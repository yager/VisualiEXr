import { VisualizerApp } from './VisualizerApp';
import { VisualizerRegistry } from './registry';

/** ハンドル(旧⚙)のロゴアイコン。ネットワーク不要・manifestのweb_accessible_resources不要にするためdata URIで埋め込み。 */
const HANDLE_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAANW0lEQVR4nO2aXZBVVXbHf3uffc69t7vpbqAZPgM6CqMIDoJ8KJOHSSaVVJyhdF4mr3lIJY/Jw+Q9L6nKU6rmITVPqUqlMuqU41TGWIlxEBH5EPlQFBVEFKZVQOSj6b73nq+9U2ufc27fbhrtbhrGqvSiFvve2+dr/dda/7XOOgfmZV7mZV7mZV7m5f+rqOlu+NM6235a49/CnIbK0KLkgAM0EAIRuBrWaawy6Bdi/vEvv+TnFhCdkWgN1sLf/tMP+Yu/+hmtHJQ28l/n0pUD50ornMU5S2Bj/uNf/oaf/8OeOQXg+hDD/ZqV3hLRFDoARIApNSi1/L71PH1HYsaCcvNpidjoLCxbbXjxTEwYajI7bntH3M3fjYZ2K2FrT206p9LTvab34SXxrm2QuV6sG8C6QaxbWH7uw7oGVrahBmlAUz5/r5d13iY1Q++LPLxtOQtCTdxs4zLIY0ue2GKtPndpFme43PLJBy9N+1RMU/4n599VHS1Gyap60GoBWvWjVaNU+b2Bpg7+c4je2c8fTeWracnmnTt8NEnsaCeRpQmcRpc6+bPKLfVA88buf51zAHbHHHcRVtcxYqDXRqk95fdKa+C3i+DRfp6MFORVqk5HrCSLgu8++iSZE+MNSjhAfpfVgrblmnd9xpDm8Mbu/XMOwLE214fhTfGsrZFVhna0y3gPQA3jQuzqAXas6/F/mV4a+Px3sHRFwH3r/pykSendAgBvcPnZqxifg0sttVBzafg0Jw5fnnMAxiwcTnlOPC6RMMH4ySqkGEEekuhezPZBVk/7ZLpEaeMjS1myeJC8lfjQn2D0ZBVWzjIaEXxw7DmuX3FzDoDIq2P8r/jSE11pZEe7jZ8EyPeG+EOmLSUAW3Zs85VEZRaVlZ4uve3BsBN/I7eECo689sL0z8XMANg3wocuwAY1opsAmEJ1iBEjti/mKV3ywPTyXwhwy5NkLTFQ3+ztKve7fhOeaI/B0QMn7xgA74/ROp9yyPOAIauan1upqglrw/2L+P69vYS+Z/oqHhCSkPxfslSz7v4nSMa6CDADLToFGUr+NyLDZ2ff49S7N+4IAEZBYmH/dX4hPGAjMm9oBYKskwBRETo3JGE/PVuHWP61J6zq/8aHv8XQoiHSZkIgESApUHm7BKGbE1yaUQ/hnWO/oNUEHcw9AJXsucJvO8ZO1m4gSnWmIMydy9juD/B1ESCydcujSO2Uul4Z2+39yapz6/ni8L4X/f5fGWazBMCW677LfJw7EhNR/zrju9PgsRXskv3zr7opyKv8f2SXz3+dT8r/rrLXrQERo9csbx46VVysvQMAuMJ5Z26QnB7lZZ8GQckDk8O/67uOMHKWB5fxZyt6CW7JA1X+Dy3WPHDfLuIxCKzphL+/k+iOhBIIm2Y0Qs3wRwc482HLH0uOM9cAiAS6YPLXv+RZKYeeCKuboEq7ATElDwQkPQMMbV7G0C0boir/N6xfzNKFS0mbWZH/UzRAngArYKT+h/DWsWdIEwiCOwdAJXsu8Fpl3C25oCsapHR6HvgDNsn+U2Zo9eO2TZupSf5n2XjN7ybBMgoqQqz+dujAy8xC9Ew2ljQQOXCBT+OUEekHpN29JSmW6oEK4PE1PNF9nAlSkcOjG39U5H/F/l1GdgNRRYPccVz/MuHI0U/8/jPw/qwAkPA9P0J28jr/5dti8e5UhnelhW+IFDy8il2LGqjqODfl/6JBzfp7nizyPzO3NL7iAyl/PZHm7Ecvc+5cUlzkzEYvekZbCw/ItUo1+IznPA8IEd6KA6oIqHl/ZoOLWfPdFQz6E3cDUH3ZsHYhyxeu9PnfHQG6S6s+oJP/ARw7+qyPIMn/GYpmlvLKeQ5KWMs9/5SenwSCNSqjR/H4t1l/Ew9U4bB9wyaf/+LZythuZfL3XONSOHh472zt0DPdoern3/iUS2NNLgUNok4aTGW8J0KFCpWWdnLnWvWnN/FAGbZq24M/VJL/VffX7fXqe8d4uf1VEVcuj3D0xGf+ADJGu9MAOJlPKLg4in3rMs/LMKSTBje1xQpC7VVHykjHsvke81Rvbbyv8N63DjXYp8INq58yyRhad+d/Zfgk8pPw7wng1Onf8OmFrDrOHQegO2X3nuN5KW++ElQAdCJAFQNKWSUCalo7tF26PNjw0Erd64+jxw8Wbbh3cNGKgTW9SSurBbnWKkVVYT859H3/n1hqGg4ff67TpMxC9Gx2qnDe8xFHxY2e5buNlzun0vACBNGAPAgSFoQ8ti5YK/uL01SZ/wu2f2fjYB36XJz1qtTP3gMBYSou0GlRJrM2HDh2aMJF3Q0AbHmyo7/j6tUbfKwbGHkWMMH4ao00RIEHwK/GsHN99H1/zTLWL/N/4Y77n+jJWvTpTPfplD6d0FApRqU3AyDer6uISxcvcvz9L4qLsncPAFfywNUm7sgwv/Q84NtiMboCQRfe9xEgxhuoGYMybH6g9uPIqKL3sQ7T31BDG5c/1YhH6QtSs0Cl9KnMq0SCFBC6gXBl/r93+ldcvmY7fcTdAqC7dX/1DL/xPCC3vR3jGfd+Gf6iqhaazAV2zerGjrWrjB+Uigw8tKp/aGXf2nrSzBo61w1SepA0SKmplEiXfNCpAJL/Dg6eeP528l9k1ntWgO89zbt+QlUrxl/jBFilgBivsWUKJEGYmEU1s3V93Q9KRZbtuOehgR5Lr+S/jqmrhLpOCuNVihCi8xFQqtwlJi048M6xCRdzNwGw5TnfOsfIhSuc8Dwg/UCnFxgnQhcGuCggDw15TYCosf2Rvs6gdPW2lX/Sm7foVbFukNDQCZFKiPxagBB44kuL/G9g+PTzj3j77LUJF3M3AXDyoEbDWAxvnOMZekse6IS/rEUKuDICcgGhFpq2Mmx8ZODHkrqmZrj3wYEneuMbNIJE13VMpERTQlFdrFIRygYoo0fD2x8+y0jTeTL6fURAdwe75yT/7XnAd4TdRCg9gsJFGhtVABh9nYCV3xn4wYolJuhf1R+uWR1tieJR29Cx8Z5XCaZLtS4jQECQDtDIcPK9FyaQ0SzF3M7OVeS99h6nXCLjchf5mY+oPOCRawsUziisVlijyQOjx9DtBSv76g9sHFhytd6vVw0munkpbqdRvZ6o3JNJSLHKfXT1T5HjAhXRGoX9H7zrT34b3r9tAKrW++Q5WucvcWjNPTxuEzLfGBUPMz0Y1ivkgSKX8ocx16xm11/f9/dXggbEN6gHxsRSNQkxKvcvH0hr4QcJ/jLl0b/Osp7I8Mlnxzk5PHo79X9uAKDggSSFA6d5es0GHrcjLtPGeQCUsTgPhMOJGoc18gzfmRutmC0/GPq7a0Gdi2NNorBuJGu0ylGEKN/vy8zf4MTzGJxTGfXIcPTs07TSckZ3ewDo29q7mwfeKsflhYEQWnyuhuPqRI3FBjkuyminrSxOWpkyMag26Bjl1zZOxVjVxmpZYxIVkyvZLoF9p4vn/zN55+BOREA3D+x7m7N5mySoE/mnNTI5CWSVsXWOMsVKkPnBhQukzw+MEmITIhNXKOu7KUtOTuafvKTktFRI5nIITURzxHLg49MTTv77jAAr02ngw9+RnBnmFXlpohiXi9czryrM0GGKKhWTegBcIMzZ9up0pS1y3SIrNVVtr861M3pyzdnP93Hqi/ZcEOCcACAikyh5pvH6CZ6hr+oHqjQoAFAmJTAJ2iSoMAFTGO+CGFsanetmRzPdJFZNYt3ywEAr843Q4XNPSyX0+X/79jMnAFTyymH2+hlgZ0zmUFHuvS4RoMMEHcY4ExfGl6sAYMVw1SRTYyR6hKa6wYgeZUw3SVQTVEtDC179ZPdc5f+ccMCEcflxhpMbejTqoc9RvConFSDweW/RwgU6x0muK8nzItdlQ0sihc4XPxnvjirDNVejSZ3M9VhqtYhW0ubg5+cmnPQbAYAtqsG5YbL3zgQvbnpM/8SNYX0k+F6gML4WJIwoMVkMT7FexXhdlDnvVvlLxiWVMuJ6cW4IXGwxfZp3xl7i7I3Ub/ZNAqDigSyD147oX27649pPbOw6DZELLE7JRKhi94zcxeQEpfEK51f5JxGRI/VA0cT5XqCRQWo4+MWz/imtNAzy8hTfJA5wxbJnvzsod0IqijQmgjBC6RoEkW9uqxdLpeTJLa7Ueye1XzVRqoWURXkDR14mWEJOTV1F62ta8SXsubSPORYzVweqOtJDb2YXx64Fl3r79becdVbJO3ziWaV8TRePS5hLFFfaLbq8qAX+ZdTctwZxNBbFzfha89DY58XJ5sb7cxoBck1yZ3rhgrVvv+t+LZNSq6QGGqwqOntRCfXJUoHgh8TlZF3GRX0qZ4Ak66dJ7Z2R/2TYFcjdXvd758qglu5P7g73pb92zliX+1bQvzw8brjkeSHdEVB9riKg87KZw/Y5rH6dX/ntZv7066uvmTkUV3Zmu19pv6lUoLUJ/MMQCXuhtELHw3ey8RUA1f2fjwSNqSl0/FsOFif5BgNgy3K4f3/7yp49zX8WEDLrn2yUTF+ZOC5TRUG1lbZkQqWje/lZcx+X5Q+zePo1L/MyL/MyL/MyL/PCVPJ/B08gMo1E2WIAAAAASUVORK5CYII=';

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
    .vexr-handle { position:absolute; left:0; top:50%; transform:translateY(-50%); width:32px; height:48px; border:none; border-radius:8px 0 0 8px; background:rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; cursor:pointer; pointer-events:auto; opacity:0.8; transition:opacity .15s, background .15s; }
    .vexr-handle:hover { opacity:1; background:rgba(0,0,0,0.8); }
    .vexr-handle img { width:22px; height:22px; display:block; pointer-events:none; }
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
    const gearIcon = document.createElement('img');
    gearIcon.src = HANDLE_ICON;
    gearIcon.alt = '';
    gear.appendChild(gearIcon);
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
    support.href = 'https://ko-fi.com/takahitoyagami';
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
