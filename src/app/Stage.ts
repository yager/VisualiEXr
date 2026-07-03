/**
 * Stage — 描画の「置き場（container）」を提供する抽象。
 * プラグインは container の中に自分の描画面（2D/WebGL canvas 等）を作る。
 *  - VideoStage : YouTube の動画に重ねる（拡張ホスト）
 *  - WindowStage: ウィンドウ全体（スタンドアロン/Electron）
 */
export interface Stage {
  /** プラグインが描画面を append するコンテナ。 */
  readonly container: HTMLElement;
  readonly width: number;
  readonly height: number;
  /** 位置・サイズを合わせる（毎フレーム呼ぶ）。 */
  fit(): void;
  dispose(): void;
}

/** container 内にプラグインの canvas を絶対配置するための共通スタイル。 */
export const SURFACE_STYLE = 'position:absolute;inset:0;width:100%;height:100%;display:block;';

/**
 * VideoStage — 動画コンテナの中に container を入れ、動画の表示矩形に追従させる。
 */
export class VideoStage implements Stage {
  readonly container: HTMLDivElement;
  private readonly onBody: boolean;

  constructor(private readonly video: HTMLMediaElement) {
    const parent = (video.parentElement ?? document.body) as HTMLElement;
    this.onBody = parent === document.body;
    this.container = document.createElement('div');
    this.container.style.cssText =
      `position:${this.onBody ? 'fixed' : 'absolute'};z-index:5;pointer-events:none;overflow:hidden;`;
    parent.appendChild(this.container);
  }

  get width(): number { return this.container.clientWidth; }
  get height(): number { return this.container.clientHeight; }

  fit(): void {
    const vr = this.video.getBoundingClientRect();
    let left = vr.left;
    let top = vr.top;
    if (!this.onBody) {
      const op = this.container.offsetParent as HTMLElement | null;
      if (op) {
        const b = op.getBoundingClientRect();
        left = vr.left - b.left;
        top = vr.top - b.top;
      }
    }
    this.container.style.left = left + 'px';
    this.container.style.top = top + 'px';
    this.container.style.width = vr.width + 'px';
    this.container.style.height = vr.height + 'px';
  }

  dispose(): void {
    this.container.remove();
  }
}

/**
 * WindowStage — ウィンドウ全体を container にする（プロジェクタ/OBS 出力向け）。
 */
export class WindowStage implements Stage {
  readonly container: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = 'position:fixed;inset:0;overflow:hidden;';
    document.body.appendChild(this.container);
  }

  get width(): number { return this.container.clientWidth; }
  get height(): number { return this.container.clientHeight; }

  fit(): void { /* inset:0 なので何もしない */ }

  dispose(): void {
    this.container.remove();
  }
}

/**
 * ViewportStage — ページ上のビューポート全体を覆う透明オーバーレイ（音声onlyサイト用）。
 * `pointer-events:none` で**下のサイトを操作可能なまま**、可視化を最前面に重ねる（動画の矩形が無いサイト向け）。
 */
export class ViewportStage implements Stage {
  readonly container: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    // 高い z-index でサイトUIより前面に。ただし操作は透過（⚙は ControlPanel 側が更に前面）。
    this.container.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden;';
    document.body.appendChild(this.container);
  }

  get width(): number { return this.container.clientWidth; }
  get height(): number { return this.container.clientHeight; }

  fit(): void { /* inset:0 なので何もしない */ }

  dispose(): void {
    this.container.remove();
  }
}
