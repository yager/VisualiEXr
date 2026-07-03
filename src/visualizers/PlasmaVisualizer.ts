import { AudioFeatures } from '../audio/AudioFeatures';
import { SurfaceVisualizer } from './Visualizer';
import { ShaderSurface } from './shaderSurface';

/**
 * PlasmaVisualizer — GLSL「一枚芸」の入門サンプル（生WebGL・ライブラリ不要＝バンドルほぼ増えない）。
 *
 * 全画面フラグメントシェーダで、正弦の重ね合わせによる流れる色場（プラズマ）を描く。
 * AudioFeatures を uniform で渡すだけで音に反応する見本：
 *   uTonalAngle→色、uFlux→流れる速さ、uBass→露出（アルファ）、uBeat→拍の閃光。
 * **明るい筋だけを不透明に乗せ、暗い所は透明**にするので、下の動画が透けて見える
 *   （アルファ＝模様の強さ。方法A「明るい所だけ乗せる」）。
 * シェーダ本体は下の FRAG。土台は ShaderSurface（[shaderSurface.ts](./shaderSurface.ts)）。
 * 用語（シェーダ/uniform/UV 等）は docs/visualizer-basics.md 参照。
 */
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
  float v = sin(p.x * 6.0 + t)
          + sin(p.y * 6.0 + t * 1.3)
          + sin((p.x + p.y) * 4.0 + t * 0.7)
          + sin(length(p) * 8.0 - t * 2.0);
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
