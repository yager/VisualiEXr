/**
 * 設定の永続化。
 * 拡張では chrome.storage.local、スタンドアロン（Electron/ブラウザ）では localStorage を使う。
 */
export interface Settings {
  enabled: boolean;
  visualizerId: string;
  /** スタンドアロンの入力デバイスID（拡張では未使用）。 */
  deviceId?: string;
}

const KEY = 'vexr-settings';
const DEFAULTS: Settings = { enabled: true, visualizerId: 'analyzer' };

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

/** 保存済み設定を読む（無ければ既定値）。 */
export async function loadSettings(): Promise<Settings> {
  try {
    if (hasChromeStorage()) {
      const got = await chrome.storage.local.get(KEY);
      return { ...DEFAULTS, ...(got[KEY] as Partial<Settings> | undefined) };
    }
    const raw = localStorage.getItem(KEY);
    return { ...DEFAULTS, ...(raw ? (JSON.parse(raw) as Partial<Settings>) : undefined) };
  } catch {
    return { ...DEFAULTS };
  }
}

/** 設定を保存する（失敗しても致命的ではないので握りつぶす）。 */
export function saveSettings(s: Settings): void {
  try {
    if (hasChromeStorage()) {
      void chrome.storage.local.set({ [KEY]: s });
    } else {
      localStorage.setItem(KEY, JSON.stringify(s));
    }
  } catch {
    // storage が使えない等は無視
  }
}
