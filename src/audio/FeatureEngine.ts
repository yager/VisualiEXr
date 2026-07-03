import { AudioFeatures } from './AudioFeatures';
import { AutoGain } from './AutoGain';
import { TempoTracker } from './TempoTracker';
import { AdaptiveOnset } from './AdaptiveOnset';

/** ステレオ解析用の L/R アナライザ（任意）。 */
export interface StereoAnalysers {
  left: AnalyserNode;
  right: AnalyserNode;
}

/** キー推定用：Krumhansl-Schmuckler のキープロファイル。 */
const KEY_PROFILE_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KEY_PROFILE_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export interface FeatureEngineOptions {
  /** FFT長。ビン数は半分になる。既定 2048 → 1024ビン。 */
  fftSize?: number;
  /** 平滑化系の指標にかける EMA 係数（0〜1、大きいほどなめらか）。既定 0.8。 */
  smoothing?: number;
  /** AnalyserNode 自身の平滑化（0〜1）。既定 0.5。 */
  analyserSmoothing?: number;
  /** bands[] の分割数（対数間隔）。既定 8。 */
  bandCount?: number;
  /** 音域別エネルギーの境界（Hz）。 */
  bands?: {
    bass: [number, number];
    mid: [number, number];
    treble: [number, number];
  };
  /** ロールオフの割合（エネルギーの何割が収まる高さを探すか）。既定 0.85。 */
  rolloffThreshold?: number;
  /** chroma のピーク拾いのしきい値（0〜255）。これ未満の山は無視。既定 24。 */
  chromaPeakFloor?: number;
  /** ドロップ（急な大音量）判定のしきい値（energyDelta が +これ以上）。既定 0.6。 */
  dropThreshold?: number;
  /** ドロップ判定の不応期（ミリ秒）。既定 800。 */
  dropRefractoryMs?: number;
  /** 無音判定の絶対音量しきい値（生RMS, 0〜1）。既定 0.01。 */
  silenceThreshold?: number;
}

type Required_<T> = { [K in keyof T]-?: T[K] };

const DEFAULTS: Required_<FeatureEngineOptions> = {
  fftSize: 2048,
  smoothing: 0.8,
  analyserSmoothing: 0.5,
  bandCount: 8,
  bands: { bass: [20, 150], mid: [150, 2000], treble: [2000, 16000] },
  rolloffThreshold: 0.85,
  chromaPeakFloor: 24,
  dropThreshold: 0.6,
  dropRefractoryMs: 800,
  silenceThreshold: 0.01,
};

/**
 * FeatureEngine — 1つの AnalyserNode から、毎フレーム AudioFeatures を計算する。
 *
 * 使い方:
 *   const engine = new FeatureEngine(analyser);
 *   function loop() {
 *     const f = engine.update();   // ← 毎フレーム呼ぶ
 *     visualizer.draw(f, ctx);
 *     requestAnimationFrame(loop);
 *   }
 *
 * プラグインは生の analyser を触らず、この update() の戻り値だけ見れば描ける。
 */
export class FeatureEngine {
  private readonly opts: Required_<FeatureEngineOptions>;
  private readonly sampleRate: number;
  private readonly binCount: number;
  private readonly binWidth: number; // 1ビンあたりの Hz 幅

  private readonly spectrum: Uint8Array;
  private readonly waveform: Float32Array;
  private readonly prevSpectrum: Uint8Array;

  private readonly rmsGain = new AutoGain();
  private readonly fluxGain = new AutoGain();
  private readonly kickGain = new AutoGain();
  private readonly snareGain = new AutoGain();
  private readonly hatGain = new AutoGain();
  private readonly energyDeltaGain = new AutoGain();

  // 平滑化（EMA）の保持先
  private readonly sm = {
    rms: 0, bass: 0, mid: 0, treble: 0,
    brightness: 0, flux: 0, rolloff: 0, flatness: 0, noisiness: 0,
    bands: [] as number[],
    tonalX: 0, tonalY: 0, tonalS: 0, // 五度圏ベクトル（X,Y）と合計（S）の平滑化
    energyDelta: 0, pan: 0, width: 0, bpm: 0,
  };

  // 五度圏上の各音名の単位ベクトル（cos/sin）を事前計算
  private readonly cos5 = new Float64Array(12);
  private readonly sin5 = new Float64Array(12);

  // ビート/オンセット検出の状態
  private lastBeatMs = 0; // beatPhase 用（最後に拍が来た時刻）
  private lastDropMs = 0;
  // 無音アイドル判定（時計で自走する beatPhase/bpm を止めるため）
  private silentSinceMs = -1;
  private wasIdle = false;
  // 無音時に角度を保持するための直近 tonalAngle
  private lastTonalAngle = 0;
  // energyDelta 用の直前 RMS
  private prevRms = 0;

  // テンポ推定（簡易・低精度。演出の補助程度）
  private readonly tempo = new TempoTracker();

  // ステレオ解析（任意）
  private readonly waveL: Float32Array | null;
  private readonly waveR: Float32Array | null;

  // キー推定の状態
  private readonly keyChroma = new Float64Array(12); // 長い時定数で蓄積した chroma
  private keyIndex = -1;
  private keyIsMajor = true;
  private keyConfidence = 0;
  private lastKeyCalc = 0;

  // ピッチ用（大FFT）— chroma / key / loudestHz を高分解能で計算する。
  private readonly pitchAnalyser: AnalyserNode | null;
  private readonly pitchSpectrum: Uint8Array | null;
  private pitchBinWidth = 0;
  private loudestHz = 0;

  private pitchPrefix: Float64Array | null = null; // chroma ホワイトニング用の移動平均（prefix sum）

  // 適応しきい値のビート/打点検出（直近包絡の平均+k×標準偏差で発火。曲の密度に自動追従）
  private readonly beatAdapt = new AdaptiveOnset(43, 1.6, 0.10, 120);
  private readonly kickAdapt = new AdaptiveOnset(43, 1.6, 0.08, 90);
  private readonly snareAdapt = new AdaptiveOnset(43, 1.6, 0.08, 90);
  private readonly hatAdapt = new AdaptiveOnset(43, 1.7, 0.08, 90);

  // 毎フレーム使い回す出力オブジェクト（GC負荷を避ける）
  private readonly features: AudioFeatures;

  constructor(
    private readonly analyser: AnalyserNode,
    options: FeatureEngineOptions = {},
    private readonly stereo: StereoAnalysers | null = null,
    pitch: AnalyserNode | null = null, // ピッチ解析用（大FFT）。chroma/key/loudestHz を高分解能で
  ) {
    this.opts = { ...DEFAULTS, ...options, bands: { ...DEFAULTS.bands, ...options.bands } };

    analyser.fftSize = this.opts.fftSize;
    analyser.smoothingTimeConstant = this.opts.analyserSmoothing;

    this.sampleRate = analyser.context.sampleRate;
    this.binCount = analyser.frequencyBinCount;
    this.binWidth = this.sampleRate / analyser.fftSize;

    this.spectrum = new Uint8Array(this.binCount);
    this.prevSpectrum = new Uint8Array(this.binCount);
    this.waveform = new Float32Array(analyser.fftSize);

    // ステレオ解析用バッファ（L/R アナライザが渡された場合のみ）
    this.waveL = stereo ? new Float32Array(stereo.left.fftSize) : null;
    this.waveR = stereo ? new Float32Array(stereo.right.fftSize) : null;

    // ピッチ用（大FFT）。分解能を上げて低音の音名を分けられるようにする。
    this.pitchAnalyser = pitch;
    if (pitch) {
      pitch.smoothingTimeConstant = 0.6;
      this.pitchSpectrum = new Uint8Array(pitch.frequencyBinCount);
      this.pitchBinWidth = this.sampleRate / pitch.fftSize;
      this.pitchPrefix = new Float64Array(pitch.frequencyBinCount + 1);
    } else {
      this.pitchSpectrum = null;
    }

    this.sm.bands = new Array(this.opts.bandCount).fill(0);

    // 五度圏：音名 k を 5度ずつ進めた位置に置く（C,G,D,A,… が円周に並ぶ）。
    // 関係の近い和音どうしが円上でも近くなり、調が変わると向きが滑らかに動く。
    for (let k = 0; k < 12; k++) {
      const pos = (7 * k) % 12;            // k番目の音名の五度圏上の位置
      const a = (2 * Math.PI * pos) / 12;
      this.cos5[k] = Math.cos(a);
      this.sin5[k] = Math.sin(a);
    }

    this.features = {
      spectrum: this.spectrum,
      waveform: this.waveform,
      rms: 0, peak: 0,
      bass: 0, mid: 0, treble: 0,
      bands: new Array(this.opts.bandCount).fill(0),
      brightness: 0, flux: 0, rolloff: 0, flatness: 0, noisiness: 0,
      chroma: new Array(12).fill(0),
      loudestHz: 0,
      impulse: 0, beat: false,
      tonalAngle: 0, tonalStrength: 0, tonalX: 0, tonalY: 0,
      bpm: 0, beatPhase: 0,
      onsetLow: 0, onsetMid: 0, onsetHigh: 0,
      kick: false, snare: false, hat: false,
      energyDelta: 0, drop: false, silence: false,
      pan: 0, stereoWidth: 0,
      keyIndex: -1, keyIsMajor: true, keyConfidence: 0,
      sampleRate: this.sampleRate,
      time: 0,
    };
  }

  /** 毎フレーム呼ぶ。最新の AudioFeatures を返す（同じオブジェクトを使い回す）。 */
  update(): AudioFeatures {
    const { analyser, spectrum, waveform, binCount } = this;

    analyser.getByteFrequencyData(spectrum);
    analyser.getFloatTimeDomainData(waveform);

    // ── 波形からの指標 ──
    let sumSq = 0;
    let peak = 0;
    let zc = 0;
    for (let i = 0; i < waveform.length; i++) {
      const x = waveform[i];
      sumSq += x * x;
      const a = Math.abs(x);
      if (a > peak) peak = a;
      if (i > 0 && (waveform[i - 1] < 0) !== (x < 0)) zc++;
    }
    const rmsRaw = Math.sqrt(sumSq / waveform.length);
    const noisiness = zc / Math.max(1, waveform.length - 1);

    // ── スペクトラムからの指標（1回のループでまとめて）──
    let total = 0;       // セントロイドの分母 ＆ ロールオフ用合計
    let weighted = 0;    // セントロイドの分子
    let flux = 0;        // 前フレームより増えた分
    let fluxKick = 0;    // 低域(40-120Hz)の立ち上がり
    let fluxSnare = 0;   // 中域(120-500Hz)の立ち上がり
    let fluxHat = 0;     // 高域(6k-16kHz)の立ち上がり
    let logSum = 0;      // フラットネス（幾何平均）用
    const eps = 1e-6;
    const chroma = this.features.chroma; // 中身は computePitchFeatures（大FFT）が毎フレーム埋める

    for (let i = 0; i < binCount; i++) {
      const v = spectrum[i];
      total += v;
      weighted += i * v;

      const d = v - this.prevSpectrum[i];
      if (d > 0) {
        flux += d;
        // 帯域別オンセット（前フレームより増えた分を帯域ごとに集計）
        const fhz = i * this.binWidth;
        if (fhz >= 40 && fhz < 120) fluxKick += d;
        else if (fhz >= 120 && fhz < 500) fluxSnare += d;
        else if (fhz >= 6000 && fhz < 16000) fluxHat += d;
      }

      logSum += Math.log(v / 255 + eps);
    }
    this.prevSpectrum.set(spectrum);

    // セントロイド → 明るさ(0〜1)
    const brightness = total > 0 ? (weighted / total) / binCount : 0;

    // ロールオフ(0〜1)
    let cum = 0;
    let rolloffIdx = 0;
    const threshold = total * this.opts.rolloffThreshold;
    for (let i = 0; i < binCount; i++) {
      cum += spectrum[i];
      if (cum >= threshold) { rolloffIdx = i; break; }
    }
    const rolloff = binCount > 0 ? rolloffIdx / binCount : 0;

    // フラットネス(0〜1) = 幾何平均 / 算術平均
    const geo = Math.exp(logSum / binCount);
    const ar = total / 255 / binCount;
    const flatness = ar > 0 ? Math.min(geo / ar, 1) : 0;

    // chroma / loudestHz / keyChroma は大FFT（computePitchFeatures）で計算・蓄積する。
    // （chroma の正規化・キー用の蓄積もその中で行う）
    if (this.pitchAnalyser) this.computePitchFeatures();
    else chroma.fill(0);

    // ── 調性ベクトル（chroma を五度圏で1方向にまとめる）──
    // ホワイトニング: 12音名の平均を引き、平均より上だけ残す（底上げ分を除去）。
    let chromaMean = 0;
    for (let i = 0; i < 12; i++) chromaMean += chroma[i];
    chromaMean /= 12;
    let tx = 0;
    let ty = 0;
    let ts = 0;
    for (let i = 0; i < 12; i++) {
      const c = chroma[i] - chromaMean;
      if (c > 0) { tx += c * this.cos5[i]; ty += c * this.sin5[i]; ts += c; }
    }
    // X,Y,S を時間平滑化（角度の継ぎ目をまたがず滑らかに）
    this.sm.tonalX = this.smooth(this.sm.tonalX, tx);
    this.sm.tonalY = this.smooth(this.sm.tonalY, ty);
    this.sm.tonalS = this.smooth(this.sm.tonalS, ts);

    const smS = this.sm.tonalS;
    const tonalX = smS > 1e-6 ? this.sm.tonalX / smS : 0; // 単位円内（-1〜1）
    const tonalY = smS > 1e-6 ? this.sm.tonalY / smS : 0;
    const tonalStrength = Math.min(1, Math.sqrt(tonalX * tonalX + tonalY * tonalY));
    let tonalAngle = this.lastTonalAngle;
    if (tonalStrength > 1e-3) {
      tonalAngle = Math.atan2(tonalY, tonalX) / (2 * Math.PI); // -0.5〜0.5
      if (tonalAngle < 0) tonalAngle += 1;                     // 0〜1（循環）
      this.lastTonalAngle = tonalAngle;
    }

    // 音域別エネルギー
    const bass = this.bandEnergy(...this.opts.bands.bass);
    const mid = this.bandEnergy(...this.opts.bands.mid);
    const treble = this.bandEnergy(...this.opts.bands.treble);

    // 多バンド（対数間隔）
    const bands = this.features.bands;
    const maxHz = Math.min(16000, this.sampleRate / 2);
    const ratio = Math.pow(maxHz / 20, 1 / this.opts.bandCount);
    for (let b = 0; b < this.opts.bandCount; b++) {
      const lo = 20 * Math.pow(ratio, b);
      const hi = 20 * Math.pow(ratio, b + 1);
      bands[b] = this.smooth(this.sm.bands[b], this.bandEnergy(lo, hi));
      this.sm.bands[b] = bands[b];
    }

    // オートゲイン
    const rmsNorm = this.rmsGain.normalize(rmsRaw);
    const fluxNorm = this.fluxGain.normalize(flux); // = impulse（鋭い値）

    // ── 平滑化して features に詰める ──
    this.sm.rms = this.smooth(this.sm.rms, rmsNorm);
    this.sm.bass = this.smooth(this.sm.bass, bass);
    this.sm.mid = this.smooth(this.sm.mid, mid);
    this.sm.treble = this.smooth(this.sm.treble, treble);
    this.sm.brightness = this.smooth(this.sm.brightness, brightness);
    this.sm.flux = this.smooth(this.sm.flux, fluxNorm);
    this.sm.rolloff = this.smooth(this.sm.rolloff, rolloff);
    this.sm.flatness = this.smooth(this.sm.flatness, flatness);
    this.sm.noisiness = this.smooth(this.sm.noisiness, noisiness);

    const time = analyser.context.currentTime;

    // 簡易ビート検出（impulse のしきい値＋不応期）。
    const nowMs = time * 1000;
    // ビート：適応しきい値（直近包絡の平均+k×標準偏差）で発火。beatPhase 用に発火時刻も控える。
    const beat = this.beatAdapt.detect(fluxNorm, nowMs);
    if (beat) this.lastBeatMs = nowMs;

    // ── 帯域別オンセット（kick / snare / hat）＝ 適応しきい値 ──
    const onsetLow = this.kickGain.normalize(fluxKick);
    const onsetMid = this.snareGain.normalize(fluxSnare);
    const onsetHigh = this.hatGain.normalize(fluxHat);
    const kick = this.kickAdapt.detect(onsetLow, nowMs);
    const snare = this.snareAdapt.detect(onsetMid, nowMs);
    const hat = this.hatAdapt.detect(onsetHigh, nowMs);

    // ── テンポ・拍フェーズ ──
    const bpmRaw = this.tempo.update(fluxNorm, time);
    if (bpmRaw > 0) this.sm.bpm = this.sm.bpm > 0 ? this.smooth(this.sm.bpm, bpmRaw) : bpmRaw;
    const bpm = this.sm.bpm;
    const period = this.tempo.beatPeriodSec;
    let beatPhase = 0;
    if (period > 0) {
      beatPhase = (((nowMs - this.lastBeatMs) / 1000) / period) % 1;
      if (beatPhase < 0) beatPhase += 1;
    }

    // ── ダイナミクス（energyDelta / drop / silence）──
    const dRms = this.sm.rms - this.prevRms;
    this.prevRms = this.sm.rms;
    const dNorm = this.energyDeltaGain.normalize(Math.abs(dRms));
    const energyDeltaInst = dRms >= 0 ? dNorm : -dNorm;
    this.sm.energyDelta = this.smooth(this.sm.energyDelta, energyDeltaInst);
    const energyDelta = this.sm.energyDelta;
    let drop = false;
    if (energyDeltaInst >= this.opts.dropThreshold && nowMs - this.lastDropMs >= this.opts.dropRefractoryMs) {
      drop = true;
      this.lastDropMs = nowMs;
    }
    const silence = rmsRaw < this.opts.silenceThreshold;

    // 無音が一定時間（0.6秒）続いたら「アイドル」とみなす。
    // beatPhase / bpm は入力ではなく時計から外挿しているので、放置すると音が無くても
    // 動き続ける。アイドル中は 0 に凍結し、突入時にテンポ推定を初期化（再生再開で作り直す）。
    if (silence) { if (this.silentSinceMs < 0) this.silentSinceMs = nowMs; }
    else this.silentSinceMs = -1;
    const idle = this.silentSinceMs >= 0 && nowMs - this.silentSinceMs > 600;
    if (idle) {
      beatPhase = 0;
      if (!this.wasIdle) { // アイドル突入時に一度だけ、テンポ推定を初期化（再生再開で作り直す）
        this.tempo.reset();
        this.sm.bpm = 0;
      }
    }
    this.wasIdle = idle;

    // ── ステレオ（pan / width）──
    if (this.stereo && this.waveL && this.waveR) {
      this.stereo.left.getFloatTimeDomainData(this.waveL);
      this.stereo.right.getFloatTimeDomainData(this.waveR);
      const n2 = Math.min(this.waveL.length, this.waveR.length);
      let sl = 0;
      let sr = 0;
      let slr = 0;
      for (let i = 0; i < n2; i++) {
        const l = this.waveL[i];
        const r = this.waveR[i];
        sl += l * l; sr += r * r; slr += l * r;
      }
      const rl = Math.sqrt(sl / n2);
      const rr = Math.sqrt(sr / n2);
      const panInst = (rl + rr) > 1e-6 ? (rr - rl) / (rr + rl) : 0;
      const corr = (sl > 1e-9 && sr > 1e-9) ? slr / Math.sqrt(sl * sr) : 1;
      const widthInst = Math.max(0, Math.min(1, 1 - corr));
      this.sm.pan = this.smooth(this.sm.pan, panInst);
      this.sm.width = this.smooth(this.sm.width, widthInst);
    }
    const pan = this.sm.pan;
    const stereoWidth = this.sm.width;

    // ── キー推定（0.5秒ごとに再計算）──
    if (time - this.lastKeyCalc > 0.5) {
      this.lastKeyCalc = time;
      this.estimateKey();
    }

    const f = this.features;
    f.rms = this.sm.rms;
    f.peak = peak;               // 鋭い値（平滑化なし）
    f.bass = this.sm.bass;
    f.mid = this.sm.mid;
    f.treble = this.sm.treble;
    f.brightness = this.sm.brightness;
    f.flux = this.sm.flux;
    f.rolloff = this.sm.rolloff;
    f.flatness = this.sm.flatness;
    f.noisiness = this.sm.noisiness;
    f.loudestHz = this.loudestHz;
    f.impulse = fluxNorm;        // 鋭い値（平滑化なし）
    f.beat = beat;
    f.tonalAngle = tonalAngle;
    f.tonalStrength = tonalStrength;
    f.tonalX = tonalX;
    f.tonalY = tonalY;
    f.bpm = idle ? 0 : bpm;
    f.beatPhase = beatPhase;
    f.onsetLow = onsetLow;
    f.onsetMid = onsetMid;
    f.onsetHigh = onsetHigh;
    f.kick = kick;
    f.snare = snare;
    f.hat = hat;
    f.energyDelta = energyDelta;
    f.drop = drop;
    f.silence = silence;
    f.pan = pan;
    f.stereoWidth = stereoWidth;
    f.keyIndex = this.keyIndex;
    f.keyIsMajor = this.keyIsMajor;
    f.keyConfidence = this.keyConfidence;
    f.time = time;
    // spectrum / waveform / chroma / bands は同じ配列を書き換え済み

    return f;
  }

  /** 旧（小FFT）の keyChroma からキーを推定して状態へ反映。 */
  private estimateKey(): void {
    const r = this.keyOf(this.keyChroma);
    this.keyIndex = r.index;
    this.keyIsMajor = r.major;
    this.keyConfidence = r.confidence;
  }

  /** 蓄積 chroma を K-S プロファイルと相関させてキーを推定（旧/新で共用）。 */
  private keyOf(c: Float64Array): { index: number; major: boolean; confidence: number } {
    let total = 0;
    let mean = 0;
    for (let i = 0; i < 12; i++) { total += c[i]; mean += c[i]; }
    mean /= 12;
    if (total < 1e-6) return { index: -1, major: true, confidence: 0 };

    const corr = (profile: number[], rot: number): number => {
      let pm = 0;
      for (let i = 0; i < 12; i++) pm += profile[i];
      pm /= 12;
      let num = 0;
      let dc = 0;
      let dp = 0;
      for (let i = 0; i < 12; i++) {
        const cv = c[(i + rot) % 12] - mean;
        const pv = profile[i] - pm;
        num += cv * pv; dc += cv * cv; dp += pv * pv;
      }
      return (dc > 0 && dp > 0) ? num / Math.sqrt(dc * dp) : 0;
    };

    let best = -Infinity;
    let bestIdx = -1;
    let bestMajor = true;
    for (let t = 0; t < 12; t++) {
      const maj = corr(KEY_PROFILE_MAJOR, t);
      const min = corr(KEY_PROFILE_MINOR, t);
      if (maj > best) { best = maj; bestIdx = t; bestMajor = true; }
      if (min > best) { best = min; bestIdx = t; bestMajor = false; }
    }
    return { index: bestIdx, major: bestMajor, confidence: Math.max(0, Math.min(1, best)) };
  }

  /**
   * 大FFTアナライザから chroma / loudestHz を計算し、キー推定用に keyChroma を蓄積。
   * ピーク拾い＋**ホワイトニング（局所平均を引く）＋放物線補間で精密周波数＋隣接音名へ線形加重**。
   * → 倍音/ノイズの底上げを抑え、半音境界の取り違えも減らす（和声が締まる）。features.chroma を直接埋める。
   */
  private computePitchFeatures(): void {
    const spec = this.pitchSpectrum!;
    this.pitchAnalyser!.getByteFrequencyData(spec);
    const bw = this.pitchBinWidth;
    const n = spec.length;
    const floor = this.opts.chromaPeakFloor;

    const chroma = this.features.chroma;
    chroma.fill(0);

    // ホワイトニング用の移動平均（prefix sum）を作る
    const pre = this.pitchPrefix!;
    pre[0] = 0;
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + spec[i];
    const W = 20; // 局所平均の窓（±W ビン ≒ ±58Hz）

    let maxV = -1;
    let maxI = 0;
    for (let i = 0; i < n; i++) {
      const v = spec[i];
      if (v > maxV) { maxV = v; maxI = i; }
      if (i > 0 && i < n - 1 && v >= floor && v > spec[i - 1] && v >= spec[i + 1]) {
        if (i * bw < 20) continue;

        // ホワイトニング（局所平均を引く。広帯域＝ノイズ/打楽器に埋もれた山は捨てる）
        const lo = Math.max(0, i - W);
        const hi = Math.min(n, i + W + 1);
        const localAvg = (pre[hi] - pre[lo]) / (hi - lo);
        const w = v - localAvg;
        if (w <= 0) continue;

        // 放物線補間で精密な周波数 → 音名
        const a = spec[i - 1], b = spec[i], c = spec[i + 1];
        const denom = a - 2 * b + c;
        const delta = denom !== 0 ? 0.5 * (a - c) / denom : 0;
        const fNew = (i + (Math.abs(delta) < 1 ? delta : 0)) * bw;
        const pcF = ((((12 * Math.log2(fNew / 440) + 69) % 12) + 12) % 12);
        // 隣接する2音名へ線形加重（半音境界の取り違えを避ける）
        const b0 = Math.floor(pcF) % 12;
        const b1 = (b0 + 1) % 12;
        const frac = pcF - Math.floor(pcF);
        chroma[b0] += w * (1 - frac);
        chroma[b1] += w * frac;
      }
    }

    this.normalize12(chroma);
    // キー推定用に長い時定数で蓄積（数秒で安定）
    for (let i = 0; i < 12; i++) this.keyChroma[i] = this.keyChroma[i] * 0.98 + chroma[i] * 0.02;
    this.loudestHz = maxI * bw;
  }

  /** 12要素配列を最大=1に正規化（その場書き換え）。 */
  private normalize12(a: number[] | Float64Array): void {
    let m = 0;
    for (let i = 0; i < 12; i++) if (a[i] > m) m = a[i];
    if (m > 0) for (let i = 0; i < 12; i++) a[i] /= m;
  }

  /** 指定 Hz 範囲のビンを平均し 0〜1 で返す。 */
  private bandEnergy(loHz: number, hiHz: number): number {
    const lo = this.hzToBin(loHz);
    const hi = this.hzToBin(hiHz);
    let sum = 0;
    for (let i = lo; i <= hi; i++) sum += this.spectrum[i];
    return sum / Math.max(1, hi - lo + 1) / 255;
  }

  /** Hz → ビン番号（0〜binCount-1 にクランプ）。 */
  private hzToBin(hz: number): number {
    return Math.max(0, Math.min(this.binCount - 1, Math.round(hz / this.binWidth)));
  }

  /** EMA（指数移動平均）による平滑化。 */
  private smooth(prev: number, next: number): number {
    const k = this.opts.smoothing;
    return prev * k + next * (1 - k);
  }
}
