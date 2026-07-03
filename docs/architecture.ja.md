[English](architecture.md) | **日本語**

# 設計メモ：プラグイン式ビジュアライザの構造

オリジナル版（`src/`）の設計意図と前提のまとめです。
「音響解析を知らなくてもビジュアライザを書ける」状態を目指しています。

関連: [../README.ja.md](../README.ja.md)（概要）／[audio-basics.md](audio-basics.md)（音の基礎）／[visualizer-basics.md](visualizer-basics.md)（描画の基礎＝シェーダ/WebGL等）／[features.ja.md](features.ja.md)（材料の一覧）

---

## 全体像

```
<video> → AnalyserNode ─┐
TimeDomain ─────────────┴─▶ FeatureEngine.update()（毎フレーム）
                                   │
                                   ▼
                            AudioFeatures   ← 0〜1 に正規化した「音の数値セット」
                                   │
              ┌──────────┬─────────┼─────────┐
            Bars    Analyzer   自作プラグイン  …   ← features だけ見て描く
```

中心の考え方は **「特徴量バス」**：プラグインは生の `AnalyserNode` を触らず、
`FeatureEngine` が毎フレーム作る [`AudioFeatures`](../src/audio/AudioFeatures.ts) だけを読みます。

---

## ファイル構成（`src/`）

| ファイル | 役割 |
|------|------|
| [`src/audio/AudioFeatures.ts`](../src/audio/AudioFeatures.ts) | プラグインに渡す「音の数値セット」の型定義（このプロジェクトの共通言語） |
| [`src/audio/FeatureEngine.ts`](../src/audio/FeatureEngine.ts) | AnalyserNode から毎フレーム AudioFeatures を計算する本体 |
| [`src/audio/AutoGain.ts`](../src/audio/AutoGain.ts) | 上限のない指標を 0〜1 に収める適応的ゲイン |
| [`src/audio/TempoTracker.ts`](../src/audio/TempoTracker.ts) | オンセット包絡の自己相関で BPM を推定 |
| **`src/visualizers/`** | **プラグインと、その契約だけ**を置くフォルダ |
| [`src/visualizers/Visualizer.ts`](../src/visualizers/Visualizer.ts) | プラグインが実装するインターフェース（契約） |
| [`src/visualizers/BarsVisualizer.ts`](../src/visualizers/BarsVisualizer.ts) | サンプルプラグイン（周波数バー） |
| [`src/visualizers/CircleVisualizer.ts`](../src/visualizers/CircleVisualizer.ts) | サンプルプラグイン（放射状バー＋波形＋調性の色） |
| [`src/visualizers/PlasmaScopeVisualizer.ts`](../src/visualizers/PlasmaScopeVisualizer.ts) | 波形を tonalAngle で回す放電風オシロ＋中央リング（Canvas2D） |
| [`src/visualizers/PlasmaBallVisualizer.ts`](../src/visualizers/PlasmaBallVisualizer.ts) | フラクタル放電のプラズマボール（Canvas2D） |
| [`src/visualizers/PixiNeonVisualizer.ts`](../src/visualizers/PixiNeonVisualizer.ts) | PixiJS ＋ pixi-filters（Glow/Shockwave）のネオン演出（自前描画面・SurfaceVisualizer） |
| [`src/visualizers/PixiFireworksVisualizer.ts`](../src/visualizers/PixiFireworksVisualizer.ts) | PixiJS の ParticleContainer による大量スプライトの花火（菊） |
| [`src/visualizers/CyberFlightVisualizer.ts`](../src/visualizers/CyberFlightVisualizer.ts) | three.js のサイバーシティ・ドライブ＋円形HUD |
| [`src/visualizers/EqFieldVisualizer.ts`](../src/visualizers/EqFieldVisualizer.ts) | three.js の3Dイコライザ原（InstancedMesh・俯瞰旋回） |
| [`src/visualizers/KaleidoShardsVisualizer.ts`](../src/visualizers/KaleidoShardsVisualizer.ts) | three.js の万華鏡ステンドグラス（半透明パネルの重なり） |
| [`src/visualizers/WaterCausticsVisualizer.ts`](../src/visualizers/WaterCausticsVisualizer.ts) | GLSL の水中コースティクス（半透明で動画が水中に見える） |
| [`src/visualizers/LofiRainVisualizer.ts`](../src/visualizers/LofiRainVisualizer.ts) | chill：雨の窓ごしの街灯り（音は質感のみ・半透過） |
| [`src/visualizers/FlowFieldVisualizer.ts`](../src/visualizers/FlowFieldVisualizer.ts) | chill：流れ場に沿う粒子の軌跡（Canvas2D） |
| [`src/visualizers/ThreeTerrainVisualizer.ts`](../src/visualizers/ThreeTerrainVisualizer.ts) | three.js（3D）の音の地形フライト（自前描画面・SurfaceVisualizer） |
| [`src/visualizers/PlasmaVisualizer.ts`](../src/visualizers/PlasmaVisualizer.ts) | GLSL一枚芸の「Chroma Flow」＝色が流れるプラズマ（生WebGL・ライブラリ不要・透過） |
| [`src/visualizers/TunnelVisualizer.ts`](../src/visualizers/TunnelVisualizer.ts) | GLSL一枚芸の格子トンネル（生WebGL・ライブラリ不要・透過） |
| [`src/visualizers/shaderSurface.ts`](../src/visualizers/shaderSurface.ts) | 全画面フラグメントシェーダの再利用土台（`*Visualizer.ts`ではないので自動登録対象外） |
| [`src/visualizers/AnalyzerVisualizer.ts`](../src/visualizers/AnalyzerVisualizer.ts) | AudioFeatures を画面に並べる分析/デバッグ表示（UI名 "Analyzer (All Features)"、id=`analyzer`） |
| **`src/app/`** | **実行コアと機構**（入力・出力に依存しない） |
| [`src/app/AudioGraph.ts`](../src/app/AudioGraph.ts) | Web Audio 配線＋特徴量エンジン。**動画/ストリーム両対応**（入力ごとに1回） |
| [`src/app/Stage.ts`](../src/app/Stage.ts) | 描画先の抽象 `Stage` ＋ `VideoStage`（動画重ね）/ `ViewportStage`（音声onlyサイトの全面重ね）/ `WindowStage`（全画面） |
| [`src/app/VisualizerApp.ts`](../src/app/VisualizerApp.ts) | 束ね役。graph/stage を**注入**され、プラグイン切替・描画ループ |
| [`src/app/ControlPanel.ts`](../src/app/ControlPanel.ts) | 動画右上の⚙（拡張ホスト用のオーバーレイUI） |
| [`src/app/registry.ts`](../src/app/registry.ts) | プラグインの登録簿（list / create / register） |
| `src/app/plugins.generated.ts` | **自動生成**（gen-plugins.mjs）。`visualizers/*Visualizer.ts` を集めて登録。手で編集しない |
| [`src/app/settings.ts`](../src/app/settings.ts) | 設定の保存/復元（拡張=chrome.storage / スタンドアロン=localStorage） |
| **`src/hosts/`** | **ホスト（両端＝入力と出力）**。コアを組み立てて起動する層 |
| [`src/hosts/extension/content.ts`](../src/hosts/extension/content.ts) | 拡張ホストのエントリ：対応サイトに注入し、アダプタで組み立てる（サイト非依存） |
| [`src/hosts/extension/adapters.ts`](../src/hosts/extension/adapters.ts) | サイト別アダプタ（YouTube / YouTube Music）：メディア要素の掴み方・重ね方・⚙位置を定義。DOMにメディア要素が無いサイト（SoundCloud/Bandcamp等）は方式Aでは不可 |
| [`src/hosts/standalone/output.ts`](../src/hosts/standalone/output.ts) | スタンドアロン出力：マイク/デバイス入力＋全画面出力 |
| [`src/hosts/standalone/control.ts`](../src/hosts/standalone/control.ts) | スタンドアロン操作：別ウィンドウのデバイス選択/切替UI |
| [`src/hosts/standalone/bus.ts`](../src/hosts/standalone/bus.ts) | 出力⇔操作ウィンドウ間のメッセージ定義 |
| [`electron/main.cjs`](../electron/main.cjs) | Electron メイン：localhost 配信＋出力/操作の2ウィンドウ |
| [`src/hosts/web/main.ts`](../src/hosts/web/main.ts) | Webホスト：マイク/タブ音声入力＋全画面出力＋同一ページ内オーバーレイUI（GitHub Pages等の静的配信向け。フォルダプラグインは呼ばない） |
| [`src/hosts/web/index.html`](../src/hosts/web/index.html) | Webホストのランディング（ヒーロー・内蔵プラグイン一覧・導線・デモ用オーバーレイDOM） |

> 各フィールドの範囲・意味・描画ヒントの一覧は [features.ja.md](features.ja.md) を参照。

型チェック: `npm install` 後に `npm run typecheck`。

---

## 実行時の構成（3層）

実行コアは、**寿命と責務**でくっきり3つに分けている。プラグインの追加・切替・ON/OFF を無理なく行うための土台。

```
[AudioGraph]  AudioContext / source / analyser / L-R / FeatureEngine
   （動画1本につき1回。切替では触らない）
        │ features
        ▼
[Stage]  canvas・動画への追従。view（描画コンテキスト）を提供
        │
        ▼
[VisualizerApp]  setVisualizer(id) / start() / stop() / setOptions()
   毎フレーム: stage.fit() → graph.update() → current.draw(features, view)
```

- **AudioGraph**：Web Audio の配線と特徴量エンジン。動画/ストリーム入力ごとに1回作る。
- **Stage**：描画先。`VideoStage`（動画重ね）/ `WindowStage`（全画面）を差し替え可能。
- **VisualizerApp**：graph/stage を**外から注入**され、その上で「現在のプラグイン」を差し替えながらループを回す。
- **ホスト（src/hosts/）**：この2つの端（入力＝どの音、出力＝どこに描く）を用意して App に渡す層。
  - 拡張：video 入力 ＋ VideoStage ＋ ⚙オーバーレイ（ControlPanel）
  - スタンドアロン：マイク/デバイス入力 ＋ WindowStage ＋ 別ウィンドウの操作UI
  - Web：マイク/タブ音声入力 ＋ WindowStage ＋ 同一ページ内オーバーレイUI（静的配信・フォルダプラグイン無し）

> **コア（audio / visualizers / app）は入力・出力に依存しない**ので、ホストを足すだけで
> YouTube・スタンドアロン（プロジェクタ/OBS）・Web（静的ホスティングのライブデモ）など出力先を増やせる。

### なぜ音声グラフを作り直さないか（重要）
`createMediaElementSource()` は **1つの `<video>` につき一度しか呼べない**（二度目は例外）。
だから「切替のたびに全部作り直す」はできない。**音声グラフ（AudioGraph）は生かしたまま、
`VisualizerApp.setVisualizer()` で描くプラグインだけを差し替える**。これがこの3層分割の一番の理由。
（同じ理由で、他の音声系拡張が先に同じ video をつかむと後発は接続できず競合する。）

---

## 設計の前提・方針

### 1. スカラー値は原則 0〜1 に正規化する
プラグイン作者が掛け算するだけで描けるようにするため。
例：`barHeight = features.bass * canvas.height`。
- **例外は `loudestHz`（Hz の生値）**。0〜1 にすると音の高さという意味が消えるため、そのまま持たせる。

### 2. 生配列も同梱する
バーや波形のように「全ビンを使う」描画のため、`spectrum`（0〜255 × 1024本）と
`waveform`（−1〜1）はそのまま渡す。正規化スカラーと使い分ける。

### 3. 「なめらかな値」と「鋭い値」を分ける
- なめらか（EMA 平滑化済み）：`rms` `bass` `mid` `treble` `brightness` `flux` `bands` など
  → ゆったりした脈動・色変化に向く。
- 鋭い（平滑化なし）：`peak` `impulse` `beat` `kick`/`snare`/`hat`
  → 拍やアタックの「パッ」とした反応に向く。

同じネタ（フラックス）から、平滑化版 `flux` と非平滑版 `impulse` の両方を出している。

### 4. 正規化の方式は指標ごとに使い分ける
| 種類 | 方式 | 対象 | 理由 |
|------|------|------|------|
| 自然に 0〜1 | そのまま | rolloff(割合) / flatness / noisiness / spectrum(÷255) | 値域がもともと有界 |
| 有界だが小さい | 固定の割り算 | bass/mid/treble/bands(÷255) / brightness(÷binCount) | 相対バランスを保ちたい（各バンドを個別に最大化すると音域差が消える） |
| 上限がない | **オートゲイン** | rms / flux(=impulse) / onset* | 曲の音量に依存して暴れるため、直近ピークで割って適応させる |

オートゲイン（[`AutoGain`](../src/audio/AutoGain.ts)）は「直近のピークを覚えて、それで割る」だけ。
新しい大きな値には即追従、その後はゆっくり減衰。これで静かな曲でも反応し、うるさい曲でも飽和しない。

### 5. 重い計算・状態はエンジン内に隠す
前フレームのスペクトラム（フラックス用）、オートゲインのピーク履歴、平滑化の保持値、
ビート検出の不応期、テンポ推定のリングバッファ、キー推定の蓄積 chroma などは、すべて
`FeatureEngine` の内部に閉じ込める。プラグインは `update()` の戻り値を読むだけ。

### 6. ビン → Hz 変換を一箇所に集約
`周波数(Hz) = ビン番号 × sampleRate ÷ fftSize`。
帯域エネルギー・クロマ・ピーク周波数はすべてこの変換に依存するため、
`FeatureEngine` 内の `hzToBin()` / `binWidth` にまとめている。

---

## 実装した指標（TierA ＋ TierB の主要項目）

材料は「1フレームで安く取れる Tier A」と「数秒の蓄積が要る Tier B」に分けて考えている。
各フィールドの範囲・意味は [features.ja.md](features.ja.md) に一覧。

**Tier A（1フレーム系）**：`spectrum` / `waveform` / `rms` / `peak` / `bass` `mid` `treble` `bands` / `brightness` / `flux` / `impulse` / `rolloff` / `flatness` / `noisiness` / `chroma`（大FFT＋ピーク拾い＋ホワイトニング＋補間）/ `loudestHz` / `tonal*`（五度圏ベクトル）

**Tier B（時間蓄積・追加解析系）**：
- `bpm` / `beatPhase` … オンセット包絡の自己相関でテンポ推定（[`TempoTracker`](../src/audio/TempoTracker.ts)）＋拍位相。
  **精度は低い**（2倍/半分の誤り・実テンポと無関係な値に張り付くことあり）。無音が 0.6 秒続くと停止・初期化。
- `onsetLow/Mid/High` ＋ `kick`/`snare`/`hat` … 帯域別フラックスの**適応しきい値**判定（[`AdaptiveOnset`](../src/audio/AdaptiveOnset.ts)）
- `energyDelta` / `drop` / `silence` … 音量の増減・急増・無音
- `pan` / `stereoWidth` … L/R アナライザから（ステレオ）
- `keyIndex` / `keyIsMajor` / `keyConfidence` … 蓄積 chroma を Krumhansl-Schmuckler プロファイルと相関
- `beat` … impulse の**適応しきい値**（[`AdaptiveOnset`](../src/audio/AdaptiveOnset.ts)）＋不応期

> `bpm` は簡易推定（2倍/半分の誤りあり。`beat`/`kick`/`snare`/`hat` は適応しきい値化済み）。精度を上げるときはエンジン内の
> 実装を差し替える（自前で書かず名前付き特徴量が欲しいなら **Meyda**、BPM・キー本格版なら
> **essentia.js** 等）。プラグイン側のコードは変えずに精度だけ上げられる。

### あえて実装していないもの（対象外）
描画トリガーには過剰で、ブラウザのリアルタイムには重いもの。当面は対象外：
- **真の音源分離**（ドラム/ベース/ボーカルを音として抽出。Demucs/Spleeter 等の AI が必要）
- **正確なメロディ採譜**（フルミックスから主旋律を音符化）

> 「ドラム/ベースに反応させたい」は、分離せず **帯域別オンセット**（`kick`/`snare`/`hat`）で近似済み。

---

## 新しいプラグインの作り方

**`src/visualizers/` に `〜Visualizer.ts` を1つ足してビルドするだけ**。登録も⚙メニューへの追加も自動。

```ts
// src/visualizers/MyVisualizer.ts
import { AudioFeatures } from '../audio/AudioFeatures';
import { Visualizer, VisualizerContext } from './Visualizer';

export default class MyVisualizer implements Visualizer {   // ← default export
  readonly id = 'my';           // 一意なID（storage の保存キーにもなる）
  readonly name = 'My';         // ⚙メニューの表示名
  readonly author = 'あなた';   // 任意：作者クレジット（⚙メニューのツールチップに出る）
  readonly description = '何をするか一言'; // 任意：説明（同ツールチップ）
  readonly order = 500;         // 任意：表示順（小さいほど上。未指定は末尾）

  draw(f: AudioFeatures, { ctx, width, height }: VisualizerContext): void {
    // features を読んでキャンバスに描くだけ。音響解析の知識は不要。
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, height * (1 - f.bass), width, height * f.bass);
  }
}
```

- ビルド時に [`gen-plugins.mjs`](../gen-plugins.mjs) が `*Visualizer.ts` を集め、
  `plugins.generated.ts`（`registry.register(() => new MyVisualizer())`）を自動生成する。
- **決まりは2つだけ**：ファイル名を `〜Visualizer.ts` にする／`export default` にする。
- `constructor` は軽く保つ（登録時に id/name を読むため1個だけ試作する）。重い準備は `init()` へ。
- 実例は [`BarsVisualizer.ts`](../src/visualizers/BarsVisualizer.ts) を参照。

> `npm run watch` 中に**新規ファイルを足したとき**だけは watch を再起動する（登録の再生成のため）。
> 既存ファイルの編集は自動反映される。

### 2種類のプラグイン（2D / 自前描画面）
プラグインは2タイプあり、`registry` で同居する（[`Visualizer.ts`](../src/visualizers/Visualizer.ts)）。

- **2D（`Visualizer`）**：`draw(features, {ctx,width,height})` を書くだけ。ホストが Canvas2D を用意。手軽。
- **自前描画面（`SurfaceVisualizer`）**：`mount(container)/frame(features)/unmount()`。自分で canvas/レンダラを作る。
  **WebGL / PixiJS / three.js でリッチな描画**が可能（1枚の canvas は2DとWebGLを混在できないため、面を分ける）。
  ※ シェーダ・WebGL・GLSL 等の用語は [visualizer-basics.md](visualizer-basics.md) を参照。

  重量ライブラリの扱いは2通り：
  - **内蔵プラグイン**は `import * as PIXI from 'pixi.js'` のように**直接importしてバンドル同梱**（拡張・スタンドアロン両方に載る）。
    例：[`PixiNeonVisualizer.ts`](../src/visualizers/PixiNeonVisualizer.ts)（pixi.js ＋ pixi-filters）。**バンドルは重くなる**（content.js が数百KB増）が、サイズを許容してリッチさを取る方針。
  - **スタンドアロンのフォルダプラグイン**は同梱できないので、ホストが `window.MV.THREE`（3D）・`window.MV.PIXI`（GPU2D）で提供する。
  - three.js も**内蔵**（[`ThreeTerrainVisualizer.ts`](../src/visualizers/ThreeTerrainVisualizer.ts)）として拡張・スタンドアロン両方に同梱済み。加えてスタンドアロンのフォルダプラグイン用に `window.MV.THREE` でも提供。
  - ※ オーバーレイ（拡張）の透過を保つため、内蔵の three サンプルは**ポストFXブルームを使わず加算合成＋フォグ**で発光/奥行きを表現している（EffectComposer のブルームは透過を壊しやすい）。

### 実行時プラグイン（スタンドアロン版のみ）
スタンドアロン（Electron）版では、**ビルドせずに JS プラグインを追加**できる。

- プラグイン置き場（`userData/plugins`）に `.js`（`export default class` の ES モジュール）を置き、
  操作ウィンドウの「再読み込み」で反映（[`examples/plugins/`](../examples/plugins) 参照）。
- [`output.ts`](../src/hosts/standalone/output.ts) が localhost 経由で動的 `import()` し、
  **同じ `registry`** に登録する（内蔵プラグインと同居）。設計は分岐しない。
- ⚠️ 実行時に第三者コードを走らせるため**直接配布（非サンドボックス）向け**。
  ストア配布（Chrome拡張 / Mac App Store）はリモートコード制限により**内蔵のみ**。

---

## ビルドして動かす（3つのホスト）

`npm run build` で3ホストを出力：`dist-extension/`（拡張）・`dist-app/`（Electron）・`dist-web/`（Webデモ）。

### A. 拡張（YouTube 重ね）

1. Chrome で `chrome://extensions` → デベロッパーモード ON
2. 「パッケージ化されていない拡張機能を読み込む」→ `dist-extension/` を選ぶ
3. YouTube で再生 → 画面に表示。右上の ⚙ でプラグイン切替 / Off

### B. スタンドアロン（VJ / プロジェクタ / OBS）

```bash
npm install   # 初回のみ（electron を含む）
npm start     # ビルド → Electron 起動（出力ウィンドウ＋操作ウィンドウ）
```

- **出力ウィンドウ**：全画面キャンバス（手動で全画面化 → プロジェクタ or OBS のウィンドウキャプチャ）
- **操作ウィンドウ**：手元だけ。入力デバイス選択・プラグイン切替・Off（観客には見せない）
- 完全ローカル（localhost 配信・ネット不要）。マイク/ライン/仮想デバイス（BlackHole 等）から入力
- 出力⇔操作は [`bus.ts`](../src/hosts/standalone/bus.ts) 定義のメッセージ（BroadcastChannel）

> 構成：[`electron/main.cjs`](../electron/main.cjs) が localhost で `dist-app/` を配信し2ウィンドウを開く →
> [`output.ts`](../src/hosts/standalone/output.ts)（マイク入力＋WindowStage＋App）／
> [`control.ts`](../src/hosts/standalone/control.ts)（操作UI）。
> ※ Electron はまだ**未パッケージ**（`npm start` 実行のみ。`.app/.dmg` 化は後日）。

### C. Web版ライブデモ（インストール不要）

GitHub Pages 等の静的ホスティングで動く、マイク/タブ音声反応のデモ＋公式ランディング（[`src/hosts/web/`](../src/hosts/web/)）。

```bash
npm run build
npm run serve:web   # = npx serve dist-web（ローカル確認用）
```

- 入力はマイク（`getUserMedia`）に加え、Chrome ではタブ/画面の音声（`getDisplayMedia({ video:true, audio:true })`、映像トラックは即停止）も選べる
- 入力・全画面・音の開始は**すべてユーザー操作（クリック）起点**（自動再生制限のため）
- フォルダプラグイン機構（`/plugins.json` 経由の動的import）は静的配信では呼ばない。内蔵プラグインのみ全て同梱
- 操作UIは別ウィンドウではなく、**同一ページ内オーバーレイ**（standaloneの2ウィンドウ/BroadcastChannelは使わない）
- GitHub Pages への公開は [`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml) を参照
  （要・人間の作業: リポジトリの Settings > Pages > Source を "GitHub Actions" に変更）
- github.io はサブパス配信（`username.github.io/リポジトリ名/`）になるため、`dist-web/` 内の資産参照は相対パス

---

## 今後の拡張余地

- **二刀流アナライザ（導入済み）**：反応系は小FFT（`fftSize 2048`）、音階系（`chroma`/`key`/`loudestHz`）は
  専用の大FFT（`fftSize 16384`, binWidth ≈ 3Hz）から算出。低音の音名精度と反応速度を両立している
  （[`AudioGraph`](../src/app/AudioGraph.ts) が2本目を作り、[`FeatureEngine.computePitchFeatures`](../src/audio/FeatureEngine.ts) が使う）。
- **TierB の精度向上**：ビート/オンセット（kick/snare/hat）は**適応しきい値**を導入済み（[`AdaptiveOnset`](../src/audio/AdaptiveOnset.ts)）で良好。
  **BPM・拍位置は精度が低いまま**。事前分布・倍音統合・スティッキー等を試したが、軽量な自己相関では
  「乱高下」か「誤ロックに粘着」のどちらかになり費用対効果が悪く撤収した（素の自己相関に戻した）。
  本気でやるなら **essentia.js 等の専用ライブラリ**、または VJ 用途なら**手動タップテンポ**が現実的（自動検出より確実）。
- **プラグインを増やす**：Analyzer / Bars / Circle / Plasma Scope / Plasma Ball / Lo-Fi Rain / Flow Field / PixiNeon / Fireworks / ThreeTerrain / Cyber Flight / EQ Field / Kaleido Glass / Chroma Flow / Tunnel / Water Caustics。材料は揃っているので作品を追加。
  GLSL系は [`shaderSurface.ts`](../src/visualizers/shaderSurface.ts) を使えば**フラグメントシェーダ本体だけ**書けば増やせる（ライブラリ不要でバンドルもほぼ増えない）。
  スタンドアロンなら WebGL / three.js のランタイムプラグイン（[`examples/plugins/three-orb.js`](../examples/plugins/three-orb.js)）も追加できる。
- **Electron のパッケージ化**：現状は `npm start` 実行のみ。配布するなら Developer ID 署名＋公証＋`.dmg` 化（直接配布）。
- **プラグインごとの設定UI**：色・感度などのパラメータを操作ウィンドウ/⚙から調整できるようにする。
