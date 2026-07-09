import {
  HUD_LABEL_CAP, HUD_LABEL_COLOR, HUD_SLICE, HUD_TITLE_FONT,
  HudSliceKey, HudSliceSet,
} from './HudSlices';

export interface HudFrameLayout {
  bodyX: number;
  bodyY: number;
  bodyW: number;
  bodyH: number;
}

const S = HUD_SLICE;

function blit(
  ctx: CanvasRenderingContext2D, img: CanvasImageSource,
  dx: number, dy: number, dw = S, dh = S,
): void {
  ctx.drawImage(img, dx, dy, dw, dh);
}

function repeatX(
  ctx: CanvasRenderingContext2D, img: CanvasImageSource,
  x: number, y: number, w: number, h = S,
): void {
  let px = x;
  while (px < x + w) {
    const tw = Math.min(S, x + w - px);
    ctx.drawImage(img, 0, 0, tw, S, px, y, tw, h);
    px += S;
  }
}

function repeatY(
  ctx: CanvasRenderingContext2D, img: CanvasImageSource,
  x: number, y: number, h: number, w = S,
): void {
  let py = y;
  while (py < y + h) {
    const th = Math.min(S, y + h - py);
    ctx.drawImage(img, 0, 0, S, th, x, py, w, th);
    py += S;
  }
}

function repeatXY(
  ctx: CanvasRenderingContext2D, img: CanvasImageSource,
  x: number, y: number, w: number, h: number,
): void {
  let py = y;
  while (py < y + h) {
    const th = Math.min(S, y + h - py);
    let px = x;
    while (px < x + w) {
      const tw = Math.min(S, x + w - px);
      ctx.drawImage(img, 0, 0, tw, th, px, py, tw, th);
      px += S;
    }
    py += S;
  }
}

function edgeColumn(
  ctx: CanvasRenderingContext2D, slices: HudSliceSet,
  x: number, y: number, h: number, t: HudSliceKey, mid: HudSliceKey, b: HudSliceKey,
): void {
  const midH = h - S * 2;
  blit(ctx, slices[t], x, y);
  repeatY(ctx, slices[mid], x, y + S, midH);
  blit(ctx, slices[b], x, y + h - S);
}

function bottomRow(
  ctx: CanvasRenderingContext2D, slices: HudSliceSet,
  x: number, y: number, w: number,
): void {
  blit(ctx, slices['3-2-l'], x, y);
  repeatX(ctx, slices['3-2'], x + S, y, w - S * 2);
  blit(ctx, slices['3-2-r'], x + w - S, y);
}

/** 11スライス+ラベルキャップ構成で HUD 枠を描画。 */
export function drawHudFrame(
  ctx: CanvasRenderingContext2D,
  slices: HudSliceSet,
  x: number, y: number, w: number, h: number,
  title: string,
  titleColor = HUD_LABEL_COLOR,
): HudFrameLayout {
  const prevFont = ctx.font;
  const prevBaseline = ctx.textBaseline;
  const prevAlign = ctx.textAlign;

  ctx.font = HUD_TITLE_FONT;
  const labelW = Math.ceil(ctx.measureText(title).width);
  ctx.font = prevFont;

  const topFlexW = w - S * 2 - labelW - HUD_LABEL_CAP;
  const midH = h - S * 2;
  const innerW = w - S * 2;

  blit(ctx, slices['1-1'], x, y);
  repeatX(ctx, slices['1-2'], x + S, y, labelW);
  blit(ctx, slices['1-3'], x + S + labelW, y, HUD_LABEL_CAP, S);
  repeatX(ctx, slices['1-4'], x + S + labelW + HUD_LABEL_CAP, y, topFlexW);
  blit(ctx, slices['1-5'], x + w - S, y);

  edgeColumn(ctx, slices, x, y + S, midH, '2-1-t', '2-1', '2-1-b');
  repeatXY(ctx, slices['2-2'], x + S, y + S, innerW, midH);
  edgeColumn(ctx, slices, x + w - S, y + S, midH, '2-3-t', '2-3', '2-3-b');

  blit(ctx, slices['3-1'], x, y + h - S);
  bottomRow(ctx, slices, x + S, y + h - S, innerW);
  blit(ctx, slices['3-3'], x + w - S, y + h - S);

  ctx.font = HUD_TITLE_FONT;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = titleColor;
  ctx.fillText(title, x + S, y + S / 2);
  ctx.font = prevFont;
  ctx.textBaseline = prevBaseline;
  ctx.textAlign = prevAlign;

  // ラベル行のすぐ下にコンテンツが詰まって見えないよう、上に5pxパディングを入れる。
  const padTop = 5;
  return {
    bodyX: x + S,
    bodyY: y + S + padTop,
    bodyW: innerW,
    bodyH: midH - padTop,
  };
}
