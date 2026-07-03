/**
 * TempoTracker — オンセット強度の時系列から BPM（テンポ）を推定する。
 *
 * しくみ:
 *  1) 毎フレームのオンセット強度（フラックス）を固定間隔（hop）のリングバッファに溜める。
 *  2) 一定間隔ごとに自己相関を取り、繰り返し周期が最も強い間隔を探す → BPM。
 *
 * ※ Tier B（数秒の蓄積が必要）。**簡易実装なので精度は低い**：2倍/半分の取り違え（オクターブ誤り）や、
 *   フルミックスでは実テンポと無関係な値に張り付くことも珍しくない。演出の補助程度に使うこと。
 *   本格的な精度が要るなら essentia.js 等の専用ライブラリへ差し替える。
 */
export class TempoTracker {
  private readonly hop = 0.02;          // 50Hz でサンプリング
  private readonly buf: Float32Array;   // オンセット包絡（リングバッファ）
  private readonly n: number;
  private head = 0;
  private filled = 0;
  private nextSampleTime = 0;
  private acc = 0;                       // 次サンプルまでのオンセット最大値
  private lastCalc = 0;
  private bpmVal = 0;

  constructor(
    seconds = 6,
    private readonly minBpm = 70,
    private readonly maxBpm = 180,
  ) {
    this.n = Math.round(seconds / this.hop);
    this.buf = new Float32Array(this.n);
  }

  /** 毎フレーム呼ぶ。最新の BPM 推定（未確定なら 0）を返す。 */
  update(onset: number, time: number): number {
    if (this.nextSampleTime === 0) this.nextSampleTime = time + this.hop;
    this.acc = Math.max(this.acc, onset);

    // 実時間に合わせて固定間隔でサンプルを格納
    while (time >= this.nextSampleTime) {
      this.buf[this.head] = this.acc;
      this.head = (this.head + 1) % this.n;
      this.filled = Math.min(this.filled + 1, this.n);
      this.acc = 0;
      this.nextSampleTime += this.hop;
    }

    // バッファが半分以上たまったら 0.5 秒ごとに再計算
    if (this.filled >= this.n * 0.5 && time - this.lastCalc > 0.5) {
      this.lastCalc = time;
      this.bpmVal = this.estimate();
    }
    return this.bpmVal;
  }

  /** 1拍の長さ（秒）。未確定なら 0。 */
  get beatPeriodSec(): number {
    return this.bpmVal > 0 ? 60 / this.bpmVal : 0;
  }

  /** 内部状態を初期化（無音でアイドルに入ったとき等、テンポを作り直したいときに呼ぶ）。 */
  reset(): void {
    this.buf.fill(0);
    this.head = 0;
    this.filled = 0;
    this.acc = 0;
    this.nextSampleTime = 0;
    this.lastCalc = 0;
    this.bpmVal = 0;
  }

  /** i=0 が最古のサンプル。 */
  private at(i: number): number {
    return this.buf[(this.head + i) % this.n];
  }

  private estimate(): number {
    const minLag = Math.floor((60 / this.maxBpm) / this.hop);
    const maxLag = Math.ceil((60 / this.minBpm) / this.hop);
    const len = this.filled;
    let bestLag = 0;
    let best = 0;
    for (let lag = minLag; lag <= maxLag && lag < len; lag++) {
      let sum = 0;
      for (let i = lag; i < len; i++) sum += this.at(i) * this.at(i - lag);
      sum /= (len - lag); // ラグごとの個数で正規化
      if (sum > best) { best = sum; bestLag = lag; }
    }
    if (bestLag === 0) return this.bpmVal;
    return 60 / (bestLag * this.hop);
  }
}
