import * as THREE from 'three';
import { AudioFeatures } from '../audio/AudioFeatures';
import { SurfaceVisualizer } from './Visualizer';

/**
 * CyberFlightVisualizer — three.js（3D）のリッチ／SFサンプル：サイバーシティのドライブ。
 *
 * EDMのVJ風。床グリッド（＝走っている道）と、両脇に立つワイヤーフレームの**ビル群**が
 * 手前へ流れていき、構造物の中を進む景色を作る。拍/キックで攻殻機動隊風の**円形HUD**が
 * 奥から生まれて手前へ飛んでくる。
 *   - bass → 前進スピード＆カメラの揺れ、tonalAngle → 色相、beat/kick → HUD出現＆発光。
 *   - chill と逆の「音で攻める」枠なので、動きを積極的に音で駆動する。
 * 透過を保つため、黒フォグ＋加算合成で遠方が黒（＝加算では透明）へフェードする方式（ブルーム不使用）。
 *
 * three.js の強み＝奥行き・パース・大量オブジェクトのリサイクル。用語は docs/visualizer-basics.md。
 * ※ three.js 同梱でビルドは増える（許容の上で採用）。
 */

const FAR = -720;            // 生成の最奥（z）
const NEAR = 30;             // これより手前に来たら奥へ戻す（カメラは z≈0）
const GROUND_Y = -16;        // 床の高さ
const CEIL_Y = 24;           // 天井の高さ（床の反射＝同じグリッドを上にミラー）
const ROAD_HALF = 16;        // 道の半幅（この外側にビルが建つ）
const GRID_HALF = 80;        // 床/天井グリッドの半幅
const GROUND_ROWS = 46;      // 手前へ流れる横線の数
const GROUND_SPACING = Math.abs(FAR) / GROUND_ROWS;
const BUILDING_COUNT = 34;   // 両脇のビルの総数
const HUD_POOL = 6;          // 円形HUDの同時最大数

interface Hud {
  group: THREE.Group;
  mats: THREE.LineBasicMaterial[];
  arcs: THREE.Object3D[];
  active: boolean;
  spin: number;
}

export default class CyberFlightVisualizer implements SurfaceVisualizer {
  readonly id = 'cyber-flight';
  readonly name = 'Cyber Flight (Three.js)';
  readonly author = 'VisualiEXr';
  readonly description = 'three.js：サイバーシティを進む。円形HUDが飛来';
  readonly order = 71;

  private container: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;

  private buildings: THREE.Group[] = [];
  private boxGeo: THREE.BoxGeometry | null = null;
  private boxEdges: THREE.EdgesGeometry | null = null;
  private edgeMat: THREE.LineBasicMaterial | null = null;
  private fillMat: THREE.MeshLambertMaterial | null = null;
  private groundLines: THREE.LineSegments[] = [];
  private groundMat: THREE.LineBasicMaterial | null = null;
  private groundFill: THREE.MeshLambertMaterial | null = null;
  private huds: Hud[] = [];

  private w = 0;
  private h = 0;
  private t = 0;
  private hudCooldown = 0;
  private shake = 0;

  mount(container: HTMLElement): void {
    this.container = container;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.w = w;
    this.h = h;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0); // 背景は透明（動画を透かす）
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 40, Math.abs(FAR) * 0.92); // 遠方を黒へ＝加算で消える
    this.scene = scene;

    // ライト：面（Lambert）に陰影を付けて「塊」に見せる（線/点の Basic 素材には影響しない）。
    scene.add(new THREE.AmbientLight(0x223344, 1.2));
    const dir = new THREE.DirectionalLight(0x88bbff, 1.4);
    dir.position.set(0.5, 1.0, 0.25);
    scene.add(dir);

    const camera = new THREE.PerspectiveCamera(72, w / h, 0.1, 900);
    camera.position.set(0, 2, 0);
    this.camera = camera;

    // ── 床グリッド ───────────────────────────────────────────────
    this.groundMat = new THREE.LineBasicMaterial({
      color: 0x2266aa, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    });
    // 半透明の床面＆天井面（立体感＝上下があるという手掛かり）。天井は床のミラー。
    this.groundFill = new THREE.MeshLambertMaterial({
      color: 0x08243a, transparent: true, opacity: 0.6,
      blending: THREE.NormalBlending, depthWrite: false, fog: true, side: THREE.DoubleSide,
    });
    const planeGeo = new THREE.PlaneGeometry(GRID_HALF * 2, Math.abs(FAR));
    const floor = new THREE.Mesh(planeGeo, this.groundFill);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, GROUND_Y - 0.2, (NEAR + FAR) / 2);
    scene.add(floor);
    const ceil = new THREE.Mesh(planeGeo, this.groundFill);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, CEIL_Y + 0.2, (NEAR + FAR) / 2);
    scene.add(ceil);
    // 縦レール（z方向・静止）：道の連続感。床と天井の両方に。
    const rails: number[] = [];
    for (let x = -GRID_HALF; x <= GRID_HALF; x += 8) {
      rails.push(x, GROUND_Y, NEAR, x, GROUND_Y, FAR);
      rails.push(x, CEIL_Y, NEAR, x, CEIL_Y, FAR);
    }
    const railGeo = new THREE.BufferGeometry();
    railGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rails), 3));
    scene.add(new THREE.LineSegments(railGeo, this.groundMat));
    // 横線（x方向・手前へ流れる）：スピード感。1本の線材で床と天井を同時に描く。
    const rowGeo = new THREE.BufferGeometry();
    rowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -GRID_HALF, GROUND_Y, 0, GRID_HALF, GROUND_Y, 0,
      -GRID_HALF, CEIL_Y, 0, GRID_HALF, CEIL_Y, 0,
    ]), 3));
    for (let i = 0; i < GROUND_ROWS; i++) {
      const line = new THREE.LineSegments(rowGeo, this.groundMat);
      line.position.z = -GROUND_SPACING * i;
      scene.add(line);
      this.groundLines.push(line);
    }

    // ── ビル群（両脇。単位キューブ＝半透明の面＋ネオンのエッジ。Group をスケール）──────
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.boxEdges = new THREE.EdgesGeometry(this.boxGeo);
    this.fillMat = new THREE.MeshLambertMaterial({
      color: 0x0a2a44, transparent: true, opacity: 0.8,
      blending: THREE.NormalBlending, depthWrite: false, fog: true,
    });
    this.edgeMat = new THREE.LineBasicMaterial({
      color: 0x33ddff, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    });
    for (let i = 0; i < BUILDING_COUNT; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(this.boxGeo, this.fillMat)); // 半透明の面（陰影で立体感）
      g.add(new THREE.LineSegments(this.boxEdges, this.edgeMat)); // ネオンの輪郭
      this.recycleBuilding(g, true);
      scene.add(g);
      this.buildings.push(g);
    }

    // ── 円形HUDのプール（最初は非表示）──
    for (let i = 0; i < HUD_POOL; i++) {
      const hud = this.buildHud();
      hud.group.visible = false;
      scene.add(hud.group);
      this.huds.push(hud);
    }
  }

  frame(f: AudioFeatures): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.resize();
    const dt = 0.016;
    this.t += dt;

    // 前進スピード：一定の基準＋低音でわずかに加速（BPM連動はしない＝推定が飛ぶと破綻するため）。
    const speed = (65 + f.bass * 120) * dt;

    // ── 床の横線を手前へ流し、抜けたら最奥へ ──
    for (const line of this.groundLines) {
      line.position.z += speed;
      if (line.position.z > NEAR) line.position.z -= GROUND_ROWS * GROUND_SPACING;
    }

    // ── ビルを手前へ流し、通り過ぎたら奥で作り直す ──
    for (const b of this.buildings) {
      b.position.z += speed;
      if (b.position.z > NEAR) this.recycleBuilding(b, false);
    }

    // ── 色（調性）──
    const hue = f.tonalAngle;
    this.edgeMat?.color.setHSL(hue, 0.7, 0.55 + (f.beat ? 0.12 : 0)); // ネオンの輪郭
    this.fillMat?.color.setHSL(hue, 0.6, 0.16);                        // 面は暗めの色かぶり＝塊感
    this.groundMat?.color.setHSL(hue, 0.6, 0.4);
    this.groundFill?.color.setHSL(hue, 0.6, 0.12);

    // ── HUD 出現（拍/キックで、クールダウン付き）──
    this.hudCooldown -= dt;
    if ((f.kick || f.beat) && this.hudCooldown <= 0) {
      this.spawnHud(f);
      this.hudCooldown = 0.22;
    }
    for (const hud of this.huds) {
      if (!hud.active) continue;
      const g = hud.group;
      g.position.z += speed * 1.25;
      g.rotation.z += hud.spin;
      hud.arcs.forEach((a, k) => { a.rotation.z += (k % 2 ? -1 : 1) * 0.03; });
      const dist = NEAR - g.position.z;
      const op = Math.max(0, Math.min(0.95, dist / 120));
      hud.mats.forEach((m) => { m.opacity = op; });
      if (g.position.z > NEAR + 8) { hud.active = false; g.visible = false; }
    }

    // ── カメラ：低音でロール/上下、キックで軽くシェイク ──
    if (f.kick) this.shake = 1;
    this.shake *= 0.85;
    this.camera.rotation.z = Math.sin(this.t * 0.25) * 0.06 + (Math.random() - 0.5) * 0.03 * this.shake;
    this.camera.position.x = Math.sin(this.t * 0.2) * 3;
    this.camera.position.y = 2 + Math.cos(this.t * 0.17) * 1.2 + f.bass * 1.5;

    this.renderer.render(this.scene, this.camera);
  }

  // ── 生成ヘルパー ─────────────────────────────────────────────

  /** ビルを奥でランダムに作り直す（両脇、道の外側に建つ）。 */
  private recycleBuilding(b: THREE.Group, anywhere: boolean): void {
    const w = 6 + Math.random() * 16;
    const d = 6 + Math.random() * 16;
    const hgt = 10 + Math.random() * 52;
    b.scale.set(w, hgt, d);
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * (ROAD_HALF + 2 + Math.random() * 52);
    const z = anywhere ? -Math.random() * Math.abs(FAR) : FAR + Math.random() * 60;
    b.position.set(x, GROUND_Y + hgt / 2, z); // 底を床に接地
    b.rotation.y = (Math.random() - 0.5) * 0.4;
  }

  private circleLoop(radius: number, seg: number, mat: THREE.LineBasicMaterial): THREE.LineLoop {
    const p = new Float32Array(seg * 3);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      p[i * 3] = Math.cos(a) * radius;
      p[i * 3 + 1] = Math.sin(a) * radius;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return new THREE.LineLoop(g, mat);
  }

  private ticks(r0: number, r1: number, count: number, mat: THREE.LineBasicMaterial): THREE.LineSegments {
    const p = new Float32Array(count * 2 * 3);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      p[i * 6] = c * r0; p[i * 6 + 1] = s * r0;
      p[i * 6 + 3] = c * r1; p[i * 6 + 4] = s * r1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return new THREE.LineSegments(g, mat);
  }

  private arcLine(radius: number, a0: number, a1: number, seg: number, mat: THREE.LineBasicMaterial): THREE.Line {
    const p = new Float32Array((seg + 1) * 3);
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg);
      p[i * 3] = Math.cos(a) * radius;
      p[i * 3 + 1] = Math.sin(a) * radius;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return new THREE.Line(g, mat);
  }

  /** 攻殻風の円形HUD（同心円＋目盛り＋回る弧＋クロスヘア）。 */
  private buildHud(): Hud {
    const group = new THREE.Group();
    const mats: THREE.LineBasicMaterial[] = [];
    const newMat = (opacity: number): THREE.LineBasicMaterial => {
      const m = new THREE.LineBasicMaterial({
        color: 0x66ffff, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      });
      mats.push(m);
      return m;
    };

    const mMain = newMat(0.9);
    group.add(this.circleLoop(10, 96, mMain));
    group.add(this.circleLoop(7.2, 72, mMain));
    group.add(this.ticks(9.4, 10.6, 48, mMain));

    const cross = new Float32Array([-3, 0, 0, 3, 0, 0, 0, -3, 0, 0, 3, 0]);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(cross, 3));
    group.add(new THREE.LineSegments(cg, mMain));

    const mArc = newMat(0.85);
    const arc1 = this.arcLine(12.5, 0, Math.PI * 0.65, 40, mArc);
    const arc2 = this.arcLine(12.5, Math.PI, Math.PI * 1.55, 40, mArc);
    const arc3 = this.arcLine(5.6, Math.PI * 0.2, Math.PI * 1.1, 32, mArc);
    group.add(arc1, arc2, arc3);

    return { group, mats, arcs: [arc1, arc2, arc3], active: false, spin: 0 };
  }

  private spawnHud(f: AudioFeatures): void {
    const hud = this.huds.find((h) => !h.active);
    if (!hud) return;
    hud.active = true;
    hud.group.visible = true;
    hud.group.position.set((Math.random() - 0.5) * 26, 2 + (Math.random() - 0.5) * 16, FAR * 0.72);
    hud.group.rotation.z = Math.random() * Math.PI;
    hud.group.scale.setScalar(0.7 + Math.random() * 0.6);
    hud.spin = (Math.random() - 0.5) * 0.04;
    const hue = (f.tonalAngle + 0.5) % 1;
    hud.mats.forEach((m) => m.color.setHSL(hue, 0.8, 0.6));
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
    this.scene?.traverse((o) => {
      const any = o as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material };
      any.geometry?.dispose?.();
      any.material?.dispose?.();
    });
    this.boxEdges?.dispose();
    this.boxGeo?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.buildings = [];
    this.boxGeo = null;
    this.boxEdges = null;
    this.edgeMat = null;
    this.fillMat = null;
    this.groundLines = [];
    this.groundMat = null;
    this.groundFill = null;
    this.huds = [];
    this.container = null;
  }
}
