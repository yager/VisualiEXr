import { CHANNEL, BusMessage, AppState, DeviceInfo, PluginInfo } from './bus';

/**
 * 操作ウィンドウ — 手元だけに表示し、観客には見せない操作パネル。
 * 入力デバイス選択・プラグイン切替・On/Off を出力ウィンドウへ送るだけ（描画も音声処理もしない）。
 */

const bus = new BroadcastChannel(CHANNEL);
const $ = (id: string) => document.getElementById(id)!;

function send(msg: BusMessage): void {
  bus.postMessage(msg);
}

function renderDevices(devices: DeviceInfo[], current: AppState): void {
  const sel = $('device') as HTMLSelectElement;
  sel.innerHTML = '';
  for (const d of devices) {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.label;
    if (d.id === current.deviceId) opt.selected = true;
    sel.appendChild(opt);
  }
}

function renderPlugins(plugins: PluginInfo[], current: AppState): void {
  const list = $('plugins');
  list.innerHTML = '';

  const off = document.createElement('button');
  off.className = 'item' + (!current.enabled ? ' active' : '');
  off.textContent = 'Off';
  off.onclick = () => send({ type: 'setEnabled', enabled: false });
  list.appendChild(off);

  for (const p of plugins) {
    const btn = document.createElement('button');
    btn.className = 'item' + (current.enabled && p.id === current.visualizerId ? ' active' : '');
    btn.textContent = p.name;
    btn.onclick = () => send({ type: 'setVisualizer', id: p.id });
    list.appendChild(btn);
  }
}

bus.onmessage = (e: MessageEvent<BusMessage>) => {
  const m = e.data;
  if (m.type === 'state') {
    renderDevices(m.devices, m.current);
    renderPlugins(m.plugins, m.current);
    $('pluginDir').textContent = m.pluginsDir ? `フォルダ: ${m.pluginsDir}` : '';
  }
};

($('device') as HTMLSelectElement).onchange = (e) => {
  send({ type: 'setDevice', deviceId: (e.target as HTMLSelectElement).value });
};

// プラグイン：再読み込み（フォルダ再走査）／フォルダを Finder で開く
$('reload').onclick = () => send({ type: 'reloadPlugins' });
$('openFolder').onclick = () => { void fetch('/open-plugins').catch(() => {}); };

// 出力ウィンドウへ現在状態を要求（あちらが先に開いていれば即返る）
send({ type: 'requestState' });
