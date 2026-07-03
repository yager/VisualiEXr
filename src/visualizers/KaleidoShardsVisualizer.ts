import * as THREE from 'three';
import { AudioFeatures } from '../audio/AudioFeatures';
import { SurfaceVisualizer } from './Visualizer';

/**
 * KaleidoShardsVisualizer — three.js（3D）のリッチサンプル：万華鏡＝ステンドグラス。
 *
 * 半透明の色パネル（多角形）を放射状に多数重ね、レイヤーが重なって色が混ざる“ステンドグラス”を作る。
 * 加算合成をやめ**通常合成**にすることで色が飽和（白飛び）せず、重なるほど深い色になる。
 *   - bass → パネルの拡大、beat → 外へ展開＆回転ブースト、flux → 回転速度、tonalAngle → 色相の基準。
 * パネル間の隙間から下の動画が透けて“鉛線”のように見える。用語は docs/visualizer-basics.md。
 * ※ three.js 同梱でビルドは増える（許容）。
 */

const SYM = 18;    // 1リングあたりのパネル数（放射対称）
const LAYERS = 6;  // 重なるレイヤー数

export default class KaleidoShardsVisualizer implements SurfaceVisualizer {
  readonly id = 'kaleido-shards';
  readonly name = 'Kaleido Glass (Three.js)';
  readonly author = 'VisualiEXr';
  readonly description = 'three.js：半透明パネルが重なる万華鏡ステンドグラス';
  readonly order = 73;

  private container: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private mesh: THREE.InstancedMesh | null = null;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  private w = 0;
  private h = 0;
  private t = 0;
  private spin = 0;
  private expand = 0;

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

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 300);
    camera.position.set(0, 0, 66);
    this.camera = camera;

    // 平らな六角パネル（ガラス片）。通常合成＋半透明で、重なると色が混ざる。
    const pane = new THREE.CircleGeometry(4.2, 6);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.5, blending: THREE.NormalBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(pane, mat, SYM * LAYERS);
    mesh.frustumCulled = false;
    this.mesh = mesh;
    scene.add(mesh);
  }

  frame(f: AudioFeatures): void {
    if (!this.renderer || !this.scene || !this.camera || !this.mesh) return;
    this.resize();
    this.t += 0.016;

    this.spin += 0.003 + f.flux * 0.015;
    if (f.beat) this.expand = 1;
    this.expand *= 0.9;
    const pulse = 1 + f.bass * 0.3 + this.expand * 0.3;

    let idx = 0;
    for (let layer = 0; layer < LAYERS; layer++) {
      const lr = 3 + layer * 6.2 + this.expand * 4 * (layer + 1);         // レイヤーごとの半径
      const lrot = this.spin * (layer % 2 === 0 ? 1 : -1) * (1 + layer * 0.12); // 交互に逆回転
      const paneScale = pulse * (1.3 + layer * 0.18);
      for (let s = 0; s < SYM; s++) {
        const a = (s / SYM) * Math.PI * 2 + lrot + (layer % 2) * (Math.PI / SYM);
        this.dummy.position.set(Math.cos(a) * lr, Math.sin(a) * lr, layer * 0.5);
        this.dummy.rotation.set(0, 0, a + this.t * 0.15); // 面内で回して重なりを変化させる
        this.dummy.scale.setScalar(paneScale);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(idx, this.dummy.matrix);

        // 色：調性ベース＋レイヤー/角度で変える（重なりで混色＝ステンドグラス）
        this.color.setHSL((f.tonalAngle + layer * 0.13 + (s / SYM) * 0.25) % 1, 0.85, 0.5);
        this.mesh.setColorAt(idx, this.color);
        idx++;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // 全体をゆっくり回して万華鏡感を増す
    this.camera.rotation.z = this.t * 0.04;

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
