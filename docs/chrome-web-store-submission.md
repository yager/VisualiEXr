# Chrome ウェブストア申請ワークシート（B4〜B6）

Chrome ウェブストアのデベロッパーダッシュボードに**そのまま貼れる**申請文をまとめたもの。
（サイトには公開されない運用メモ。B1/B2 のアイコン・スクリーンショット画像は別途用意する。）

参照：拡張マニフェストの権限は `permissions: ["storage"]` ／ `host_permissions: ["*://*.youtube.com/*"]`、
content script は `*://*.youtube.com/*` のみ。ネットワーク送信なし・リモートコードなし。

---

## B6. 単一目的（Single purpose）＆ ストア掲載文

### 単一目的の記述（Single purpose description）
> 日本語：YouTube / YouTube Music の再生音に反応するビジュアライザを、動画プレイヤー上にオーバーレイ表示する拡張機能です。

> English: A single-purpose extension that overlays an audio-reactive visualizer on the YouTube / YouTube Music player, driven by the currently playing audio.

### 概要（Summary / 132文字以内）
> 日本語：YouTube の再生音に合わせて動くビジュアライザを動画に重ねて表示。プラグイン式で多彩な演出を切り替えられます。

> English: Overlay an audio-reactive visualizer on YouTube that moves with the music. Plugin-based, with many switchable visual styles.

### 詳細説明（Detailed description）
> 日本語：
> VisualiEXr は、YouTube / YouTube Music で再生中の音に反応して動くグラフィック（ビジュアライザ）を、
> 動画プレイヤーの上に重ねて表示する拡張機能です。
>
> ・動画右上の ⚙ からビジュアライザを切り替え／Off。選択は保存され次回も復元されます。
> ・波形・スペクトラム・プラズマ・3D 地形・花火など、多彩な内蔵ビジュアライザを収録。
> ・音声はビジュアル生成のためにブラウザ内で解析するだけで、録音・保存・外部送信は一切行いません。
> ・完全無料・オープンソース（MIT ライセンス）。
>
> ライブデモ（インストール不要の Web 版）や、VJ・プロジェクタ・OBS 向けのスタンドアロン版もあります。
> 詳しくは公式サイト／GitHub をご覧ください。

> English:
> VisualiEXr overlays an audio-reactive visualizer on top of the YouTube / YouTube Music player,
> moving in sync with whatever is playing.
>
> - Switch visualizers or turn them off from the ⚙ menu at the top-right of the video. Your choice is saved.
> - Includes many built-in visualizers: waveforms, spectrum, plasma, 3D terrain, fireworks, and more.
> - Audio is analyzed locally in your browser only — nothing is recorded, stored, or sent anywhere.
> - Completely free and open source (MIT license).
>
> A no-install web demo and a standalone version (for VJ / projector / OBS) are also available.

### カテゴリ / 言語
- カテゴリ：Fun（エンタメ系）
- 既定の言語：日本語（英語の説明も併記済み。英語ロケールを追加すると訴求が広がる）

---

## B5. 権限の正当化（Permission justifications）

ダッシュボードの「プライバシーへの取り組み（Privacy practices）」タブで各権限に理由を記入する欄。

### `storage`
> 日本語：ユーザーが選択したビジュアライザと表示オン/オフの状態を保存し、次回アクセス時に復元するために使用します。個人情報は保存しません。

> English: Used to save the user's selected visualizer and on/off state so it persists across sessions. No personal data is stored.

### ホストアクセス `*://*.youtube.com/*`（host permission / content script）
> 日本語：YouTube および YouTube Music のページで、動画プレイヤー上に音反応ビジュアライザの canvas を重ねて表示し、再生中の音声（ページ内の video 要素）を解析して描画に用いるために必要です。動作対象は youtube.com のみで、音声はブラウザ内で解析するだけで外部送信しません。

> English: Required to run only on YouTube / YouTube Music, where the extension overlays an audio-reactive canvas on the video player and analyzes the currently playing audio (the page's video element) to drive the visualization. It operates solely on youtube.com; audio is analyzed locally and never transmitted.

### リモートコードの使用（Are you using remote code?）
> いいえ / No. すべてのコードは拡張パッケージに同梱されており、外部からのコード読み込み（eval・動的 import 等）は行いません。

---

## B4. データ利用・プライバシー申告（Data usage / Privacy）

「プライバシーへの取り組み」タブのデータ収集申告。

### 収集するユーザーデータ
> **収集しない（None）。** 本拡張は個人情報・利用状況データを収集・送信しません。
> 設定（選択したビジュアライザ等）は端末内の `chrome.storage.local` にのみ保存され、外部へ送信されません。
> 音声はビジュアル生成のためにブラウザ内で解析するのみで、録音・保存・送信を行いません。

### データ利用に関する認証（チェック項目）
以下すべてに該当（チェックできる）：
- [x] 販売や第三者への譲渡のために、ユーザーデータを第三者に販売・移転しない
- [x] 拡張機能の単一目的と無関係な目的で、ユーザーデータを使用・移転しない
- [x] 信用調査・貸付資格の判断のために、ユーザーデータを使用・移転しない

### プライバシーポリシー URL
> `https://yager.github.io/VisualiEXr/legal/privacy/`

---

## 提出時のチェックリスト
- [ ] `dist-extension/` を zip 化してアップロード（`npm run build` 後）
- [ ] アイコン（16/32/48/128）を manifest とストアに設定 ← 別ライン（B1）で対応中
- [ ] スクリーンショット 1枚以上（1280×800 か 640×400）← B2
- [ ] 単一目的・権限理由・データ申告・プライバシー URL を上記から記入
- [ ] 公式サイト（`https://yager.github.io/VisualiEXr/`）をホームページ URL に設定（任意）
