/**
 * ShaderSurface（og-poster用コピー）— 元は src/visualizers/shaderSurface.ts。
 *
 * OGポスター合成では drawImage で確実にキャプチャする必要があるため、
 * getContext に `preserveDrawingBuffer: true` を追加している点だけがオリジナルとの差分。
 * ロジック本体（render/resize/dispose）はオリジナルと同一。
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export class ShaderSurface {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private posLoc = -1;
  private readonly locs = new Map<string, WebGLUniformLocation | null>();
  private w = 0;
  private h = 0;

  constructor(private readonly container: HTMLElement, fragmentSrc: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    container.appendChild(this.canvas);

    const gl = (this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true })
      || this.canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    this.gl = gl;
    if (!gl) { console.warn('[ShaderSurface] WebGL 未対応'); return; }

    const vs = this.compile(gl.VERTEX_SHADER, VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, fragmentSrc);
    if (!vs || !fs) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[ShaderSurface] link 失敗:', gl.getProgramInfoLog(program));
      return;
    }
    this.program = program;
    this.posLoc = gl.getAttribLocation(program, 'aPos');

    // 画面いっぱいの四角形（TRIANGLE_STRIP 4頂点）
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  }

  /** 毎フレーム呼ぶ。uniforms は名前→float（シェーダに宣言があるものだけ効く）。 */
  render(uniforms: Record<string, number>): void {
    const gl = this.gl;
    if (!gl || !this.program) return;
    this.resize();

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.posLoc);
    gl.vertexAttribPointer(this.posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(this.loc('uResolution'), this.canvas.width, this.canvas.height);
    for (const name in uniforms) {
      const l = this.loc(name);
      if (l) gl.uniform1f(l, uniforms[name]);
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private loc(name: string): WebGLUniformLocation | null {
    if (!this.locs.has(name)) this.locs.set(name, this.gl!.getUniformLocation(this.program!, name));
    return this.locs.get(name)!;
  }

  private compile(type: number, src: string): WebGLShader | null {
    const gl = this.gl!;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[ShaderSurface] shader compile 失敗:', gl.getShaderInfoLog(sh), '\n', src);
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(Math.max(1, this.container.clientWidth) * dpr);
    const h = Math.round(Math.max(1, this.container.clientHeight) * dpr);
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl!.viewport(0, 0, w, h);
  }

  dispose(): void {
    const gl = this.gl;
    if (gl) {
      if (this.program) gl.deleteProgram(this.program);
      if (this.buffer) gl.deleteBuffer(this.buffer);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.canvas.remove();
    this.program = null;
    this.buffer = null;
    this.locs.clear();
  }
}
