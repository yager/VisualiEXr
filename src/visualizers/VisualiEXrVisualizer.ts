/**
 * VisualiEXrVisualizer — シグネチャー・ビジュアライザ。
 *
 * Three.js（Cyber Flight 削減版）/ PixiJS（PixiNeon 削減版）/ 生GLSL（Chroma Flow）の
 * 3レイヤーを1つの container に canvas 積層し、CSS合成（filter/opacity/blend）で重ねた上に
 * 中央へロゴを置く（方式A）。tools/og-poster/poster.ts で詰めた見た目・CONFIG値を、
 * 静止画ではなく実オーディオで毎フレーム動くプラグインとして移植したもの。
 *
 * 3レイヤーの描画ロジックは tools/og-poster/vendored/*.ts からのコピー（オリジナルの
 * src/visualizers/ChromaFlowVisualizer.ts / CyberFlightVisualizer.ts / PixiNeonVisualizer.ts は
 * 無改変のまま別プラグインとして存続する）。shaderSurface.ts のみ中立ユーティリティとして import 再利用。
 */
import * as THREE from 'three';
import * as PIXI from 'pixi.js';
import 'pixi.js/unsafe-eval';
import { GlowFilter } from 'pixi-filters/glow';
import { ShockwaveFilter } from 'pixi-filters/shockwave';
import { AudioFeatures } from '../audio/AudioFeatures';
import { SurfaceVisualizer } from './Visualizer';
import { ShaderSurface } from './shaderSurface';
import { LOGO_DATA_URL } from './visualiexrLogo';

/** 調整用定数。poster.ts の CONFIG の値を初期値として移植（offset は容器サイズ比%）。 */
const CONFIG = {
  background: {
    color: '#0a0a0f',
    opacity: 0.0, // 既定は無効（動画の上ではそのまま透過。拡張で覆いたい場合に上げる）
  },
  layers: {
    chroma: {
      opacity: 0.50,
      // 順序厳守：contrast → saturate → brightness（brightness を先にすると contrast が模様を消してしまう）
      filter: { contrast: 2.2, saturate: 0.25, brightness: 0.85 },
      scale: 1.5,
      offsetXRatio: 0,
      offsetYRatio: 0,
    },
    cyber: {
      opacity: 1.0,
      blend: 'normal' as const,
      scale: 1.05,
      offsetXRatio: 0,
      offsetYRatio: 0,
    },
    pixi: {
      opacity: 0.85,
      blend: 'screen' as const,
      scale: 1.0,
    },
  },
  logo: {
    show: true,
    widthRatio: 0.24,
    offsetYRatio: 0.01, // poster の +11/1080 ≒ 1.0%
    opacity: 1.0,
    glow: { radiusRatio: 0.42, opacity: 0.55 },
  },
};

const FAR = -720;
const GROUND_Y = -20;
const CEIL_Y = 28;
const GRID_HALF = 80;
// 実座標で奥へ流れる横線（床/天井）。SPAWN_Z（カメラ位置0からわずかに離した位置）で生まれ、
// 奥（FAR）で消える。0に近すぎると、大きく振れたスパイク行がカメラの近接クリップ面ギリギリで
// 生成されてしまい塗りつぶし面が正しく描画されず下レイヤーが透けて見える。離しすぎると、
// 生成された瞬間が画面奥に小さく見えてしまい迫力が失われる（-90は離しすぎだった）。
// この2点のバランスを取るための値。全体の見え方に応じて調整してください。
const SPAWN_Z = 60;
const LOOP_LEN = SPAWN_Z - FAR; // ループ全長（FAR〜SPAWN_Zの往復距離）
const LINE_ROWS = 46;
const LINE_SPACING = LOOP_LEN / LINE_ROWS;
// 各横線はラップ（再生成＝SPAWN_Zで生まれる瞬間）のchroma(12bin)で形が決まる折れ線にする。
// 画面端側のアクションを増やすため、外側=chroma[0]、中央=chroma[11]になるよう左右ミラー配置にする。
const CHROMA_BINS = 12;
const LINE_POINTS = CHROMA_BINS * 2 - 1; // 23点（中心を共有する対称形、重複なし）
const LINE_HEIGHT = 6; // 折れ線の基本振幅（GROUND_Y〜CEIL_Yの間隔=40の中に収まる範囲）

// ── 拍・音量に連動したスパイク（急激に高くなる行）の確率変調 ──
const SPIKE_BASE_CHANCE = 0.15;  // 何もない時でもたまに出る基礎確率
const SPIKE_BEAT_BOOST = 0.5;    // f.beat が立った瞬間に足す確率
const SPIKE_BASS_BOOST = 0.3;    // f.bass(0..1) に比例して足す確率
const SPIKE_MUL_MIN = 1.8;       // スパイク時の高さ倍率（下限）
const SPIKE_MUL_RANGE = 1.2;     // スパイク時の高さ倍率の追加ランダム幅（下限+0〜この値）
const LINE_HEIGHT_CLAMP = 18;    // 倍率をかけても超えない上限（GROUND_Y〜CEIL_Yの間隔=40に対する安全マージン）

/**
 * 横線同士（隣接する行）を四角形（三角形×2）でつないだインデックスを作る。
 * 行はコンベア状に一定間隔で並ぶため、最終行→先頭行の接続を含めても常に隣接関係が保たれる
 * （全行が同じ速度で流れ、同じ量だけラップするため、行間の相対間隔は常に一定）。
 */
function buildStripIndices(rows: number, cols: number): Uint32Array {
  const idx: number[] = [];
  for (let r = 0; r < rows; r++) {
    const rNext = (r + 1) % rows;
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = r * cols + c + 1;
      const cc = rNext * cols + c;
      const d = rNext * cols + c + 1;
      idx.push(a, cc, b, b, cc, d);
    }
  }
  return new Uint32Array(idx);
}

const CHROMA_FRAG = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uTonalAngle;
uniform float uFlux;
uniform float uBass;
uniform float uBeat;

vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 p = uv - 0.5;
  p.x *= uResolution.x / uResolution.y;

  float t = uTime * (0.3 + uFlux * 1.5);
  float v = sin(p.x * 15.0 + t)
          + sin(p.y * 15.0 + t * 1.3)
          + sin((p.x + p.y) * 10.0 + t * 0.7)
          + sin(length(p) * 20.0 - t * 2.0);
  v *= 0.25;

  float pattern = 0.55 + 0.45 * v;
  float intensity = pattern * (0.3 + uBass * 1.1) + uBeat * 0.3;
  float a = clamp(intensity, 0.0, 1.0);

  float hue = uTonalAngle + v * 0.2;
  vec3 col = palette(hue) * (0.7 + 0.3 * a);
  gl_FragColor = vec4(col, a);
}
`;

/** Chroma Flow 層（削減なし・ChromaFlowVisualizer と同一ロジック）。ShaderSurface は import 再利用。 */
class ChromaLayer {
  private surface: ShaderSurface | null = null;
  private flash = 0;

  mount(container: HTMLElement): void {
    this.surface = new ShaderSurface(container, CHROMA_FRAG);
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

/**
 * Cyber Flight 層（削減版：HUD・建物・Fogなし、Terrain地形も廃止）。
 * 床/天井は実座標で「手前（カメラの目の前）→奥」へ流れる横線（position.zを動かしてFARでラップ）。
 * 各横線はラップ（カメラの目の前で再生成）した瞬間の chroma(12bin) を焼き付けた折れ線グラフになる：
 * 画面端側のアクションを増やすため、外側=chroma[0]・中央=chroma[11]の左右ミラー配置。
 * 床は上向き、天井は下向きに同じchromaスナップショットを使うことで上下対称になる。カメラは固定。
 * 拍/低音の瞬間はSPIKE_*の確率で高さ倍率を上げた「スパイク行」を手前（カメラのすぐそば）で
 * 生成するため、拍との連動性が視覚的に分かりやすい。
 */
class CyberLayer {
  private container: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;

  private lineMat: THREE.LineBasicMaterial | null = null;
  private floorLines: THREE.Line[] = [];
  private ceilLines: THREE.Line[] = [];

  private fillMat: THREE.MeshBasicMaterial | null = null;
  private floorFillGeo: THREE.BufferGeometry | null = null;
  private ceilFillGeo: THREE.BufferGeometry | null = null;

  private w = 0;
  private h = 0;

  mount(container: HTMLElement): void {
    this.container = container;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.w = w;
    this.h = h;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    scene.add(new THREE.AmbientLight(0x223344, 1.2));
    const dir = new THREE.DirectionalLight(0x88bbff, 1.4);
    dir.position.set(0.5, 1.0, 0.25);
    scene.add(dir);

    const camera = new THREE.PerspectiveCamera(72, w / h, 0.1, 900);
    camera.position.set(0, (GROUND_Y + CEIL_Y) / 2, 0);
    this.camera = camera;

    this.lineMat = new THREE.LineBasicMaterial({
      color: 0x33ccff, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });

    const silence = new Array(CHROMA_BINS).fill(0);
    for (let i = 0; i < LINE_ROWS; i++) {
      const floorGeo = new THREE.BufferGeometry();
      floorGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_POINTS * 3), 3));
      this.writeChromaShape(floorGeo, GROUND_Y, 1, silence);
      const floorLine = new THREE.Line(floorGeo, this.lineMat);
      floorLine.position.z = SPAWN_Z - LINE_SPACING * i;
      scene.add(floorLine);
      this.floorLines.push(floorLine);

      const ceilGeo = new THREE.BufferGeometry();
      ceilGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_POINTS * 3), 3));
      this.writeChromaShape(ceilGeo, CEIL_Y, -1, silence);
      const ceilLine = new THREE.Line(ceilGeo, this.lineMat);
      ceilLine.position.z = SPAWN_Z - LINE_SPACING * i;
      scene.add(ceilLine);
      this.ceilLines.push(ceilLine);
    }

    // ── 横線の間を塗りつぶして山の立体感を出す（線だけだとワイヤーフレームで面が無い）。
    // 隣接する行同士を四角形でつなぐ。頂点位置は毎フレーム、各行の折れ線から実座標で作り直す。 ──
    this.fillMat = new THREE.MeshBasicMaterial({
      color: 0x04121d, transparent: true, opacity: 0.5,
      blending: THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const stripIndex = buildStripIndices(LINE_ROWS, LINE_POINTS);

    const floorFillGeo = new THREE.BufferGeometry();
    floorFillGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_ROWS * LINE_POINTS * 3), 3));
    floorFillGeo.setIndex(new THREE.BufferAttribute(stripIndex, 1));
    this.floorFillGeo = floorFillGeo;
    const floorFillMesh = new THREE.Mesh(floorFillGeo, this.fillMat);
    floorFillMesh.renderOrder = 0;
    scene.add(floorFillMesh);

    const ceilFillGeo = new THREE.BufferGeometry();
    ceilFillGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_ROWS * LINE_POINTS * 3), 3));
    ceilFillGeo.setIndex(new THREE.BufferAttribute(stripIndex.slice(), 1));
    this.ceilFillGeo = ceilFillGeo;
    const ceilFillMesh = new THREE.Mesh(ceilFillGeo, this.fillMat);
    ceilFillMesh.renderOrder = 0;
    scene.add(ceilFillMesh);

    for (const line of [...this.floorLines, ...this.ceilLines]) line.renderOrder = 1;
    this.updateFillGeometry(this.floorFillGeo, this.floorLines);
    this.updateFillGeometry(this.ceilFillGeo, this.ceilLines);
  }

  /** 塗りつぶし面の頂点を、対応する各行の折れ線（ローカルXY＋実座標のposition.z）から作り直す。 */
  private updateFillGeometry(geo: THREE.BufferGeometry, lines: THREE.Line[]): void {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let r = 0; r < lines.length; r++) {
      const line = lines[r];
      const src = (line.geometry.attributes.position as THREE.BufferAttribute).array;
      const z = line.position.z;
      for (let c = 0; c < LINE_POINTS; c++) {
        const si = c * 3;
        const di = (r * LINE_POINTS + c) * 3;
        pos.array[di] = src[si];
        pos.array[di + 1] = src[si + 1];
        pos.array[di + 2] = z;
      }
    }
    pos.needsUpdate = true;
  }

  /**
   * 折れ線の頂点を書き換える。外側=chroma[0]・中央=chroma[11]の左右ミラー、23点、
   * Y=baseline+sign*min(chroma*高さ*heightMul, LINE_HEIGHT_CLAMP)。
   * heightMul>1 を渡すと「急激に高くなる行（スパイク）」になる。
   */
  private writeChromaShape(
    geo: THREE.BufferGeometry, baselineY: number, sign: number,
    chroma: readonly number[], heightMul = 1,
  ): void {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const half = CHROMA_BINS - 1; // 11
    for (let i = 0; i < LINE_POINTS; i++) {
      const k = i - half; // -11..11（0=中央）
      const idx = half - Math.abs(k); // 外側(|k|=11)→0、中央(k=0)→11
      const x = k * (GRID_HALF / half);
      const bump = Math.min(chroma[idx] * LINE_HEIGHT * heightMul, LINE_HEIGHT_CLAMP);
      const y = baselineY + sign * bump;
      pos.setXYZ(i, x, y, 0);
    }
    pos.needsUpdate = true;
  }

  frame(f: AudioFeatures): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.resize();
    const dt = 0.016;
    const speed = (65 + f.bass * 120) * dt;

    // ── 横線を実座標で「SPAWN_Z→奥」へスクロール。FARを超えたらSPAWN_Zでラップ＋その瞬間の
    // chromaを焼き付け。SPAWN_Zは画面の横幅がちょうど収まる程度の奥行きなので、拍で急に高くなる
    // 行が「画面に入った辺り」から見え始め、カメラの近接クリップによる塗りつぶしの欠けを避けつつ
    // 拍との連動性を感じやすくする。 ──
    const spikeChance = SPIKE_BASE_CHANCE + (f.beat ? SPIKE_BEAT_BOOST : 0) + f.bass * SPIKE_BASS_BOOST;
    for (let i = 0; i < this.floorLines.length; i++) {
      const floorLine = this.floorLines[i];
      const ceilLine = this.ceilLines[i];
      floorLine.position.z -= speed;
      ceilLine.position.z -= speed;
      if (floorLine.position.z < FAR) {
        floorLine.position.z += LOOP_LEN;
        ceilLine.position.z += LOOP_LEN;
        const heightMul = Math.random() < spikeChance ? SPIKE_MUL_MIN + Math.random() * SPIKE_MUL_RANGE : 1;
        this.writeChromaShape(floorLine.geometry, GROUND_Y, 1, f.chroma, heightMul);
        this.writeChromaShape(ceilLine.geometry, CEIL_Y, -1, f.chroma, heightMul);
      }
    }
    this.lineMat?.color.setHSL(f.tonalAngle, 0.6, 0.4 + (f.beat ? 0.15 : 0));
    this.fillMat?.color.setHSL(f.tonalAngle, 0.5, 0.12);

    if (this.floorFillGeo) this.updateFillGeometry(this.floorFillGeo, this.floorLines);
    if (this.ceilFillGeo) this.updateFillGeometry(this.ceilFillGeo, this.ceilLines);

    this.camera.rotation.z = 0;
    this.camera.position.x = 0;
    this.camera.position.y = (GROUND_Y + CEIL_Y) / 2;

    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const c = this.container!;
    const w = Math.max(1, c.clientWidth);
    const h = Math.max(1, c.clientHeight);
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.renderer!.setSize(w, h, false);
    this.camera!.aspect = w / h;
    this.camera!.updateProjectionMatrix();
  }

  unmount(): void {
    for (const line of [...this.floorLines, ...this.ceilLines]) {
      line.geometry.dispose();
    }
    this.lineMat?.dispose();
    this.floorFillGeo?.dispose();
    this.ceilFillGeo?.dispose();
    this.fillMat?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
    this.renderer?.domElement.remove();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.lineMat = null;
    this.floorLines = [];
    this.ceilLines = [];
    this.floorFillGeo = null;
    this.ceilFillGeo = null;
    this.fillMat = null;
    this.container = null;
  }
}

const SHOCK_SPEED = 700;

/** PixiNeon 層（削減版：外周円なし、中心の空き/バー長さ調整済み）。 */
class PixiLayer {
  private container: HTMLElement | null = null;
  private app: PIXI.Application | null = null;
  private ready = false;
  private content: PIXI.Container | null = null;
  private g: PIXI.Graphics | null = null;
  private glow: GlowFilter | null = null;
  private shock: ShockwaveFilter | null = null;
  private w = 0;
  private h = 0;
  private shockActive = false;

  mount(container: HTMLElement): void {
    this.container = container;
    this.ready = false;

    const app = new PIXI.Application();
    this.app = app;
    app
      .init({
        width: Math.max(1, container.clientWidth),
        height: Math.max(1, container.clientHeight),
        backgroundAlpha: 0,
        antialias: true,
      })
      .then(() => {
        const canvas = app.canvas;
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
        container.appendChild(canvas);

        const content = new PIXI.Container();
        const g = new PIXI.Graphics();
        content.addChild(g);
        app.stage.addChild(content);

        const glow = new GlowFilter({ distance: 18, outerStrength: 2, innerStrength: 1, color: 0x33ccff, quality: 0.3 });
        const shock = new ShockwaveFilter({
          center: { x: 0, y: 0 },
          amplitude: 30,
          wavelength: 120,
          brightness: 1.1,
          speed: SHOCK_SPEED,
          radius: 1,
          time: 999,
        });
        content.filters = [glow, shock];

        this.content = content;
        this.g = g;
        this.glow = glow;
        this.shock = shock;
        this.ready = true;
      })
      .catch((e) => console.warn('[VisualiEXr/pixi] init 失敗:', e));
  }

  frame(f: AudioFeatures): void {
    if (!this.ready || !this.app || !this.g || !this.content || !this.glow || !this.shock) return;
    this.resize();

    const cx = this.w / 2;
    const cy = this.h / 2;
    const minDim = Math.min(this.w, this.h);

    const color = this.hsl(f.tonalAngle, 0.5 + 0.5 * f.tonalStrength, 0.6);

    const g = this.g;
    g.clear();
    const spokes = 96;
    const spec = f.spectrum;
    const span = Math.max(2, Math.floor(spec.length * 0.4));
    const R0 = minDim * 0.3;
    const len = minDim * 0.4;
    const halfSpokes = Math.floor(spokes / 2);
    for (let half = 0; half < 2; half++) {
      const angleStart = half === 0 ? -Math.PI / 2 : Math.PI / 2;
      for (let i = 0; i < halfSpokes; i++) {
        const t = i / halfSpokes;
        const amp = spec[Math.floor(t * (span - 1))] / 255;
        const theta = angleStart + t * Math.PI;
        const sin = Math.sin(theta);
        const cos = Math.cos(theta);
        const r1 = R0 + amp * len;
        g.moveTo(cx + sin * R0, cy - cos * R0);
        g.lineTo(cx + sin * r1, cy - cos * r1);
      }
    }
    g.stroke({ width: 2.5, color: 0xffffff, alpha: 0.9 });
    this.content.tint = color;

    this.glow.color = color;
    this.glow.outerStrength = 1.5 + f.bass * 8 + (f.beat ? 3 : 0);
    this.glow.innerStrength = 0.5 + f.rms * 2;

    const shock = this.shock;
    if (f.kick) {
      shock.time = 0;
      shock.center.x = cx;
      shock.center.y = cy;
      shock.radius = Math.hypot(this.w, this.h);
      this.shockActive = true;
    }
    if (this.shockActive) {
      shock.time += 0.016;
      if (shock.time * SHOCK_SPEED > shock.radius) {
        this.shockActive = false;
        shock.time = 999;
      }
    }
  }

  private resize(): void {
    const c = this.container!;
    const w = Math.max(1, c.clientWidth);
    const h = Math.max(1, c.clientHeight);
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.app!.renderer.resize(w, h);
    this.content!.filterArea = new PIXI.Rectangle(0, 0, w, h);
  }

  private hsl(h: number, s: number, l: number): number {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number): number => {
      const k = (n + h * 12) % 12;
      const col = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * col);
    };
    return (f(0) << 16) | (f(8) << 8) | f(4);
  }

  unmount(): void {
    if (this.app) this.app.destroy(true, { children: true });
    this.app = null;
    this.content = null;
    this.g = null;
    this.glow = null;
    this.shock = null;
    this.ready = false;
    this.container = null;
  }
}

export default class VisualiEXrVisualizer implements SurfaceVisualizer {
  readonly id = 'visualiexr';
  readonly name = 'VisualiEXr';
  readonly author = 'VisualiEXr';
  readonly description = 'シグネチャー：GLSL＋Three.js＋PixiJSの3層を重ねたロゴ入り演出';
  readonly order = 1;

  private bgEl: HTMLDivElement | null = null;
  private chromaEl: HTMLDivElement | null = null;
  private cyberEl: HTMLDivElement | null = null;
  private pixiEl: HTMLDivElement | null = null;
  private logoGlowEl: HTMLDivElement | null = null;
  private logoImg: HTMLImageElement | null = null;

  private readonly chroma = new ChromaLayer();
  private readonly cyber = new CyberLayer();
  private readonly pixi = new PixiLayer();

  mount(container: HTMLElement): void {
    container.style.position = container.style.position || 'relative';
    container.style.isolation = 'isolate';
    container.style.overflow = 'hidden';

    // 1. 背景ベース
    const bg = document.createElement('div');
    bg.style.cssText =
      `position:absolute;inset:0;background:${CONFIG.background.color};opacity:${CONFIG.background.opacity};`;
    container.appendChild(bg);
    this.bgEl = bg;

    // 2. Chroma Flow（GLSL）
    const chromaEl = document.createElement('div');
    const { contrast, saturate, brightness } = CONFIG.layers.chroma.filter;
    chromaEl.style.cssText =
      `position:absolute;inset:0;` +
      `filter:contrast(${contrast}) saturate(${saturate}) brightness(${brightness});` +
      `opacity:${CONFIG.layers.chroma.opacity};` +
      `transform:scale(${CONFIG.layers.chroma.scale});`;
    container.appendChild(chromaEl);
    this.chromaEl = chromaEl;
    this.chroma.mount(chromaEl);

    // 3. Cyber Flight（three.js 削減版）
    const cyberEl = document.createElement('div');
    const cyberOffsetY = CONFIG.layers.cyber.offsetYRatio * 100;
    const cyberOffsetX = CONFIG.layers.cyber.offsetXRatio * 100;
    cyberEl.style.cssText =
      `position:absolute;inset:0;` +
      `opacity:${CONFIG.layers.cyber.opacity};` +
      `mix-blend-mode:${CONFIG.layers.cyber.blend};` +
      `transform:scale(${CONFIG.layers.cyber.scale}) translate(${cyberOffsetX}%, ${cyberOffsetY}%);`;
    container.appendChild(cyberEl);
    this.cyberEl = cyberEl;
    this.cyber.mount(cyberEl);

    // 4. PixiNeon 削減版
    const pixiEl = document.createElement('div');
    pixiEl.style.cssText =
      `position:absolute;inset:0;` +
      `opacity:${CONFIG.layers.pixi.opacity};` +
      `mix-blend-mode:${CONFIG.layers.pixi.blend};` +
      `transform:scale(${CONFIG.layers.pixi.scale});`;
    container.appendChild(pixiEl);
    this.pixiEl = pixiEl;
    this.pixi.mount(pixiEl);

    // 5. ロゴ（最前面）
    if (CONFIG.logo.show) {
      const glowEl = document.createElement('div');
      const glowRPct = CONFIG.logo.glow.radiusRatio * 100;
      glowEl.style.cssText =
        `position:absolute;inset:0;` +
        `background:radial-gradient(circle at 50% ${50 + CONFIG.logo.offsetYRatio * 100}%, ` +
        `rgba(5,5,10,${CONFIG.logo.glow.opacity}) 0%, rgba(5,5,10,0) ${glowRPct}%);`;
      container.appendChild(glowEl);
      this.logoGlowEl = glowEl;

      const img = document.createElement('img');
      img.src = LOGO_DATA_URL;
      img.style.cssText =
        `position:absolute;left:50%;top:${50 + CONFIG.logo.offsetYRatio * 100}%;` +
        `width:${CONFIG.logo.widthRatio * 100}%;height:auto;` +
        `transform:translate(-50%, -50%);opacity:${CONFIG.logo.opacity};pointer-events:none;`;
      container.appendChild(img);
      this.logoImg = img;
    }
  }

  frame(f: AudioFeatures): void {
    this.chroma.frame(f);
    this.cyber.frame(f);
    this.pixi.frame(f);
  }

  unmount(): void {
    this.chroma.unmount();
    this.cyber.unmount();
    this.pixi.unmount();
    this.bgEl?.remove();
    this.chromaEl?.remove();
    this.cyberEl?.remove();
    this.pixiEl?.remove();
    this.logoGlowEl?.remove();
    this.logoImg?.remove();
    this.bgEl = null;
    this.chromaEl = null;
    this.cyberEl = null;
    this.pixiEl = null;
    this.logoGlowEl = null;
    this.logoImg = null;
  }
}
