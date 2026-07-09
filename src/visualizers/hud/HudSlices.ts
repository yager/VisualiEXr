import svg11 from '../../../img/slice_hud1_1-1.svg';
import svg12 from '../../../img/slice_hud1_1-2.svg';
import svg13 from '../../../img/slice_hud1_1-3.svg';
import svg14 from '../../../img/slice_hud1_1-4.svg';
import svg15 from '../../../img/slice_hud1_1-5.svg';
import svg21t from '../../../img/slice_hud1_2-1-t.svg';
import svg21 from '../../../img/slice_hud1_2-1.svg';
import svg21b from '../../../img/slice_hud1_2-1-b.svg';
import svg22 from '../../../img/slice_hud1_2-2.svg';
import svg23t from '../../../img/slice_hud1_2-3-t.svg';
import svg23 from '../../../img/slice_hud1_2-3.svg';
import svg23b from '../../../img/slice_hud1_2-3-b.svg';
import svg31 from '../../../img/slice_hud1_3-1.svg';
import svg32l from '../../../img/slice_hud1_3-2-l.svg';
import svg32 from '../../../img/slice_hud1_3-2.svg';
import svg32r from '../../../img/slice_hud1_3-2-r.svg';
import svg33 from '../../../img/slice_hud1_3-3.svg';
import svgTrigLamp from '../../../img/slice_hud1_trig_lamp.svg';

export const HUD_SLICE = 15;
export const HUD_LABEL_CAP = 15;
export const HUD_ROW_MID_MIN = HUD_SLICE * 3;
export const HUD_FRAME_MIN_H = HUD_SLICE * 5;
export const TRIG_LAMP_SIZE = 32;

export const HUD_FONT = '11px "Courier New", Courier, monospace';
export const HUD_TITLE_FONT = 'bold 11px "Courier New", Courier, monospace';
export const HUD_LABEL_COLOR = '#003333';

export type HudSliceKey =
  | '1-1' | '1-2' | '1-3' | '1-4' | '1-5'
  | '2-1-t' | '2-1' | '2-1-b' | '2-2'
  | '2-3-t' | '2-3' | '2-3-b'
  | '3-1' | '3-2-l' | '3-2' | '3-2-r' | '3-3'
  | 'trig-lamp';

export type HudSliceSet = Record<HudSliceKey, HTMLImageElement>;

const SVG_SOURCES: Record<HudSliceKey, string> = {
  '1-1': svg11, '1-2': svg12, '1-3': svg13, '1-4': svg14, '1-5': svg15,
  '2-1-t': svg21t, '2-1': svg21, '2-1-b': svg21b, '2-2': svg22,
  '2-3-t': svg23t, '2-3': svg23, '2-3-b': svg23b,
  '3-1': svg31, '3-2-l': svg32l, '3-2': svg32, '3-2-r': svg32r, '3-3': svg33,
  'trig-lamp': svgTrigLamp,
};

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('HUD slice rasterize failed'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

let cache: Promise<HudSliceSet> | null = null;

/** バンドル済み SVG 文字列を Image に変換（初回のみ非同期）。 */
export function loadHudSlices(): Promise<HudSliceSet> {
  if (!cache) {
    cache = Promise.all(
      (Object.entries(SVG_SOURCES) as Array<[HudSliceKey, string]>).map(
        async ([key, svg]) => [key, await svgToImage(svg)] as const,
      ),
    ).then((entries) => Object.fromEntries(entries) as HudSliceSet);
  }
  return cache;
}
