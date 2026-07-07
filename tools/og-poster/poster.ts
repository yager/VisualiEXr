import { AudioFeatures } from '../../src/audio/AudioFeatures';
import { SurfaceVisualizer } from '../../src/visualizers/Visualizer';
import ChromaFlowVisualizer from './vendored/ChromaFlowVisualizer';
import CyberFlightVisualizer from './vendored/CyberFlightVisualizer';
import PixiNeonVisualizer from './vendored/PixiNeonVisualizer';
import { makePosterFeatures } from './features';

// ビルド時刻（build.mjs の define で埋め込む）。実行中のJSが最新かを画面で判別するため。
declare const __BUILD_ID__: string;

/**
 * poster.ts — VisualiEXr の OG画像（1920×1080 / 1200×630）をブラウザ内で合成するツール。
 * 【非公開・内部専用】dist-web には含めない。本サイトのビジュアライザは一切改変せず、
 * tools/og-poster/vendored/ にコピーしたキャプチャ対応版だけを使う。
 *
 * 調整はこの定数オブジェクト（CONFIG）を編集 → リロード → Download で詰める（スライダーUIなし）。
 */
const CONFIG = {
  width: 1920,
  height: 1080,
  safe: { width: 1200, height: 630 }, // 1200x630版はこの中央領域に要点が収まる想定

  warmup: {
    dt: 1 / 60,     // features.time を毎フレーム進める量
    chroma: 5,      // Chroma Flow（ほぼ時間関数。数フレームで十分）
    cyber: 120,     // Cyber Flight（カメラが進むので空回しが必要）
    pixi: 90,       // PixiNeon（Shockwave/グロー安定のため空回し）
  },

  layers: {
    // 背景：Chroma Flow（GLSL）。暗めに落として背景に馴染ませる（手前のレイヤーを立たせる）。
    chroma: {
      opacity: 0.95,
      blend: 'source-over' as GlobalCompositeOperation,
      saturate: 0.25,
      // 明るさの底上げ：全体の印象を明るくしつつ、コントラストで模様を立たせる。
      brightness: 0.85,
      // 元の色のうちに先にcontrastをかけ、後からbrightnessで落とす順序にする（下のfilter文字列を参照）。
      // brightnessを先にかけると全体が中間グレーの基準点(128)より暗くなり、contrastが
      // 「暗部をさらに沈めるだけ」になって模様が消えてしまうため、順序が重要。
      contrast: 2.2,
      scale: 1.5,
      offsetX: 0,
      offsetY: 0,
    },
    // Cyber Flight（three.js、床/天井のみ）：通常合成（source-over）。
    // screenだと不透明度を上げても背景を完全には覆えない（加算的に光を足すだけの性質のため）ので、
    // opacityがそのまま「不透明度」として体感通りに効く source-over に変更。
    // 透明な領域（何もない空の部分）はcanvasのalpha=0なので、そこは引き続き背景が見える。
    // offsetY は 0 固定。正の値にするとレイヤー全体が下にずれ、上端に未合成の帯ができる。
    cyber: {
      opacity: 1.0,
      blend: 'source-over' as GlobalCompositeOperation,
      scale: 1.05,
      offsetX: 0,
      offsetY: 0,
    },
    // PixiNeon：中央の空きにロゴを収める（vendored側でR0/lenを調整済み。ここでは等倍）。
    pixi: {
      opacity: 0.85,
      blend: 'screen' as GlobalCompositeOperation,
      scale: 1.0,
      offsetX: 0,
      offsetY: 0,
    },
  },

  logo: {
    src: '/img/visualiexr_logo_gradient_transparent.png',
    scale: 0.24, // キャンバス幅に対するロゴ幅の比率（PixiNeonの内円に収まるサイズ）
    // 元画像は透過キャンバス内でV字の視覚的重心が幾何中心よりやや上に寄っている
    // （alpha重心を実測: 中心からY方向に-46.8px/2048、比率にして約-2.3%）ため、
    // 見た目の中心を合わせるために少し下へオフセットする。
    offsetY: 11,
    glow: {
      radius: 0.42,  // キャンバス幅に対する放射グラデーション半径の比率
      opacity: 0.55, // 中心の暗がりの強さ
    },
  },

  background: {
    color: '#0a0a0f',
  },
};

type LayerConfig = {
  opacity: number;
  blend: GlobalCompositeOperation;
  scale: number;
  offsetX: number;
  offsetY: number;
};

function setStatus(msg: string): void {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
}

function makeOffscreenContainer(id: string): HTMLDivElement {
  const div = document.createElement('div');
  div.id = id;
  div.style.cssText =
    `position:fixed; left:-99999px; top:0; width:${CONFIG.width}px; height:${CONFIG.height}px; overflow:hidden;`;
  document.body.appendChild(div);
  return div;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** frame() を rAF ペースで繰り返す。PixiJS は内部tickerがrAF駆動のため、これで実際に描画が進む。 */
async function warmup(v: SurfaceVisualizer, features: AudioFeatures, frames: number, dt: number): Promise<void> {
  for (let i = 0; i < frames; i++) {
    features.time += dt;
    v.frame(features);
    await nextFrame();
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`画像の読み込みに失敗: ${src}`));
    img.src = src;
  });
}

/** レイヤーのcanvasを、指定のblend/opacity/scale/offsetでマスターに合成する。 */
function drawLayer(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  layer: LayerConfig,
  cssFilter?: string,
): void {
  ctx.save();
  if (cssFilter) ctx.filter = cssFilter;
  ctx.globalCompositeOperation = layer.blend;
  ctx.globalAlpha = layer.opacity;
  const w = CONFIG.width * layer.scale;
  const h = CONFIG.height * layer.scale;
  const cx = CONFIG.width / 2 + layer.offsetX;
  const cy = CONFIG.height / 2 + layer.offsetY;
  ctx.drawImage(canvas, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

function drawLogo(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
  const cx = CONFIG.width / 2;
  const cy = CONFIG.height / 2 + CONFIG.logo.offsetY;

  // ロゴの可読性のため、背後にごく薄い放射状の暗がりを敷く
  const glowR = CONFIG.width * CONFIG.logo.glow.radius;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  grad.addColorStop(0, `rgba(5,5,10,${CONFIG.logo.glow.opacity})`);
  grad.addColorStop(1, 'rgba(5,5,10,0)');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
  ctx.restore();

  const targetW = CONFIG.width * CONFIG.logo.scale;
  const targetH = targetW * (img.height / img.width);
  ctx.drawImage(img, cx - targetW / 2, cy - targetH / 2, targetW, targetH);
}

function download(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function getCanvas(container: HTMLElement): HTMLCanvasElement | null {
  return container.querySelector('canvas');
}

async function main(): Promise<void> {
  console.log('[og-poster] build', __BUILD_ID__);
  setStatus(`準備中…（build ${__BUILD_ID__}）`);
  const features = makePosterFeatures();

  const chromaContainer = makeOffscreenContainer('og-layer-chroma');
  const cyberContainer = makeOffscreenContainer('og-layer-cyber');
  const pixiContainer = makeOffscreenContainer('og-layer-pixi');

  const chroma = new ChromaFlowVisualizer();
  const cyber = new CyberFlightVisualizer();
  const pixi = new PixiNeonVisualizer();

  chroma.mount(chromaContainer);
  cyber.mount(cyberContainer);
  pixi.mount(pixiContainer);

  setStatus('ウォームアップ中（Chroma Flow）…');
  await warmup(chroma, features, CONFIG.warmup.chroma, CONFIG.warmup.dt);

  setStatus('ウォームアップ中（Cyber Flight）…');
  await warmup(cyber, features, CONFIG.warmup.cyber, CONFIG.warmup.dt);

  setStatus('ウォームアップ中（PixiNeon）…');
  await warmup(pixi, features, CONFIG.warmup.pixi, CONFIG.warmup.dt);

  const chromaCanvas = getCanvas(chromaContainer);
  const cyberCanvas = getCanvas(cyberContainer);
  const pixiCanvas = getCanvas(pixiContainer);
  if (!chromaCanvas || !cyberCanvas || !pixiCanvas) {
    setStatus('エラー：レイヤーのcanvasが見つかりません（キャプチャ失敗）');
    console.error('missing canvas', { chromaCanvas, cyberCanvas, pixiCanvas });
    return;
  }

  setStatus('ロゴを読み込み中…');
  const logoImg = await loadImage(CONFIG.logo.src);

  const master = document.getElementById('master') as HTMLCanvasElement;
  master.width = CONFIG.width;
  master.height = CONFIG.height;
  const ctx = master.getContext('2d');
  if (!ctx) { setStatus('エラー：2Dコンテキストを取得できません'); return; }

  // 背景色 → Chroma Flow（彩度・明るさを落として背景に馴染ませる）→ Cyber Flight → PixiNeon → ロゴ
  ctx.fillStyle = CONFIG.background.color;
  ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
  drawLayer(ctx, chromaCanvas, CONFIG.layers.chroma,
    `contrast(${CONFIG.layers.chroma.contrast}) saturate(${CONFIG.layers.chroma.saturate}) brightness(${CONFIG.layers.chroma.brightness})`);
  drawLayer(ctx, cyberCanvas, CONFIG.layers.cyber);
  drawLayer(ctx, pixiCanvas, CONFIG.layers.pixi);
  drawLogo(ctx, logoImg);

  setStatus(`完成（build ${__BUILD_ID__}）。下のボタンから保存できます。`);

  document.getElementById('btn-1920')?.addEventListener('click', () => {
    download(master, 'visualiexr-og-1920x1080.png');
  });

  document.getElementById('btn-1200')?.addEventListener('click', () => {
    const crop = document.createElement('canvas');
    crop.width = CONFIG.safe.width;
    crop.height = CONFIG.safe.height;
    const cctx = crop.getContext('2d');
    if (!cctx) return;
    const sx = (CONFIG.width - CONFIG.safe.width) / 2;
    const sy = (CONFIG.height - CONFIG.safe.height) / 2;
    cctx.drawImage(master, sx, sy, CONFIG.safe.width, CONFIG.safe.height, 0, 0, CONFIG.safe.width, CONFIG.safe.height);
    download(crop, 'visualiexr-og-1200x630.png');
  });
}

void main().catch((err) => {
  console.error('[og-poster] failed:', err);
  setStatus(`エラー: ${err instanceof Error ? err.message : String(err)}`);
});
