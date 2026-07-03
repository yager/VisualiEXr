# AudioFeatures リファレンス（実装された数値セットの定義）

[`FeatureEngine`](../src/audio/FeatureEngine.ts) が毎フレーム生成し、プラグインの `draw(features, ctx)` に渡される数値セットの**完全な定義**です。型は [`AudioFeatures.ts`](../src/audio/AudioFeatures.ts)。

音の用語（周波数・スペクトラム・FFT・ビン・倍音・対数など）が分からない場合は、先に [audio-basics.md](audio-basics.md) を読んでください。

凡例:
- **範囲**：とり得る値の範囲。
- **平滑化**：「あり」= EMA でなめらか（ゆったりした演出向き）／「なし」= 鋭い瞬間値（拍・アタック向き）。
- **正規化**：0〜1 にする方法（[architecture.md](architecture.md) の方針を参照）。

---

## スカラー値（数値ひとつ）

| フィールド | 型 | 範囲 | 平滑化 | 正規化 | 意味 / 描画のヒント |
|------|------|------|------|------|------|
| `rms` | number | 0〜1 | あり | オートゲイン | **全体の音量感**。映像全体のスケール・明るさに。 |
| `peak` | number | 0〜1 | なし | 有界(≤1) | **その瞬間の最大振れ幅**。急な大音量でフラッシュ。 |
| `bass` | number | 0〜1 | あり | ÷255 | **低音**（既定 20〜150Hz）。ベース・バスドラム帯。背景の脈動に。 |
| `mid` | number | 0〜1 | あり | ÷255 | **中音**（既定 150〜2000Hz）。ボーカル・主要楽器帯。 |
| `treble` | number | 0〜1 | あり | ÷255 | **高音**（既定 2k〜16kHz）。シンバル・ハイハット帯。粒子に。 |
| `brightness` | number | 0〜1 | あり | ÷binCount | **音の明るさ**（セントロイド）。高音が多いほど大。色相に。 |
| `flux` | number | 0〜1 | あり | オートゲイン | **音の変化量**（なめらか版）。動きの激しさ。 |
| `impulse` | number | 0〜1 | なし | オートゲイン | **立ち上がりの鋭さ**（フラックスの鋭い版）。拍の種。 |
| `rolloff` | number | 0〜1 | あり | 割合(≤1) | **音の上の広がり**。エネルギーの85%が収まる高さの割合。 |
| `flatness` | number | 0〜1 | あり | 幾何/算術(≤1) | **ノイズ寄り(1)⇄澄んだ音寄り(0)**。質感の切替に。 |
| `noisiness` | number | 0〜1 | あり | 割合(≤1) | **ザラつき・高音っぽさ**（ゼロクロス率）。 |
| `loudestHz` | number | 0〜約16000 | なし | **生値(Hz)** | **いちばん強い音の高さ**。※ここだけ正規化しない。 |
| `tonalAngle` | number | 0〜1（循環） | あり | 五度圏角度 | **調性の向き**。chroma を五度圏で1方向にまとめた角度。色相・回転角などに。0と1は同じ点。 |
| `tonalStrength` | number | 0〜1 | あり | 平均合成長 | **調性のはっきり具合**。1=明確な和音/単音、0=調性なし（ノイズ/打楽器）。低いとき angle は無意味。 |
| `tonalX` / `tonalY` | number | 各−1〜1 | あり | — | 調性ベクトルの成分。継ぎ目を気にせず使える。`tonalX²+tonalY² = tonalStrength²`、角度=`tonalAngle`。 |
| `bpm` | number | 0 or ~70-180 | あり | 生値(BPM) | **推定テンポ**（Tier B）。0=未確定。**精度は低い**：2倍/半分の誤りに加え、フルミックスでは実テンポと無関係な値に張り付くこともある（簡易な自己相関のため）。演出の補助程度に。無音が続くと 0。 |
| `beatPhase` | number | 0〜1 | なし | 位相 | **拍間の位相**（拍で0に戻り次の拍へ増える）。テンポ同期の脈動に。時計から外挿するので、**無音が続くと 0 で停止**（音が無いのに自走するのを防ぐ）。`bpm` が不正確だと当然ずれる。 |
| `onsetLow` | number | 0〜1 | なし | オートゲイン | **低域オンセット強度**（≒キックの立ち上がり）。 |
| `onsetMid` | number | 0〜1 | なし | オートゲイン | **中域オンセット強度**（≒スネア）。 |
| `onsetHigh` | number | 0〜1 | なし | オートゲイン | **高域オンセット強度**（≒ハイハット）。 |
| `energyDelta` | number | −1〜1 | あり | オートゲイン | **音量の増減**（+大きく/−小さく）。ビルドの判定に。 |
| `pan` | number | −1〜1 | あり | L/R RMS比 | **左右バランス**（−左/+右）。※ステレオ解析が有効な場合のみ。 |
| `stereoWidth` | number | 0〜1 | あり | 1−相関 | **ステレオの広がり**（0=モノ/1=広い）。※ステレオ解析が有効な場合のみ。 |
| `keyConfidence` | number | 0〜1 | — | 相関 | **キー推定の確信度**（Tier B）。数秒で安定。 |
| `keyIndex` | number | −1 or 0〜11 | — | 生値 | **主音**（0=C…11=B、−1=未確定）。`keyIsMajor` と併用。 |
| `sampleRate` | number | 例:44100/48000 | — | — | サンプリングレート(Hz)。ビン→周波数変換に（ナイキスト=sampleRate/2）。動画の音質ではなく出力デバイスのレート（[audio-basics.md](audio-basics.md) 15章）。 |
| `time` | number | 0〜（秒） | — | — | AudioContext 基準の経過秒。アニメの位相計算に。 |

## 真偽値

| フィールド | 型 | 意味 |
|------|------|------|
| `beat` | boolean | **拍が来た瞬間だけ true**。**適応しきい値**（直近包絡の平均+k×標準偏差）＋不応期で検出。曲の密度に自動追従。 |
| `kick` | boolean | **低域を叩いた瞬間** だけ true（≒バスドラム）。帯域別オンセットの適応しきい値検出。 |
| `snare` | boolean | **中域を叩いた瞬間** だけ true（≒スネア）。帯域別オンセットの適応しきい値検出。 |
| `hat` | boolean | **高域を叩いた瞬間** だけ true（≒ハイハット）。帯域別オンセットの適応しきい値検出。 |
| `drop` | boolean | **急な大音量の立ち上がり**（ドロップ/衝撃）の瞬間だけ true。 |
| `silence` | boolean | **ほぼ無音**のとき true（絶対音量がしきい値未満）。 |
| `keyIsMajor` | boolean | 長調=true / 短調=false（`keyIndex` と併用）。 |

## 配列（複数の数値）

| フィールド | 型 | 長さ | 範囲 | 平滑化 | 意味 / 描画のヒント |
|------|------|------|------|------|------|
| `chroma` | number[] | 12 | 各0〜1 | なし | **12音名の含有量**（0=C,1=C#,…11=B、最大=1で正規化）。和音でも動く。**専用の大FFT（fftSize 16384）**のスペクトルから**ピークのみ集計**し、**ホワイトニング（局所平均を引いてノイズ/打楽器に埋もれた山を除去）＋放物線補間で精密化＋隣接音名へ線形加重**（半音境界の取り違えを抑制）。しきい値は `chromaPeakFloor`（既定24）。`key`/`loudestHz` も同じ大FFT由来。 |
| `bands` | number[] | 既定8 | 各0〜1 | あり | **対数間隔の多バンド**エネルギー（対数で分ける理由は [audio-basics.md](audio-basics.md) 10章）。汎用の多バー描画に。 |

## 生データ配列（"全ビン使う" 描画用）

| フィールド | 型 | 長さ | 範囲 | 意味 |
|------|------|------|------|------|
| `spectrum` | Uint8Array | fftSize/2（既定1024） | 各0〜255 | **周波数ビン**（低音→高音）。バーの高さに直接。 |
| `waveform` | Float32Array | fftSize（既定2048） | 各−1〜1付近 | **波形**（時間領域）。オシロ風ラインに。 |

> ⚠️ `spectrum` / `waveform` は毎フレーム同じ配列を**書き換えて**返している（GC負荷回避）。
> フレームをまたいで保持したい場合はコピー（`spectrum.slice()`）すること。

---

## エンジンの設定（既定値）

[`FeatureEngine`](../src/audio/FeatureEngine.ts) のコンストラクタ第2引数で変更可能。

| オプション | 既定 | 説明 |
|------|------|------|
| `fftSize` | 2048 | 反応系（spectrum/bands/flux 等）の FFT長。ビン数は半分（1024）。大きいほど細かいが反応はもっさり。 |

> 音階系（`chroma` / `key` / `loudestHz`）は、この反応系とは別に**専用の大FFT（fftSize 16384、binWidth ≈ 3Hz）**を使う（[`AudioGraph`](../src/app/AudioGraph.ts) が2本目のアナライザを用意）。低音でも音名を分離できる一方、時間窓が長い（≈0.34秒）ので反応はゆっくり＝安定寄り。
| `smoothing` | 0.8 | 平滑化系の EMA 係数。大きいほどなめらか（鈍い）。 |
| `analyserSmoothing` | 0.5 | AnalyserNode 自身の平滑化。 |
| `bandCount` | 8 | `bands[]` の分割数。 |
| `bands` | bass/mid/treble の Hz | 音域別エネルギーの境界。 |
| `rolloffThreshold` | 0.85 | ロールオフで見るエネルギーの割合。 |
| `chromaPeakFloor` | 24 | chroma のピーク拾いのしきい値（0〜255）。上げると弱い音を無視して点灯が減る。 |
| `dropThreshold` | 0.6 | `drop` を立てる energyDelta のしきい値。 |
| `dropRefractoryMs` | 800 | `drop` 判定の不応期。 |
| `silenceThreshold` | 0.01 | `silence` 判定の絶対音量しきい値（生RMS, 0〜1）。 |

> ステレオ解析（`pan` / `stereoWidth`）は、`FeatureEngine` の第3引数に L/R アナライザを渡したときのみ有効（[`AudioGraph`](../src/app/AudioGraph.ts) が渡している）。渡さない場合は 0。

> `beat` / `kick` / `snare` / `hat` は**適応しきい値検出**（[`AdaptiveOnset`](../src/audio/AdaptiveOnset.ts)）。感度 `k`・下限 `floor`・窓幅 `win`・不応期は `FeatureEngine` 内の生成時に指定（現状はコード側で調整）。

---

## Analyzer（分析/デバッグ表示モード）

実装された数値を**画面に並べて**確認するための [`AnalyzerVisualizer`](../src/visualizers/AnalyzerVisualizer.ts)（UI名 "Analyzer (All Features)"、id=`analyzer`）を同梱しています。これも普通のプラグインの1つで、プラグイン作者が使える全特徴量の参照元も兼ねます。

表示は **動画の表示範囲にぴったり重なり**、フルスクリーン・シアターモード・サイズ変更に追従します（YouTube のコントロールより奥のレイヤーに入ります）。

横長の動画域を活かした **4カラム構成**（左→右）：

1. **spectrum** … 周波数を**縦軸（リニア＝等間隔）**（低域=下／高域=上）にした横バー。生 FFT ビンに忠実。縦幅いっぱい。
2. **bands** … 周波数を**縦軸（対数）**にした横バー（音楽的に低い方を細かく刻んだまとめ）。
3. **スカラーバー** … `rms` 〜 `pan` を ラベル＋横バー＋数値で一覧（tonal 各値・onset・energyDelta・stereoWidth・keyConfidence も。±値は 0 中央のバー）。
4. **chroma** → **key** → **bpm/loudestHz/sampleRate/time** → **調性ベクトルのダイヤル**（円＋ドット）→ **ランプ**（beat/kick/snare/hat/drop/silence）→ **waveform**。

> ⚠️ `spectrum`（リニア軸）と `bands`（対数軸）は**縦軸の刻み方が意図的に違う**。
> `bands` は `spectrum` を音楽的にまとめたものだが、軸が違うので山の位置は一致しない（別物として見る）。
> **なぜ bands は対数で刻むのか** → [audio-basics.md](audio-basics.md) 10章。

### 使い方（オンスクリーン・推奨）

実際のホスト（[`content.ts`](../src/hosts/extension/content.ts)）と同じ3層の配線。
`AudioGraph`（音の入力）と `Stage`（描画先）を作って `VisualizerApp` に注入する。

```ts
import { registry } from '../app/registry';
import '../app/plugins.generated';                // 副作用 import で内蔵プラグインを登録
import { AudioGraph } from '../app/AudioGraph';
import { VideoStage } from '../app/Stage';
import { VisualizerApp } from '../app/VisualizerApp';

const video = document.querySelector<HTMLVideoElement>('video.video-stream')!;
const graph = new AudioGraph({ kind: 'element', element: video });
graph.resume();                                   // AudioContext を再開

const app = new VisualizerApp(graph, new VideoStage(video), registry);
app.setVisualizer('analyzer');
app.start();
// 切替（音声グラフは作り直さない）: app.setVisualizer('bars');
// 停止: app.stop();   破棄: app.dispose();
```

数値は毎フレーム変わりますが、**横バー・縦バー・グラフ**で動きが直感的に分かります。
本物のビジュアライザを作る前に「どの指標がどんな音でどう動くか」を体感するのに使ってください。

### Console で見たい場合（補助）

毎フレーム `console.log` すると流れて読めないので、**間引いて `console.table`** がおすすめです。

```ts
let lastLog = 0;
function loop() {
  const f = engine.update();
  visualizer.draw(f, view);
  if (f.time - lastLog > 0.25) {        // 0.25秒ごと（毎フレームは多すぎる）
    lastLog = f.time;
    console.table({
      rms: +f.rms.toFixed(2), bass: +f.bass.toFixed(2), mid: +f.mid.toFixed(2),
      treble: +f.treble.toFixed(2), brightness: +f.brightness.toFixed(2),
      flux: +f.flux.toFixed(2), impulse: +f.impulse.toFixed(2),
      beat: f.beat, bpm: +f.bpm.toFixed(1),
    });
  }
  requestAnimationFrame(loop);
}
```

> 配列（spectrum/chroma/waveform）は Console だと見づらいので、オンスクリーンの `AnalyzerVisualizer` 推奨。
> Console は「特定スカラーが想定どおり動くか」のピンポイント確認向き。
