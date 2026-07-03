// サンプルの「実行時プラグイン」。
// このファイルをプラグインフォルダにコピーして、操作ウィンドウの「再読み込み」を押すと
// 一覧に「Pulse (folder)」が現れます（ビルド不要）。
//
// 形式のきまり:
//   - ES モジュールで `export default class`
//   - id（一意）/ name（表示名）/ draw(features, { ctx, width, height }) を持つ
//   - features の中身は docs/features.md を参照（0〜1 に正規化済みの音の数値）
//
// ※ 実行時に任意の JS を走らせるため、直接配布版（非サンドボックス）向けの仕組みです。

export default class PulsePlugin {
  id = 'pulse';
  name = 'Pulse (folder)';

  draw(f, { ctx, width, height }) {
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    // 音量(rms)で膨らむ円。拍(beat)の瞬間だけ少し大きく。
    const base = Math.min(width, height) * 0.12;
    const r = base + Math.min(width, height) * 0.35 * f.rms + (f.beat ? 20 : 0);

    // 色は調性ベクトル（色相=向き、彩度=はっきり具合）
    ctx.fillStyle = `hsl(${f.tonalAngle * 360}, ${Math.round(f.tonalStrength * 100)}%, 55%)`;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
