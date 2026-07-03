import { AudioFeatures } from '../audio/AudioFeatures';

/** 描画先の情報（2Dプラグイン向け）。ホストが2Dキャンバスを用意して渡す。 */
export interface VisualizerContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** 論理ピクセルの幅・高さ（devicePixelRatio 補正後の描画領域）。 */
  width: number;
  height: number;
}

/**
 * Visualizer — 2D 簡易プラグイン（従来どおり）。
 * ホストが Canvas2D を用意し、毎フレーム `draw(features, ctx)` を呼ぶ。手軽に書ける。
 */
export interface Visualizer {
  readonly id: string;
  readonly name: string;
  /** 作者名（任意）。プラグイン作者のクレジット。外部プラグイン開放時に使う。 */
  readonly author?: string;
  /** 一言説明（任意）。何をするプラグインか。メニューのツールチップに表示。 */
  readonly description?: string;
  /** メニューの表示順（小さいほど先頭。未指定は末尾＝name順）。 */
  readonly order?: number;
  init?(c: VisualizerContext): void;
  draw(features: AudioFeatures, c: VisualizerContext): void;
  setOptions?(opts: Record<string, unknown>): void;
  dispose?(): void;
}

/**
 * SurfaceVisualizer — 自前の描画面を持つプラグイン（WebGL / three.js / 独自canvas 等）。
 * ホストは container（DOM要素）を渡すだけ。プラグインが自分のキャンバス/レンダラを作る。
 * → 2D と WebGL のプラグインを同居させられる（1枚のcanvasは2DとWebGLを混在できないため）。
 */
export interface SurfaceVisualizer {
  readonly id: string;
  readonly name: string;
  /** 作者名（任意）。プラグイン作者のクレジット。外部プラグイン開放時に使う。 */
  readonly author?: string;
  /** 一言説明（任意）。何をするプラグインか。メニューのツールチップに表示。 */
  readonly description?: string;
  /** メニューの表示順（小さいほど先頭。未指定は末尾＝name順）。 */
  readonly order?: number;
  /** 表示開始：container に自分の描画面を作る。サイズは container を見て決める。 */
  mount(container: HTMLElement): void;
  /** 毎フレーム描画。 */
  frame(features: AudioFeatures): void;
  setOptions?(opts: Record<string, unknown>): void;
  /** 表示終了：描画面を片付ける。 */
  unmount(): void;
}

/** どちらのプラグインでも受け付ける。 */
export type AnyVisualizer = Visualizer | SurfaceVisualizer;

/** プラグインを生成する関数。 */
export type VisualizerFactory = () => AnyVisualizer;

/** 自前描画面タイプ（SurfaceVisualizer）かどうか。 */
export function isSurfaceVisualizer(v: AnyVisualizer): v is SurfaceVisualizer {
  return typeof (v as SurfaceVisualizer).mount === 'function';
}
