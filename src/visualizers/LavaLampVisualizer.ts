/**
 * LavaLampVisualizer — メタボール（融合するブロブ）の GLSL chill 系。
 *
 * メタボール場（sum = Σ r²/d²）＋閾値 smoothstep で青緑のぬめる塊を描く。
 * 数式は lucia-gomez/lava-lamp を参考（標準的なメタボール式。コードは自前実装）。
 * shaderSurface は vec3 配列 uniform を渡せないため、最小の自前 WebGL を持つ。
 */
import { AudioFeatures } from '../audio/AudioFeatures';
import { SurfaceVisualizer } from './Visualizer';

/** 調整用定数（各項目の意味はファイル末尾コメント参照）。 */
const CONFIG = {
  blobCount: 18,
  minR: 26,
  maxR: 52,
  speed: 0.03,
  stickiness: 2.05,
  softness: 0.3,
  glow: 0.05,
  blobAlpha: 0.8,
  colors: {
    color1: [0.32, 0.96, 0.78] as const,
    color2: [0.04, 0.38, 0.44] as const,
  },
  glass: {
    rgb: [0.07, 0.26, 0.30] as const,
    alpha: 0.4,
    vignetteCenter: 0.32,
    vignetteEdge: 1.0,
  },
  audio: {
    sizeGain: 0.12,
    speedGain: 0.14,
    beatPulse: 0.2,
    glowGain: 0.12,
  },
} as const;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

function buildFrag(blobCount: number): string {
  return `
precision highp float;
uniform vec2 uResolution;
uniform vec3 uBlobs[${blobCount}];
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec4 uGlass;
uniform float uThreshold;
uniform float uSoftness;
uniform float uGlow;
uniform float uBlobAlpha;

void main() {
  float sum = 0.0;
  for (int i = 0; i < ${blobCount}; i++) {
    vec2 d = uBlobs[i].xy - gl_FragCoord.xy;
    float r = uBlobs[i].z;
    sum += (r * r) / (d.x * d.x + d.y * d.y + 1.0);
  }

  float t = smoothstep(uThreshold - uSoftness, uThreshold + uSoftness, sum);
  vec3 blobCol = mix(uColor2, uColor1, gl_FragCoord.y / uResolution.y);
  float glow = smoothstep(uThreshold * 0.4, uThreshold, sum) * uGlow;

  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 cuv = uv - 0.5;
  float dist = length(cuv) * 1.35;
  float vig = mix(${CONFIG.glass.vignetteCenter.toFixed(2)}, ${CONFIG.glass.vignetteEdge.toFixed(2)}, dist);
  float bgA = uGlass.a * vig;

  vec3 rgb = mix(uGlass.rgb, blobCol, t);
  float a = max(mix(bgA, uBlobAlpha, t), glow * 0.6);
  gl_FragColor = vec4(rgb, a);
}
`;
}

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseR: number;
}

export default class LavaLampVisualizer implements SurfaceVisualizer {
  readonly id = 'lava-lamp';
  readonly name = 'Lava Lamp (Chill)';
  readonly author = 'VisualiEXr';
  readonly description = 'メタボールの青緑ブロブがゆっくり漂う。chill';
  readonly order = 56;

  private container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private posLoc = -1;
  private readonly locs = new Map<string, WebGLUniformLocation | null>();
  private blobs: Blob[] = [];
  private readonly blobUniform = new Float32Array(CONFIG.blobCount * 3);
  private w = 0;
  private h = 0;
  private beatPulse = 0;
  /** コンテナ未レイアウト時の 1px 初期化を避ける（リフレッシュ直後の全面塗りつぶし防止）。 */
  private layoutReady = false;

  mount(container: HTMLElement): void {
    this.container = container;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    container.appendChild(canvas);
    this.canvas = canvas;

    const gl = (canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false })
      || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    this.gl = gl;
    if (!gl) {
      console.warn('[LavaLamp] WebGL 未対応');
      return;
    }

    const vs = this.compile(gl.VERTEX_SHADER, VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, buildFrag(CONFIG.blobCount));
    if (!vs || !fs) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[LavaLamp] link 失敗:', gl.getProgramInfoLog(program));
      return;
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;
    this.posLoc = gl.getAttribLocation(program, 'aPos');

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.buffer = buffer;

    this.resize();
  }

  frame(f: AudioFeatures): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.buffer) return;
    if (!this.resize()) return;

    if (f.beat) this.beatPulse = CONFIG.audio.beatPulse;
    this.beatPulse *= 0.88;

    const move = CONFIG.speed * (1 + f.flux * CONFIG.audio.speedGain);
    const sizeMul = 1 + f.bass * CONFIG.audio.sizeGain + this.beatPulse;
    const glow = CONFIG.glow + f.rms * CONFIG.audio.glowGain;

    this.updateBlobs(move, sizeMul);
    this.draw(glow);
  }

  unmount(): void {
    const gl = this.gl;
    if (gl) {
      if (this.program) gl.deleteProgram(this.program);
      if (this.buffer) gl.deleteBuffer(this.buffer);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.canvas?.remove();
    this.canvas = null;
    this.gl = null;
    this.program = null;
    this.buffer = null;
    this.locs.clear();
    this.blobs = [];
    this.container = null;
    this.layoutReady = false;
  }

  private initBlobs(w: number, h: number, dpr: number): void {
    const minR = CONFIG.minR * dpr;
    const maxR = CONFIG.maxR * dpr;
    this.blobs = [];
    for (let i = 0; i < CONFIG.blobCount; i++) {
      const baseR = minR + Math.random() * (maxR - minR);
      const margin = baseR * 1.1;
      this.blobs.push({
        x: margin + Math.random() * Math.max(1, w - margin * 2),
        y: margin + Math.random() * Math.max(1, h - margin * 2),
        vx: (Math.random() - 0.5) * 90,
        vy: (Math.random() - 0.5) * 90,
        baseR,
      });
    }
  }

  private updateBlobs(move: number, sizeMul: number): void {
    const w = this.w;
    const h = this.h;
    const arr = this.blobUniform;

    for (let i = 0; i < this.blobs.length; i++) {
      const b = this.blobs[i];
      b.x += b.vx * move;
      b.y += b.vy * move;

      const r = b.baseR * sizeMul;
      const margin = r * 0.95;
      if (b.x < margin) { b.x = margin; b.vx = Math.abs(b.vx) + (Math.random() - 0.5) * 4; }
      if (b.x > w - margin) { b.x = w - margin; b.vx = -Math.abs(b.vx) - (Math.random() - 0.5) * 4; }
      if (b.y < margin) { b.y = margin; b.vy = Math.abs(b.vy) + (Math.random() - 0.5) * 4; }
      if (b.y > h - margin) { b.y = h - margin; b.vy = -Math.abs(b.vy) - (Math.random() - 0.5) * 4; }

      const idx = i * 3;
      arr[idx] = b.x;
      arr[idx + 1] = b.y;
      arr[idx + 2] = r;
    }
  }

  private draw(glow: number): void {
    const gl = this.gl!;
    const program = this.program!;

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.posLoc);
    gl.vertexAttribPointer(this.posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(this.loc('uResolution'), this.w, this.h);
    gl.uniform3fv(this.loc('uBlobs'), this.blobUniform);
    const c1 = CONFIG.colors.color1;
    const c2 = CONFIG.colors.color2;
    gl.uniform3f(this.loc('uColor1'), c1[0], c1[1], c1[2]);
    gl.uniform3f(this.loc('uColor2'), c2[0], c2[1], c2[2]);
    const g = CONFIG.glass.rgb;
    gl.uniform4f(this.loc('uGlass'), g[0], g[1], g[2], CONFIG.glass.alpha);
    gl.uniform1f(this.loc('uThreshold'), CONFIG.stickiness);
    gl.uniform1f(this.loc('uSoftness'), CONFIG.softness);
    gl.uniform1f(this.loc('uGlow'), glow);
    gl.uniform1f(this.loc('uBlobAlpha'), CONFIG.blobAlpha);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private resize(): boolean {
    const canvas = this.canvas!;
    const cssW = this.container!.clientWidth;
    const cssH = this.container!.clientHeight;
    // リフレッシュ直後は container が 0〜数 px のことがある。1px へ丸めない。
    if (cssW < 32 || cssH < 32) return false;

    const dpr = this.dpr();
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (w === this.w && h === this.h && this.layoutReady) return true;

    const hadValidLayout = this.layoutReady && this.w > 0 && this.h > 0;
    if (hadValidLayout && this.blobs.length > 0) {
      const sx = w / this.w;
      const sy = h / this.h;
      for (const b of this.blobs) {
        b.x *= sx;
        b.y *= sy;
        b.baseR *= (sx + sy) * 0.5;
      }
    } else {
      this.initBlobs(w, h, dpr);
    }

    this.w = w;
    this.h = h;
    this.layoutReady = true;
    canvas.width = w;
    canvas.height = h;
    this.gl!.viewport(0, 0, w, h);
    return true;
  }

  private dpr(): number {
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  private loc(name: string): WebGLUniformLocation | null {
    if (!this.locs.has(name)) {
      this.locs.set(name, this.gl!.getUniformLocation(this.program!, name));
    }
    return this.locs.get(name)!;
  }

  private compile(type: number, src: string): WebGLShader | null {
    const gl = this.gl!;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[LavaLamp] shader compile 失敗:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }
}

// ── CONFIG 各項目の意味 ─────────────────────────────────────────────
// blobCount      … ブロブ数（多いほど賑やか）
// minR / maxR    … 半径レンジ（CSS px。実際は dpr 倍）
// speed          … 移動の遅さ（小さいほどゆっくり）
// stickiness     … メタボール閾値 uThreshold（小さいほど融合しやすい）
// softness       … 閾値のソフト幅（艶・ぬめり）
// glow           … 外周グロー基準（rms で増減）
// blobAlpha      … ブロブ本体の最大不透明度（1.0=不透明）
// colors.color1  … 上側の明るいシアングリーン
// colors.color2  … 下側の濃ティール
// glass.rgb/alpha … ガラス色背景の色と基準透明度
// glass.vignetteCenter/Edge … 中心〜端の減光
// audio.sizeGain   … bass → ブロブ半径
// audio.speedGain  … flux → 移動速度
// audio.beatPulse  … beat → 一瞬のサイズ膨らみ
// audio.glowGain   … rms → グロー
