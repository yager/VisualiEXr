import { AudioFeatures } from '../audio/AudioFeatures';
import { Visualizer, VisualizerContext } from './Visualizer';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * AnalyzerVisualizer — AudioFeatures の中身を画面に並べて見る分析/デバッグ表示。
 * （UI表示名は "Analyzer (All Features)"。プラグイン作者が使える全特徴量の参照元でもある）
 *
 * 横長の動画域を活かした4カラム構成（左→右）:
 *   1) spectrum   … 周波数を縦軸（低域=下/高域=上）にした横バー。縦幅いっぱい。
 *   2) bands      … 同じく周波数を縦軸にした横バー（spectrum のまとめ版）。
 *   3) スカラー値  … rms 〜 time を ラベル＋横バー＋数値 で一覧。
 *   4) 上 chroma / 下 waveform
 */
export default class AnalyzerVisualizer implements Visualizer {
  readonly id = 'analyzer';
  readonly name = 'Analyzer (All Features)';
  readonly author = 'VisualiEXr';
  readonly description = 'AudioFeatures を一覧表示する分析/デバッグ画面';
  readonly order = 2;

  // ランプの点灯を少し持続させて、一瞬の発火を目で追えるようにする（キー=行ラベル+名前 → 最後に光った時刻）
  private lampHold: Record<string, number> = {};

  draw(f: AudioFeatures, { ctx, width, height }: VisualizerContext): void {
    ctx.clearRect(0, 0, width, height);
    ctx.font = '12px monospace';
    ctx.textBaseline = 'middle';

    const pad = 10;
    const gap = 14;
    const labelH = 18;                       // 各カラム見出しの高さ
    const chartH = height - pad * 2 - labelH; // 縦軸グラフの高さ（縦幅いっぱい）

    // 注意: spectrum と bands は縦軸（周波数の刻み方）が意図的に異なる。
    //   spectrum = 生 FFT ビンを等間隔（周波数リニア）→ 低音が下に密集して見える
    //   bands    = 音楽的な対数分割（低い方を細かく刻む）→ 山が広がって見える
    // これは別物として並べて確認するためのもので、山の位置は一致しない。

    // ── 1) spectrum（縦軸=周波数リニア。生 FFT に忠実）──
    let x = pad;
    const wSpec = 70;
    this.freqColumn(ctx, x, pad, wSpec, labelH, chartH, 'spectrum', (frac) => {
      const bin = Math.min(f.spectrum.length - 1, Math.floor(frac * f.spectrum.length));
      return f.spectrum[bin] / 255;
    });

    // ── 2) bands（縦軸=対数周波数。低い方を細かく刻んだまとめ）──
    x += wSpec + gap;
    const wBands = 70;
    const n = f.bands.length;
    this.freqColumn(ctx, x, pad, wBands, labelH, chartH, 'bands', (frac) => {
      const i = Math.min(n - 1, Math.floor(frac * n));
      return f.bands[i];
    });

    // ── 3) スカラーバー（levels / spectral / tonal / rhythm / stereo / dynamics）──
    x += wBands + gap;
    const wMeters = 250;
    this.metersColumn(ctx, x, pad, wMeters, f);

    // ── 4) chroma → key → tonal vector → bpm等 → ランプ → waveform ──
    x += wMeters + gap;
    const rw = width - x - pad;
    if (rw > 120) {
      const cw = Math.min(rw, 300);
      let cy4 = pad;
      this.chroma(ctx, x, cy4, cw, 56, f.chroma);
      cy4 += 18 + 56 + 16;
      this.text(ctx, `key: ${this.keyName(f.keyIndex, f.keyIsMajor)} (${f.keyConfidence.toFixed(2)})`, x, cy4 + 9);
      cy4 += 24;
      cy4 = this.infoText(ctx, x, cy4, f) + gap;
      cy4 = this.tonalDial(ctx, x, cy4, 34, f) + gap;
      cy4 = this.lampsRow(ctx, x, cy4, '', [
        ['beat', f.beat], ['kick', f.kick], ['snare', f.snare],
        ['hat', f.hat], ['drop', f.drop], ['silence', f.silence],
      ], f.time) + gap;
      this.waveform(ctx, x, cy4, rw, 56, f.waveform);
    }
  }

  /** bpm / loudestHz / sampleRate / time のテキスト。戻り値は下端 y。 */
  private infoText(ctx: CanvasRenderingContext2D, x: number, y: number, f: AudioFeatures): number {
    const rowH = 18;
    let yy = y + rowH / 2;
    this.text(ctx, `bpm: ${f.bpm > 0 ? f.bpm.toFixed(1) : '--'}`, x, yy); yy += rowH;
    this.text(ctx, `loudestHz: ${f.loudestHz.toFixed(0)} Hz (${this.hzNote(f.loudestHz)})`, x, yy); yy += rowH;
    this.text(ctx, `sampleRate: ${f.sampleRate} Hz`, x, yy); yy += rowH;
    this.text(ctx, `time: ${f.time.toFixed(1)} s`, x, yy);
    return yy + rowH / 2;
  }

  /**
   * 横並びのランプ（点灯=true）。行ラベル付き。戻り値は下端 y。
   * 発火は一瞬なので、点いた時刻を覚えて HOLD 秒だけ点灯を持続させる（新旧の比較を目で追えるように）。
   */
  private lampsRow(
    ctx: CanvasRenderingContext2D, x: number, y: number,
    rowLabel: string, items: Array<[string, boolean]>, now: number,
  ): number {
    const HOLD = 0.12; // 秒
    const yy = y + 9;
    let lx = x;
    if (rowLabel) {
      this.text(ctx, rowLabel, x, yy, '#9cf');
      lx = x + ctx.measureText(rowLabel).width + 10;
    }
    for (const [name, on] of items) {
      const key = rowLabel + name;
      if (on) this.lampHold[key] = now;
      const lit = now - (this.lampHold[key] ?? -1e9) < HOLD;
      ctx.fillStyle = lit ? '#ff4060' : '#444';
      ctx.beginPath();
      ctx.arc(lx + 6, yy, 6, 0, Math.PI * 2);
      ctx.fill();
      this.text(ctx, name, lx + 15, yy, '#fff');
      lx += 15 + ctx.measureText(name).width + 14;
    }
    return yy + 9;
  }

  /** キー番号＋長短から表示名（C major 等）。 */
  private keyName(index: number, major: boolean): string {
    if (index < 0) return '--';
    return `${NOTE_NAMES[index]} ${major ? 'major' : 'minor'}`;
  }

  /**
   * 周波数を縦軸にした横バー列（spectrum / bands 共通）。
   * 低域=下、高域=上。各行の強さ（0〜1）はコールバックで取得する。
   * @param valueAt frac=0(最低域) 〜 1(最高域) を渡すと 0〜1 の強さを返す関数
   */
  private freqColumn(
    ctx: CanvasRenderingContext2D, x: number, y: number, w: number,
    labelH: number, h: number, label: string,
    valueAt: (frac: number) => number,
  ): void {
    this.text(ctx, label, x, y + 6);
    const top = y + labelH;

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, top, w, h);

    const rows = Math.max(1, Math.floor(h));
    for (let i = 0; i < rows; i++) {
      // i=0 が一番上＝高域。frac は 1(高域)→0(低域)。
      const frac = 1 - i / rows;
      const v = Math.max(0, Math.min(1, valueAt(frac)));
      ctx.fillStyle = `hsl(${200 - v * 170}, 85%, ${25 + v * 45}%)`;
      ctx.fillRect(x, top + i, w * v, 1);
    }
  }

  /** スカラーバー（rms 〜 tonal）を縦に並べる。戻り値は下端 y。 */
  private metersColumn(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, f: AudioFeatures): number {
    const rowH = 18;
    const labelW = 100; // フィールド名を省略せず表示できる幅
    const meterW = w - labelW - 44;
    let yy = y + rowH / 2;

    // 0〜1 のスカラー（ラベルは AudioFeatures のフィールド名そのまま）
    const meters: Array<[string, number]> = [
      ['rms', f.rms], ['peak', f.peak],
      ['bass', f.bass], ['mid', f.mid], ['treble', f.treble],
      ['brightness', f.brightness], ['flux', f.flux], ['impulse', f.impulse],
      ['rolloff', f.rolloff], ['flatness', f.flatness], ['noisiness', f.noisiness],
      ['tonalStrength', f.tonalStrength], ['tonalAngle', f.tonalAngle],
    ];
    for (const [name, v] of meters) {
      this.meter(ctx, x, yy, labelW, meterW, name, v);
      yy += rowH;
    }

    // tonalX / tonalY は ±（0を中央、左=−・右=＋）
    this.bipolarMeter(ctx, x, yy, labelW, meterW, 'tonalX', f.tonalX); yy += rowH;
    this.bipolarMeter(ctx, x, yy, labelW, meterW, 'tonalY', f.tonalY); yy += rowH;

    // tonal の下にリズム/ダイナミクス/ステレオのバーを続ける
    const meters2: Array<[string, number]> = [
      ['beatPhase', f.beatPhase],
      ['onsetLow', f.onsetLow], ['onsetMid', f.onsetMid], ['onsetHigh', f.onsetHigh],
      ['stereoWidth', f.stereoWidth], ['keyConfidence', f.keyConfidence],
    ];
    for (const [name, v] of meters2) {
      this.meter(ctx, x, yy, labelW, meterW, name, v);
      yy += rowH;
    }
    this.bipolarMeter(ctx, x, yy, labelW, meterW, 'energyDelta', f.energyDelta); yy += rowH;
    this.bipolarMeter(ctx, x, yy, labelW, meterW, 'pan', f.pan); yy += rowH;

    return yy;
  }

  /** 調性ベクトル（tonalX/Y）を小さな円＋ドットで可視化。戻り値は下端 y。 */
  private tonalDial(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, f: AudioFeatures): number {
    this.text(ctx, 'tonal vector', x, y + 6);
    const cx = x + r;
    const cy = y + r + 14;

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
    ctx.stroke();

    // ドット（画面の y は下向きなので tonalY は反転）。色相=角度・彩度=強さ。
    const dx = cx + f.tonalX * r;
    const dy = cy - f.tonalY * r;
    const color = `hsl(${f.tonalAngle * 360}, ${Math.round(f.tonalStrength * 100)}%, 55%)`;
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(dx, dy); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(dx, dy, 5, 0, Math.PI * 2); ctx.fill();

    return cy + r + 6;
  }

  /** ±バー（0を中央、左=−/右=＋）。v は −1〜1。 */
  private bipolarMeter(ctx: CanvasRenderingContext2D, x: number, y: number, labelW: number, w: number, name: string, v: number): void {
    this.text(ctx, name, x, y, '#9cf');
    const bx = x + labelW;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(bx, y - 5, w, 10);
    const mid = bx + w / 2;
    const cl = Math.max(-1, Math.min(1, v));
    ctx.fillStyle = '#4caf50';
    if (cl >= 0) ctx.fillRect(mid, y - 5, (w / 2) * cl, 10);
    else ctx.fillRect(mid + (w / 2) * cl, y - 5, -(w / 2) * cl, 10);
    // 中央の目盛り
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(mid - 0.5, y - 6, 1, 12);
    // 数値（符号付き）
    this.text(ctx, (v >= 0 ? '+' : '') + v.toFixed(2), bx + w + 8, y);
  }

  /** ラベル + 横バー + 数値 の1行（0〜1 スカラー用）。 */
  private meter(ctx: CanvasRenderingContext2D, x: number, y: number, labelW: number, w: number, name: string, v: number): void {
    this.text(ctx, name, x, y, '#9cf');
    const bx = x + labelW;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(bx, y - 5, w, 10);
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(bx, y - 5, w * Math.max(0, Math.min(1, v)), 10);
    this.text(ctx, v.toFixed(2), bx + w + 8, y);
  }

  /** 半透明黒の背景つきでテキストを描く（明るい映像でも読めるように）。 */
  private text(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, color = '#fff'): void {
    const w = ctx.measureText(str).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 2, y - 8, w + 4, 16);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  /** Hz → 最も近い音名＋オクターブ（例 220Hz → A3）。0以下は '--'。 */
  private hzNote(hz: number): string {
    if (hz <= 0) return '--';
    const midi = Math.round(12 * Math.log2(hz / 440) + 69);
    const pc = ((midi % 12) + 12) % 12;
    return NOTE_NAMES[pc] + (Math.floor(midi / 12) - 1);
  }

  /** chroma（12音名）を縦バー＋音名ラベルで。 */
  private chroma(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, chroma: number[], label = 'chroma'): void {
    const bw = w / 12;
    this.text(ctx, label, x, y + 6);
    const top = y + 18;
    for (let i = 0; i < 12; i++) {
      const bh = chroma[i] * h;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x + i * bw, top, bw - 2, h);
      ctx.fillStyle = `hsl(${i * 30}, 80%, 60%)`;
      ctx.fillRect(x + i * bw, top + h - bh, bw - 2, bh);
      this.text(ctx, NOTE_NAMES[i], x + i * bw + 2, top + h + 8, '#bbb');
    }
  }

  /** waveform（−1〜1）をオシロ風ラインで（横軸=時間）。 */
  private waveform(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wave: Float32Array): void {
    this.text(ctx, 'waveform', x, y + 6);
    const top = y + 18;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, top, w, h);
    ctx.strokeStyle = '#ffca28';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const mid = top + h / 2;
    const step = Math.max(1, Math.floor(w));
    for (let i = 0; i < step; i++) {
      const idx = Math.floor((i / step) * wave.length);
      const yy = mid - wave[idx] * (h / 2);
      if (i === 0) ctx.moveTo(x + i, yy);
      else ctx.lineTo(x + i, yy);
    }
    ctx.stroke();
  }
}
