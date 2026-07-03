import { AudioGraph } from './AudioGraph';
import { Stage, SURFACE_STYLE } from './Stage';
import { AnyVisualizer, Visualizer, VisualizerContext, isSurfaceVisualizer } from '../visualizers/Visualizer';
import { VisualizerRegistry } from './registry';

/**
 * VisualizerApp — 実行コアの束ね役。
 *
 * graph（音声）と stage（描画の置き場）を注入され、「現在のプラグイン」を差し替えながら
 * ループを回す。プラグインは2種類あり、両方を扱う：
 *  - 2D（Visualizer）        … ホストが 2D canvas を用意して draw(features, ctx) を呼ぶ
 *  - 自前描画面（SurfaceVisualizer）… プラグインが container に自分の canvas を作り frame() で描く
 */
export class VisualizerApp {
  private current: AnyVisualizer | null = null;
  private currentId = '';
  private raf = 0;
  private running = false;

  // 2Dプラグイン用にホストが用意するキャンバス一式
  private canvas2d: HTMLCanvasElement | null = null;
  private view2d: VisualizerContext | null = null;

  constructor(
    private graph: AudioGraph,
    private readonly stage: Stage,
    private readonly registry: VisualizerRegistry,
  ) {}

  replaceGraph(graph: AudioGraph): void {
    if (graph === this.graph) return;
    this.graph.dispose();
    this.graph = graph;
  }

  setVisualizer(id: string): void {
    if (id === this.currentId && this.current) return;
    this.currentId = id;
    if (this.running) this.remount();
  }

  setOptions(opts: Record<string, unknown>): void {
    this.current?.setOptions?.(opts);
  }

  get visualizerId(): string { return this.currentId; }
  get isRunning(): boolean { return this.running; }

  start(): void {
    if (this.running) return;
    this.running = true;
    if (!this.current) this.remount();
    const loop = () => {
      this.stage.fit();
      const features = this.graph.update();
      const v = this.current;
      if (v) {
        if (isSurfaceVisualizer(v)) {
          v.frame(features);
        } else {
          this.size2D();
          v.draw(features, this.view2d!);
        }
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.teardownCurrent(); // 描画面を外して画面を消す（Off）
  }

  dispose(): void {
    this.stop();
    this.stage.dispose();
    this.graph.dispose();
  }

  /** 現在のプラグインを生成して描画面を用意する。 */
  private remount(): void {
    this.teardownCurrent();
    const v = this.registry.create(this.currentId);
    if (!v) { console.warn(`Visualizer "${this.currentId}" は未登録`); return; }

    if (isSurfaceVisualizer(v)) {
      v.mount(this.stage.container);
    } else {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = SURFACE_STYLE;
      this.stage.container.appendChild(canvas);
      const ctx = canvas.getContext('2d')!;
      this.canvas2d = canvas;
      const stage = this.stage;
      this.view2d = {
        canvas, ctx,
        get width() { return stage.width; },
        get height() { return stage.height; },
      };
      (v as Visualizer).init?.(this.view2d);
    }
    this.current = v;
  }

  /** 現在のプラグインの描画面を片付ける。 */
  private teardownCurrent(): void {
    const v = this.current;
    if (v) {
      if (isSurfaceVisualizer(v)) v.unmount();
      else (v as Visualizer).dispose?.();
    }
    this.canvas2d?.remove();
    this.canvas2d = null;
    this.view2d = null;
    this.current = null;
  }

  /** 2Dキャンバスのバッキングストアを container サイズ×DPR に合わせる。 */
  private size2D(): void {
    const canvas = this.canvas2d;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.stage.width * dpr));
    const h = Math.max(1, Math.round(this.stage.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
