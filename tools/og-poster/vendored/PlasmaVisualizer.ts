/**
 * PlasmaVisualizer（og-poster用コピー、"Chroma Flow"）— 元は src/visualizers/PlasmaVisualizer.ts。
 * ロジックはオリジナルと同一。キャプチャ対応の ShaderSurface コピー（./shaderSurface）を使うだけ。
 */
import { AudioFeatures } from '../../../src/audio/AudioFeatures';
import { SurfaceVisualizer } from '../../../src/visualizers/Visualizer';
import { ShaderSurface } from './shaderSurface';

const FRAG = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uTonalAngle; // 0..1（調性→色相の基準）
uniform float uFlux;       // 流れる速さ
uniform float uBass;       // 明るさ
uniform float uBeat;       // 拍の閃光（0..1、減衰）

// IQ のコサインパレット（tを色に）
vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 p = uv - 0.5;
  p.x *= uResolution.x / uResolution.y; // アスペクト補正

  float t = uTime * (0.3 + uFlux * 1.5);
  // 正弦の重ね合わせ＝プラズマ
  // OGポスター用調整：空間周波数を上げて模様を細かくしている（オリジナルは 6.0/6.0/4.0/8.0）。
  float v = sin(p.x * 15.0 + t)
          + sin(p.y * 15.0 + t * 1.3)
          + sin((p.x + p.y) * 10.0 + t * 0.7)
          + sin(length(p) * 20.0 - t * 2.0);
  v *= 0.25; // おおむね -1..1 に

  float pattern = 0.55 + 0.45 * v;                   // 模様の強さ（0.1..1）
  float intensity = pattern * (0.3 + uBass * 1.1) + uBeat * 0.3;
  float a = clamp(intensity, 0.0, 1.0);              // アルファ＝見える強さ（暗い所は透明→動画が見える）

  float hue = uTonalAngle + v * 0.2;
  vec3 col = palette(hue) * (0.7 + 0.3 * a);         // 色はビビッドに、縁だけ少し落とす
  gl_FragColor = vec4(col, a);                       // 明るい筋だけが動画の上に乗る
}
`;

export default class PlasmaVisualizer implements SurfaceVisualizer {
  readonly id = 'plasma';
  readonly name = 'Chroma Flow (GLSL)';
  readonly author = 'VisualiEXr';
  readonly description = 'GLSL：色が流れるプラズマ。半透過で映像が透ける';
  readonly order = 80;

  private surface: ShaderSurface | null = null;
  private flash = 0; // kick/beat の閃光（減衰）

  mount(container: HTMLElement): void {
    this.surface = new ShaderSurface(container, FRAG);
  }

  frame(f: AudioFeatures): void {
    if (!this.surface) return;
    if (f.beat) this.flash = 1;
    this.flash *= 0.9;
    this.surface.render({
      uTime: f.time,
      uTonalAngle: f.tonalAngle,
      uFlux: f.flux,
      uBass: f.bass,
      uBeat: this.flash,
    });
  }

  unmount(): void {
    this.surface?.dispose();
    this.surface = null;
  }
}
