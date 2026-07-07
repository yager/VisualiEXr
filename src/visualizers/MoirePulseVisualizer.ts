import { AudioFeatures } from '../audio/AudioFeatures';
import { SurfaceVisualizer } from './Visualizer';
import { ShaderSurface } from './shaderSurface';

/**
 * MoirePulseVisualizer — GLSL「一枚芸」：同心円モアレの催眠オプアート（生WebGL・ライブラリ不要）。
 *
 * 周波数の近いリング模様を重ね、干渉縞（モアレ）を作る。音反応の見本：
 *   uFlux→回転・脈動、uBass→リング密度とコントラスト、uBeat→位相ズレ、uTonalAngle→色相。
 * 暗い所は透明にして**動画が透ける**（明るい縞だけが上に乗る）。
 * 色相は左右反射（abs(p.x)）で atan の切れ目（左=-90°）を除去。
 * 土台は ShaderSurface（[shaderSurface.ts](./shaderSurface.ts)）。用語は docs/visualizer-basics.md。
 */
const FRAG = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uTonalAngle; // 0..1（色相の基準）
uniform float uFlux;       // 回転・脈動の速さ
uniform float uBass;       // リング密度・コントラスト
uniform float uBeat;       // 拍の位相ズレ（0..1、減衰）

vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float r = length(p) + 1e-4;

  // 色の切れ目は atan(y,x) が左（真上=0° なら -90°）で π↔-π と跳ぶため。
  // 左半分を右に反射（-90°..90° と 90°..270° を対称に）して不連続を消す。
  vec2 pMir = vec2(abs(p.x), p.y);
  float ang = atan(pMir.y, pMir.x);

  float speed = 0.18 + uFlux * 0.85;
  float t = uTime * speed;
  float breathe = 1.0 + sin(t * 0.55) * 0.06;

  float rot = t * 0.22;
  float cr = cos(rot);
  float sr = sin(rot);
  vec2 q = vec2(cr * pMir.x - sr * pMir.y, sr * pMir.x + cr * pMir.y);
  float rq = length(q);

  float phaseHit = uBeat * 2.5;

  float freqA = (36.0 + uBass * 8.0) * breathe;
  float freqB = freqA * 0.965;
  float layerA = sin(rq * freqA - t * 1.6);
  float layerB = sin(rq * freqB + t * 1.45 + phaseHit);

  float segs = 9.0 + floor(uBass * 3.0);
  float layerC = sin(ang * segs - t * 0.9 + rq * 3.5);

  float moire = layerA * layerB;
  moire = mix(moire, moire * layerC, 0.5);

  float pattern = 0.5 + 0.5 * moire;
  pattern = pow(clamp(pattern, 0.0, 1.0), 0.75 + uBass * 0.35);

  float vig = smoothstep(1.4, 0.2, r);
  float intensity = pattern * vig * (0.42 + uBass * 0.58) + uBeat * 0.22;
  float a = clamp(intensity, 0.0, 1.0);

  float hue = uTonalAngle + rq * 0.12 + ang * 0.04 + t * 0.03;
  vec3 col = palette(hue) * (0.62 + 0.38 * a);
  gl_FragColor = vec4(col, a);
}
`;

export default class MoirePulseVisualizer implements SurfaceVisualizer {
  readonly id = 'moire-pulse';
  readonly name = 'Moire Pulse (GLSL)';
  readonly author = 'VisualiEXr';
  readonly description = 'GLSL：同心円モアレの干渉縞。暗部は透過';
  readonly order = 83;

  private surface: ShaderSurface | null = null;
  private flash = 0;

  mount(container: HTMLElement): void {
    this.surface = new ShaderSurface(container, FRAG);
  }

  frame(f: AudioFeatures): void {
    if (!this.surface) return;
    if (f.kick || f.beat) this.flash = 1;
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
