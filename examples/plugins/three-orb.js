// three.js（WebGL）を使うランタイムプラグインのサンプル（スタンドアロン版専用）。
//
// これは「自前の描画面を持つプラグイン（SurfaceVisualizer）」の例：
//   mount(container) で自分の WebGL キャンバスを作り、frame(features) で GPU 描画する。
// three.js はアプリが window.MV.THREE で提供する（プラグインに同梱不要）。
//
// 使い方: このファイルをプラグインフォルダにコピー →「再読み込み」→ 一覧に "Three Orb (folder)"。

const THREE = window.MV.THREE;

export default class ThreeOrb {
  id = 'three-orb';
  name = 'Three Orb (folder)';

  mount(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    this.camera.position.z = 3.2;

    this.mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: 0x3388ff, flatShading: true, roughness: 0.5 }),
    );
    this.scene.add(this.mesh);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x223355, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(2, 3, 4);
    this.scene.add(dir);

    this._w = 0; this._h = 0;
    this._resize();
  }

  frame(f) {
    this._resize();
    const s = 1 + f.bass * 1.4 + (f.beat ? 0.25 : 0);
    this.mesh.scale.setScalar(s);
    this.mesh.rotation.y += 0.01 + f.flux * 0.12;
    this.mesh.rotation.x += 0.006;
    this.mesh.material.color.setHSL(f.tonalAngle, 0.4 + 0.6 * f.tonalStrength, 0.55);
    this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    if (w === this._w && h === this._h) return;
    this._w = w; this._h = h;
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  unmount() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
