import { AudioFeatures } from '../../../audio/AudioFeatures';

/**
 * makeDemoFeatures — ギャラリーのカード/ライトボックスを駆動する「見栄えする合成トラック」。
 * マイク不要。時刻 t（秒）だけから、約10秒でループする AudioFeatures を毎フレーム計算する。
 * tools/og-poster/features.ts（静止画向けの凍結フレーム）を土台に、時間依存化したもの。
 */
const BPM = 120;
const BEAT_SEC = 60 / BPM;       // 0.5s
const LOOP_SEC = 10;             // 全体のループ長（スペクトラムの山・調性の移動に使う）

export function makeDemoFeatures(t: number): AudioFeatures {
  const loopT = t % LOOP_SEC;
  const loopFrac = loopT / LOOP_SEC; // 0..1

  // ── 拍（120BPM）：ビート内の経過割合で鋭いエンベロープを作る ──
  const beatIndex = Math.floor(t / BEAT_SEC);
  const beatFrac = (t % BEAT_SEC) / BEAT_SEC; // 0(拍の瞬間)..1(次の拍の直前)
  const beat = beatFrac < 0.06;
  const kick = beat;
  const snare = beatFrac < 0.06 && beatIndex % 2 === 1; // バックビート（裏拍）
  const hatDur = BEAT_SEC / 2;
  const hatFrac = (t % hatDur) / hatDur;
  const hat = hatFrac < 0.08;

  // キック直後に立ち上がり、指数的に減衰する低音エンベロープ
  const bassEnv = Math.exp(-beatFrac * 6);
  const bass = 0.35 + 0.55 * bassEnv;
  const rms = 0.45 + 0.35 * Math.exp(-beatFrac * 4);

  // ── たまに来るドロップ（ループの後半に1回、短時間だけ音量が跳ねる） ──
  const dropWindow = loopFrac > 0.78 && loopFrac < 0.8;
  const drop = dropWindow;
  const dropBoost = dropWindow ? 1.5 : 1;

  // ── スペクトラム：低音強めの基本カーブ＋ループに沿って移動する山 ──
  const spectrum = new Uint8Array(1024);
  const humpCenter = loopFrac; // 0..1 でループしながら移動
  const humpWidth = 0.12;
  for (let i = 0; i < spectrum.length; i++) {
    const u = i / spectrum.length;
    const base = 220 * Math.exp(-u * 4.2) * (0.6 + 0.4 * bassEnv);
    const d = Math.min(Math.abs(u - humpCenter), 1 - Math.abs(u - humpCenter)); // 循環距離
    const hump = 140 * Math.exp(-(d * d) / (2 * humpWidth * humpWidth));
    const ripple = 10 * Math.sin(u * 50 + t * 3);
    spectrum[i] = Math.max(0, Math.min(255, Math.round((base + hump + ripple) * dropBoost)));
  }

  // ── 波形：低音エンベロープで振幅が脈打つ正弦 ──
  const waveform = new Float32Array(2048);
  const waveFreq = 8 + bassEnv * 4;
  for (let i = 0; i < waveform.length; i++) {
    const u = i / waveform.length;
    waveform[i] = Math.sin(u * Math.PI * 2 * waveFreq + t * 6) * (0.35 + 0.35 * bassEnv);
  }

  // ── 多バンド（8分割）：低域から高域へ、ループに沿ってゆっくり起伏 ──
  const bands: number[] = [];
  for (let b = 0; b < 8; b++) {
    const u = b / 7;
    bands.push(Math.max(0.05, Math.min(1, 0.75 * Math.exp(-u * 1.6) + 0.15 * Math.sin(t * 1.7 + b))));
  }

  // ── 調性：ループに沿ってゆっくり五度圏を一周する ──
  const tonalAngle = loopFrac; // 0..1（一周）
  const tonalStrength = 0.7 + 0.2 * Math.sin(t * 0.7);
  const tonalX = Math.cos(tonalAngle * Math.PI * 2) * tonalStrength;
  const tonalY = Math.sin(tonalAngle * Math.PI * 2) * tonalStrength;

  // chroma: ループ位置に応じた主音(root)＋完全5度にピーク
  const rootIdx = Math.floor(tonalAngle * 12) % 12;
  const fifthIdx = (rootIdx + 7) % 12;
  const chroma = new Array(12).fill(0.08);
  chroma[rootIdx] = 0.9;
  chroma[fifthIdx] = 0.5;

  // ── 明るさ・変化量：なめらかに明滅 ──
  const brightness = 0.45 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.1)) * dropBoost;
  const flux = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3.3 + 1.1));
  const impulse = beat ? 0.8 : 0.2 * bassEnv;

  return {
    spectrum,
    waveform,

    rms: Math.min(1, rms * dropBoost),
    peak: Math.min(1, (0.5 + 0.4 * bassEnv) * dropBoost),

    bass: Math.min(1, bass * dropBoost),
    mid: 0.4 + 0.2 * Math.sin(t * 1.3),
    treble: 0.3 + 0.2 * Math.sin(t * 2.7 + 2),
    bands,

    brightness: Math.min(1, brightness),
    flux,
    rolloff: 0.5 + 0.15 * Math.sin(t * 0.9),
    flatness: 0.2 + 0.1 * Math.sin(t * 1.5),
    noisiness: 0.15 + 0.1 * Math.sin(t * 2.2),

    chroma,
    loudestHz: 110 * Math.pow(2, rootIdx / 12),

    tonalAngle,
    tonalStrength,
    tonalX,
    tonalY,

    impulse,
    beat,

    bpm: BPM,
    beatPhase: beatFrac,
    onsetLow: kick ? 0.8 : 0.1,
    onsetMid: snare ? 0.7 : 0.1,
    onsetHigh: hat ? 0.6 : 0.1,
    kick,
    snare,
    hat,

    energyDelta: Math.sin(t * 1.1) * 0.3,
    drop,
    silence: false,

    pan: Math.sin(t * 0.5) * 0.3,
    stereoWidth: 0.5 + 0.2 * Math.sin(t * 0.6),

    keyIndex: rootIdx,
    keyIsMajor: true,
    keyConfidence: 0.75,

    sampleRate: 48000,
    time: t,
  };
}
