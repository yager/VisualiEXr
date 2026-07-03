import { AudioFeatures } from '../audio/AudioFeatures';
import { SurfaceVisualizer } from './Visualizer';
import { ShaderSurface } from './shaderSurface';

/**
 * TunnelVisualizer — GLSL「一枚芸」の見せ場サンプル：奥へ飛ぶ格子トンネル（生WebGL・ライブラリ不要）。
 *
 * 解析的トンネル（画面を極座標にして 1/r を奥行きに使う）。レイマーチせず軽量。
 *   uFlux→前進速度、uBass→壁の密度＆露出、uBeat→閃光、uTonalAngle→奥行きで流れる色。
 * 中心（消失点）と縁は透明にして**動画が透ける**（明るい格子だけが上に乗る）。
 * 土台は ShaderSurface（[shaderSurface.ts](./shaderSurface.ts)）。用語は docs/visualizer-basics.md。
 */
const FRAG = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uTonalAngle; // 0..1（色相の基準）
uniform float uFlux;       // 前進速度
uniform float uBass;       // 壁の密度・露出
uniform float uBeat;       // 拍の閃光（0..1、減衰）

vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  // 画面中心を原点に、縦を基準にアスペクト補正
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float r = length(p) + 1e-4;
  float ang = atan(p.y, p.x);

  // 奥行き：1/r が奥、uTime で前進（uFlux で速く）
  float speed = 0.4 + uFlux * 2.0;
  float depth = 0.35 / r + uTime * speed;

  // 壁のグリッド：奥方向のリング × 円周方向のセグメント（整数倍で継ぎ目なく一周）
  float rings = 0.5 + 0.5 * sin(depth * (10.0 + uBass * 8.0));
  float seg   = 0.5 + 0.5 * sin(ang * 8.0);
  float grid  = pow(rings * seg, 1.5);

  // 中心（遠方）は透明にして動画を覗かせる
  float depthFade = smoothstep(0.0, 0.35, r);
  float intensity = grid * depthFade * (0.5 + uBass * 0.7) + uBeat * 0.25;
  float a = clamp(intensity, 0.0, 1.0);

  float hue = uTonalAngle + depth * 0.03; // 奥行きで色が流れる
  vec3 col = palette(hue) * (0.6 + 0.4 * a);
  gl_FragColor = vec4(col, a);            // 明るい格子だけが動画の上に乗る
}
`;

export default class TunnelVisualizer implements SurfaceVisualizer {
  readonly id = 'tunnel';
  readonly name = 'Tunnel (GLSL)';
  readonly author = 'VisualiEXr';
  readonly description = 'GLSL：格子トンネルを進む。中心は透過';
  readonly order = 81;

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
