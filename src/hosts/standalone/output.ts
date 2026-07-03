import * as THREE from 'three';
import * as PIXI from 'pixi.js';
import { registry } from '../../app/registry';
import '../../app/plugins.generated'; // プラグインの自動登録
import { AudioGraph } from '../../app/AudioGraph';
import { WindowStage } from '../../app/Stage';
import { VisualizerApp } from '../../app/VisualizerApp';
import { loadSettings, saveSettings, Settings } from '../../app/settings';
import { CHANNEL, BusMessage, DeviceInfo } from './bus';

// ランタイムプラグイン（フォルダの JS）向けの SDK。重いライブラリはここで提供し、
// プラグイン側は同梱せず `window.MV.THREE` で使う（バンドルを軽く保つ）。
(window as unknown as { MV: Record<string, unknown> }).MV = { THREE, PIXI };

/**
 * 出力ウィンドウ — ウィンドウ全体に映像を描く（プロジェクタ/OBS 用）。
 * 音声はマイク/デバイスから取り込み、操作ウィンドウからのコマンドで切り替える。
 */

const bus = new BroadcastChannel(CHANNEL);
const stage = new WindowStage();
let app: VisualizerApp | null = null;
let state: Settings = { enabled: true, visualizerId: 'circle' };
let pluginsDir = '';

/**
 * ユーザーが置いた JS プラグインをフォルダから読み込む（直接配布版の目玉機能）。
 * 各ファイルは `export default class implements Visualizer` の ES モジュール。
 * localhost 経由で動的 import し、registry に登録する。
 * ※ 実行時に第三者コードを走らせるため、直接配布（非サンドボックス）前提の機能。
 */
async function loadFolderPlugins(): Promise<void> {
  try {
    const res = await fetch('/plugins.json');
    const info = (await res.json()) as { dir: string; files: string[] };
    pluginsDir = info.dir;
    for (const file of info.files) {
      try {
        // ?t= でキャッシュを外し、編集した内容を読み直せるようにする
        const mod = await import(`/plugins/${file}?t=${Date.now()}`);
        const Factory = mod.default;
        if (typeof Factory === 'function') {
          registry.register(() => new Factory());
        } else {
          console.warn(`[plugin] ${file}: default export がクラスではありません`);
        }
      } catch (err) {
        console.warn(`[plugin] ${file} 読み込み失敗:`, err);
      }
    }
  } catch {
    // /plugins.json が無い（拡張ビルド等）場合は何もしない
  }
}

/** 指定デバイス（無指定は既定）から音声ストリームを取得。 */
async function acquire(deviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: false,
  });
}

/** 入力デバイス一覧を取得。 */
async function listDevices(): Promise<DeviceInfo[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `入力 ${i + 1}` }));
}

/** 音声グラフを（再）構築して App に載せる。 */
async function useDevice(deviceId?: string): Promise<void> {
  const stream = await acquire(deviceId);
  const graph = new AudioGraph({ kind: 'stream', stream });
  graph.resume();
  if (!app) app = new VisualizerApp(graph, stage, registry);
  else app.replaceGraph(graph);
  state.deviceId = deviceId;
}

/** 現在状態を操作ウィンドウへ配信。 */
async function broadcastState(): Promise<void> {
  const msg: BusMessage = {
    type: 'state',
    devices: await listDevices(),
    plugins: registry.list(),
    current: { enabled: state.enabled, visualizerId: state.visualizerId, deviceId: state.deviceId },
    pluginsDir,
  };
  bus.postMessage(msg);
}

function persist(): void {
  saveSettings(state);
}

bus.onmessage = async (e: MessageEvent<BusMessage>) => {
  const m = e.data;
  switch (m.type) {
    case 'requestState':
      await broadcastState();
      break;
    case 'setVisualizer':
      state.visualizerId = m.id;
      app?.setVisualizer(m.id);
      if (!app?.isRunning) app?.start();
      state.enabled = true;
      persist();
      await broadcastState();
      break;
    case 'setEnabled':
      state.enabled = m.enabled;
      if (m.enabled) app?.start(); else app?.stop();
      persist();
      await broadcastState();
      break;
    case 'setDevice':
      await useDevice(m.deviceId);
      persist();
      await broadcastState();
      break;
    case 'reloadPlugins':
      await loadFolderPlugins();
      await broadcastState();
      break;
  }
};

async function main(): Promise<void> {
  state = await loadSettings();
  if (!state.visualizerId) state.visualizerId = 'circle';
  await loadFolderPlugins();        // 内蔵に加え、フォルダのプラグインも登録
  await useDevice(state.deviceId);  // 先に getUserMedia するとデバイス名(label)も取れる
  app!.setVisualizer(state.visualizerId);
  if (!app!.visualizerId) app!.setVisualizer('circle');
  if (state.enabled) app!.start();
  await broadcastState();
}

void main().catch((err) => {
  console.error('[output] 起動に失敗:', err);
});
