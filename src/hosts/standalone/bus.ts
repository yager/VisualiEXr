/**
 * 出力ウィンドウ ⇔ 操作ウィンドウ の通信メッセージ定義。
 * 同一オリジン（localhost）なので BroadcastChannel で繋がる。
 */
export const CHANNEL = 'vexr-control';

export interface DeviceInfo { id: string; label: string; }
export interface PluginInfo { id: string; name: string; }

export interface AppState {
  enabled: boolean;
  visualizerId: string;
  deviceId?: string;
}

export type BusMessage =
  | { type: 'requestState' }                                   // 操作 → 出力：現在の状態をくれ
  | { type: 'state'; devices: DeviceInfo[]; plugins: PluginInfo[]; current: AppState; pluginsDir?: string } // 出力 → 操作
  | { type: 'setVisualizer'; id: string }                      // 操作 → 出力
  | { type: 'setEnabled'; enabled: boolean }                   // 操作 → 出力
  | { type: 'setDevice'; deviceId: string }                    // 操作 → 出力
  | { type: 'reloadPlugins' };                                 // 操作 → 出力：フォルダを再走査
