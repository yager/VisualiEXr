import * as PIXI from 'pixi.js';
import 'pixi.js/unsafe-eval';
import { RGBSplitFilter } from 'pixi-filters/rgb-split';
import { GlitchFilter } from 'pixi-filters/glitch';
import { CRTFilter } from 'pixi-filters/crt';
import { AudioFeatures } from '../audio/AudioFeatures';
import { SurfaceVisualizer } from './Visualizer';

/** 調整用定数（各項目の意味はファイル末尾コメント参照）。 */
const CONFIG = {
  colors: { cyan: 0x00e8ff, magenta: 0xff2aa0, tear: 0xff4488 },
  grid: { cols: 36, rows: 22, alphaBase: 0.1, alphaGain: 0.7 },
  tracking: {
    bands: 14,
    panGain: 28,
    stereoSpread: 22,
    fluxJitter: 18,
    smooth: 0.14,
    dropSnap: 72,
    tearAlpha: 0.12,
  },
  rgbSplit: { base: 0.8, gain: 20 },
  glitch: {
    baseSlices: 1,
    baseOffset: 0,
    burstSlices: 16,
    burstOffset: 120,
    burstDecay: 0.78,
  },
  crt: {
    curvature: 0.55,
    lineWidth: 1,
    lineContrast: 0.16,
    noiseBase: 0.05,
    noiseGain: 0.32,
    vignette: 0.58,
    vignetteAlpha: 0.24,
    vignetteBlur: 0.22,
  },
  recDot: { show: true, radius: 5, flashDecay: 0.72 },
  background: { alpha: 0 },
} as const;

const DT = 0.016;
const TRACK_BANDS = CONFIG.tracking.bands;

/**
 * GlitchVHSVisualizer — PixiJS ＋ pixi-filters の VHS / グリッチ派手系。
 *
 * フル幅ノイズ床＋横帯トラッキングエラー（帯ごと X ずれ）を自前描画し、
 * RGBSplit / Glitch / CRT を重ねる。平常時 Glitch はほぼゼロ、拍でデータモッシュ burst。
 * REC ドットのみ無フィルタ層に表示（拍の瞬間だけ点滅）。背景透明＝動画透過。
 */
export default class GlitchVHSVisualizer implements SurfaceVisualizer {
  readonly id = 'glitch-vhs';
  readonly name = 'Glitch VHS (PixiJS)';
  readonly author = 'VisualiEXr';
  readonly description = 'VHSトラッキングエラー＋ノイズ床。拍で画面が破断';
  readonly order = 65;

  private container: HTMLElement | null = null;
  private app: PIXI.Application | null = null;
  private ready = false;
  private signal: PIXI.Container | null = null;
  private g: PIXI.Graphics | null = null;
  private recG: PIXI.Graphics | null = null;
  private rgb: RGBSplitFilter | null = null;
  private glitch: GlitchFilter | null = null;
  private crt: CRTFilter | null = null;

  private readonly bandShift = new Float32Array(TRACK_BANDS);
  private w = 0;
  private h = 0;
  private glitchBurst = 0;
  private recFlash = 0;
  private crtTime = 0;
  private glitchSeed = 0;
  private dropBand = 0;

  mount(container: HTMLElement): void {
    this.container = container;
    this.ready = false;

    const app = new PIXI.Application();
    this.app = app;
    app
      .init({
        width: Math.max(1, container.clientWidth),
        height: Math.max(1, container.clientHeight),
        backgroundAlpha: CONFIG.background.alpha,
        antialias: true,
      })
      .then(() => {
        app.ticker.stop();

        const canvas = app.canvas;
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
        container.appendChild(canvas);

        const signal = new PIXI.Container();
        const g = new PIXI.Graphics();
        signal.addChild(g);

        const rgb = new RGBSplitFilter({
          red: { x: -CONFIG.rgbSplit.base, y: 0 },
          green: { x: CONFIG.rgbSplit.base * 0.4, y: 0 },
          blue: { x: CONFIG.rgbSplit.base * 0.2, y: 0 },
        });
        const glitch = new GlitchFilter({
          slices: CONFIG.glitch.baseSlices,
          offset: CONFIG.glitch.baseOffset,
          seed: 0,
          fillMode: 0,
          average: false,
        });
        const crt = new CRTFilter({
          curvature: CONFIG.crt.curvature,
          lineWidth: CONFIG.crt.lineWidth,
          lineContrast: CONFIG.crt.lineContrast,
          verticalLine: false,
          time: 0,
          noise: CONFIG.crt.noiseBase,
          noiseSize: 1,
          vignetting: CONFIG.crt.vignette,
          vignettingAlpha: CONFIG.crt.vignetteAlpha,
          vignettingBlur: CONFIG.crt.vignetteBlur,
        });
        signal.filters = [rgb, glitch, crt];

        const osd = new PIXI.Container();
        const recG = new PIXI.Graphics();
        osd.addChild(recG);

        app.stage.addChild(signal);
        if (CONFIG.recDot.show) app.stage.addChild(osd);

        this.signal = signal;
        this.g = g;
        this.recG = recG;
        this.rgb = rgb;
        this.glitch = glitch;
        this.crt = crt;
        this.w = app.renderer.width;
        this.h = app.renderer.height;
        signal.filterArea = new PIXI.Rectangle(0, 0, this.w, this.h);
        this.ready = true;
      })
      .catch((e) => console.warn('[GlitchVHS] init 失敗:', e));
  }

  frame(f: AudioFeatures): void {
    if (!this.ready || !this.app || !this.g || !this.signal || !this.rgb || !this.glitch || !this.crt) return;
    this.resize();

    if (f.beat || f.kick) {
      this.glitchBurst = 1;
      this.recFlash = 1;
      this.glitch.refresh();
    }
    if (f.drop) {
      this.glitchBurst = Math.max(this.glitchBurst, 0.85);
      this.dropBand = Math.floor(Math.random() * TRACK_BANDS);
      this.bandShift[this.dropBand] += CONFIG.tracking.dropSnap * (Math.random() > 0.5 ? 1 : -1);
      this.glitch.refresh();
    }
    this.glitchBurst *= CONFIG.glitch.burstDecay;
    this.recFlash *= CONFIG.recDot.flashDecay;

    this.updateBandShifts(f);
    this.drawSignal(f);
    this.drawRecDot();
    this.updateFilters(f);

    this.app.render();
  }

  /** 横帯ごとの X ずれ（VHS トラッキングエラー）。 */
  private updateBandShifts(f: AudioFeatures): void {
    const mid = (TRACK_BANDS - 1) / 2;
    const smooth = CONFIG.tracking.smooth;
    for (let i = 0; i < TRACK_BANDS; i++) {
      const spread = (i - mid) / Math.max(1, mid);
      const target =
        f.pan * CONFIG.tracking.panGain +
        spread * f.stereoWidth * CONFIG.tracking.stereoSpread +
        (Math.random() - 0.5) * f.flux * CONFIG.tracking.fluxJitter;
      this.bandShift[i] += (target - this.bandShift[i]) * smooth;
    }
  }

  /** フル幅ノイズ床＋帯オフセット描画。 */
  private drawSignal(f: AudioFeatures): void {
    const g = this.g!;
    const w = this.w;
    const h = this.h;
    g.clear();

    const { cols, rows } = CONFIG.grid;
    const cellW = w / cols;
    const cellH = h / rows;
    const rowsPerBand = Math.max(1, Math.ceil(rows / TRACK_BANDS));
    const bands = f.bands;
    const bright = 0.45 + f.rms * 0.5;

    for (let row = 0; row < rows; row++) {
      const bandIdx = Math.min(TRACK_BANDS - 1, Math.floor(row / rowsPerBand));
      const dx = this.bandShift[bandIdx];
      const y = row * cellH;

      const zone = row / Math.max(1, rows - 1);
      const zoneE =
        zone < 0.33 ? f.bass : zone < 0.66 ? f.mid : f.treble;
      const bandE = bands[Math.min(bands.length - 1, Math.floor(zone * bands.length))] ?? f.rms;

      for (let col = 0; col < cols; col++) {
        const flicker = 0.85 + 0.15 * Math.sin(col * 0.7 + row * 1.1 + f.time * 3.5);
        const v = Math.min(1, (zoneE * 0.55 + bandE * 0.45) * bright * flicker);
        const colT = (col / cols + f.tonalAngle * 0.4 + zone * 0.15) % 1;
        const color = this.mixColor(CONFIG.colors.cyan, CONFIG.colors.magenta, colT);
        const x = col * cellW + dx;
        g.rect(x, y, cellW - 0.5, cellH - 0.5).fill({
          color,
          alpha: CONFIG.grid.alphaBase + v * CONFIG.grid.alphaGain,
        });
      }

      if (row > 0 && row % rowsPerBand === 0) {
        const tearY = y;
        g.rect(-20, tearY, w + 40, 1.2).fill({
          color: CONFIG.colors.tear,
          alpha: CONFIG.tracking.tearAlpha + f.flux * 0.15,
        });
      }
    }
  }

  /** 拍の瞬間だけ左上に REC ドット（フィルタ無し＝読める/判別できる）。 */
  private drawRecDot(): void {
    if (!CONFIG.recDot.show || !this.recG) return;
    const g = this.recG;
    g.clear();
    if (this.recFlash < 0.08) return;
    g.circle(18, 18, CONFIG.recDot.radius).fill({
      color: 0xff2244,
      alpha: Math.min(1, this.recFlash),
    });
  }

  private updateFilters(f: AudioFeatures): void {
    const attack = f.impulse * 0.7 + f.flux * 0.3;
    const splitAmt = CONFIG.rgbSplit.base + CONFIG.rgbSplit.gain * attack * (0.3 + this.glitchBurst * 0.7);
    this.rgb!.redX = -splitAmt;
    this.rgb!.greenX = splitAmt * 0.5;
    this.rgb!.blueX = splitAmt * 0.25;

    const burst = this.glitchBurst;
    this.glitch!.slices = Math.max(
      CONFIG.glitch.baseSlices,
      Math.round(CONFIG.glitch.baseSlices + (CONFIG.glitch.burstSlices - CONFIG.glitch.baseSlices) * burst),
    );
    this.glitch!.offset = CONFIG.glitch.baseOffset +
      (CONFIG.glitch.burstOffset - CONFIG.glitch.baseOffset) * burst;
    this.glitchSeed += 0.2 + burst * 2.5;
    this.glitch!.seed = this.glitchSeed;
    if (burst > 0.25) this.glitch!.refresh();

    this.crtTime += DT;
    this.crt!.time = this.crtTime;
    this.crt!.noise =
      CONFIG.crt.noiseBase + CONFIG.crt.noiseGain * (f.treble * 0.7 + (f.hat ? 0.25 : 0));
  }

  private resize(): void {
    const c = this.container!;
    const w = Math.max(1, c.clientWidth);
    const h = Math.max(1, c.clientHeight);
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.app!.renderer.resize(w, h);
    this.signal!.filterArea = new PIXI.Rectangle(0, 0, w, h);
  }

  private mixColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | bl;
  }

  unmount(): void {
    this.glitch?.destroy();
    this.rgb?.destroy();
    this.crt?.destroy();
    if (this.app) this.app.destroy(true, { children: true });
    this.app = null;
    this.signal = null;
    this.g = null;
    this.recG = null;
    this.rgb = null;
    this.glitch = null;
    this.crt = null;
    this.ready = false;
    this.container = null;
  }
}

// ── CONFIG 各項目の意味 ─────────────────────────────────────────────
// colors.cyan/magenta … ノイズ床セルの VHS 配色（tonalAngle で補間）
// colors.tear           … 横帯境界のティアライン色
// grid.cols/rows        … ノイズ床の粗格子解像度（大きいほど細かい＝重い）
// grid.alphaBase/Gain   … セルの透明度（小さいほど動画が透ける）
// tracking.bands        … 横帯分割数（トラッキングエラーの本数）
// tracking.panGain      … pan による帯ずれ量
// tracking.stereoSpread … stereoWidth による帯間の差
// tracking.fluxJitter   … flux によるランダム揺れ
// tracking.smooth       … 帯ずれの追従速度（大きいほどキビキビ）
// tracking.dropSnap     … drop 時の一帯だけ大きくズレる量
// tracking.tearAlpha    … 帯境界線の見え方
// rgbSplit.base/gain    … 常時最小ズレ + アタック/バースト時の RGB 分裂
// glitch.baseSlices/Offset … 平常時（≒0 で静か）
// glitch.burstSlices/Offset … beat/kick 時のデータモッシュ強度
// glitch.burstDecay     … バースト減衰（小さいほど破断が長く残る）
// crt.*                 … 走査線・湾曲・ノイズ・ビネット（控えめ設定）
// recDot.show           … 拍時 REC ドット（無フィルタ層）
// recDot.flashDecay     … ドットの残光時間
// background.alpha      … 0＝透明オーバーレイ
