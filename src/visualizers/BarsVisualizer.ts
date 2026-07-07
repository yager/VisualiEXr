import { AudioFeatures } from '../audio/AudioFeatures';
import { Visualizer, VisualizerContext } from './Visualizer';

interface BarsOptions {
  barCount: number;   // バーの本数
  topColor: string;   // 上の色
  bottomColor: string; // 下の色
  reactToBeat: boolean; // 拍で背景を光らせる
  bandRatio: number;  // 画面下側の使用高さ比（0〜1）。小さいほど動画を隠さない。1で全高
}

/**
 * BarsVisualizer — サンプルプラグイン。
 *
 * AudioFeatures だけを見て描く例。音響解析のコードは一切含まない。
 *  - spectrum: バーの高さ
 *  - brightness: バーの色相（明るい曲ほど暖色へ）
 *  - bass: 画面下の発光の強さ
 *  - beat: 拍の瞬間に全体をフラッシュ
 */
export default class BarsVisualizer implements Visualizer {
  readonly id = 'bars';
  readonly name = 'Bars (2D Basics)';
  readonly author = 'VisualiEXr';
  readonly description = '定番の周波数バー。画面下だけで動き映像を邪魔しない';
  readonly order = 3;

  private opts: BarsOptions = {
    barCount: 96,
    topColor: '#0057B8',
    bottomColor: '#FFD700',
    reactToBeat: true,
    bandRatio: 0.35, // 既定は下側35%だけ使う＝動画/全画面を汚さない
  };

  setOptions(opts: Partial<BarsOptions>): void {
    this.opts = { ...this.opts, ...opts };
  }

  draw(f: AudioFeatures, { ctx, width, height }: VisualizerContext): void {
    ctx.clearRect(0, 0, width, height);

    // 下側バンドだけ使う（上は透明のまま＝元動画/全画面を隠さない）。
    const bandH = height * Math.max(0.05, Math.min(1, this.opts.bandRatio));
    const top = height - bandH;

    // 拍のフラッシュは「バンド内だけ」に限定（動画全体を汚さない）。
    if (this.opts.reactToBeat && f.beat) {
      ctx.fillStyle = `rgba(255,255,255,${0.15 * f.impulse})`;
      ctx.fillRect(0, top, width, bandH);
    }

    const n = this.opts.barCount;
    const step = width / n;

    // 明るさで色相を回す（青→黄など）。HSLで色相だけ動かす例。
    const hue = 220 - f.brightness * 160; // brightness 0→青(220), 1→暖色(60)

    for (let i = 0; i < n; i++) {
      // spectrum(1024本) を n 本にダウンサンプル
      const binIndex = Math.floor((i / n) * f.spectrum.length);
      const v = f.spectrum[binIndex] / 255; // 0〜1
      const h = v * bandH; // バンド内で伸びる（最大でも下側 bandH まで）

      // 縦グラデーション
      const grad = ctx.createLinearGradient(0, height - h, 0, height);
      grad.addColorStop(0, `hsl(${hue}, 90%, 60%)`);
      grad.addColorStop(1, this.opts.bottomColor);
      ctx.fillStyle = grad;
      ctx.fillRect(i * step, height - h, step - 1, h);
    }

    // 低音で画面下を発光させる（バンド下部。bass は 0〜1 なのでそのまま使える）
    const glowH = bandH * 0.6;
    const glow = ctx.createLinearGradient(0, height, 0, height - glowH);
    glow.addColorStop(0, `rgba(255,255,255,${0.4 * f.bass})`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, height - glowH, width, glowH);
  }
}
