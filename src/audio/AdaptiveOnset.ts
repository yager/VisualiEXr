/**
 * AdaptiveOnset — オンセット強度の時系列から「適応しきい値」で拍/打点を検出する。
 *
 * 固定しきい値（例: 値が 0.5 を超えたら発火）は、曲やセクションの密度で取りこぼし/誤爆する。
 * これは直近ウィンドウの **平均 + k×標準偏差** を毎フレームのしきい値にするので、
 * 静かな所では敏感に、うるさい所では鈍く、自動で調整される。
 *
 * 使い方: 毎フレーム detect(odf, nowMs) を呼ぶ。odf は 0〜1 のオンセット検出関数（フラックス等）。
 */
export class AdaptiveOnset {
  private readonly buf: Float32Array;   // 直近 odf のリングバッファ
  private head = 0;
  private filled = 0;
  private lastMs = -1e9;
  private threshold = 0;                 // 直近に計算したしきい値（表示用）

  constructor(
    private readonly win = 43,           // 参照する直近フレーム数（≈0.7秒 @60fps）
    private readonly k = 1.6,             // 感度（小さいほど敏感）
    private readonly floor = 0.08,        // 絶対的な下限（無音付近の誤爆を防ぐ）
    private readonly refractoryMs = 90,   // 不応期（連続検出を防ぐ）
  ) {
    this.buf = new Float32Array(win);
  }

  /** 現在の適応しきい値（平均 + k×標準偏差）。可視化・デバッグ用。 */
  get currentThreshold(): number {
    return this.threshold;
  }

  /** 毎フレーム呼ぶ。今フレームが拍/打点なら true。 */
  detect(odf: number, nowMs: number): boolean {
    // 直近ウィンドウ（今の値は含めない）の平均・標準偏差
    const n = this.filled;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += this.buf[i];
    mean = n > 0 ? mean / n : 0;
    let varSum = 0;
    for (let i = 0; i < n; i++) { const d = this.buf[i] - mean; varSum += d * d; }
    const std = n > 0 ? Math.sqrt(varSum / n) : 0;
    this.threshold = mean + this.k * std;

    // 今の値をバッファへ（しきい値計算の後に入れる＝自分自身でしきい値を持ち上げない）
    this.buf[this.head] = odf;
    this.head = (this.head + 1) % this.win;
    this.filled = Math.min(this.filled + 1, this.win);

    if (odf > this.floor && odf >= this.threshold && nowMs - this.lastMs >= this.refractoryMs) {
      this.lastMs = nowMs;
      return true;
    }
    return false;
  }
}
