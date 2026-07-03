/**
 * AutoGain — 適応的ゲイン（オートゲイン）。
 *
 * 上限が決まっていない指標（フラックス・RMS など）を、曲の音量によらず
 * 常に「見える範囲（0〜1）」に収めるための道具。
 *
 * しくみ: 直近のピーク値を覚えておき、現在値をそのピークで割る。
 * ピークは新しい大きな値が来れば即追従し、来なければ毎フレーム少しずつ減衰する。
 * これにより「静かな曲では小さな変化も大きく、うるさい曲では飽和しない」反応になる。
 */
export class AutoGain {
  private peak: number;

  /**
   * @param decay 1フレームごとにピークが下がる割合（1に近いほどゆっくり下がる）。
   *              60fps で 0.997 なら約 0.83/秒。
   * @param floor ゼロ割り防止＆無音時の暴れ防止の下限。
   */
  constructor(
    private readonly decay = 0.997,
    private readonly floor = 1e-4,
  ) {
    this.peak = floor;
  }

  /** 生値を渡すと 0〜1 の正規化値を返す。副作用としてピークを更新する。 */
  normalize(value: number): number {
    this.peak = Math.max(value, this.peak * this.decay, this.floor);
    return Math.min(value / this.peak, 1);
  }
}
