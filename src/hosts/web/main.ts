import * as THREE from 'three';
import * as PIXI from 'pixi.js';
import { registry } from '../../app/registry';
import '../../app/plugins.generated'; // プラグインの自動登録（内蔵のみ。フォルダプラグインは静的配信なので無し）
import { AudioGraph } from '../../app/AudioGraph';
import { WindowStage } from '../../app/Stage';
import { VisualizerApp } from '../../app/VisualizerApp';
import { loadSettings, saveSettings, Settings } from '../../app/settings';

/**
 * Web ホスト — GitHub Pages 等の静的ホスティングで動くライブデモ。
 * 拡張・スタンドアロンと同じコア（AudioGraph / WindowStage / VisualizerApp / registry）を
 * 単一ページ・オーバーレイUIで束ねるだけ。コアは一切改変しない。
 *
 * スタンドアロンとの違い：
 *  - フォルダプラグイン（/plugins.json 経由の動的import）は呼ばない（静的配信に存在しないため）
 *  - 2ウィンドウ＋BroadcastChannel ではなく、同一ページ内のオーバーレイDOMで完結させる
 *  - 入力元はマイクに加え、Chrome の getDisplayMedia({audio:true}) によるタブ音声も選べる
 */

// ランタイムプラグイン向けSDK注入（Web版では使わないが、他ホストと同じ形にしておいて損はない）
(window as unknown as { MV: Record<string, unknown> }).MV = { THREE, PIXI };

let stage: WindowStage | null = null;
let app: VisualizerApp | null = null;
let state: Settings = { enabled: false, visualizerId: 'circle' };

function persist(): void {
  saveSettings(state);
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} が見つかりません`);
  return el;
}

async function acquireMic(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}

/**
 * タブ/画面の音声を取得（Chrome中心。getDisplayMedia は仕様上 video を要求するため
 * 映像トラックは取得後すぐ止める＝画面は録らない、音声だけ使う）。
 */
async function acquireTabAudio(): Promise<MediaStream> {
  const gdm = navigator.mediaDevices.getDisplayMedia as
    | ((opts: DisplayMediaStreamOptions) => Promise<MediaStream>)
    | undefined;
  if (!gdm) throw new Error('このブラウザはタブ音声の取得に対応していません（Chrome推奨）。');
  const stream = await gdm.call(navigator.mediaDevices, { video: true, audio: true });
  for (const track of stream.getVideoTracks()) track.stop();
  if (stream.getAudioTracks().length === 0) {
    for (const track of stream.getTracks()) track.stop();
    throw new Error('音声トラックが取得できませんでした。共有ダイアログで「音声を共有」をONにしてください。');
  }
  return stream;
}

async function startWithStream(stream: MediaStream): Promise<void> {
  const graph = new AudioGraph({ kind: 'stream', stream });
  graph.resume();
  if (!stage) stage = new WindowStage();
  if (!app) app = new VisualizerApp(graph, stage, registry);
  else app.replaceGraph(graph);
  if (!app.visualizerId) app.setVisualizer(state.visualizerId);
  app.start();
  state.enabled = true;
  persist();
  showDemo();
}

function stopDemo(): void {
  app?.stop();
  state.enabled = false;
  persist();
  showLanding();
}

function showDemo(): void {
  $('landing').hidden = true;
  $('overlay').hidden = false;
  setStatus('');
}

function showLanding(): void {
  $('landing').hidden = false;
  $('overlay').hidden = true;
}

function setStatus(msg: string): void {
  $('status').textContent = msg;
}

function populatePluginList(): void {
  const list = registry.list();
  const ul = $('plugin-list');
  ul.innerHTML = list
    .map(
      (p) =>
        `<li><strong>${escapeHtml(p.name)}</strong>${p.description ? ` — ${escapeHtml(p.description)}` : ''}</li>`,
    )
    .join('');

  const select = $('visualizer-select') as HTMLSelectElement;
  select.innerHTML = list.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function wireUI(): void {
  $('btn-start-mic').addEventListener('click', async () => {
    setStatus('マイクのアクセス許可を待っています… / Waiting for microphone permission…');
    try {
      const stream = await acquireMic();
      await startWithStream(stream);
    } catch (err) {
      setStatus(`マイクを取得できませんでした / Could not access microphone: ${String((err as Error).message ?? err)}`);
    }
  });

  $('btn-start-tab').addEventListener('click', async () => {
    setStatus('タブ/画面の共有ダイアログを待っています… / Waiting for share dialog…');
    try {
      const stream = await acquireTabAudio();
      await startWithStream(stream);
    } catch (err) {
      setStatus(`タブ音声を取得できませんでした / Could not access tab audio: ${String((err as Error).message ?? err)}`);
    }
  });

  const select = $('visualizer-select') as HTMLSelectElement;
  select.addEventListener('change', () => {
    state.visualizerId = select.value;
    app?.setVisualizer(select.value);
    persist();
  });

  $('btn-fullscreen').addEventListener('click', () => {
    void document.documentElement.requestFullscreen?.();
  });

  $('btn-off').addEventListener('click', () => {
    stopDemo();
  });
}

async function main(): Promise<void> {
  state = await loadSettings();
  if (!state.visualizerId) state.visualizerId = 'circle';
  populatePluginList();
  const select = $('visualizer-select') as HTMLSelectElement;
  select.value = state.visualizerId;
  wireUI();
  showLanding();
}

void main().catch((err) => {
  console.error('[web] 起動に失敗:', err);
});
