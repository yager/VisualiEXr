import { VisualizerApp } from './VisualizerApp';
import { VisualizerRegistry } from './registry';

export interface ControlPanelState {
  enabled: boolean;
  visualizerId: string;
}

export interface ControlPanelOptions {
  /** 起動時のオン/オフ。 */
  enabled: boolean;
  /** 選択・オンオフが変わったら呼ばれる（永続化に使う）。 */
  onChange: (state: ControlPanelState) => void;
  /**
   * 歯車UIの取り付け先（省略時は video.parentElement）。
   * 位置は `top:50%`（上下中央）で決めるので、**動画エリアと同じ高さを持つ要素**を
   * 渡すこと（例: YouTube のプレイヤー本体）。高さが合わない親に付けると中央がズレる。
   */
  container?: HTMLElement;
}

const STYLE_ID = 'vexr-controls-style';

/** クリック用のスタイルを一度だけ注入（YouTube と衝突しないよう vexr- 接頭辞）。 */
function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    /* 右端ドック式のドロワー。ハンドル(歯車)は右端の上下中央に出ており、クリックで
       サイドバーが右端から左へスライドして出る。項目が増えても縦スクロールで全部見える。
       ・.vexr-controls … 右端に貼り付く枠。overflow:hidden で閉じたサイドバーを画面外へ隠す。
       ・.vexr-drawer   … ハンドル＋サイドバーの塊。translateX で左右にスライド。
       ・pointer-events … 枠は none（動画のクリックを邪魔しない）、ハンドルとサイドバーだけ auto。 */
    .vexr-controls { position:absolute; top:0; right:0; width:232px; height:100%; overflow:hidden; z-index:2147483001; pointer-events:none; font:13px/1.4 sans-serif; }
    .vexr-drawer { position:absolute; top:0; right:0; width:232px; height:100%; transform:translateX(200px); transition:transform .25s ease; }
    .vexr-drawer.open { transform:translateX(0); }
    .vexr-handle { position:absolute; left:0; top:50%; transform:translateY(-50%); width:32px; height:48px; border:none; border-radius:8px 0 0 8px; background:rgba(0,0,0,0.55); color:#fff; font-size:16px; line-height:48px; text-align:center; cursor:pointer; pointer-events:auto; opacity:0.8; transition:opacity .15s, background .15s; }
    .vexr-handle:hover { opacity:1; background:rgba(0,0,0,0.8); }
    .vexr-sidebar { position:absolute; left:32px; top:0; width:200px; height:100%; overflow-y:auto; background:rgba(20,20,20,0.94); padding:6px 0; pointer-events:auto; box-shadow:-4px 0 16px rgba(0,0,0,0.4); box-sizing:border-box; }
    .vexr-title { color:#9cf; padding:6px 14px 8px; font-weight:bold; }
    .vexr-item { display:block; width:100%; text-align:left; padding:8px 14px; background:transparent; color:#eee; border:none; cursor:pointer; }
    .vexr-item:hover { background:rgba(255,255,255,0.12); }
    .vexr-item.active { background:#2e7d32; color:#fff; }
    .vexr-support { color:#ff9ec7; text-decoration:none; border-top:1px solid rgba(255,255,255,0.14); margin-top:6px; }
    .vexr-support:hover { background:rgba(255,255,255,0.12); }
  `;
  document.head.appendChild(s);
}

/**
 * ControlPanel — 動画の右端に貼り付く「歯車ハンドル → スライド式サイドバー」のオーバーレイ。
 *
 * 歯車(ハンドル)は右端の上下中央に出ており、クリックすると右端からプラグイン一覧の
 * サイドバーが左へスライドして開く。選ぶと `app.setVisualizer()` で切り替わる。
 * サイドバーは縦フル高＆縦スクロールなので、プラグインが増えても下まで見える。
 * ツールバーの popup を使わず、YouTube 画面の上で完結する。
 */
export class ControlPanel {
  private readonly root: HTMLDivElement;   // 右端に貼り付く枠（画面外を隠す）
  private readonly drawer: HTMLDivElement;  // ハンドル＋サイドバー（スライドする塊）
  private readonly panel: HTMLDivElement;   // サイドバー本体（プラグイン一覧・縦スクロール）
  private open = false;
  private enabled: boolean;
  private readonly onDocPointerDown: (e: Event) => void;

  constructor(
    video: HTMLMediaElement,
    private readonly registry: VisualizerRegistry,
    private readonly app: VisualizerApp,
    private readonly opts: ControlPanelOptions,
  ) {
    this.enabled = opts.enabled;
    ensureStyle();
    const container = (opts.container ?? video.parentElement ?? document.body) as HTMLElement;

    this.root = document.createElement('div');
    this.root.className = 'vexr-controls';
    if (container === document.body) this.root.style.position = 'fixed';

    this.drawer = document.createElement('div');
    this.drawer.className = 'vexr-drawer';

    const gear = document.createElement('button');
    gear.className = 'vexr-handle';
    gear.textContent = '⚙';
    gear.title = 'ビジュアライザを選ぶ';
    gear.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });

    this.panel = document.createElement('div');
    this.panel.className = 'vexr-sidebar';

    this.drawer.appendChild(gear);
    this.drawer.appendChild(this.panel);
    this.root.appendChild(this.drawer);
    container.appendChild(this.root);

    this.buildList();

    // パネルの外側をクリックしたら閉じる
    this.onDocPointerDown = (e: Event) => {
      if (this.open && !this.root.contains(e.target as Node)) this.setOpen(false);
    };
    document.addEventListener('pointerdown', this.onDocPointerDown);
  }

  private buildList(): void {
    const title = document.createElement('div');
    title.className = 'vexr-title';
    title.textContent = 'Visualizer';
    this.panel.appendChild(title);

    // Off（描画停止）
    const off = document.createElement('button');
    off.className = 'vexr-item';
    off.textContent = 'Off';
    off.dataset.off = '1';
    off.addEventListener('click', (e) => {
      e.stopPropagation();
      this.enabled = false;
      this.app.stop();
      this.highlight();
      this.emit();
      this.setOpen(false);
    });
    this.panel.appendChild(off);

    for (const { id, name, author, description } of this.registry.list()) {
      const item = document.createElement('button');
      item.className = 'vexr-item';
      item.textContent = name;
      item.dataset.id = id;
      // 説明＋作者をツールチップに（プラグインが description/author を持つときだけ）
      const tip = [description, author && `by ${author}`].filter(Boolean).join(' — ');
      if (tip) item.title = tip;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.enabled = true;
        this.app.setVisualizer(id);
        this.app.start(); // オフだった場合はここで再開（実行中なら何もしない）
        this.highlight();
        this.emit();
        this.setOpen(false);
      });
      this.panel.appendChild(item);
    }

    // 開発支援（任意の寄付）。外部サイトを新しいタブで開くだけ（決済は埋め込まない）。
    const support = document.createElement('a');
    support.className = 'vexr-item vexr-support';
    support.textContent = '♥ Support / 寄付';
    support.href = 'https://donate.stripe.com/7sY3cw6r7aaI7rIczv18c00';
    support.target = '_blank';
    support.rel = 'noopener noreferrer';
    support.title = '開発を支援する（任意の寄付・新しいタブで開きます）';
    support.addEventListener('click', (e) => { e.stopPropagation(); this.setOpen(false); });
    this.panel.appendChild(support);

    this.highlight();
  }

  /** 現在の状態（Off か、どのプラグインか）をハイライト。 */
  private highlight(): void {
    const activeId = this.enabled ? this.app.visualizerId : null;
    for (const el of Array.from(this.panel.querySelectorAll<HTMLElement>('.vexr-item'))) {
      const on = el.dataset.off === '1' ? !this.enabled : el.dataset.id === activeId;
      el.classList.toggle('active', on);
    }
  }

  private emit(): void {
    this.opts.onChange({ enabled: this.enabled, visualizerId: this.app.visualizerId });
  }

  private toggle(): void {
    this.setOpen(!this.open);
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.drawer.classList.toggle('open', open); // スライドで開閉（CSS の transform）
    if (open) this.highlight();
  }

  dispose(): void {
    document.removeEventListener('pointerdown', this.onDocPointerDown);
    this.root.remove();
  }
}
