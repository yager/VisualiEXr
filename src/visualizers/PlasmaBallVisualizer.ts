import { AudioFeatures } from '../audio/AudioFeatures';
import { Visualizer, VisualizerContext } from './Visualizer';

/**
 * PlasmaBallVisualizer — 本物志向のプラズマボール（Canvas2D・ライブラリ不要）。
 *
 * 中心の電極（コア）から複数の**ギザギザした稲妻フィラメント**が放射状に伸び、外側のガラス球へ届く。
 * フィラメントは毎フレーム揺らいで枝分かれし、ガラスに触れた点が明るく光る。Plasma Scope（波形の回転）
 * とは別物で、こちらは**フラクタル放電のシミュレーション**。
 *   - bass → 本数と太さ、kick/beat → 稲妻が飛び移る＆コア発光、treble/impulse → パチパチ（ジッター量）。
 * 加算合成＋短いトレイルで電気的に光り、背景は塗らないので下の動画が透ける。用語は docs/visualizer-basics.md。
 */

const MAX_FIL = 9;   // フィラメント最大数

export default class PlasmaBallVisualizer implements Visualizer {
  readonly id = 'plasma-ball';
  readonly name = 'Plasma Ball (2D)';
  readonly author = 'VisualiEXr';
  readonly description = 'フラクタル放電のプラズマボール。拍で稲妻が飛ぶ';
  readonly order = 36;

  private w = 0;
  private h = 0;
  private pulse = 0;                         // コア発光のパルス（減衰）
  private angles = new Float32Array(MAX_FIL); // 各フィラメントの向き

  init(c: VisualizerContext): void {
    c.ctx.clearRect(0, 0, c.width, c.height);
    this.w = c.width;
    this.h = c.height;
    for (let i = 0; i < MAX_FIL; i++) this.angles[i] = Math.random() * Math.PI * 2;
  }

  draw(f: AudioFeatures, { ctx, width, height }: VisualizerContext): void {
    if (width !== this.w || height !== this.h) {
      ctx.clearRect(0, 0, width, height);
      this.w = width;
      this.h = height;
    }

    // 短いトレイル＝放電のちらつき。動画は透け続ける。
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const cx = width / 2;
    const cy = height / 2;
    const minDim = Math.min(width, height);
    const sphereR = minDim * 0.4;
    const baseHue = 280;                       // 紫（プラズマの基調）

    // フィラメントの向きを更新：ゆっくり漂い、キック/ビートで一部が飛び移る。
    if (f.kick || f.beat) this.pulse = 1;
    for (let i = 0; i < MAX_FIL; i++) {
      this.angles[i] += (Math.random() - 0.5) * 0.04;
      if (f.kick && Math.random() < 0.5) this.angles[i] = Math.random() * Math.PI * 2;
      else if (f.beat && Math.random() < 0.2) this.angles[i] = Math.random() * Math.PI * 2;
    }
    this.pulse *= 0.9;

    // ガラス球の輪郭（うっすら）
    ctx.beginPath();
    ctx.arc(cx, cy, sphereR, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${baseHue}, 70%, 65%, 0.15)`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // ジッター量（treble/impulse でパチパチ）
    const amp = sphereR * (0.10 + f.treble * 0.18 + f.impulse * 0.12);
    const count = Math.min(MAX_FIL, 4 + Math.round(f.bass * 5));

    for (let i = 0; i < count; i++) {
      const a = this.angles[i];
      const hue = baseHue + (i % 2 ? 20 : -30); // 紫〜青のばらつき
      const ex = cx + Math.cos(a) * sphereR;
      const ey = cy + Math.sin(a) * sphereR;

      // 本線：中心→ガラス
      this.bolt(ctx, cx, cy, ex, ey, amp, hue);

      // 枝分かれ（半分より外から、少しずれた方向へ）
      if (Math.random() < 0.6) {
        const bt = 0.45 + Math.random() * 0.2;
        const bx = cx + (ex - cx) * bt;
        const by = cy + (ey - cy) * bt;
        const ba = a + (Math.random() - 0.5) * 0.8;
        const bl = sphereR * (0.7 + Math.random() * 0.25);
        this.bolt(ctx, bx, by, cx + Math.cos(ba) * bl, cy + Math.sin(ba) * bl, amp * 0.7, hue);
      }

      // 接触部の発光：ガラス外周に当たった箇所だけが弧状に光る（反射）。丸い点は描かない。
      const spread = 0.025 + f.bass * 0.03; // 当たりの広がり（rad 半幅・狭め）
      ctx.beginPath();
      ctx.arc(cx, cy, sphereR, a - spread * 2, a + spread * 2);
      ctx.strokeStyle = `hsla(${hue + 15}, 90%, 65%, 0.3)`; // 外周の広めのにじみ
      ctx.lineWidth = 4 + f.bass * 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, sphereR, a - spread, a + spread);
      ctx.strokeStyle = `hsla(${hue + 25}, 100%, 85%, 0.95)`; // 芯（明るい弧）
      ctx.lineWidth = 2 + f.bass * 2;
      ctx.stroke();
    }

    // コア（中心の電極）：ギザギザな輪郭の発光。外周の稲妻に合わせ、頂点半径を毎フレーム乱数で。
    const coreR = minDim * (0.014 + f.rms * 0.016 + this.pulse * 0.025);
    const outer = coreR * 2.6;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outer);
    grad.addColorStop(0, 'rgba(230,240,255,0.95)');
    grad.addColorStop(0.45, `hsla(${baseHue + 10}, 100%, 75%, 0.5)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    const N = 22;
    for (let k = 0; k < N; k++) {
      const ang = (k / N) * Math.PI * 2;
      const rr = coreR * 1.0 + Math.random() * (outer - coreR); // 谷は明るく・尖端はフェード端へ
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = grad; // 内側ほど明るいグラデをギザギザ多角形で切り抜く＝不揃いな発光
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
  }

  /** ギザギザの稲妻を1本描く（グロー＋芯の二度描き）。両端で振れが0になるよう包絡をかける。 */
  private bolt(
    ctx: CanvasRenderingContext2D,
    x0: number, y0: number, x1: number, y1: number, amp: number, hue: number,
  ): void {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len; // 進行方向に垂直
    const K = 12;

    const path = (): void => {
      ctx.beginPath();
      for (let k = 0; k <= K; k++) {
        const t = k / K;
        const env = Math.sin(Math.PI * t);              // 両端0・中央最大
        const off = (Math.random() - 0.5) * amp * env;
        const x = x0 + dx * t + px * off;
        const y = y0 + dy * t + py * off;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    };

    path();
    ctx.strokeStyle = `hsla(${hue}, 90%, 60%, 0.22)`; // グロー
    ctx.lineWidth = 5;
    ctx.stroke();

    path();
    ctx.strokeStyle = `hsla(${hue + 15}, 100%, 82%, 0.9)`; // 芯
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
