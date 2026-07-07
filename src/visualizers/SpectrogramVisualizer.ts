import { AudioFeatures } from '../audio/AudioFeatures';
import { Visualizer, VisualizerContext } from './Visualizer';

/**
 * SpectrogramVisualizer — 時間×周波数のスクロール履歴（右→左）。
 *
 * 既存プラグインは「今この瞬間」のスペクトラムを毎フレーム描き直す表現が中心で、
 * 時間軸の履歴表現が無かった。本プラグインはキャンバス自身に履歴を蓄積し、
 * 右端に新しい列を足しては左へ流す、定番のスクロール型スペクトログラム。
 * DPRのブレを避けるため、毎フレーム backing-store ピクセル（canvas.width/height）で処理する。
 */
const CONFIG = {
  fMin: 30,       // 表示する周波数帯の下限（Hz）
  fMax: 16000,    // 上限（Hz）。sampleRate/2 を超えないようクランプする
  gamma: 0.7,     // 強度カーブ（<1で弱い音を持ち上げ、見栄えを良くする）
  alphaGain: 1.4, // 強度→アルファのゲイン（静かな所ほど透明＝拡張オーバーレイで動画が透ける）
  scrollStep: 1,  // 1フレームで進める横方向のピクセル数
  beatMark: false, // trueなら拍の瞬間に右端へ細い縦ハイライトを重ねる
};

// magma風の強度カラーマップ（制御点を線形補間）。[t, r, g, b]。
const MAGMA_STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.0, 0, 0, 4],
  [0.25, 60, 15, 90],
  [0.5, 150, 30, 90],
  [0.7, 230, 90, 60],
  [0.85, 250, 160, 70],
  [1.0, 255, 245, 200],
];

function magma(t: number): readonly [number, number, number] {
  const v = Math.max(0, Math.min(1, t));
  for (let i = 0; i < MAGMA_STOPS.length - 1; i++) {
    const [t0, r0, g0, b0] = MAGMA_STOPS[i];
    const [t1, r1, g1, b1] = MAGMA_STOPS[i + 1];
    if (v >= t0 && v <= t1) {
      const f = t1 === t0 ? 0 : (v - t0) / (t1 - t0);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  const [, r, g, b] = MAGMA_STOPS[MAGMA_STOPS.length - 1];
  return [r, g, b];
}

export default class SpectrogramVisualizer implements Visualizer {
  readonly id = 'spectrogram';
  readonly name = 'Spectrogram (2D Basics)';
  readonly author = 'VisualiEXr';
  readonly description = '時間×周波数のスクロール履歴。対数周波数・強度カラーマップ';
  readonly order = 12;

  draw(f: AudioFeatures, { canvas, ctx }: VisualizerContext): void {
    const w = canvas.width;
    const h = canvas.height;
    if (w < 2 || h < 1) return;
    const step = Math.max(1, Math.min(CONFIG.scrollStep, w - 1));

    // 履歴を蓄積するため clearRect はしない。backing-store ピクセルで扱うため変換をリセットする。
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 既存を左へ1列（以上）ずらす。'copy' なので露出した右端はいったん透明になる。
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(canvas, -step, 0);

    // 右端に新しい列を書く（per-pixel alpha を直接書けるので putImageData を使う）。
    ctx.putImageData(this.makeColumn(f, h, step), w - step, 0);

    if (CONFIG.beatMark && f.beat) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(w - step, 0, step, h);
    }

    ctx.restore();
  }

  /** 縦1列ぶんの ImageData を対数周波数マッピングで作る（幅 step 分は同じ色を複製）。 */
  private makeColumn(f: AudioFeatures, h: number, step: number): ImageData {
    const data = new Uint8ClampedArray(step * h * 4);
    const spectrum = f.spectrum;
    const fftSize = spectrum.length * 2;
    const binWidth = f.sampleRate / fftSize;
    const fMin = CONFIG.fMin;
    const fMax = Math.min(f.sampleRate / 2, CONFIG.fMax);
    const denom = Math.max(1, h - 1);

    for (let y = 0; y < h; y++) {
      // y=0(上)=高音, y=h-1(下)=低音。対数補間で周波数へ変換する。
      const p = (h - 1 - y) / denom;
      const freq = fMin * Math.pow(fMax / fMin, p);
      const bin = Math.max(0, Math.min(spectrum.length - 1, Math.round(freq / binWidth)));
      const v = Math.pow(spectrum[bin] / 255, CONFIG.gamma);
      const [r, g, b] = magma(v);
      const a = Math.round(255 * Math.max(0, Math.min(1, v * CONFIG.alphaGain)));
      for (let x = 0; x < step; x++) {
        const i = (y * step + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = a;
      }
    }
    return new ImageData(data, step, h);
  }
}
