import { registry } from '../../app/registry';
import '../../app/plugins.generated'; // プラグインの自動登録（副作用 import）
import { AudioGraph } from '../../app/AudioGraph';
import { VisualizerApp } from '../../app/VisualizerApp';
import { ControlPanel } from '../../app/ControlPanel';
import { loadSettings, saveSettings } from '../../app/settings';
import { showAudioNotice } from '../../app/notice';
import { pickAdapter } from './adapters';

/**
 * 拡張ホストのエントリ — 対応サイト（YouTube / YouTube Music …）に注入される。
 * サイト差分は SiteAdapter（adapters.ts）に集約：どのメディア要素を掴み、どう重ね、⚙をどこに置くか。
 * コア（AudioGraph / VisualizerApp / ControlPanel）はサイト非依存のまま。
 */

// createMediaElementSource は1要素につき1回しか呼べないので、二重起動を防ぐ。
const STARTED_FLAG = '__vexr_started__';

async function main(): Promise<void> {
  const w = window as unknown as Record<string, boolean>;
  if (w[STARTED_FLAG]) return;

  const adapter = pickAdapter(location.hostname);
  if (!adapter) return; // 対応外サイト
  w[STARTED_FLAG] = true;

  const [media, settings] = await Promise.all([adapter.waitForMedia(), loadSettings()]);

  // 別拡張が先に音声を掴んでいると createMediaElementSource が失敗することがある。案内を出す。
  let graph: AudioGraph;
  try {
    graph = new AudioGraph({ kind: 'element', element: media });
  } catch (e) {
    console.warn('[MV] 音声ソースを取得できませんでした:', e);
    showAudioNotice();
    return;
  }

  // AudioContext はユーザー操作が無いと suspended のことがある。操作/再生で再開する。
  const resume = () => graph.resume();
  resume();
  media.addEventListener('play', resume);
  document.addEventListener('pointerdown', resume);

  const stage = adapter.createStage(media);
  const app = new VisualizerApp(graph, stage, registry);
  app.setVisualizer(settings.visualizerId);
  if (!app.visualizerId) app.setVisualizer('analyzer');
  if (settings.enabled) {
    app.start();
    watchAudio(graph, media); // 再生中なのに無音（＝競合等）を検知して案内
  }

  new ControlPanel(media, registry, app, {
    enabled: settings.enabled,
    onChange: saveSettings,
    container: adapter.controlContainer(media),
  });

  console.log(`[Music Visualizer] started on ${adapter.id}`);
}

/**
 * 再生が始まってから約3秒、peak が終始ほぼ 0 なら「音を取れていない」と判断して案内する。
 * （例外は投げないが無音になる“競合の負け側”ケースを拾う。）
 */
function watchAudio(graph: AudioGraph, media: HTMLMediaElement): void {
  let started = false;
  const run = (): void => {
    if (started) return;
    started = true;
    let maxPeak = 0;
    let ticks = 0;
    const iv = setInterval(() => {
      maxPeak = Math.max(maxPeak, graph.update().peak);
      if (++ticks >= 15) { // 約3秒
        clearInterval(iv);
        if (!media.paused && maxPeak < 0.002) showAudioNotice();
      }
    }, 200);
  };
  if (!media.paused && media.currentTime > 0) run();
  else media.addEventListener('play', run, { once: true });
}

void main();
