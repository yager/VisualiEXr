import * as THREE from 'three';
import { AudioFeatures } from '../audio/AudioFeatures';
import { SurfaceVisualizer } from './Visualizer';

const COLS = 64;          // 横（周波数）方向の格子数
const ROWS = 96;          // 奥（時間）方向の格子数
const WIDTH = 70;         // 地形の横幅（ワールド単位）
const DEPTH = 140;        // 地形の奥行き
const HEIGHT_SCALE = 14;  // 高さの倍率

/**
 * ThreeTerrainVisualizer — three.js（3D）の見せ場サンプル：音の地形フライト。
 *
 * spectrum を「動くスペクトログラム地形」にして手前へ流し、その上を飛ぶ 3D シーン。
 *   - 奥に新しい行を追加し、毎フレーム手前へスクロール（＝飛行しているように見える）。
 *   - 高さ＝spectrum（中央=低域・左右対称）、色＝tonalAngle、camera が bass で上下に揺れる。
 *   - 加算合成のワイヤーフレーム＋フォグで「ネオンが遠方へ消える」奥行き感（背景は透過）。
 *
 * three.js の強み＝奥行き・パースペクティブ・カメラ・フォグを見せる。Pixi(2D)/GLSL(平面)との差が明確。
 * ※ three.js を同梱するためこのビルドはサイズが増える（許容の上で採用）。用語は docs/visualizer-basics.md。
 * ※ オーバーレイの透過を保つため、ポストFXブルームは使わず加算合成で発光を表現している。
 */
export default class ThreeTerrainVisualizer implements SurfaceVisualizer {
  readonly id = 'three-terrain';
  readonly name = 'ThreeTerrain (Three.js)';
  readonly author = 'VisualiEXr';
  readonly description = 'three.js：音のスペクトログラム地形を飛ぶ';
  readonly order = 70;

  private container: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private geometry: THREE.PlaneGeometry | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
  private readonly heights = new Float32Array(ROWS * COLS);
  private readonly row = new Float32Array(COLS);
  private w = 0;
  private h = 0;
  private t = 0;

  mount(container: HTMLElement): void {
    this.container = container;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.w = w;
    this.h = h;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    // 黒フォグ＋加算合成 → 遠方のワイヤーが黒に近づき「加算で消える」＝透過を保ったまま奥行きフェード
    scene.fog = new THREE.Fog(0x000000, 40, DEPTH * 1.05);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 400);
    camera.position.set(0, 10, DEPTH * 0.5);
    camera.lookAt(0, 2, -DEPTH * 0.15);
    this.camera = camera;

    // 平面を寝かせて地形に（頂点の並びは iy*COLS+ix。iy=ROWS-1 が最奥＝新しい行）
    const geometry = new THREE.PlaneGeometry(WIDTH, DEPTH, COLS - 1, ROWS - 1);
    geometry.rotateX(-Math.PI / 2);
    this.geometry = geometry;

    const material = new THREE.MeshBasicMaterial({
      color: 0x33ccff,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    this.material = material;

    scene.add(new THREE.Mesh(geometry, material));
  }

  frame(f: AudioFeatures): void {
    if (!this.renderer || !this.scene || !this.camera || !this.geometry || !this.material) return;
    this.resize();
    this.t += 0.016;

    // ── 新しい行を spectrum から作る（中央=低域、左右対称）──
    const spec = f.spectrum;
    const span = Math.max(2, Math.floor(spec.length * 0.4)); // 低〜中域を使う
    const center = (COLS - 1) / 2;
    for (let ix = 0; ix < COLS; ix++) {
      const d = Math.abs(ix - center) / center;          // 0=中央 .. 1=端
      const bin = Math.floor(d * (span - 1));
      this.row[ix] = spec[bin] / 255;
    }

    // ── 手前へ1行スクロール（奥→手前）＋最奥に新しい行を書く ──
    this.heights.copyWithin(0, COLS);                    // row1→row0 …（手前が抜ける）
    this.heights.set(this.row, (ROWS - 1) * COLS);       // 最奥＝新しい行

    // ── 頂点の高さを更新 ──
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const scale = HEIGHT_SCALE * (0.7 + f.rms * 0.8);
    for (let i = 0; i < ROWS * COLS; i++) pos.setY(i, this.heights[i] * scale);
    pos.needsUpdate = true;

    // ── 色（調性）と発光（拍/低音）──
    const light = Math.min(0.75, 0.45 + (f.beat ? 0.25 : 0) + f.bass * 0.2);
    this.material.color.setHSL(f.tonalAngle, 0.5 + 0.5 * f.tonalStrength, light);

    // ── カメラの揺れ（低音で上下、ゆっくり左右スウェイ）──
    this.camera.position.y = 10 + f.bass * 6;
    this.camera.position.x = Math.sin(this.t * 0.2) * 6;
    this.camera.lookAt(0, 2, -DEPTH * 0.15);

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
    this.geometry?.dispose();
    this.material?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.geometry = null;
    this.material = null;
    this.container = null;
  }
}
