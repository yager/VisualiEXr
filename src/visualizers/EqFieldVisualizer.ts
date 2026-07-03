import * as THREE from 'three';
import { AudioFeatures } from '../audio/AudioFeatures';
import { SurfaceVisualizer } from './Visualizer';

/**
 * EqFieldVisualizer — three.js（3D）のリッチサンプル：3Dイコライザ原を上空から。
 *
 * 一面に敷き詰めた無数の柱（InstancedMesh＝数千本を1描画）が、中心からの距離＝周波数で波打つ。
 * 上空をカメラがゆっくり旋回する。前進系・中央定点系と差別化する「俯瞰スペクトラム」枠。
 *   - spectrum → 各柱の高さ（同心円状のEQ）、bass → 全体のうねり、beat → 中心発光、tonalAngle → 色。
 * ネオンの加算合成＋フォグで、遠方が消えて透過を保つ。用語は docs/visualizer-basics.md。
 * ※ three.js 同梱でビルドは増える（許容）。
 */

const GRID = 44;              // 一辺のセル数（GRID×GRID 本）
const SPACING = 3.0;          // セル間隔
const HEIGHT = 30;            // 柱の最大高さ

export default class EqFieldVisualizer implements SurfaceVisualizer {
  readonly id = 'eq-field';
  readonly name = 'EQ Field (Three.js)';
  readonly author = 'VisualiEXr';
  readonly description = 'three.js：俯瞰の3Dイコライザ原';
  readonly order = 72;

  private container: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private mesh: THREE.InstancedMesh | null = null;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private cellX: Float32Array = new Float32Array(0);
  private cellZ: Float32Array = new Float32Array(0);
  private cellBin: Float32Array = new Float32Array(0); // 中心からの距離→周波数（0..1）

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
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const span = GRID * SPACING;
    scene.fog = new THREE.Fog(0x000000, span * 0.4, span * 1.3); // 遠方を黒へ＝加算で消える
    this.scene = scene;

    // ライト：立方体の上面/側面に明暗を付けて、同色の隣同士でも輪郭が分かるようにする。
    scene.add(new THREE.AmbientLight(0xffffff, 0.45)); // 環境光は控えめ＝陰影のコントラストを残す
    const dir = new THREE.DirectionalLight(0xffffff, 1.3);
    dir.position.set(0.6, 1.0, 0.35);
    scene.add(dir);

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 400);
    this.camera = camera;

    const count = GRID * GRID;
    const boxGeo = new THREE.BoxGeometry(SPACING * 0.55, 1, SPACING * 0.55); // 間隔を少し広げて分離
    // 陰影の付くLambert＋通常合成＋depthWrite：手前が奥を隠し、面の明暗で立方体が立体に見える。
    // opacity 0.9＝半透過（下の動画が薄く透ける）。
    const mat = new THREE.MeshLambertMaterial({
      transparent: true, opacity: 0.9, blending: THREE.NormalBlending, depthWrite: true, fog: true,
    });
    const mesh = new THREE.InstancedMesh(boxGeo, mat, count);
    mesh.frustumCulled = false;
    this.mesh = mesh;
    scene.add(mesh);

    // セル配置（中心を原点に）と、中心からの距離→周波数マップ
    this.cellX = new Float32Array(count);
    this.cellZ = new Float32Array(count);
    this.cellBin = new Float32Array(count);
    const half = (GRID - 1) / 2;
    const maxDist = Math.hypot(half, half);
    let k = 0;
    for (let iz = 0; iz < GRID; iz++) {
      for (let ix = 0; ix < GRID; ix++) {
        this.cellX[k] = (ix - half) * SPACING;
        this.cellZ[k] = (iz - half) * SPACING;
        this.cellBin[k] = Math.hypot(ix - half, iz - half) / maxDist; // 0=中心 .. 1=端
        k++;
      }
    }
  }

  frame(f: AudioFeatures): void {
    if (!this.renderer || !this.scene || !this.camera || !this.mesh) return;
    this.resize();
    this.t += 0.016;

    const spec = f.spectrum;
    const usable = Math.floor(spec.length * 0.5); // 低〜中域を同心円に割り当て
    const beatBoost = f.beat ? 1 : 0;

    for (let i = 0; i < this.cellBin.length; i++) {
      const bin = Math.min(usable - 1, Math.floor(this.cellBin[i] * usable));
      let v = spec[bin] / 255;                          // 0..1
      v = v * (0.85 + f.bass * 0.5);                    // 低音で全体をうねらせる
      const hgt = Math.max(0.4, v * HEIGHT + beatBoost * (1 - this.cellBin[i]) * 6); // 中心ほど拍で伸びる

      this.dummy.position.set(this.cellX[i], hgt / 2, this.cellZ[i]);
      this.dummy.scale.set(1, hgt, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);

      // 色：彩度高め。明度はライトの陰影ぶんを見込んで中庸に（分離は陰影が担当）。
      this.color.setHSL((f.tonalAngle + this.cellBin[i] * 0.25) % 1, 0.85, 0.42 + v * 0.18);
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // カメラ：上空をゆっくり旋回
    const a = this.t * 0.12;
    const dist = GRID * SPACING * 0.62;
    this.camera.position.set(Math.sin(a) * dist, 42 + f.bass * 8, Math.cos(a) * dist);
    this.camera.lookAt(0, 4, 0);

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
    this.mesh?.geometry.dispose();
    (this.mesh?.material as THREE.Material)?.dispose();
    this.mesh?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.mesh = null;
    this.container = null;
  }
}
