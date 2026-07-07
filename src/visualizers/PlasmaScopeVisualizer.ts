import { AudioFeatures } from '../audio/AudioFeatures';
import { Visualizer, VisualizerContext } from './Visualizer';

/**
 * PlasmaScopeVisualizer — 波形オシロスコープの回転版（Canvas2D・ライブラリ不要）。
 *
 * 生波形(waveform)を一本の線として中心から引き、その向きを tonalAngle（0〜1）→360°で回す。
 * 線の長さは画面の対角より長くとり、どの角度でも画面外へ突き抜ける。キー（調性）が動くと線が
 * 回転し、tonalAngle が急に飛ぶと——加算合成＋短いトレイルにより——放電のような扇（プラズマ感）になる。
 * 中央にはリズム/ボリュームで拡縮するリングを重ねる（回転なし）。
 *   - waveform → 軸に垂直な振れ、tonalAngle → 線の向き、impulse → 立ち上がりで“パチッ”と細かく散る。
 * 背景は塗らずトレイルは destination-out で消すので、下の動画が透け続ける。用語は docs/visualizer-basics.md。
 */
export default class PlasmaScopeVisualizer implements Visualizer {
  readonly id = 'plasma-scope';
  readonly name = 'Plasma Scope (2D Basics)';
  readonly author = 'VisualiEXr';
  readonly description = '波形をキーで回す放電風オシロ＋反応する中央リング';
  readonly order = 10;

  private w = 0;
  private h = 0;
  private pulse = 0; // 拍で跳ねる中央円のパルス（減衰）

  init(c: VisualizerContext): void {
    c.ctx.clearRect(0, 0, c.width, c.height);
    this.w = c.width;
    this.h = c.height;
  }

  draw(f: AudioFeatures, { ctx, width, height }: VisualizerContext): void {
    if (width !== this.w || height !== this.h) {
      ctx.clearRect(0, 0, width, height);
      this.w = width;
      this.h = height;
    }

    // 短いトレイルを残す（角度が飛ぶと直前の線が重なって“放電の扇”になる）。動画は透け続ける。
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, 0, width, height);

    // 加算合成＝線が重なるほど明るい（電気っぽい）。
    ctx.globalCompositeOperation = 'lighter';

    const cx = width / 2;
    const cy = height / 2;
    const ang = f.tonalAngle * Math.PI * 2;   // 調性 → 線の向き（360°）
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const nx = -dy, ny = dx;                    // 軸に垂直（振れの方向）
    const half = Math.hypot(width, height) * 0.6; // 対角より長い＝突き抜ける
    const maxDim = Math.max(width, height);
    const amp = maxDim * 0.45;                  // 縦横最大に合わせた振れ幅
    const jitter = maxDim * 0.03 * f.impulse;   // 立ち上がりで細かく散る（プラズマの“パチッ”）

    const wave = f.waveform;
    const N = wave.length;

    // ── 波形ポリライン（グロー用に太い淡い線＋細い明るい線の二度描き）──
    const buildPath = (): void => {
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const p = i / (N - 1) - 0.5;            // -0.5 .. 0.5
        const along = p * half * 2;             // 軸方向（全長＝対角×1.2）
        const perp = wave[i] * amp + (jitter ? (Math.random() - 0.5) * jitter : 0);
        const x = cx + dx * along + nx * perp;
        const y = cy + dy * along + ny * perp;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    };

    const hue = Math.round(f.tonalAngle * 360);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    buildPath();
    ctx.strokeStyle = `hsla(${hue}, 90%, 60%, 0.25)`; // グロー（太・淡）
    ctx.lineWidth = 6;
    ctx.stroke();

    buildPath();
    ctx.strokeStyle = `hsla(${hue}, 100%, 80%, 0.9)`; // 芯（細・明）
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // ── 中央の円（塗りなしのリング）：リズム/ボリュームで拡大（回転なし）。──
    // 最小で直径≒短辺の50%（半径0.25）、最大反応で直径≒90%（半径0.45）。
    if (f.beat || f.kick) this.pulse = 1;
    this.pulse *= 0.9;
    const minDim = Math.min(width, height);
    const react = Math.min(1, f.rms * 0.6 + this.pulse * 0.6);
    const r = minDim * (0.25 + 0.2 * react);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue}, 100%, 78%, 0.9)`; // 明るい輪郭のみ（中は塗らない）
    ctx.lineWidth = 2.5 + f.bass * 3;
    ctx.stroke();

    ctx.globalCompositeOperation = 'source-over'; // 後片付け
  }
}
