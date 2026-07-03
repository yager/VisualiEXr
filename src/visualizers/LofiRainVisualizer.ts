import { AudioFeatures } from '../audio/AudioFeatures';
import { SurfaceVisualizer } from './Visualizer';
import { ShaderSurface } from './shaderSurface';

/**
 * LofiRainVisualizer — chill / BGV 系サンプル。lo-fi 作業用BGMの定番ビジュアル
 * （夕暮れ、雨の窓ごしに滲む街の灯り）をアセットなしで手続き的に描く。
 *
 * chill の原則（[[chill-visualizer-design]]）を守る：
 *   - **動きはすべて時間ベースで自律・一定**：雨の落下、ボケ玉の漂い、瞬きは音では動かさない。
 *   - **音は“動きに出ない質感”だけにごく薄く**：uExpose（全体の露出）/uGlow（灯りの明るさ）/
 *     uTwinkle（きらめき量）に微量だけ効かせる。ガクガク反応させない。
 *   - **不透明な背景**：動画を隠す “BGVの置き換え” として使う。
 * 土台は ShaderSurface（[shaderSurface.ts](./shaderSurface.ts)）。用語は docs/visualizer-basics.md 参照。
 */
const FRAG = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uExpose;  // 0.85..1.1 くらい：全体の露出（rms由来・微量）
uniform float uGlow;    // 0.9..1.1 くらい：灯りの明るさ（bass由来・微量）
uniform float uTwinkle; // 0..0.3 くらい：きらめき量（treble由来・微量）

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

// 暖色のボケ配色（琥珀〜ピンク〜わずかに青緑）。h で少し色みが変わる。
vec3 bokehColor(float h) {
  vec3 amber = vec3(1.0, 0.62, 0.28);
  vec3 pink  = vec3(1.0, 0.4, 0.55);
  vec3 teal  = vec3(0.45, 0.8, 0.85);
  vec3 c = mix(amber, pink, smoothstep(0.0, 0.6, h));
  c = mix(c, teal, smoothstep(0.75, 1.0, h) * 0.5); // ときどき寒色のアクセント
  return c;
}

// ボケ玉レイヤー：セルごとに1つの柔らかい光。ゆっくり漂い・ゆっくり瞬く（音では動かさない）。
// p は「画面比で正方形」に補正済みの座標（uv.x にアスペクト比を掛けたもの）＝玉が真円になる。
vec3 bokehLayer(vec2 p, float scale, float t, float seed, float twinkle) {
  vec2 g = p * scale + seed;
  vec2 id = floor(g);
  vec2 f = fract(g);
  vec3 col = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 h = hash2(id + o + seed);
      vec2 pos = o + 0.5 + 0.3 * vec2(sin(t * 0.25 + h.x * 6.28), cos(t * 0.2 + h.y * 6.28));
      float d = length(f - pos);
      float r = 0.28 + 0.35 * h.x;                 // 大きめ＝レンズのボケ感
      float glow = smoothstep(r, 0.0, d);
      glow *= glow;
      float tw = 1.0 - twinkle + twinkle * (0.5 + 0.5 * sin(t * 0.9 + h.y * 30.0));
      col += bokehColor(h.y) * glow * tw * (0.35 + 0.65 * h.x);
    }
  }
  return col;
}

// 窓ガラスを流れ落ちる雨：列ごとに速度・位相を変え、頭（雫）と尾を下方向へ。時間ベースで一定。
// 数は控えめ・ゆっくり。頭は細く（横に広がらない）。
float rain(vec2 uv, float t) {
  float N = 16.0;                                  // 列を減らす＝雨粒を減らす
  float col = floor(uv.x * N);
  float lx = fract(uv.x * N);
  float on = step(0.45, hash(vec2(col, 17.0)));    // 一部の列だけ降らせる（さらに間引く）
  float w = smoothstep(0.14, 0.0, abs(lx - 0.5));  // 中心の細い筋だけ（横に潰れない）
  float sp = mix(0.02, 0.05, hash(vec2(col, 3.0))); // もっとゆっくり落ちる
  float ph = hash(vec2(col, 9.0));
  float dy = fract(uv.y + t * sp + ph);            // 下向きに流れる雫の頭
  float head = smoothstep(0.02, 0.0, dy);          // 雫の頭（明るい点）
  float trail = smoothstep(0.22, 0.0, dy) * 0.3;   // その上に伸びる尾
  return on * w * (head + trail);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;      // 0..1（左下原点）
  float aspect = uResolution.x / uResolution.y;    // 16:9 等
  vec2 sc = vec2(uv.x * aspect, uv.y);             // 画面比で正方形になる座標（ボケを真円に）
  float t = uTime;

  // 夕暮れの縦グラデ（上＝暗い藍、下＝暖色）＋うっすらフォグ ＝ 背景（動画を薄く透かす）
  vec3 top = vec3(0.06, 0.05, 0.12);
  vec3 bot = vec3(0.18, 0.09, 0.10);
  vec3 base = mix(bot, top, uv.y) + vec3(0.02, 0.015, 0.03);

  // 街灯りのボケ（2層のパララックス）— 背景と同じく半透過にする（際を目立たせない）。
  vec3 bokeh = bokehLayer(sc, 5.0, t, 11.3, uTwinkle) * 0.9 * uGlow
             + bokehLayer(sc, 9.0, t * 1.3, 41.7, uTwinkle) * 0.5 * uGlow;
  // 雨の筋 — これだけは不透明に残す。
  float r = rain(uv, t);
  vec3 rainCol = vec3(0.7, 0.75, 0.85) * r * 0.18; // ガラス越しの雨のにじみ

  vec3 col = base + bokeh + rainCol;

  // 周辺減光（vignette）で lo-fi の落ち着き
  float vig = smoothstep(1.15, 0.35, length(uv - 0.5));
  col *= vig;

  // フィルムグレイン（lo-fi のざらつき）— 時間で動くが極微量
  float grain = hash(gl_FragCoord.xy + fract(t) * 100.0) - 0.5;
  col += grain * 0.03;

  col *= uExpose;                                  // 露出（音量でごく控えめに）

  // アルファ：背景・ボケは 0.9（動画が薄く透ける）。雨の筋の分だけ 1.0 へ寄せる（雨は透かさない）。
  float lum = clamp(dot(rainCol, vec3(0.6)), 0.0, 0.1);
  gl_FragColor = vec4(col, 0.9 + lum);
}
`;

export default class LofiRainVisualizer implements SurfaceVisualizer {
  readonly id = 'lofi-rain';
  readonly name = 'Lo-Fi Rain (Chill)';
  readonly author = 'VisualiEXr';
  readonly description = 'chill：雨の窓ごしの街灯り。半透過で映像も透ける';
  readonly order = 37;

  private surface: ShaderSurface | null = null;

  mount(container: HTMLElement): void {
    this.surface = new ShaderSurface(container, FRAG);
  }

  frame(f: AudioFeatures): void {
    if (!this.surface) return;
    // 音は「動きに出ない質感」だけにごく薄く効かせる（動きは時間ベースで一定）。
    this.surface.render({
      uTime: f.time,
      uExpose: 0.85 + f.rms * 0.25,
      uGlow: 0.9 + f.bass * 0.2,
      uTwinkle: f.treble * 0.3,
    });
  }

  unmount(): void {
    this.surface?.dispose();
    this.surface = null;
  }
}
