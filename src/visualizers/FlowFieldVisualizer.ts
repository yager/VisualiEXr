import { AudioFeatures } from '../audio/AudioFeatures';
import { Visualizer, VisualizerContext } from './Visualizer';

interface Particle {
  x: number;
  y: number;
  life: number;  // 残り寿命（フレーム）
  max: number;   // 寿命の最大（フェード計算用）
  hue: number;   // 個体の色みオフセット
}

/**
 * FlowFieldVisualizer — chill 系サンプル（Canvas2D・粒子系。ライブラリ不要）。
 *
 * 無数の光点が「流れ場（flow field）」に沿って漂い、淡い軌跡を残す。lo-fi/作業用と相性のよい、
 * 催眠的でおだやかな絵。**「音より仕組みで気持ちよさ」** を体現する一本。
 *
 * chill の原則（[[chill-visualizer-design]]）：
 *   - **流れ（＝各点の進む向き）は座標と時間だけで決まり、音では動かさない**。時間で自律的にうねる。
 *   - 音は「動きに出ない質感」だけにごく薄く：光の明るさ（rms）と色みの基準（tonalAngle）。
 * YouTube に重ねる前提：背景は塗らず、加算合成の淡い点で描画。軌跡は destination-out で少しずつ
 *   消す（＝暗い膜を残さない）ので、下の動画がずっと透けて見える。
 */
export default class FlowFieldVisualizer implements Visualizer {
  readonly id = 'flow-field';
  readonly name = 'Flow Field (Chill)';
  readonly author = 'VisualiEXr';
  readonly description = 'chill：流れ場に沿って粒子が漂い軌跡を残す';
  readonly order = 38;

  private particles: Particle[] = [];
  private w = 0;
  private h = 0;

  init(c: VisualizerContext): void {
    c.ctx.clearRect(0, 0, c.width, c.height);
    this.reset(c.width, c.height);
  }

  private reset(width: number, height: number): void {
    this.w = width;
    this.h = height;
    // 面積に応じた数（重すぎない上限つき）
    const count = Math.min(1400, Math.round((width * height) / 2600));
    this.particles = [];
    for (let i = 0; i < count; i++) this.particles.push(this.spawn(true));
  }

  private spawn(anywhere: boolean): Particle {
    const max = 180 + Math.random() * 320;
    return {
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      // 初期化時は寿命をばらけさせ、いっせいに消えないようにする
      life: anywhere ? Math.random() * max : max,
      max,
      hue: (Math.random() - 0.5) * 60, // 個体ごとの色みブレ
    };
  }

  /** 流れ場：座標と時間だけで向きを決める（音は入れない）。滑らかにうねる。 */
  private angle(x: number, y: number, t: number): number {
    const s = 2.6 / this.h; // 画面高さで正規化＝サイズによらず同じ模様スケール
    return (
      Math.sin(x * s + t * 0.15) +
      Math.cos(y * s * 1.1 - t * 0.12) +
      Math.sin((x + y) * s * 0.6 + t * 0.05)
    ) * 1.3;
  }

  draw(f: AudioFeatures, { ctx, width, height }: VisualizerContext): void {
    if (width !== this.w || height !== this.h) {
      ctx.clearRect(0, 0, width, height);
      this.reset(width, height);
    }

    // 軌跡を少しずつ消す（暗い膜を残さず、動画が透け続ける）。
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.045)';
    ctx.fillRect(0, 0, width, height);

    // 光点は加算合成でやわらかく重ねる。
    ctx.globalCompositeOperation = 'lighter';

    const t = f.time;
    const speed = height * 0.0022;              // ゆっくり流れる（chill）
    const baseHue = 200 + f.tonalAngle * 80;    // 色みの基準は調性でゆっくり動く（質感）
    const alpha = 0.09 + f.rms * 0.10;          // 明るさだけ音で微調整（動きには出さない）

    for (const p of this.particles) {
      const a = this.angle(p.x, p.y, t);
      p.x += Math.cos(a) * speed;
      p.y += Math.sin(a) * speed;
      p.life -= 1;

      // 寿命切れ or 画面外 → 別の場所へ生まれ直す
      if (p.life <= 0 || p.x < -10 || p.x > width + 10 || p.y < -10 || p.y > height + 10) {
        Object.assign(p, this.spawn(false));
        continue;
      }

      // 生まれ際・消え際はフェード（ふっと現れて消える）
      const fade = Math.min(1, p.life / 40, (p.max - p.life) / 40);
      ctx.fillStyle = `hsla(${baseHue + p.hue}, 70%, 66%, ${alpha * fade})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over'; // 後片付け（他描画への影響を防ぐ）
  }

  dispose(): void {
    this.particles = [];
    this.w = 0;
    this.h = 0;
  }
}
