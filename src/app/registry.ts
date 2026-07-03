import { AnyVisualizer, VisualizerFactory } from '../visualizers/Visualizer';

/**
 * VisualizerRegistry — プラグインの登録簿。
 *
 * 生成関数（factory）を登録しておき、必要なときにIDから生成する。
 * `id` / `name` は factory が作る1個から読むので、登録は factory を渡すだけ。
 * 実際の登録はビルド時に自動生成される（plugins.generated.ts）。
 */
interface Entry {
  name: string;
  order: number;
  author?: string;
  description?: string;
  create: VisualizerFactory;
}

/** UI 一覧の1項目（メニュー表示に必要なメタ）。 */
export interface VisualizerInfo {
  id: string;
  name: string;
  author?: string;
  description?: string;
}

export class VisualizerRegistry {
  private readonly factories = new Map<string, Entry>();

  /** プラグインを登録する。id / name / order / author / description は生成した1個から取る。 */
  register(create: VisualizerFactory): void {
    const v = create(); // 試作して id/name/order 等を読む（constructor は軽く保つ）
    const { id, name, author, description } = v;
    const order = v.order ?? 1000; // 未指定は末尾寄り
    if (this.factories.has(id)) {
      console.warn(`Visualizer "${id}" は既に登録済み。上書きします。`);
    }
    this.factories.set(id, { name, order, author, description, create });
  }

  /** ID からプラグインを生成する。未登録なら null。 */
  create(id: string): AnyVisualizer | null {
    const entry = this.factories.get(id);
    return entry ? entry.create() : null;
  }

  /** 登録済み一覧（UIのメニュー用）。order 昇順 → name 昇順で並べる。 */
  list(): VisualizerInfo[] {
    return [...this.factories.entries()]
      .map(([id, e]) => ({ id, name: e.name, order: e.order, author: e.author, description: e.description }))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map(({ id, name, author, description }) => ({ id, name, author, description }));
  }
}

/** アプリ全体で使う共有レジストリ。 */
export const registry = new VisualizerRegistry();
