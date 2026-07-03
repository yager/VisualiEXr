import { AudioFeatures } from '../audio/AudioFeatures';
import { SurfaceVisualizer } from './Visualizer';
import { ShaderSurface } from './shaderSurface';

/**
 * WaterCausticsVisualizer — chill 系サンプル（GLSL・生WebGL＝バンドルほぼ増えない）。
 *
 * 水面/プールの底で光がゆらぐ「caustics（焦線）」を描く癒し系。YouTube に重ねる利点を活かし、
 * **暗い所は水色に薄く透け、明るい網目だけを光として乗せる**＝下の動画が“水中にある”ように見せる。
 *
 * chill の原則（[[chill-visualizer-design]]）：
 *   - **ゆらぎは時間ベースで自律・一定**（音では動かさない）。
 *   - 音は「動きに出ない質感」だけにごく薄く：uExpose（露出・rms由来）/uGlow（網目の明るさ・bass由来）。
 * caustics の反復乱流は定番の手法を土台に調整。ハーネスは ShaderSurface（[shaderSurface.ts](./shaderSurface.ts)）。
 * 用語は docs/visualizer-basics.md 参照。
 */
const FRAG = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uExpose; // 0.85..1.1：全体の露出（rms由来・微量）
uniform float uGlow;   // 0.8..1.2：網目の明るさ（bass由来・微量）

#define TAU 6.28318530718

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float aspect = uResolution.x / uResolution.y;
  vec2 p0 = vec2(uv.x * aspect, uv.y);            // アスペクト補正（網目を潰さない）

  // caustics：反復する乱流で焦線ネットワークを作る（定番手法）。
  vec2 p = p0 * TAU * 1.3 - 250.0;               // スケール＆原点をずらして対称を避ける
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  float t = uTime * 0.45;                         // ゆっくり（chill）
  for (int n = 0; n < 5; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  float bright = pow(abs(c), 8.0) * uGlow;        // 焦線の明るさ

  // 水の色みと焦線の色
  vec3 water = vec3(0.04, 0.30, 0.40);            // 深い青緑の色かぶり
  vec3 caust = vec3(0.55, 0.9, 1.0);              // 網目（明るいシアン白）
  vec3 col = water * 0.5 + caust * bright;
  col *= uExpose;

  // 深さを感じる周辺減光
  float vig = smoothstep(1.2, 0.4, length(uv - 0.5));
  col *= vig;

  // アルファ：暗い所は水色に薄く透け（0.35）、明るい網目ほど光として乗る（→ 最大 0.9 付近）。
  float a = 0.35 + clamp(bright, 0.0, 1.0) * 0.55;
  a *= vig;                                       // 縁はより透けて奥行きを出す
  gl_FragColor = vec4(col, a);                    // 下の動画が“水中”に見える
}
`;

export default class WaterCausticsVisualizer implements SurfaceVisualizer {
  readonly id = 'water-caustics';
  readonly name = 'Water Caustics (GLSL)';
  readonly author = 'VisualiEXr';
  readonly description = 'GLSL：水中の光の網目。映像が水中に見える';
  readonly order = 82;

  private surface: ShaderSurface | null = null;

  mount(container: HTMLElement): void {
    this.surface = new ShaderSurface(container, FRAG);
  }

  frame(f: AudioFeatures): void {
    if (!this.surface) return;
    // 音は「動きに出ない質感」だけにごく薄く（ゆらぎは時間ベースで一定）。
    this.surface.render({
      uTime: f.time,
      uExpose: 0.85 + f.rms * 0.25,
      uGlow: 0.8 + f.bass * 0.4,
    });
  }

  unmount(): void {
    this.surface?.dispose();
    this.surface = null;
  }
}
