/**
 * PixiNeonVisualizer（og-poster用コピー）— 元は src/visualizers/PixiNeonVisualizer.ts。
 *
 * 差分なし（ロジック・オプションともオリジナルと同一）。キャンバスは `app.canvas` から
 * そのまま drawImage で読めるため、キャプチャ対応の改造は不要（指示に従い無改変でコピー）。
 * import パスのみ、このファイルの新しい置き場所（tools/og-poster/vendored/）に合わせて調整。
 */
import * as PIXI from 'pixi.js';
// Chrome拡張（YouTubeページ）のCSPは unsafe-eval を許さない。この副作用importで
// Pixi の eval 依存部分を eval非依存の polyfill に差し替える（import するだけで自動適用）。
import 'pixi.js/unsafe-eval';
// 拡張フィルタは pixi-filters から**サブモジュール単位**でimport（使う分だけバンドル＝軽い）。
import { GlowFilter } from 'pixi-filters/glow';
import { ShockwaveFilter } from 'pixi-filters/shockwave';
import { AudioFeatures } from '../../../src/audio/AudioFeatures';
import { SurfaceVisualizer } from '../../../src/visualizers/Visualizer';

const SHOCK_SPEED = 700; // ショックウェーブの前進速度（px/秒相当）

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
    // OGポスター用調整：中央の空きはロゴにかからない広さ、バーは長めに横へ突き出す。
    // 外側に放射するバーだけを描く（正円は描かない）。
    // 角度は「真上=0度、時計回りが正」の座標系で、上半分(-90°〜90°)と下半分(90°〜270°)に
    // 同じ低音→高音のスペクトラムを2回リピート配置する。低音（振幅が大きい）が -90° 付近
    // （上半分の左端）と +90° 付近（下半分の右端）＝ともに水平方向の端に来るので、
    // 横長キャンバスでバーが画面内に収まりやすい。
    // （回転する this.phase は静止画では位置がズレるだけなので使わない）
    const R0 = minDim * 0.3;
    const len = minDim * 0.4;
    const halfSpokes = Math.floor(spokes / 2);
    for (let half = 0; half < 2; half++) {
      const angleStart = half === 0 ? -Math.PI / 2 : Math.PI / 2; // 上半分: -90° / 下半分: +90°
      for (let i = 0; i < halfSpokes; i++) {
        const t = i / halfSpokes; // 0(低音)→1(高音)
        const amp = spec[Math.floor(t * (span - 1))] / 255;
        const theta = angleStart + t * Math.PI; // 半円分(180°)を掃引
        const sin = Math.sin(theta);
        const cos = Math.cos(theta);
        const r1 = R0 + amp * len;
        // 真上=0度の座標系: x = cx + r*sin(theta), y = cy - r*cos(theta)
        g.moveTo(cx + sin * R0, cy - cos * R0);
        g.lineTo(cx + sin * r1, cy - cos * r1);
      }
    }
    g.stroke({ width: 2.5, color: 0xffffff, alpha: 0.9 });
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
