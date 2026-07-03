# 実行時プラグイン（スタンドアロン版）

スタンドアロン（Electron）版では、**ビルドせずに JS プラグインを追加**できます。

## 使い方

1. `npm start` でアプリを起動
2. 操作ウィンドウ下部の「**フォルダを開く**」を押す（プラグイン置き場が Finder で開く）
   - 場所は `~/Library/Application Support/<アプリ名>/plugins/`
3. このフォルダに `.js` プラグイン（例: [`pulse.js`](pulse.js)）をコピー
4. 操作ウィンドウの「**再読み込み**」を押す → 一覧に現れる

## プラグインの形式

**ES モジュールで `export default class`**。`id`（一意）/ `name`（表示名）を持つ。
`features` の中身は [`../../docs/features.md`](../../docs/features.md)（0〜1 に正規化された音の数値）。

2種類あり、用途で選べます。

### 1. 2D（手軽）— [`pulse.js`](pulse.js)
- `draw(features, { ctx, width, height })` を実装するだけ。ホストが 2D キャンバスを用意。

### 2. 自前描画面（WebGL / three.js / PixiJS などリッチ）— [`three-orb.js`](three-orb.js)
- `mount(container)` / `frame(features)` / `unmount()` を実装。自分で canvas やレンダラを作る。
- **重いライブラリはアプリが提供**（フォルダプラグインに同梱不要）：
  - three.js（3D）: `const THREE = window.MV.THREE;` — 例 [`three-orb.js`](three-orb.js)
  - PixiJS（GPU 2D・粒子）: `const PIXI = window.MV.PIXI;`
- 用語（シェーダ/WebGL/GLSL/uniform 等）は [`../../docs/visualizer-basics.md`](../../docs/visualizer-basics.md)。

> PixiJS ＋ pixi-filters の例は**内蔵プラグイン**（[`../../src/visualizers/PixiNeonVisualizer.ts`](../../src/visualizers/PixiNeonVisualizer.ts)）として拡張・スタンドアロン両方に同梱済み。
> 上の `window.MV.*` は、スタンドアロンで**自分のフォルダプラグイン**からこれらライブラリを使いたいとき向け。

TypeScript で書く場合は JS にコンパイルしてから置く。

## 注意

- 実行時に任意の JS を走らせるため、**直接配布版（非サンドボックス）向け**の機能です。
- Chrome 拡張版・Mac App Store 版は、ストアのリモートコード制限により**内蔵プラグインのみ**になります。
