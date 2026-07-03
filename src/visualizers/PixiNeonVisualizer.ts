import * as PIXI from 'pixi.js';
// Chrome拡張（YouTubeページ）のCSPは unsafe-eval を許さない。この副作用importで
// Pixi の eval 依存部分を eval非依存の polyfill に差し替える（import するだけで自動適用）。
import 'pixi.js/unsafe-eval';
// 拡張フィルタは pixi-filters から**サブモジュール単位**でimport（使う分だけバンドル＝軽い）。
import { GlowFilter } from 'pixi-filters/glow';
import { ShockwaveFilter } from 'pixi-filters/shockwave';
import { AudioFeatures } from '../audio/AudioFeatures';
import { SurfaceVisualizer } from './Visualizer';

const SHOCK_SPEED = 700; // ショックウェーブの前進速度（px/秒相当）

/**
 * PixiNeonVisualizer — PixiJS ＋ pixi-filters（拡張フィルタ）の見せ場サンプル。
 *
 * 「Canvas2D では無理」な GPU フィルタで音に反応させる:
 *   - GlowFilter（ネオン発光）：bass / beat で発光量、tonalAngle で色。
 *   - ShockwaveFilter（波紋）：kick のたびに中心から円い衝撃波が走る。
 * ベースは spectrum の放射スポーク＋脈動リング（毎フレーム描き直し）。
 *
 * ※ pixi-filters / pixi.js を同梱するためこのビルドはサイズが増える（許容の上で採用）。
 * ※ 用語は docs/visualizer-basics.md 参照。
 */
export default class PixiNeonVisualizer implements SurfaceVisualizer {
  readonly id = 'pixi-neon';
  readonly name = 'PixiNeon (PixiJS)';
  readonly author = 'VisualiEXr';
  readonly description = 'PixiJS＋フィルタのネオン演出（Glow/Shockwave）';
  readonly order = 60;

  private container: HTMLElement | null = null;
  private app: PIXI.Application | null = null;
  private ready = false;
  private content: PIXI.Container | null = null;
  private g: PIXI.Graphics | null = null;
  private glow: GlowFilter | null = null;
  private shock: ShockwaveFilter | null = null;
  private w = 0;
  private h = 0;
  private phase = 0;
  private shockActive = false;

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

        const content = new PIXI.Container();
        const g = new PIXI.Graphics();
        content.addChild(g);
        app.stage.addChild(content);

        // 拡張フィルタ（pixi-filters）：ネオングロー ＋ ビートで走るショックウェーブ
        const glow = new GlowFilter({ distance: 18, outerStrength: 2, innerStrength: 1, color: 0x33ccff, quality: 0.3 });
        const shock = new ShockwaveFilter({
          center: { x: 0, y: 0 },
          amplitude: 30,
          wavelength: 120,
          brightness: 1.1,
          speed: SHOCK_SPEED,
          radius: 1,
          time: 999, // 最初は「終わった状態」にしておく（kick で発火）
        });
        content.filters = [glow, shock];

        this.content = content;
        this.g = g;
        this.glow = glow;
        this.shock = shock;
        this.ready = true;
      })
      .catch((e) => console.warn('[PixiNeon] init 失敗:', e));
  }

  frame(f: AudioFeatures): void {
    if (!this.ready || !this.app || !this.g || !this.content || !this.glow || !this.shock) return;
    this.resize();

    const cx = this.w / 2;
    const cy = this.h / 2;
    const minDim = Math.min(this.w, this.h);
    this.phase += 0.003 + f.flux * 0.02; // flux で回転が速く

    const color = this.hsl(f.tonalAngle, 0.5 + 0.5 * f.tonalStrength, 0.6); // 調性 → 色

    // ── ベース図形：spectrum の放射スポーク＋脈動リング（毎フレーム描き直し）──
    const g = this.g;
    g.clear();
    const spokes = 96;
    const spec = f.spectrum;
    const span = Math.max(2, Math.floor(spec.length * 0.4)); // 低〜中域を使う
    const R0 = minDim * 0.12;
    const len = minDim * 0.34;
    for (let i = 0; i < spokes; i++) {
      const t = i / spokes;
      const amp = spec[Math.floor(t * (span - 1))] / 255;
      const a = t * Math.PI * 2 + this.phase;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const r1 = R0 + amp * len;
      g.moveTo(cx + cos * R0, cy + sin * R0);
      g.lineTo(cx + cos * r1, cy + sin * r1);
    }
    g.stroke({ width: 2.5, color: 0xffffff, alpha: 0.9 });
    g.circle(cx, cy, R0 * (0.7 + f.bass * 0.6)).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
    g.circle(cx, cy, R0 + len * (0.5 + 0.5 * f.rms)).stroke({ width: 1.5, color: 0xffffff, alpha: 0.3 });
    this.content.tint = color;

    // ── グロー：低音・拍で発光量アップ、色は調性 ──
    this.glow.color = color;
    this.glow.outerStrength = 1.5 + f.bass * 8 + (f.beat ? 3 : 0);
    this.glow.innerStrength = 0.5 + f.rms * 2;

    // ── ショックウェーブ：kick で中心から発火、以後 time を進めて前進させる ──
    const shock = this.shock;
    if (f.kick) {
      shock.time = 0;
      shock.center.x = cx;
      shock.center.y = cy;
      shock.radius = Math.hypot(this.w, this.h);
      this.shockActive = true;
    }
    if (this.shockActive) {
      shock.time += 0.016;
      if (shock.time * SHOCK_SPEED > shock.radius) {
        this.shockActive = false;
        shock.time = 999; // 波が画面外へ抜けたら無効化
      }
    }
  }

  /** コンテナのサイズに追従（全画面/シアター切替やウィンドウリサイズに対応）。 */
  private resize(): void {
    const c = this.container!;
    const w = Math.max(1, c.clientWidth);
    const h = Math.max(1, c.clientHeight);
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.app!.renderer.resize(w, h);
    // フィルタが画面全体に効くように領域を明示（ショックウェーブが端まで走る）
    this.content!.filterArea = new PIXI.Rectangle(0, 0, w, h);
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
    this.content = null;
    this.g = null;
    this.glow = null;
    this.shock = null;
    this.ready = false;
    this.container = null;
  }
}
