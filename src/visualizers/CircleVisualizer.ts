import { AudioFeatures } from '../audio/AudioFeatures';
import { Visualizer, VisualizerContext } from './Visualizer';

/**
 * CircleVisualizer — Basic なサンプルプラグイン。
 *
 *  - 中央のリング：spectrum を 128本の外向き放射バーで（左右対称ミラー）。
 *    バーの色は「調性ベクトル」のルール：色相 = tonalAngle、彩度 = tonalStrength。
 *  - 上下中央を全幅で waveform が貫通（前面・白）。
 *
 * spectrum / waveform / tonal* を読むだけ。音響解析の知識は不要、という見本。
 */
export default class CircleVisualizer implements Visualizer {
  readonly id = 'circle';
  readonly name = 'Circle (2D Basics)';
  readonly author = 'VisualiEXr';
  readonly description = '放射状バー＋波形＋調性の色の円';
  readonly order = 4;

  private readonly HALF = 64; // 片側の本数（左右あわせて 128本）

  draw(f: AudioFeatures, { ctx, width, height }: VisualizerContext): void {
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const minDim = Math.min(width, height);
    const R0 = minDim * 0.16;    // 基本半径
    const scale = minDim * 0.24; // 音による伸びしろ（最大で半径 0.40×min → 直径 ≒ 縦幅の80%）

    // spectrum の低〜中域を使うと動きが出る（高域はほぼ無音で平坦になるため）
    const span = Math.max(2, Math.floor(f.spectrum.length * 0.35));
    const sampleAt = (t: number) => f.spectrum[Math.floor(t * (span - 1))] / 255;

    // ── リング：spectrum を外向きの放射バーで（64本・左右対称ミラー）──
    ctx.beginPath();
    for (let i = 0; i < this.HALF; i++) {
      const t = (i + 0.5) / this.HALF;         // 0..1（上下の極を避ける）
      const ang = -Math.PI / 2 + t * Math.PI;  // 右半円（下→上）
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);               // 画面は y が下向きなので後で反転
      const r1 = R0 + sampleAt(t) * scale;     // バー先端の半径
      // 右側のバー（基本円 → 外向き）
      ctx.moveTo(cx + cos * R0, cy - sin * R0);
      ctx.lineTo(cx + cos * r1, cy - sin * r1);
      // 左側のバー（x を反転してミラー）
      ctx.moveTo(cx - cos * R0, cy - sin * R0);
      ctx.lineTo(cx - cos * r1, cy - sin * r1);
    }
    // 色：調性ベクトルのルール（色相=向き、彩度=はっきり具合）。
    // 彩度が tonalStrength に連動するので、ノイズ/打楽器主体のときは自然に色あせて落ち着く。
    ctx.strokeStyle = `hsl(${f.tonalAngle * 360}, ${Math.round(f.tonalStrength * 100)}%, 58%)`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt'; // 次の波形描画に影響しないよう戻す

    // ── 波形（全幅・上下中央を貫通・前面）──
    const amp = height * 0.18;
    const n = f.waveform.length;
    ctx.beginPath();
    for (let x = 0; x <= width; x++) {
      const idx = Math.floor((x / width) * (n - 1));
      const y = cy - f.waveform[idx] * amp;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
