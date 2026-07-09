import { registry } from '../../../app/registry';
import '../../../app/plugins.generated'; // 副作用importで内蔵16個を登録（このページ専用のregistryインスタンス）
import { AnyVisualizer, VisualizerContext, isSurfaceVisualizer } from '../../../visualizers/Visualizer';
import { VisualizerInfo } from '../../../app/registry';
import { makeDemoFeatures } from './features';

/**
 * gallery.ts — プラグインギャラリー（/gallery/）。
 * 静止時はサムネイル/プレースホルダのみ。hoverで対象カード1枚だけライブ再生（常に最大1枚）、
 * クリック/タップでライトボックス拡大表示。マイク不要、合成した AudioFeatures ループで駆動する。
 *
 * src/visualizers・src/audio・src/app は import して使うだけで無改変。
 * src/hosts/web/main.ts（ランディングのデモ）にも一切依存しない、完全に独立したページ。
 */

const CARD_W = 320;
const CARD_H = 180;
const HOVER_DEBOUNCE_MS = 120;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasFineHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

interface Runner {
  id: string;
  stop(): void;
}

/** SurfaceVisualizer / Visualizer(2D) の両方に対応するライブ実行ランナーを起動する。 */
function startLive(id: string, host: HTMLElement, width: number, height: number): Runner | null {
  const v: AnyVisualizer | null = registry.create(id);
  if (!v) return null;

  const dpr = window.devicePixelRatio || 1;
  const t0 = performance.now();
  let raf = 0;

  if (isSurfaceVisualizer(v)) {
    const container = document.createElement('div');
    container.className = 'live-container';
    host.appendChild(container);
    v.mount(container);

    const loop = (): void => {
      const t = (performance.now() - t0) / 1000;
      v.frame(makeDemoFeatures(t));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return {
      id,
      stop(): void {
        cancelAnimationFrame(raf);
        v.unmount();
        container.remove();
      },
    };
  }

  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let cw = 0;
  let ch = 0;
  const resize = (): void => {
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (w === cw && h === ch) return;
    cw = w; ch = h;
    canvas.width = w;
    canvas.height = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  const view: VisualizerContext = {
    canvas, ctx,
    get width() { return width; },
    get height() { return height; },
  };
  v.init?.(view);

  const loop = (): void => {
    const t = (performance.now() - t0) / 1000;
    resize();
    v.draw(makeDemoFeatures(t), view);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    id,
    stop(): void {
      cancelAnimationFrame(raf);
      v.dispose?.();
      canvas.remove();
    },
  };
}

// ── カード側：常に最大1枚だけライブ ──────────────────────────────
let currentRunner: Runner | null = null;
let currentStageEl: HTMLElement | null = null;
let hoverTimer = 0;

function stopCurrent(): void {
  if (currentRunner) {
    currentRunner.stop();
    currentRunner = null;
  }
  if (currentStageEl) {
    currentStageEl.classList.remove('live');
    currentStageEl = null;
  }
}

function buildCard(info: VisualizerInfo): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = info.id;

  const stage = document.createElement('div');
  stage.className = 'stage';

  const placeholder = document.createElement('div');
  placeholder.className = 'placeholder';
  placeholder.textContent = info.name;

  const img = document.createElement('img');
  img.className = 'thumb';
  img.loading = 'lazy';
  img.alt = '';
  img.addEventListener('error', () => {
    img.style.display = 'none';
    placeholder.style.display = 'flex';
  }, { once: true });
  img.src = `thumbs/${info.id}.png`; // 無ければ error→プレースホルダ表示

  stage.appendChild(img);
  stage.appendChild(placeholder);
  card.appendChild(stage);

  const meta = document.createElement('div');
  meta.className = 'meta';

  const nameEl = document.createElement('div');
  nameEl.className = 'name';
  nameEl.textContent = info.name;
  meta.appendChild(nameEl);

  if (info.author) {
    const authorEl = document.createElement('div');
    authorEl.className = 'author';
    authorEl.textContent = `by ${info.author}`;
    meta.appendChild(authorEl);
  }
  if (info.description) {
    const descEl = document.createElement('div');
    descEl.className = 'desc';
    descEl.textContent = info.description;
    meta.appendChild(descEl);
  }
  card.appendChild(meta);

  // hover（微細なデバウンス。reduced-motionまたはfine hover非対応なら無効）
  if (hasFineHover && !reduceMotion) {
    card.addEventListener('mouseenter', () => {
      window.clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => {
        stopCurrent();
        stage.classList.add('live');
        const runner = startLive(info.id, stage, CARD_W, CARD_H);
        if (runner) {
          currentRunner = runner;
          currentStageEl = stage;
        }
      }, HOVER_DEBOUNCE_MS);
    });
    card.addEventListener('mouseleave', () => {
      window.clearTimeout(hoverTimer);
      if (currentStageEl === stage) stopCurrent();
    });
  }

  // クリック/タップ → ライトボックス（hover非対応・reduced-motionでもここは常に有効）
  card.addEventListener('click', () => openLightbox(info));

  return card;
}

// ── ライトボックス ──────────────────────────────────────────────
const lightbox = document.getElementById('lightbox') as HTMLDivElement;
const lightboxStage = document.getElementById('lightbox-stage') as HTMLDivElement;
const lightboxName = document.getElementById('lightbox-name') as HTMLDivElement;
const lightboxDesc = document.getElementById('lightbox-desc') as HTMLDivElement;
const lightboxCloseBtn = document.getElementById('lightbox-close') as HTMLButtonElement;

function openLightbox(info: VisualizerInfo): void {
  stopCurrent(); // カードのhoverライブがあれば止める（常に最大1枚）
  window.clearTimeout(hoverTimer);

  lightboxName.textContent = info.name + (info.author ? ` — by ${info.author}` : '');
  lightboxDesc.textContent = info.description ?? '';

  const w = Math.min(window.innerWidth * 0.9, 960);
  const h = w * 9 / 16;
  lightboxStage.style.width = `${w}px`;
  lightboxStage.style.height = `${h}px`;
  lightboxStage.innerHTML = '';

  lightbox.hidden = false;
  const runner = startLive(info.id, lightboxStage, w, h);
  if (runner) currentRunner = runner;
}

function closeLightbox(): void {
  if (currentRunner) {
    currentRunner.stop();
    currentRunner = null;
  }
  lightboxStage.innerHTML = '';
  lightbox.hidden = true;
}

lightboxCloseBtn.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox(); // 背景クリックで閉じる（stage/info自体は除く）
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
});

// ── 初期化：registryの全ビジュアライザをカード化 ──────────────────
function main(): void {
  const grid = document.getElementById('grid');
  if (!grid) return;
  for (const info of registry.list()) {
    grid.appendChild(buildCard(info));
  }
}

main();
