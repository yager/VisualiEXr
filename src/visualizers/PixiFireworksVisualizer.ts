import * as PIXI from 'pixi.js';
// Chrome拡張（YouTubeページ）のCSPは unsafe-eval を許さない。副作用importで回避（PixiNeonと同じ）。
import 'pixi.js/unsafe-eval';
import { AudioFeatures } from '../audio/AudioFeatures';
import { SurfaceVisualizer } from './Visualizer';

/**
 * PixiFireworksVisualizer — PixiJS の見せ場サンプル：大量スプライトの花火。
 *
 * Pixi 最大の武器「膨大なスプライトを高速に描く ParticleContainer」を体現する。
 *   - kick/beat → ロケットが下から打ち上がり、頂点で**数百の火花**に爆発。
 *   - 火花は重力で落ちながら減衰、加算合成で発光。色は tonalAngle（調性）ベース。
 * 全パーティクルは事前に確保してプールを使い回す（生成/破棄コストを避ける定番手法）。
 * 背景は透明＝下の動画の上で花火が上がる。※ pixi.js 同梱でビルド増（許容）。用語は docs/visualizer-basics.md。
 */

const MAX = 6000;        // パーティクル総数（プール）
const DT = 0.016;
const ROCKET_G = 620;    // ロケットの減速（px/秒²）
const SPARK_G = 90;      // 火花の重力は弱め（爆発力が勝ち、ほぼ正円を保つ＝菊）
const DRAG = 0.965;      // 強めの空気抵抗＝広がって程よく止まり、円のまま消える

export default class PixiFireworksVisualizer implements SurfaceVisualizer {
  readonly id = 'pixi-fireworks';
  readonly name = 'Fireworks (PixiJS)';
  readonly author = 'VisualiEXr';
  readonly description = 'PixiJSの大量スプライトで打ち上がる菊の花火';
  readonly order = 61;

  private container: HTMLElement | null = null;
  private app: PIXI.Application | null = null;
  private ready = false;
  private particles: PIXI.Particle[] = [];

  // パーティクル状態（プールと並行の配列）
  private px = new Float32Array(MAX);
  private py = new Float32Array(MAX);
  private vx = new Float32Array(MAX);
  private vy = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private hue = new Float32Array(MAX);
  private kind = new Uint8Array(MAX); // 0=死 1=ロケット 2=火花
  private cursor = 0;

  private w = 0;
  private h = 0;
  private kickCd = 0;
  private beatCd = 0;

  mount(container: HTMLElement): void {
    this.container = container;
    this.ready = false;

    const app = new PIXI.Application();
    this.app = app;
    app
      .init({
        width: Math.max(1, container.clientWidth),
        height: Math.max(1, container.clientHeight),
        backgroundAlpha: 0,
        antialias: true,
      })
      .then(() => {
        const canvas = app.canvas;
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
        container.appendChild(canvas);

        // 柔らかい光点テクスチャ（淡い外周＋明るい芯）を1枚作って全火花で共有
        const dot = new PIXI.Graphics();
        dot.circle(16, 16, 15).fill({ color: 0xffffff, alpha: 0.18 });
        dot.circle(16, 16, 6).fill({ color: 0xffffff, alpha: 1 });
        const texture = app.renderer.generateTexture(dot);
        dot.destroy();

        // 位置・スケール・色は毎フレーム変わる＝dynamic。回転は使わない＝static（高速）。
        const pc = new PIXI.ParticleContainer({
          dynamicProperties: { position: true, scale: true, rotation: false, color: true },
        });
        pc.blendMode = 'add'; // 加算＝重なるほど明るい花火
        app.stage.addChild(pc);

        for (let i = 0; i < MAX; i++) {
          const p = new PIXI.Particle({ texture, anchorX: 0.5, anchorY: 0.5, alpha: 0 });
          pc.addParticle(p);
          this.particles.push(p);
        }

        this.w = app.renderer.width;
        this.h = app.renderer.height;
        this.ready = true;
      })
      .catch((e) => console.warn('[Fireworks] init 失敗:', e));
  }

  frame(f: AudioFeatures): void {
    if (!this.ready || !this.app) return;
    this.resize();

    // ── 打ち上げ：kick で発火（beat でも控えめに）。クールダウンで撃ちすぎ防止 ──
    this.kickCd -= DT;
    this.beatCd -= DT;
    if (f.kick && this.kickCd <= 0) { this.launch(f); this.kickCd = 0.12; }
    else if (f.beat && this.beatCd <= 0) { this.launch(f); this.beatCd = 0.35; }

    // ── 全パーティクル更新 ──
    for (let i = 0; i < MAX; i++) {
      const k = this.kind[i];
      if (k === 0) continue;
      const p = this.particles[i];

      if (k === 1) {
        // ロケット：上昇しつつ減速。頂点（速度が緩む）で爆発。
        this.vy[i] += ROCKET_G * DT;
        this.px[i] += this.vx[i] * DT;
        this.py[i] += this.vy[i] * DT;
        this.life[i] -= DT;
        if (this.vy[i] >= -30 || this.life[i] <= 0) {
          this.explode(this.px[i], this.py[i], this.hue[i], f);
          this.kind[i] = 0;
          p.alpha = 0;
          continue;
        }
        p.x = this.px[i];
        p.y = this.py[i];
        p.scaleX = p.scaleY = 0.5;
        p.alpha = 1;
        p.tint = this.hsl(this.hue[i], 0.4, 0.9); // 打ち上げは白っぽく明るい
      } else {
        // 火花：重力＋空気抵抗で落ちながら減衰。
        this.vx[i] *= DRAG;
        this.vy[i] = this.vy[i] * DRAG + SPARK_G * DT;
        this.px[i] += this.vx[i] * DT;
        this.py[i] += this.vy[i] * DT;
        this.life[i] -= DT;
        if (this.life[i] <= 0) { this.kind[i] = 0; p.alpha = 0; continue; }
        const lt = this.life[i] / this.maxLife[i]; // 1→0
        p.x = this.px[i];
        p.y = this.py[i];
        p.scaleX = p.scaleY = 0.25 + lt * 0.5;
        p.alpha = lt;
        p.tint = this.hsl(this.hue[i], 0.9, 0.55 + lt * 0.25);
      }
    }
  }

  /** ロケットを1発、画面下から打ち上げる。 */
  private launch(f: AudioFeatures): void {
    const i = this.alloc();
    this.px[i] = (0.2 + Math.random() * 0.6) * this.w;
    this.py[i] = this.h + 6;
    this.vx[i] = (Math.random() - 0.5) * 60;
    this.vy[i] = -(560 + Math.random() * 200 + f.bass * 120); // bass で高く
    this.life[i] = 2.0; // 保険のヒューズ（通常は頂点で爆発）
    this.hue[i] = (f.tonalAngle + Math.random() * 0.1) % 1;
    this.kind[i] = 1;
  }

  /** 火花の爆発（菊：ほぼ同速の球殻を2Dへ投影＝縁が明るい正円）。 */
  private explode(x: number, y: number, hue: number, f: AudioFeatures): void {
    const count = Math.floor(120 + Math.random() * 80 + f.bass * 140);
    const baseSpeed = 300 + f.bass * 130; // 発ごとにほぼ一定＝殻状に正円へ広がる
    for (let n = 0; n < count; n++) {
      const i = this.alloc();
      // 3D 球面上の一様方向。2D(vx,vy)へ投影すると、極付近は中心寄り・赤道付近は外周へ
      // ＝縁が明るい塗りつぶし円（limb brightening）になり、菊らしい正円の花になる。
      const u = Math.random() * 2 - 1;      // z 成分
      const th = Math.random() * Math.PI * 2;
      const r2 = Math.sqrt(1 - u * u);
      const sp = baseSpeed * (0.9 + Math.random() * 0.2); // ほぼ同速
      this.px[i] = x;
      this.py[i] = y;
      this.vx[i] = Math.cos(th) * r2 * sp;
      this.vy[i] = Math.sin(th) * r2 * sp;
      const l = 0.9 + Math.random() * 0.5; // 広がりきる頃に消える＝円のままフェード
      this.life[i] = l;
      this.maxLife[i] = l;
      this.hue[i] = (hue + (Math.random() - 0.5) * 0.08 + 1) % 1;
      this.kind[i] = 2;
    }
  }

  /** プールから次のスロットを取る（最古を上書きするリングバッファ）。 */
  private alloc(): number {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    return i;
  }

  private resize(): void {
    const c = this.container!;
    const w = Math.max(1, c.clientWidth);
    const h = Math.max(1, c.clientHeight);
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.app!.renderer.resize(w, h);
  }

  /** HSL(各0〜1) → 0xRRGGBB。 */
  private hsl(h: number, s: number, l: number): number {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number): number => {
      const k = (n + h * 12) % 12;
      const col = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * col);
    };
    return (f(0) << 16) | (f(8) << 8) | f(4);
  }

  unmount(): void {
    if (this.app) this.app.destroy(true, { children: true });
    this.app = null;
    this.particles = [];
    this.ready = false;
    this.container = null;
  }
}
