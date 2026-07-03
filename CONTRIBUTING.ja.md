[English](CONTRIBUTING.md) | **日本語**

# コントリビューションガイド

VisualiEXr への貢献を歓迎します。特に **ビジュアライザ（プラグイン）の追加**は、
コアに触れずに作品を増やせるので最初の一歩に最適です。

- 設計の全体像 → [README.ja.md](README.ja.md)
- プラグインの作り方（詳細） → [docs/architecture.ja.md](docs/architecture.ja.md#新しいプラグインの作り方)
- 使える音の材料（AudioFeatures） → [docs/features.ja.md](docs/features.ja.md)

---

## 開発の準備

```bash
npm install        # 依存の取得（electron / three / pixi 含む）
npm run typecheck  # 型チェック（gen-plugins.mjs → tsc）
npm run build      # 拡張(dist-extension/) と Electron(dist-app/) を出力
npm start          # ビルド → Electron 起動（出力＋操作ウィンドウ）
```

拡張の動作確認は `chrome://extensions` →「デベロッパーモード」ON →
「パッケージ化されていない拡張機能を読み込む」→ `dist-extension/` を選択。

---

## ビジュアライザ（プラグイン）を追加する

**`src/visualizers/` に `〜Visualizer.ts` を1つ足すだけ**で、登録も⚙メニューへの追加も自動です
（[`gen-plugins.mjs`](gen-plugins.mjs) が `plugins.generated.ts` を生成）。

### 決まりは2つだけ
1. ファイル名を `〜Visualizer.ts` にする
2. `export default class` にする

### 2種類のプラグイン
- **2D（`Visualizer`）**：`draw(features, { ctx, width, height })` を書くだけ。ホストが Canvas2D を用意。手軽。
- **自前描画面（`SurfaceVisualizer`）**：`mount(container) / frame(features) / unmount()`。
  自分で canvas / レンダラを作る。WebGL・three.js・PixiJS でのリッチ描画向け。

契約は [`src/visualizers/Visualizer.ts`](src/visualizers/Visualizer.ts)、
お手本は [`BarsVisualizer.ts`](src/visualizers/BarsVisualizer.ts)（2D）と
[`ThreeTerrainVisualizer.ts`](src/visualizers/ThreeTerrainVisualizer.ts)（Surface）を参照。

### 守ってほしいこと
- **音響解析は知らなくてよい**。`features`（0〜1 に正規化された値）を掛けるだけで音に反応します
  （例外は `loudestHz`＝生の Hz）。範囲・意味は [docs/features.ja.md](docs/features.ja.md) に全部あります。
- `id` はプロジェクト内で一意に（`storage` の保存キーになります）。`name` は⚙メニューの表示名。
- `author` に自分のクレジットを入れてかまいません（ツールチップに出ます）。
- `constructor` は軽く保つ（登録時に1個だけ試作するため）。重い準備は `init()`（2D）/ `mount()`（Surface）へ。
- 拡張オーバーレイの**透過を壊さない**：three 系は EffectComposer のブルームを避け、
  加算合成＋フォグで発光を表現してください（既存の three サンプルに倣う）。
- `npm run watch` 中に**新規ファイルを足したとき**は watch を再起動（登録の再生成のため）。既存編集は自動反映。

---

## プルリクエストの前に

- `npm run typecheck` が通ること。
- 新しいプラグインは拡張・スタンドアロンのどちらかで実際に描画されることを確認。
- 変更の意図を PR 説明に一言添えてください（挙動の変化があれば特に）。

## ライセンス

コントリビュートされたコードは、本プロジェクトと同じ **MIT License**（[LICENSE](LICENSE)）で
公開されることに同意したものとみなします。
