import { Stage, VideoStage, ViewportStage } from '../../app/Stage';

/**
 * SiteAdapter — 対応サービスごとの差分をまとめた小さなアダプタ。
 *
 * 「どのメディア要素を掴むか」「どう重ねるか（動画追従 or ビューポート全面）」「⚙をどこに置くか」を
 * サービス別に定義する。新サービスは **アダプタを1つ足して manifest に1行**で増やせる
 * （ワイルドカードにせず、対応ドメインは明示列挙する方針）。
 *
 * ※ A方式（createMediaElementSource）は **DRM(EME)保護音源では無音**になる（Spotify等は不可）。
 * ※ 別オリジンからCORSヘッダ無しで配信される音源は、再生されてもアナライザが無音を返すことがある
 *    → サービスごとに「実際に波形が取れるか」の実地確認が必要。
 */
export interface SiteAdapter {
  readonly id: string;
  /** 対応ホスト（末尾一致。例 'youtube.com' は music.youtube.com も含む）。 */
  readonly hosts: string[];
  /** そのサイトで解析対象のメディア要素を（出現を待って）返す。 */
  waitForMedia(): Promise<HTMLMediaElement>;
  /** 重ね方：動画に追従（VideoStage）か、ビューポート全面（ViewportStage）か。 */
  createStage(media: HTMLMediaElement): Stage;
  /** ⚙の取り付け先（省略時は body 固定）。 */
  controlContainer(media: HTMLMediaElement): HTMLElement | undefined;
}

/** セレクタに一致する要素の出現を待つ（pick で複数から選べる）。 */
function waitForEl<T extends Element>(selector: string, pick?: (els: T[]) => T | null): Promise<T> {
  const find = (): T | null => {
    const els = Array.from(document.querySelectorAll<T>(selector));
    return pick ? pick(els) : (els[0] ?? null);
  };
  return new Promise((resolve) => {
    const existing = find();
    if (existing) return resolve(existing);
    const obs = new MutationObserver(() => {
      const el = find();
      if (el) { obs.disconnect(); resolve(el); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  });
}

/** YouTube（既存挙動）：video.video-stream に追従して重ねる。 */
const youtube: SiteAdapter = {
  id: 'youtube',
  hosts: ['youtube.com'],
  waitForMedia: () => waitForEl<HTMLVideoElement>('video.video-stream'),
  createStage: (media) => new VideoStage(media),
  controlContainer: (media) => (media.closest('.html5-video-player') as HTMLElement) ?? undefined,
};

/**
 * 音声onlyサイト共通アダプタ：DOM上の <audio>/<video>（src を持つものを優先）を掴み、
 * ビューポート全面に重ねる。⚙はビューポート右端中央（fixed）。
 * ※ サイトがDOMにメディア要素を持たず Web Audio で直接再生する場合は方式Aでは取得できない
 *    （例：SoundCloud）。その場合はタブキャプチャ（方式B）が必要。
 */
function audioSiteAdapter(id: string, hosts: string[]): SiteAdapter {
  return {
    id,
    hosts,
    waitForMedia: () => waitForEl<HTMLMediaElement>('audio, video', (els) =>
      els.find((e) => e.currentSrc || e.src) ?? els[0] ?? null),
    createStage: () => new ViewportStage(),
    controlContainer: () => document.body,
  };
}

// YouTube Music（music.youtube.com）：<video> を音源に使うが、画面は音楽表示で動画の矩形が
// 無いに等しいので ViewportStage（全面）で重ねる。music は youtube にもマッチするので**先に**判定する。
const youtubeMusic = audioSiteAdapter('youtube-music', ['music.youtube.com']);

const ADAPTERS: SiteAdapter[] = [youtubeMusic, youtube];

/** ホスト名から対応アダプタを選ぶ（未対応なら null）。 */
export function pickAdapter(hostname: string): SiteAdapter | null {
  return ADAPTERS.find((a) => a.hosts.some((h) => hostname === h || hostname.endsWith('.' + h))) ?? null;
}
