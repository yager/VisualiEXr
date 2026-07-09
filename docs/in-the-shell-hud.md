# In The Shell — 実装メモ（一時）

> **削除予定。** Analyzer の HUD 版プラグインを STEP 分割で作るための作業用メモ。  
> 完成・マージ後にこのファイルは消してよい。

## プラグイン定義

| 項目 | 値 |
|------|-----|
| 表示名 | `In The Shell (HUD)` |
| id | `in-the-shell` |
| 型 | `Visualizer`（Canvas 2D） |
| 参照実装 | [`AnalyzerVisualizer.ts`](../src/visualizers/AnalyzerVisualizer.ts)（**改変しない**。ロジック・グループ分けの参考のみ） |
| コンセプト | 全 `AudioFeatures` を SF/HUD 風計器パネルで表示。攻殻機動隊寄りのタクティカルオーバーレイ |

## ビジュアル定数（共通）

- **主色**: シアン `#66ffff` / `#00e8ff`（線・ラベル・トレース）
- **警告・アクセント**: 蛍光オレンジ `#ff8800`（drop / silence / 強調）
- **ランプ点灯**: `#ff4060` 系（Analyzer のランプ色を踏襲可）
- **グリッド・枠**: `rgba(0,255,255,0.06〜0.12)`
- **パネル背景**: ~~半透明 fillRect＋四隅 L 字~~ → **STEP 10 で chrome 差し替え**（`img/HUD_sample.jpg` 参照）
- **フォント**: `monospace`、ラベル 10〜11px、STATUS 12px
- **線**: 芯 1px ＋ `globalCompositeOperation = 'lighter'` で外光を 2〜3 ストローク
- **数値**: 単独Bar 系は**バーのみ**（実数テキストなし）。全体系・必要箇所のみ数値

## グループ → パネル

| パネル ID | フィールド | HUD 方針 |
|-----------|-----------|----------|
| `FREQ` | spectrum, bands | 縦1pxバー列そのまま。枠＋`FFT_RAW`/`BAND_LOG` バッジ＋周波数目盛 LOW/MID/HI |
| `LEVEL` | rms, peak, bass, mid, treble | 横バー、短縮ラベル、0/50/100% 目盛のみ |
| `SPECTRAL` | brightness, flux, impulse, rolloff, flatness, noisiness | 同上 |
| `TONAL` | tonalX, tonalY, tonalAngle, tonalStrength, tonal vector | **画面の顔**。同心円レティクル＋十字＋vector 針。X/Y は 0=真上の 360° リング針。角度は外周度数 |
| `RHYTHM` | beatPhase, onsetLow, onsetMid, onsetHigh | beatPhase=円形掃引線。onset*=垂直スパイク（減衰 0.1〜0.15s） |
| `FIELD` | stereoWidth, pan, energyDelta | pan=L─C─R 水平。energyDelta=縦双極。stereoWidth=ブラケット開閉 `⟨ ⟩` |
| `CHROMA` | chroma[12], keyIndex, keyIsMajor, **keyConfidence** | 12 縦バーそのまま。key=列上のロックブラケット（移動）。**輝度 ∝ keyConfidence** |
| `STATUS` | bpm, loudestHz, sampleRate, time | 画面上部 1 行ストリップ。`TMP │ F0 │ SR │ T+` |
| `TRIG` | beat, kick, snare, hat, drop, silence | 六角 or ブラケット枠ランプ。`lampHold` 0.12s 持続（Analyzer 同様） |
| `SIG` | waveform | 下部横幅。方眼＋中心線。シアン trace ＋ lighter 外光 |

## マクロレイアウト（横長・目安）

```
┌ STATUS ────────────────────────────────────────────────┐
│ FREQ×2 │ LEVEL+SPECTRAL │    TONAL (大)    │ CHROMA  │
│        │ RHYTHM │ FIELD  │                  │         │
├ TRIG ──────────────────────────────────────────────────┤
│ SIG (waveform + grid)                                  │
└────────────────────────────────────────────────────────┘
```

- `pad=10`, パネル間 `gap=8〜12`
- 幅不足時: STATUS/SIG は維持 → TONAL 縮小 → LEVEL/SPECTRAL 折りたたみ（v2）

## 共有プリミティブ（STEP 0）

新ファイル内に private メソッドとして実装:

- `panelFrame(x,y,w,h,title)` — ブラケット枠＋タイトル
- `neonLine` / `neonArc` / `neonStroke` — lighter 多層
- `hudGrid(x,y,w,h,step)` — 方眼
- `hudText(str,x,y,color?)` — 半透明背板つき等幅
- `meterBar` — 0..1 横バー（数値なし）
- `bipolarBar` — ±1 横 or 縦
- `lampHold` — Analyzer と同じ Map + HOLD 秒

## 実装 STEP（この順で完走）

- [x] **STEP 0** `InTheShellVisualizer.ts` 骨格（id/name/order/draw clear + プリミティブ）
- [x] **STEP 1** `TONAL` パネル（レティクル＋vector＋X/Y リング）
- [x] **STEP 2** `FREQ`（spectrum + bands 2 列）
- [x] **STEP 3** `SIG`（waveform + 方眼）
- [x] **STEP 4** `RHYTHM` + `TRIG`
- [x] **STEP 5** `LEVEL` + `SPECTRAL`
- [x] **STEP 6** `FIELD`
- [x] **STEP 7** `CHROMA`（key ロック＋keyConfidence 輝度）
- [x] **STEP 8** `STATUS` ストリップ
- [x] **STEP 9** レイアウト調整・狭幅劣化・`order` 確定

`gen-plugins.mjs` はファイル追加だけで自動登録。`AnalyzerVisualizer` は触らない。

## Analyzer から流用する挙動

| 挙動 | 参照メソッド |
|------|-------------|
| spectrum/bands 縦バー | `freqColumn` |
| 0..1 メーター | `meter`（数値出力は落とす） |
| ± メーター | `bipolarMeter` |
| tonal vector | `tonalDial` |
| chroma 12 本 | `chroma` |
| waveform | `waveform` |
| ランプ持続 | `lampsRow` + `lampHold` |
| Hz→音名 | `hzNote` |
| key 表示名 | `keyName` |

## やらないこと

- Analyzer の改変・共通化リファクタ（別プラグインとして完結）
- Pixi / Three / GLSL
- 実数だらけのデバッグ UI そのまま移植

---

## デザイン反映方針（`img/HUD_sample.jpg` 参照）

参照サンプル: [`img/HUD_sample.jpg`](../img/HUD_sample.jpg)（Sci-Fi HUD パーツ集。単色シアン／暗青、ドットグリッド地）

### 現状が「手抜き」に見える理由

| 現状 (`panelFrame`) | サンプルの語彙 |
|---------------------|-------------|
| 矩形 `fillRect` の半透明板 | **開いた枠**または薄い内側線だけ。面で区切らない |
| 四隅 L 字だけ（中身が空） | **切欠き角・タブ・途切れた辺・二重線・先端の丸ノード** |
| 各テキストに個別の黒背板 | ラベルは**枠の辺やリーダー線上**に乗る。文字ごとに箱を敷かない |
| グローバル背景なし | 全面の**ドットグリッド**で HUD 空間を一体感 |
| データ部品が素の Canvas 矩形 | バー・ゲージ・ランプが**専用シルエット**（段差バー、円形アイコン、六角セル） |

角だけ色を付けた半透明箱は「デバッグ UI の枠」に見える。HUD は**線の文法（chrome）**が主役。

### サンプルから抽出するデザイン語彙（優先度順）

1. **Chrome（枠組み）** — 切欠き矩形、突出タブ、辺のギャップ、コーナーブラケット（囲い切らない）、モジュール間コネクタ（直角配線）
2. **地肌** — ドットグリッド（低 opacity）。SIG 方眼とは別レイヤの「世界観」
3. **ゲージ語彙** — 同心円（実線／破線／弧セグメント）、照準十字、外周ティック
4. **バー語彙** — 斜め段差スペクトラム、端キャップ付き細バー、バー上の固定幅ダミー数字（greeble）
5. **ランプ／セル** — 円内記号・六角グリッド（TRIG／CHROMA 向き）
6. **タイポ** — 等幅・小サイズ・**パネル辺に沿った配置**（中央浮き＋背板なし）
7. **レイヤ** — 構造線は暗く、データ・強調だけ明るい（2段階 opacity）

### パネル別のサンプル対応案

| パネル | サンプルから借りる形 | データはそのまま |
|--------|---------------------|-----------------|
| STATUS | 上端の細い **horizontal rail**（タブ＋途切れ辺） | 固定幅フィールド列 |
| FREQ | **段差型縦バー** or 斜め刻みのスペクトラム列 | spectrum / bands 値 |
| LEVEL/SPEC | 端キャップ付き **rail bar** ＋ 目盛り短線 | 0..1 メーター |
| TONAL | 中央の **multi-ring reticle**（破線環・弧セグメント） | vector / X/Y / angle |
| RHYTHM | 小円 **掃引レーダー** ＋ 垂直スパイク列 | beatPhase / onset* |
| FIELD | **ブラケット幅**＋水平スライダー轨 | pan / width / dE |
| CHROMA | **六角セル** or 細枠付き縦セル ＋ ロックブラケット | chroma / key |
| TRIG | サンプル左下の **円形ステータスアイコン列** | beat/kick/… |
| SIG | 方眼＋細トレース（現状近い。枠だけ chrome 化） | waveform |

### 実装手段の判断基準

#### A. Canvas 2D 手描きのみ（アセットなし）

**向くもの**

- ドットグリッド、直線／弧／破線、切欠き矩形（Path2D）、同心円レティクル
- 動的バー・スペクトラム・針・スイープ（値連動部分はすべて procedural が妥当）

**難しい／工数が跳ねるもの**

- サンプル級の**パネルシルエットのバリエーション**（10種超の装飾枠）
- 円形ランプの**中身記号**を個別に美しく
- 辺のギャップ・ノブ・greeble を毎パネル手配置で「デザインされた」密度にする作業

**結論**: chrome 層を **`HudChrome` モジュール（Path テンプレ数種）** として作り直せば **アセットなしでも 70〜80%** は狙える。ただし現 `panelFrame` の延長では不可。**STEP 10 として chrome 全面差し替え**が必要。

#### B. ハイブリッド（推奨）

| 種別 | 手段 |
|------|------|
| 動的データ（バー・針・色） | Canvas 手描き |
| パネル外枠 3〜5 種 | SVG → 実行時 Path 化、または PNG 9-patch |
| TRIG ランプ 6〜12 アイコン | 小さい SVG sprite / シート 1 枚 |
| TONAL レティクル土台 | 1 枚 SVG または円弧テンプレをコード化 |

**バンドル**: 数 KB〜数十 KB（拡張でも許容範囲）。**見た目の安定性**が最も高い。

#### C. フルアセット（サンプルシート丸ごと）

- 最大級の見栄えだが、**任意サイズへのスケール**・メンテ・ダーク／ライト差が辛い
- VisualiEXr は動画サイズ可変のため **非推奨**

### 推奨ロードマップ

```
STEP 10（デザイン）— 現行の panelFrame / hudText 背板を廃止
  ├─ ~~10a: 全面ドットグリッド~~ — 見送り
  ├─ [x] 10b: HudChrome テンプレ 3種（rail / chamfer / ring-mount）を Path2D で実装
  ├─ [x] 10c: テキスト背板廃止 → 1px 影＋タブ上ラベル
  └─ [x] 10d: パネルごとに chrome 差し替え

STEP 11（任意）— 10b で足りない枠・ランプだけ SVG アセット追加
```

### アセットが「必要」と判断するチェックリスト

次の **2 項目以上** に当てはまったら SVG/PNG 追加を検討:

- [ ] Path2D テンプレ 3 種でもパネル見た目のバラつきが目立つ
- [ ] chrome 実装に **200 行超**かつまだ「素の UI」に見える
- [ ] TRIG ランプを記号付き円にしたい（手描きだとアイコン品質が落ちる）
- [ ] チューニング 1 パネルあたり **30 分以上**かかり続ける

当てはまらなければ **Canvas のみで続行**でよい。

### 触らない／後回し

- Analyzer の表示はそのまま（HUD は別商品）
- Pixi / GLSL への移行は不要（データ UI は Canvas が最適）
- サンプルの「意味のない数字」は全再現しない。固定幅 greeble を **少数**入れる程度に留める

