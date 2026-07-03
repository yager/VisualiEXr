# 参考：ダウンロードした元の Chrome 拡張の解析

このプロジェクトは、既存の Chrome 拡張 **「YouTube™ Music Visualizer」** をダウンロードして仕組みを調べ、それを参考にオリジナル版（`src/`）を作っています。このドキュメントは、その**元拡張のリバースエンジニアリング（解析）メモ**です。オリジナル版の設計は [architecture.md](architecture.md) を参照。

音の用語（周波数・スペクトラム・FFT・ビン・デシベルなど）は [audio-basics.md](audio-basics.md) にまとめてあります。

元拡張は、YouTube（`youtube.com` / `music.youtube.com`）で再生中の動画の音を分析し、画面下部（または動画上）にスペクトラム風のビジュアライザを重ねて表示する Manifest V3 拡張です。

---

## ファイル構成（元拡張）

| 役割 | パス |
|------|------|
| 拡張の設定ファイル（権限や入口を宣言） | `manifest.json` |
| YouTube ページに注入され、実際に絵を描く本体 | `js/content_script.js`（ビルド済み・1ファイルに圧縮） |
| 設定の保存と、全タブへの配信担当 | `js/background.js` |
| 拡張アイコンを押すと出る設定パネル | `popup.html`, `js/popup.js`, `styles/*.css` |
| 寄付のお知らせ表示用スタイル | `styles/notification.css` |
| 表示文言 | `_locales/en/messages.json` |

> メモ：`popup.html` は `js/vendor.js`（外部ライブラリをまとめたファイル）を読み込んでいますが、リポジトリには同梱されていません。配布版から欠けている可能性があります。
>
> メモ：`content_script.js` と `background.js` は、人が読みやすい元のソースを **1 行に圧縮（minify）したビルド済みファイル**です。変数名が `t` や `e` などに置き換わって読みにくいですが、処理内容は以下のとおりです。

---

## 全体の流れ（音 → 絵 までの配管）

```
[YouTube の <video>]
      │  音を取り出す（蛇口）
      ▼
 createMediaElementSource
      │
      ├──────────────▶ destination（スピーカー：いつもどおり音が鳴る）
      │
      ▼
  AnalyserNode（分析装置：音を覗き見する）
      │  毎フレーム getByteFrequencyData() で数字の列を取得
      ▼
  バー描画（Bar）/ 円描画（Circle）→ <canvas> に毎フレーム描く
```

ポイントは、音の流れを**2本に枝分かれ**させていることです。1本は**スピーカー（destination）**へ（普通に音が聞こえる）、もう1本は**分析装置（AnalyserNode）**へ（絵を描く分析用）。この枝分かれのおかげで「分析しているのに音は消えない」が成立します。

処理の順番（`js/content_script.js`）：

1. **動画要素が出てくるのを待つ**。YouTube はページを開いた瞬間には動画タグ（`video.video-stream`）が無いことがあるため、`MutationObserver` で出現を待つ。
2. **`AudioContext` を作り**、`createMediaElementSource(video)` で動画の音を取り込み、分析装置とスピーカーの両方へつなぐ。
3. 拡張の設定（表示モードや ON/OFF、色）は `background.js` が保存し、メッセージで content script に渡す。
4. 設定パネル（popup）でスライダーや色を変えると、background 経由で**開いている全 YouTube タブ**に配信され、描画に反映される。

---

## 音を「数字の列」に変える仕組み

絵を描く材料は、毎フレーム取得する**数字の列（長さ 1024 の配列）**です。

- **`fftSize = 2048`**：FFT にかけるサンプル数。分解後のビン数は半分の **1024 個**。
- **`minDecibels = -90` / `maxDecibels = 0`**：どれくらい小さい音〜大きい音を 0〜255 に対応させるかの感度範囲。
- 毎フレーム **`analyser.getByteFrequencyData(配列)`** を呼ぶと、1024 個の箱に **0〜255 の数字**が入る（先頭が低い音、後ろほど高い音。数字が大きいほど強い）。

---

## バー表示モード（設定名 `andromeda` / UI 上は「Bars」）

画面下端に、音にあわせて上下するスペクトラムの棒グラフを表示。コード上は `Bar` クラス。

- バー1本ごとに、配列の箱を**1つそのまま割り当て**。`t` 本目のバーには `配列[t]` を使う（左端が最低音、右へいくほど高音）。まとめて平均する等の加工はなし。
- 本数 **`barCount`** はユーザー設定（スライダー 1〜230、初期値 132）。上限 230 < 箱の総数 1024 なので常に有効な箱を参照。
- 高さ変換：各箱の値 `v`（0〜255）とキャンバス高さ `H` で、バー上端 = `H − (v ÷ 255) × H`（`v` が大きいほど上へ＝高いバー）。
- 幅は「キャンバス幅 ÷ 本数 − すき間（`meterStep = 0.5`）」、横位置は `t ×（バー幅 + すき間）`。

### 見た目のオプション（設定パネル）
- **色（グラデーション）**：下・中・上に BOTTOM / MIDDLE / TOP の色を配置。
- **高さ（BARS HEIGHT）**：`barHeight`（%）でキャンバス表示高さを画面比で変える。
- **透明度（OPACITY）**：`opacity` を `globalAlpha` に反映。
- **CAPS**：各バー先端に「ピークが少しずつ落ちる帽子」を描く（音が下がるとゆっくり落ち、上がると即追従）。

キャンバスは `position: fixed; bottom: 0; pointer-events: none` で画面下端に重ねる（`pointer-events: none` で YouTube 操作を邪魔しない）。

---

## 円形モード（設定名 `n16` / UI 上は「Circle (BETA)」）

動画の上に円を描き、円周から外へ音にあわせた線が放射状に伸びるモード。コード上は `Circle` クラス。

- 材料はバーモードと同じ（同じ `getByteFrequencyData`）。
- **固定 200 本**の線を円周に等間隔（`2π ÷ 200` ごと）に配置。
- `t` 本目の線の長さは `配列[t] × 0.7`。線の色は `rgb(値, 値, 205)`（強いほど白っぽい）。
- キャンバスは動画コンテナに重ね、`MutationObserver` で動画の `style`（サイズ）変化に追従。

---

## 設定の保存と受け渡し（background の役割）

設定は `chrome.storage.local` に置かれ、`background.js` が読み書きと配信を担当。主なキー：

- **`galaxy`**：表示モード（`andromeda`＝バー、`n16`＝円）。
- **`andromedaSettings`**（コード上は `"andromeda"` + `"Settings"` の連結キー）：バーモードの設定 JSON。初期値の例：
  ```json
  { "top": "#0057B8", "middle": "#0057B8", "bottom": "#FFD700",
    "bar": "#000", "barCount": 132, "barHeight": 15,
    "capsEnabled": false, "opacity": 1 }
  ```
- **`mg-visualiser-activated`**：ビジュアライザの ON/OFF。

流れ：設定パネル操作 → `{ update: true, params: {…} }` が background へ → 保存＆全 YouTube タブへ配信 → 各タブの描画オブジェクトの `process()` が反映。初回インストール時（`onInstalled`）に既定モードと ON 状態を書き込む。

---

## その他の UI 挙動

- 初回訪問時に**寄付のお知らせ（トースト）**を一度だけ表示（`localStorage` に表示日を記録し日付単位で重複防止）。スタイルは `notification.css`。
- 設定パネル下部に寄付リンク（Buy me a coffee / PayPal）。
