import { AudioFeatures } from '../audio/AudioFeatures';
import { Visualizer, VisualizerContext } from './Visualizer';
import { drawHudFrame, HudFrameLayout } from './hud/drawHudFrame';
import {
  HUD_FONT, HUD_LABEL_CAP, HUD_ROW_MID_MIN, HUD_SLICE, TRIG_LAMP_SIZE,
  HudSliceSet, loadHudSlices,
} from './hud/HudSlices';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const CYAN = '#66cccc';          // 明るい青緑（主色。枠・ゲージ・ライン用）
const TEXT_COLOR = '#99ffff';    // 文字専用色（CYANよりさらに明るく、可視性を優先）
const CYAN_DIM = '#339999';      // 一段暗い青緑（副色）
const CYAN_FAINT = 'rgba(102,204,204,0.18)'; // 薄い主色（罫線・リング）
const ORANGE = '#cc6666';        // 差し色（コーラル）
const LOCK_ORANGE = '#ff9933';   // CHROMAのLOCK中キーを目立たせる明るいオレンジ
const LAMP_HOLD = 0.12;
const LINE_H = 12;

/**
 * InTheShellVisualizer — Analyzer の HUD 版（Canvas 2D + スライス SVG 枠）。
 */
export default class InTheShellVisualizer implements Visualizer {
  readonly id = 'in-the-shell';
  readonly name = 'In The Shell (HUD)';
  readonly author = 'VisualiEXr';
  readonly description = 'AudioFeatures を SF/HUD 風計器パネルで表示';
  readonly order = 3;

  private slices: HudSliceSet | null = null;
  private lampHold: Record<string, number> = {};
  private hexCanvas: HTMLCanvasElement | null = null;
  private glitchUntil = 0;
  private nextGlitchAt = 0;
  /** 切り欠き円の表示角（目標へゆっくり追従）。 */
  private notchAngX = 0;
  private notchAngY = Math.PI / 2 + Math.PI;

  init(): void {
    loadHudSlices().then((s) => { this.slices = s; });
  }

  draw(f: AudioFeatures, { ctx, width, height }: VisualizerContext): void {
    ctx.clearRect(0, 0, width, height);
    if (!this.slices) return;

    ctx.font = HUD_FONT;
    ctx.textBaseline = 'middle';

    const topMargin = 5; // キャンバス最上端にフレームが接しないようにする余白
    const status = this.statusSize(ctx);

    const mainTop = topMargin;
    const mainH = height - mainTop;

    // 左：FREQ（フル高さ）。その右隣の列にMETRICS（画面上に詰める）とRHYTHM（画面下に詰める）。
    const leftColW = this.metricsBoxW();
    const midX = leftColW;

    const rhythmW = this.rhythmTrigBoxW();
    const rhythmH = this.rhythmTrigBoxH();

    // 右上詰め：STATUS直下にTONAL（幅はSTATUSと同じ・左レーダー右テキスト）。
    const tonal = this.tonalSize(ctx, status.w);

    // 右下詰め：CHROMA（上）・WAVE（下）を同じ横幅・同じ高さで積む。
    // CHROMAの音名ラベル（C/C#等）が窮屈にならないよう、1音あたり22px確保する幅にする。
    const rbH = 110; // CHROMA/WAVEともにこれを下回らない最低高さ
    const wChroma = HUD_SLICE * 2 + 22 * 12;
    const rbX = width - wChroma;

    // 描画順＝重なり順（後に描くほど手前）。画面縮小でパネルが重なった際に
    // インパクトのあるパネルが手前に残るよう、指定の優先順（手前→奥：
    // RHYTHM, WAVE, CHROMA, TONAL, STATUS, METRICS, FREQ）を逆順に描画する。
    this.panelFreq(ctx, 0, mainTop, leftColW, mainH, f);
    this.panelMeters(ctx, midX, mainTop, leftColW, mainH, f);
    this.panelStatus(ctx, width - status.w, topMargin, status.w, status.h, f);
    this.panelTonal(ctx, width - tonal.w, topMargin + status.h, tonal.w, tonal.h, f);
    this.panelChroma(ctx, rbX, height - rbH, wChroma, rbH, f);
    this.panelSig(ctx, rbX, height - rbH * 2, wChroma, rbH, f);
    // バンドのドラムのように中央奥（画面下・水平中央）に配置。METRICSは上詰めなので下側は空いている。
    this.panelTrig(ctx, (width - rhythmW) / 2, height - rhythmH, rhythmW, rhythmH, f);

    const panelRects: Array<[number, number, number, number]> = [
      [width - status.w, topMargin, status.w, status.h],
      [0, mainTop, leftColW, mainH],
      [midX, mainTop, leftColW, mainH],
      [(width - rhythmW) / 2, height - rhythmH, rhythmW, rhythmH],
      [width - tonal.w, topMargin + status.h, tonal.w, tonal.h],
      [rbX, height - rbH * 2, wChroma, rbH],
      [rbX, height - rbH, wChroma, rbH],
    ];
    this.drawGlobalPulse(ctx, panelRects, f);
    this.drawGlitch(ctx, width, height, f);
  }

  /**
   * 拍連動の全体グロー・パルス。全パネルの上から加算合成でうっすら重ねることで、
   * SVGで手描きした規則正しい線だけでは出ない「電気的な揺らぎ」を足す。
   * - 拍の瞬間に画面全体がわずかに明るくなり、次の拍にかけて減衰（beatPhaseを流用）。
   * - 毎フレームの微小なランダムジッターと、低確率のフリッカーで不規則さを加える。
   */
  private drawGlobalPulse(
    ctx: CanvasRenderingContext2D, panelRects: Array<[number, number, number, number]>, f: AudioFeatures,
  ): void {
    const beatGlow = Math.max(0, 1 - f.beatPhase);
    const jitter = (Math.random() - 0.5) * 0.03;
    const flicker = Math.random() < 0.04 ? Math.random() * 0.08 : 0;
    const alpha = Math.min(0.18, Math.max(0, 0.015 + beatGlow * 0.09 + jitter + flicker));
    if (alpha <= 0) return;
    ctx.save();
    // パネルの外側（本来は透明なはず）まで加算しないよう、パネル矩形の合成でクリップする。
    ctx.beginPath();
    for (const [x, y, w, h] of panelRects) ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(102,204,204,${alpha})`;
    let maxX = 0;
    let maxY = 0;
    for (const [x, y, w, h] of panelRects) { maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h); }
    ctx.fillRect(0, 0, maxX, maxY);
    ctx.restore();
  }

  /**
   * ノイズ/グリッチのランダム発生。数秒〜十数秒に一度、ごく短時間だけ画面の一部を
   * 水平にずらして「センサーの電波が一瞬乱れる」ような演出を入れる。常時ではなく
   * 低頻度・短時間にすることで、チープに見えず「たまに起きる」不穏さを狙う。
   */
  private drawGlitch(ctx: CanvasRenderingContext2D, width: number, height: number, f: AudioFeatures): void {
    if (this.nextGlitchAt === 0) this.nextGlitchAt = f.time + 4 + Math.random() * 6;
    if (f.time >= this.nextGlitchAt && f.time >= this.glitchUntil) {
      this.glitchUntil = f.time + 0.06 + Math.random() * 0.08;
      this.nextGlitchAt = f.time + 6 + Math.random() * 10;
    }
    if (f.time >= this.glitchUntil) return;

    const bands = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < bands; i++) {
      const bh = 2 + Math.floor(Math.random() * 5);
      const by = Math.floor(Math.random() * Math.max(1, height - bh));
      const offset = Math.round((Math.random() - 0.5) * 24);
      ctx.drawImage(ctx.canvas, 0, by, width, bh, offset, by, width, bh);
    }

    // 走査ノイズの薄い帯を1本重ねる
    const noiseY = Math.floor(Math.random() * height);
    const noiseH = 1 + Math.floor(Math.random() * 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(153,255,255,${(0.15 + Math.random() * 0.15).toFixed(3)})`;
    ctx.fillRect(0, noiseY, width, noiseH);
    ctx.restore();
  }

  // ── フレーム ──

  private withFrame(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, title: string,
    drawContent: (layout: HudFrameLayout) => void,
  ): void {
    if (!this.slices) return;
    const layout = drawHudFrame(ctx, this.slices, x, y, w, h, title);
    ctx.font = HUD_FONT;
    drawContent(layout);
  }

  private statusSize(ctx: CanvasRenderingContext2D): { w: number; h: number } {
    const samples = ['BPM: 999.9', 'HZ: 00440 A4', 'SAMPLERATE: 48000', 'TIME: 0123.4s'];
    const contentW = Math.max(...samples.map((s) => ctx.measureText(s).width));
    ctx.save();
    ctx.font = 'bold 11px "Courier New", Courier, monospace';
    const labelW = ctx.measureText('STATUS').width;
    ctx.restore();
    const w = Math.ceil(Math.max(
      HUD_SLICE * 2 + labelW + HUD_LABEL_CAP + HUD_SLICE * 3,
      HUD_SLICE * 2 + contentW,
    )) + 30; // SAMPLERATEの幅・HZの可変幅に余裕を持たせる
    const h = HUD_SLICE + Math.max(HUD_ROW_MID_MIN, 4 * LINE_H) + 3 + HUD_SLICE;
    return { w, h };
  }

  // ── 描画プリミティブ ──

  private drawText(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  private neonSeg(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  private neonLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string): void {
    this.neonSeg(ctx, x1, y1, x2, y2, color);
  }

  /** vector 専用：lighter で外光を重ねた2重ストローク。 */
  private neonVectorGlow(
    ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string,
  ): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private dashedCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
    if (!(r > 0)) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private neonArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, a0: number, a1: number, color = CYAN): void {
    if (!(r > 0)) return; // 半径0以下は描かない（arc の IndexSizeError を回避）
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.stroke();
  }

  private sectionLabel(ctx: CanvasRenderingContext2D, x: number, y: number, label: string): void {
    this.drawText(ctx, `[${label}]`, x, y, TEXT_COLOR);
  }

  private hudGrid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step: number): void {
    ctx.strokeStyle = 'rgba(102,204,204,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = x; gx <= x + w; gx += step) {
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + h);
    }
    for (let gy = y; gy <= y + h; gy += step) {
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
    }
    ctx.stroke();
    this.neonSeg(ctx, x, y + h / 2, x + w, y + h / 2, CYAN_FAINT);
  }

  private meterBarH(
    ctx: CanvasRenderingContext2D, x: number, y: number, labelW: number, barW: number, label: string, v: number,
  ): number {
    const rowH = 13;
    this.drawText(ctx, label, x, y, TEXT_COLOR);
    const bx = x + labelW;
    this.neonSeg(ctx, bx, y, bx + barW, y, CYAN_FAINT);
    // 左端・中央・右端に薄い目盛り線
    for (const tx of [bx, bx + barW / 2, bx + barW]) {
      this.neonSeg(ctx, tx, y - 2, tx, y + 2, CYAN_FAINT);
    }
    const cl = Math.max(0, Math.min(1, v));
    const fillW = barW * cl;
    if (fillW > 0) {
      ctx.fillStyle = CYAN;
      ctx.globalAlpha = 0.25 + cl * 0.55;
      ctx.fillRect(bx, y, fillW, 2);
      ctx.globalAlpha = 1;
    }
    return rowH;
  }

  // ── パネル ──

  private panelStatus(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: AudioFeatures): void {
    this.withFrame(ctx, x, y, w, h, 'STATUS', ({ bodyX, bodyY, bodyW }) => {
      const bpm = f.bpm > 0 ? f.bpm.toFixed(1) : '--.-';
      const hz = f.loudestHz.toFixed(0);
      const note = this.hzNote(f.loudestHz);
      const sr = String(f.sampleRate);
      const tim = `${f.time.toFixed(1)}s`;

      const rows: Array<[string, string]> = [
        ['BPM', bpm], ['HZ', `${hz} ${note}`], ['SAMPLERATE', sr], ['TIME', tim],
      ];
      let cy = bodyY + LINE_H / 2;
      ctx.save();
      for (const [label, value] of rows) {
        ctx.textAlign = 'left';
        this.drawText(ctx, `${label}:`, bodyX, cy, TEXT_COLOR);
        ctx.textAlign = 'right';
        this.drawText(ctx, value, bodyX + bodyW, cy, TEXT_COLOR);
        cy += LINE_H;
      }
      ctx.restore();
    });
  }

  private panelFreq(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: AudioFeatures): void {
    this.withFrame(ctx, x, y, w, h, 'FREQ', ({ bodyX, bodyY, bodyW, bodyH }) => {
      const colW = (bodyW - 4) / 2;
      const badgeH = 12;
      const ch = bodyH - badgeH;

      const c1 = bodyX;
      const c2 = c1 + colW + 4;
      this.drawText(ctx, 'SPECTRUM', c1, bodyY + 6, TEXT_COLOR);
      this.drawText(ctx, 'BANDS', c2, bodyY + 6, TEXT_COLOR);
      const stripY = bodyY + badgeH;
      this.freqStrip(ctx, c1, stripY, colW, ch, (frac) => {
        const bin = Math.min(f.spectrum.length - 1, Math.floor(frac * f.spectrum.length));
        return f.spectrum[bin] / 255;
      });
      this.bandBlocks(ctx, c2, stripY, colW, ch, f.bands);
    });
  }

  private freqStrip(
    ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
    valueAt: (frac: number) => number,
  ): void {
    const rows = Math.max(1, Math.floor(h));
    for (let i = 0; i < rows; i++) {
      const frac = 1 - i / rows;
      const v = Math.max(0, Math.min(1, valueAt(frac)));
      const alpha = 0.35 + v * 0.65;
      const segW = w * v;
      if (segW < 0.5) continue;
      ctx.fillStyle = `rgba(102,204,204,${alpha})`;
      ctx.fillRect(x, y + i, segW, 1);
    }
  }

  /**
   * bands（縦に並ぶ実際のbin配列）を1本ずつ描く。各binは高さ(cellH-1)の帯＋下1pxの隙間で区切り、
   * 右方向の伸びは5段階のブロック（1pxギャップ区切り）でデフォルメする（LEDメーター風）。
   * 上=高域・下=低域（freqStripと同じ向き）。
   */
  private bandBlocks(
    ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bands: readonly number[],
  ): void {
    const n = bands.length;
    if (n <= 0) return;
    const cellH = h / n;
    const levels = 5;
    const gap = 1;
    const blockW = (w - gap * (levels - 1)) / levels;
    for (let k = 0; k < n; k++) {
      const idx = n - 1 - k; // k=0(上)が高域＝配列末尾
      const v = Math.max(0, Math.min(1, bands[idx]));
      const level = Math.round(v * levels);
      if (level <= 0) continue;
      const cy = y + k * cellH;
      const rowH = Math.max(1, cellH - 1);
      const alpha = 0.4 + (level / levels) * 0.6;
      ctx.fillStyle = `rgba(102,204,204,${alpha})`;
      for (let b = 0; b < level; b++) {
        ctx.fillRect(x + b * (blockW + gap), cy, blockW, rowH);
      }
    }
  }

  /** LVL(5)+SPC(6)+FLD(タコメーター3つ)ぶんの実コンテンツに必要な外枠高さ。mainHいっぱいに伸ばさず、これに合わせる。 */
  private metricsBoxH(): number {
    const lvlRows = 5;
    const spcRows = 6;
    return HUD_SLICE + 5 /* padTop */ + 4 + 14 + lvlRows * 13 + 8 + 14 + spcRows * 13
      + 8 + 14 + InTheShellVisualizer.FIELD_H + 6 + HUD_SLICE;
  }

  /** タコメーター3つが半径の上限まで出せる最小幅。パネル幅が足りなければここまで広げる。 */
  private metricsBoxW(): number {
    return HUD_SLICE * 2 + InTheShellVisualizer.FIELD_MIN_W;
  }

  private panelMeters(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: AudioFeatures): void {
    const boxW = Math.max(w, this.metricsBoxW());
    this.withFrame(ctx, x, y, boxW, Math.min(h, this.metricsBoxH()), 'METRICS', ({ bodyX, bodyY, bodyW }) => {
      const lvlItems = [
        ['RMS', f.rms], ['PEAK', f.peak], ['BASS', f.bass], ['MID', f.mid], ['TREBLE', f.treble],
      ] as const;
      const spcItems = [
        ['BRIGHTNESS', f.brightness], ['FLUX', f.flux], ['IMPULSE', f.impulse],
        ['ROLLOFF', f.rolloff], ['FLATNESS', f.flatness], ['NOISINESS', f.noisiness],
      ] as const;
      // ラベルが項目ごとに長さが違っても、ゲージの開始位置が揃うよう最長ラベルに合わせる。
      const labelW = Math.ceil(Math.max(
        ...lvlItems.map(([lb]) => ctx.measureText(lb).width),
        ...spcItems.map(([lb]) => ctx.measureText(lb).width),
      )) + 4;
      const barW = bodyW - labelW;
      let yy = bodyY + 4;

      this.sectionLabel(ctx, bodyX, yy, 'LVL');
      yy += 14;
      for (const [lb, v] of lvlItems) {
        yy += this.meterBarH(ctx, bodyX, yy, labelW, barW, lb, v);
      }

      yy += 8;
      this.sectionLabel(ctx, bodyX, yy, 'SPC');
      yy += 14;
      for (const [lb, v] of spcItems) {
        yy += this.meterBarH(ctx, bodyX, yy, labelW, barW, lb, v);
      }

      yy += 8;
      this.sectionLabel(ctx, bodyX, yy, 'FLD');
      yy += 14;
      this.panelField(ctx, bodyX, yy, bodyW, InTheShellVisualizer.FIELD_H, f);
    });
  }

  // 六角形はRHYTHM（旧TRIG）パネル中央の列に収める。列の正方形サイズ(RHYTHM_HEX_COL)に対して、
  // DELTAでの最大+30%膨張・外枠が外側に太くなる分を含めても欠けないよう半径上限を逆算した値。
  private static readonly HEX_R_MAX = 46;
  private static readonly RHYTHM_HEX_COL = 140;
  // タコメーター1個が半径の上限（20）まで出せる最小セル幅×3列ぶん。METRICSの最小横幅もこれで決まる。
  private static readonly FIELD_MIN_W = (20 * 2 + 12) * 3;
  private static readonly FIELD_H = 38;

  /**
   * beatPhase/onsetLow/onsetMid/onsetHighは「点」ではなく連続値なので、六角形（頂点が上）を
   * 中心から6分割した三角形の発光濃度で表す。上段=HIGH・中段=MID・下段=LOWを左右2枚ずつに割り当て、
   * 左右の配分は pan で振る（pan=0で左右均等）。外周線の明るさはbeatPhaseで拍ごとに明滅させる。
   * 色は青緑系のモノクロ演出で統一（色相は変えない）。
   */
  private panelRhythm(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: AudioFeatures): void {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const baseR = Math.max(10, Math.min(w / 2 - 4, h / 2 - 2, InTheShellVisualizer.HEX_R_MAX));

    const pan = Math.max(-1, Math.min(1, f.pan));
    const stereoWidth = Math.max(0, Math.min(1, f.stereoWidth));
    const energyDelta = Math.max(-1, Math.min(1, f.energyDelta));

    // DELTA：全体のサイズが呼吸するように増減（energyDeltaが+ならふくらむ、最大30%）
    const r = baseR * (1 + energyDelta * 0.3);
    // PAN：全体をわずかに左右へ傾ける
    const rotationDeg = pan * 12;
    // WIDTH：外周線の太さだけを変化させる（面の大きさは変えない）
    const borderLineWidth = 2.5 + stereoWidth * 3;

    // destination-out で隙間を「消す」処理はメインcanvasに直接行うと、下地（パネル背景など）まで
    // 消してしまう。オフスクリーンcanvasに六角形だけを描いてから通常合成で貼ることで、
    // 消去の影響をこの図形の中だけに閉じ込める。サイズはbaseRの最大想定値（サイズ30%増・外枠が
    // 外側に太くなる分）を見込んで余裕を持たせ、毎フレームのcanvas再確保を避ける。
    const S = Math.ceil((baseR * 1.3 + 12) * 2 + 8);
    if (!this.hexCanvas) this.hexCanvas = document.createElement('canvas');
    const hc = this.hexCanvas;
    if (hc.width !== S || hc.height !== S) { hc.width = S; hc.height = S; }
    const hctx = hc.getContext('2d');
    if (!hctx) return;
    hctx.clearRect(0, 0, S, S);

    const lcx = S / 2;
    const lcy = S / 2;
    const rad = (deg: number): number => (deg * Math.PI) / 180;
    const pt = (radius: number, deg: number): readonly [number, number] =>
      [lcx + radius * Math.cos(rad(deg)), lcy + radius * Math.sin(rad(deg))];
    const gap = 3; // 外周線と三角形の隙間（一律px）
    const fillR = r - gap;
    // 外周線は「内側の縁」がrで固定になるよう、線の中心をr+線幅/2に置く（=外側だけに太くなる）。
    const borderPathR = r + borderLineWidth / 2;
    const borderVerts = [-90, -30, 30, 90, 150, 210].map((deg) => pt(borderPathR, deg));
    const fillVerts = [-90, -30, 30, 90, 150, 210].map((deg) => pt(fillR, deg));

    const leftScale = Math.max(0, Math.min(1, 1 - pan));
    const rightScale = Math.max(0, Math.min(1, 1 + pan));

    hctx.save();
    hctx.translate(lcx, lcy);
    hctx.rotate(rad(rotationDeg));
    hctx.translate(-lcx, -lcy);

    // まず6枚を隙間なく（中心から各頂点まで）描き、あとから中心⇄各頂点の6本の線を
    // destination-out で「一律の太さ」で消す。角度で余白を取ると中心に近いほど幅が狭く/広く
    // 不均一になるため、線幅（px固定）で消す方式にする。これで隣接面の境界と中心の隙間が
    // 同時に・同じ太さでできる。
    const facet = (i0: number, i1: number, value: number, scale: number): void => {
      const alpha = Math.min(0.85, 0.1 + Math.max(0, Math.min(1, value)) * scale * 0.75);
      hctx.fillStyle = `rgba(102,204,204,${alpha})`;
      hctx.beginPath();
      hctx.moveTo(lcx, lcy);
      hctx.lineTo(fillVerts[i0][0], fillVerts[i0][1]);
      hctx.lineTo(fillVerts[i1][0], fillVerts[i1][1]);
      hctx.closePath();
      hctx.fill();
    };

    facet(0, 1, f.onsetHigh, rightScale);
    facet(1, 2, f.onsetMid, rightScale);
    facet(2, 3, f.onsetLow, rightScale);
    facet(3, 4, f.onsetLow, leftScale);
    facet(4, 5, f.onsetMid, leftScale);
    facet(5, 0, f.onsetHigh, leftScale);

    hctx.globalCompositeOperation = 'destination-out';
    hctx.strokeStyle = 'rgba(0,0,0,1)';
    hctx.lineWidth = 1.5;
    hctx.lineCap = 'round';
    for (const v of fillVerts) {
      hctx.beginPath();
      hctx.moveTo(lcx, lcy);
      hctx.lineTo(v[0], v[1]);
      hctx.stroke();
    }
    hctx.globalCompositeOperation = 'source-over';

    // beatPhase：外周線の明るさで拍を表現（拍の瞬間に明るく、次の拍にかけて減衰）
    const strokeAlpha = Math.max(0.25, 1 - f.beatPhase);
    hctx.strokeStyle = `rgba(102,204,204,${strokeAlpha})`;
    hctx.lineWidth = borderLineWidth;
    hctx.beginPath();
    hctx.moveTo(borderVerts[0][0], borderVerts[0][1]);
    for (let i = 1; i < borderVerts.length; i++) hctx.lineTo(borderVerts[i][0], borderVerts[i][1]);
    hctx.closePath();
    hctx.stroke();

    hctx.restore();

    ctx.drawImage(hc, cx - S / 2, cy - S / 2);
  }

  /**
   * PAN・WIDTH・DELTAは3つとも同じ「タコメーター」ベース（上半円の縁＋目盛り＋針）に統一する。
   * PANとDELTAは±なので動きが似るが、間にWIDTHを挟むことで並びとしては区別できる。
   * 上半円しか使わないので、円の下半分ぶんの余白を持たず高さを詰めている。
   */
  private panelField(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: AudioFeatures): void {
    const labelH = 10;
    const cellW = w / 3;
    const r = Math.max(10, Math.min(20, cellW / 2 - 6, h - labelH - 4));
    const cy = y + r + 2; // 上半円の底辺をベースラインにして、円の下半分の余白を作らない
    const labelY = y + h - 2;

    ctx.save();
    ctx.textAlign = 'center';

    const panCx = x + cellW / 2;
    this.drawGaugeBase(ctx, panCx, cy, r);
    this.drawGaugeNeedle(ctx, panCx, cy, r, (Math.max(-1, Math.min(1, f.pan)) + 1) / 2);
    this.drawText(ctx, 'PAN', panCx, labelY, TEXT_COLOR);

    const widthCx = x + cellW + cellW / 2;
    this.drawGaugeBase(ctx, widthCx, cy, r);
    this.drawWidthCalipers(ctx, widthCx, cy, r, f.stereoWidth);
    this.drawText(ctx, 'WIDTH', widthCx, labelY, TEXT_COLOR);

    const deltaCx = x + cellW * 2 + cellW / 2;
    this.drawGaugeBase(ctx, deltaCx, cy, r);
    this.drawGaugeNeedle(ctx, deltaCx, cy, r, (Math.max(-1, Math.min(1, f.energyDelta)) + 1) / 2);
    this.drawText(ctx, 'DELTA', deltaCx, labelY, TEXT_COLOR);

    ctx.restore();
  }

  /** タコメーター共通のベース（上半円の縁＋目盛り5本：両端・中央=長め、25%/75%=短め）。 */
  private drawGaugeBase(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.strokeStyle = CYAN_DIM;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, Math.PI * 2, false);
    ctx.stroke();
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const a = Math.PI + t * Math.PI;
      const major = t === 0 || t === 0.5 || t === 1;
      const rInner = major ? r - 5 : r - 3;
      const rOuter = r + 2;
      const x0 = cx + Math.cos(a) * rInner;
      const y0 = cy + Math.sin(a) * rInner;
      const x1 = cx + Math.cos(a) * rOuter;
      const y1 = cy + Math.sin(a) * rOuter;
      this.neonSeg(ctx, x0, y0, x1, y1, CYAN_FAINT);
    }
  }

  /** タコメーター共通の針。value01は0(左端)〜1(右端)に正規化した値。 */
  private drawGaugeNeedle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, value01: number): void {
    const v = Math.max(0, Math.min(1, value01));
    const a = Math.PI + v * Math.PI;
    const nx = cx + Math.cos(a) * (r - 2);
    const ny = cy + Math.sin(a) * (r - 2);
    this.neonLine(ctx, cx, cy, nx, ny, CYAN);
    ctx.fillStyle = CYAN;
    ctx.beginPath();
    ctx.arc(nx, ny, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  /** WIDTHだけは針1本ではなく、末広がりに開くキャリパー（0=閉じている・1=大きく開く）にする。 */
  private drawWidthCalipers(ctx: CanvasRenderingContext2D, cx: number, cy: number, len: number, width01: number): void {
    const wv = Math.max(0, Math.min(1, width01));
    const splay = wv * (Math.PI * 0.32); // 最大約58°
    const base = -Math.PI / 2;
    const arm = (dir: number): void => {
      const a = base + dir * splay;
      const x1 = cx + Math.cos(a) * len;
      const y1 = cy + Math.sin(a) * len;
      this.neonLine(ctx, cx, cy, x1, y1, CYAN);
    };
    arm(-1);
    arm(1);
    this.neonArc(ctx, cx, cy, len * 0.4, base - splay, base + splay, CYAN_FAINT);
  }

  // TONAL ── Vector Radar Dial（左）＋数値列（右）
  private static readonly TONAL_ROW_COUNT = 4;
  /** 切り欠き円の基準角。tonalX/Y は同一ベクトル成分で近い値になりやすいため Y を 90° ずらす。 */
  private static readonly TONAL_NOTCH_BASE_X = 0;
  private static readonly TONAL_NOTCH_BASE_Y = Math.PI / 2;
  /** 切り欠きの追従速度（小さいほど HUD らしくゆっくり）。vector は直接追従のまま。 */
  private static readonly TONAL_NOTCH_SMOOTH = 0.03;
  private static readonly TONAL_RING_STROKE_OUTER = 3;
  private static readonly TONAL_RING_STROKE_INNER = 4;

  /** STATUS と同幅。レーダー直径に合わせて高さを伸ばす。 */
  private tonalSize(ctx: CanvasRenderingContext2D, statusW: number): { w: number; h: number } {
    const innerW = statusW - HUD_SLICE * 2;
    const labelW = Math.ceil(Math.max(
      ctx.measureText('BRG:').width,
      ctx.measureText('STR:').width,
      ctx.measureText('X:').width,
      ctx.measureText('Y:').width,
    ));
    const valueW = Math.ceil(Math.max(
      ctx.measureText('999').width,
      ctx.measureText('100%').width,
      ctx.measureText('+0.99').width,
      ctx.measureText('-0.99').width,
    ));
    const textBlockW = labelW + 6 + valueW;
    const dialSize = Math.max(0, innerW - textBlockW - 2);
    const textBlockH = InTheShellVisualizer.TONAL_ROW_COUNT * LINE_H;
    const bodyInnerH = Math.max(textBlockH, dialSize);
    const h = bodyInnerH + HUD_SLICE * 2 + 5;
    return { w: statusW, h };
  }

  private fmtSigned(v: number): string {
    return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
  }

  /** 差し色オレンジ（明るさは alpha で変える）。 */
  private accentOrange(alpha: number): string {
    return `rgba(255,153,51,${Math.max(0, Math.min(1, alpha))})`;
  }

  /** tonalX/Y（−1〜1）を基準角＋0〜360°（ラジアン）へ。0°=3時。 */
  private tonalBipolarToNotchRad(v: number, baseRad: number): number {
    const cl = Math.max(-1, Math.min(1, v));
    return baseRad + ((cl + 1) / 2) * Math.PI * 2;
  }

  /** 角度の最短経路で線形補間（0〜2π の継ぎ目をまたぐ）。 */
  private smoothAngleRad(current: number, target: number, t: number): number {
    let diff = target - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return current + diff * t;
  }

  /** 30°切り欠きの円弧。切り欠き中心が notchRad の方向を向く。 */
  private drawNotchedRing(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, radius: number, notchRad: number, color: string, lineWidth: number,
  ): void {
    if (!(radius > 0)) return;
    const gap = (30 / 180) * Math.PI;
    const half = gap / 2;
    const start = notchRad + half;
    const end = notchRad + Math.PI * 2 - half;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, end);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Vector Radar Dial。左にレーダー（切り欠き二重円＋vector）、右下に STATUS 形式の数値列。
   */
  private panelTonal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: AudioFeatures): void {
    this.withFrame(ctx, x, y, w, h, 'TONAL', ({ bodyX, bodyY, bodyW, bodyH }) => {
      const strength = Math.max(0, Math.min(1, f.tonalStrength));
      const angleDeg = f.tonalAngle * 360;

      const rows: Array<[string, string]> = [
        ['BRG', strength > 0.05 ? angleDeg.toFixed(0) : '--'],
        ['STR', strength > 0.05 ? `${(strength * 100).toFixed(0)}%` : '--'],
        ['X', this.fmtSigned(f.tonalX)],
        ['Y', this.fmtSigned(f.tonalY)],
      ];

      const labelW = Math.ceil(Math.max(...rows.map(([lb]) => ctx.measureText(`${lb}:`).width)));
      const valueW = Math.ceil(Math.max(...rows.map(([, v]) => ctx.measureText(v).width)));
      const textBlockW = labelW + 6 + valueW;
      const textLabelX = bodyX + bodyW - textBlockW;
      const dialSize = Math.max(16, textLabelX - bodyX - 2);
      const cx = bodyX + dialSize / 2;
      const cy = bodyY + bodyH / 2;
      const r = Math.max(8, dialSize / 2 - 3);

      const vecAlpha = 0.4 + strength * 0.6;
      const vecColor = this.accentOrange(vecAlpha);

      // レティクル（固定・シアン mono）
      this.dashedCircle(ctx, cx, cy, r * 0.66, CYAN_FAINT);
      this.dashedCircle(ctx, cx, cy, r * 0.33, CYAN_FAINT);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const major = i % 3 === 0;
        const r0 = r * (major ? 0.86 : 0.9);
        const r1 = r * (major ? 0.98 : 0.94);
        this.neonSeg(
          ctx, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0,
          cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, major ? CYAN_DIM : CYAN_FAINT,
        );
      }
      this.neonSeg(ctx, cx - r * 0.82, cy, cx + r * 0.82, cy, CYAN_FAINT);
      this.neonSeg(ctx, cx, cy - r * 0.82, cx, cy + r * 0.82, CYAN_FAINT);

      // 切り欠き外周円（目標角へゆっくり追従・青緑 mono）
      const targetNotchX = this.tonalBipolarToNotchRad(f.tonalX, InTheShellVisualizer.TONAL_NOTCH_BASE_X);
      const targetNotchY = this.tonalBipolarToNotchRad(f.tonalY, InTheShellVisualizer.TONAL_NOTCH_BASE_Y);
      const smooth = InTheShellVisualizer.TONAL_NOTCH_SMOOTH;
      this.notchAngX = this.smoothAngleRad(this.notchAngX, targetNotchX, smooth);
      this.notchAngY = this.smoothAngleRad(this.notchAngY, targetNotchY, smooth);
      const ringOuterR = r - 1.5;
      const ringInnerR = r * 0.78;
      this.drawNotchedRing(
        ctx, cx, cy, ringOuterR, this.notchAngX, CYAN_DIM,
        InTheShellVisualizer.TONAL_RING_STROKE_OUTER,
      );
      this.drawNotchedRing(
        ctx, cx, cy, ringInnerR, this.notchAngY, CYAN,
        InTheShellVisualizer.TONAL_RING_STROKE_INNER,
      );

      // vector blip（オレンジ）
      const dx = cx + f.tonalX * r;
      const dy = cy - f.tonalY * r;
      if (strength > 0.05) {
        this.neonVectorGlow(ctx, cx, cy, dx, dy, vecColor);
        const dotR = 2.5 + strength * 2;
        ctx.fillStyle = vecColor;
        ctx.beginPath();
        ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = this.accentOrange(vecAlpha * 0.45);
        ctx.beginPath();
        ctx.arc(dx, dy, dotR + 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = CYAN_FAINT;
        ctx.beginPath();
        ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 右列：STATUS 同形式（項目左揃え・値右揃え）、4行ぶん下詰め
      const textBlockH = InTheShellVisualizer.TONAL_ROW_COUNT * LINE_H;
      let ty = bodyY + bodyH - textBlockH + LINE_H / 2;
      ctx.save();
      for (const [label, value] of rows) {
        ctx.textAlign = 'left';
        this.drawText(ctx, `${label}:`, textLabelX, ty, TEXT_COLOR);
        ctx.textAlign = 'right';
        this.drawText(ctx, value, bodyX + bodyW, ty, TEXT_COLOR);
        ty += LINE_H;
      }
      ctx.restore();
    });
  }

  private panelChroma(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: AudioFeatures): void {
    this.withFrame(ctx, x, y, w, h, 'CHROMA', ({ bodyX, bodyY, bodyW, bodyH }) => {
      const footerH = 26; // 音名ラベルとLOCK/CF行がぶつからないよう2行分の高さを確保
      const ch = bodyH - footerH;
      const bw = bodyW / 12;
      const conf = Math.max(0, Math.min(1, f.keyConfidence));
      const lock = f.keyIndex;

      ctx.save();
      ctx.textAlign = 'center';
      for (let i = 0; i < 12; i++) {
        const bx = bodyX + i * bw;
        const v = f.chroma[i];
        const bh = v * ch;
        const isKey = lock === i;
        const cellW = Math.max(2, bw - 2);
        const lit = isKey ? conf : 0.35 + v * 0.65;
        ctx.fillStyle = isKey ? `rgba(255,153,51,${lit})` : `rgba(102,204,204,${lit})`;
        ctx.fillRect(bx, bodyY + ch - bh, cellW, Math.max(0, bh));
        if (bw >= 12) {
          this.drawText(ctx, NOTE_NAMES[i], bx + bw / 2, bodyY + ch + 8, isKey ? LOCK_ORANGE : TEXT_COLOR);
        }
      }
      ctx.restore();

      const footY = bodyY + bodyH - 4;
      const keyStr = lock >= 0 ? this.keyName(lock, f.keyIsMajor) : '--';
      this.drawText(ctx, `LOCK ${keyStr}`, bodyX, footY, TEXT_COLOR);
      const confStr = `CF ${(conf * 100).toFixed(0)}%`;
      this.drawText(ctx, confStr, bodyX + bodyW - ctx.measureText(confStr).width, footY, TEXT_COLOR);
    });
  }

  // RHYTHM（旧TRIG）パネル：左列＝実ドラムキットの並び（上からHAT/SNARE/KICK）、
  // 中央＝六角形（beatPhase/onset*）、右列＝BEAT(総合)/DROP/MUTE(状態)。
  private static readonly RHYTHM_LAMP_COL = TRIG_LAMP_SIZE + 16;
  private static readonly RHYTHM_CONTENT_H = TRIG_LAMP_SIZE / 2 + (TRIG_LAMP_SIZE + 16) * 2 + TRIG_LAMP_SIZE / 2 + 7 + 5;

  /** RHYTHMパネルの実コンテンツに必要な外枠幅（左右のランプ列＋中央の六角形列＋枠）。 */
  private rhythmTrigBoxW(): number {
    return HUD_SLICE * 2 + InTheShellVisualizer.RHYTHM_LAMP_COL * 2 + InTheShellVisualizer.RHYTHM_HEX_COL;
  }

  /** RHYTHMパネルの実コンテンツに必要な外枠高さ（ランプ3段ぶん＋枠）。 */
  private rhythmTrigBoxH(): number {
    return HUD_SLICE + 5 /* padTop */ + InTheShellVisualizer.RHYTHM_CONTENT_H + HUD_SLICE;
  }

  private panelTrig(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: AudioFeatures): void {
    const boxW = Math.min(w, this.rhythmTrigBoxW());
    const boxH = Math.min(h, this.rhythmTrigBoxH());
    this.withFrame(ctx, x, y, boxW, boxH, 'RHYTHM', ({ bodyX, bodyY }) => {
      const colW = InTheShellVisualizer.RHYTHM_LAMP_COL;
      const rowH = TRIG_LAMP_SIZE + 16;
      const gridY = bodyY + TRIG_LAMP_SIZE / 2;
      const hexColX = bodyX + colW;
      const hexColW = InTheShellVisualizer.RHYTHM_HEX_COL;

      const leftItems: ReadonlyArray<readonly [string, boolean, string]> = [
        ['HAT', f.hat, CYAN], ['SNARE', f.snare, CYAN], ['KICK', f.kick, CYAN],
      ];
      const rightItems: ReadonlyArray<readonly [string, boolean, string]> = [
        ['BEAT', f.beat, CYAN], ['DROP', f.drop, ORANGE], ['MUTE', f.silence, ORANGE],
      ];

      ctx.save();
      ctx.textAlign = 'center';
      const drawLampCol = (items: ReadonlyArray<readonly [string, boolean, string]>, colX: number): void => {
        items.forEach(([name, on, col], r) => {
          const cx = colX + colW / 2;
          const cy = gridY + rowH * r;
          if (on) this.lampHold[name] = f.time;
          const lit = f.time - (this.lampHold[name] ?? -1e9) < LAMP_HOLD;
          this.drawTrigLamp(ctx, cx, cy, lit, col);
          this.drawText(ctx, name, cx, cy + TRIG_LAMP_SIZE / 2 + 7, TEXT_COLOR);
        });
      };
      drawLampCol(leftItems, bodyX);
      drawLampCol(rightItems, hexColX + hexColW);
      ctx.restore();

      this.panelRhythm(ctx, hexColX, bodyY, hexColW, InTheShellVisualizer.RHYTHM_CONTENT_H, f);
    });
  }

  /** TRIGランプ：外周1pxリング＋2pxマージン＋十字方向が2px幅で途切れた5px幅リング（SVG）＋点灯時のみ塗る中心ドット。 */
  private drawTrigLamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, lit: boolean, color: string): void {
    if (!this.slices) return;
    const s = TRIG_LAMP_SIZE;
    ctx.drawImage(this.slices['trig-lamp'], cx - s / 2, cy - s / 2, s, s);
    if (lit) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.19, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private panelSig(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: AudioFeatures): void {
    this.withFrame(ctx, x, y, w, h, 'WAVE', ({ bodyX, bodyY, bodyW, bodyH }) => {
      this.hudGrid(ctx, bodyX, bodyY, bodyW, bodyH, 15);
      const mid = bodyY + bodyH / 2;
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1;
      const step = Math.max(1, Math.floor(bodyW));
      ctx.beginPath();
      for (let i = 0; i < step; i++) {
        const idx = Math.floor((i / step) * f.waveform.length);
        const yy = mid - f.waveform[idx] * (bodyH / 2 - 2);
        if (i === 0) ctx.moveTo(bodyX + i, yy);
        else ctx.lineTo(bodyX + i, yy);
      }
      ctx.stroke();
    });
  }

  private keyName(index: number, major: boolean): string {
    if (index < 0) return '--';
    return `${NOTE_NAMES[index]}${major ? '' : 'm'}`;
  }

  private hzNote(hz: number): string {
    if (hz <= 0) return '--';
    const midi = Math.round(12 * Math.log2(hz / 440) + 69);
    const pc = ((midi % 12) + 12) % 12;
    return NOTE_NAMES[pc] + (Math.floor(midi / 12) - 1);
  }
}
