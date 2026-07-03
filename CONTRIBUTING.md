**English** | [日本語](CONTRIBUTING.ja.md)

# Contributing guide

Contributions to VisualiEXr are welcome. Adding a **visualizer (plugin)** in particular
is a great first step, since you can add new work without touching the core.

- Design overview → [README.md](README.md)
- How to write a plugin (in detail) → [docs/architecture.md](docs/architecture.md#how-to-add-a-new-plugin)
- The audio material you can use (AudioFeatures) → [docs/features.md](docs/features.md)

---

## Development setup

```bash
npm install        # fetch dependencies (includes electron / three / pixi)
npm run typecheck  # type check (gen-plugins.mjs → tsc)
npm run build      # outputs the extension (dist-extension/) and Electron (dist-app/)
npm start          # build → launch Electron (output + control windows)
```

To check the extension: `chrome://extensions` → turn on "Developer mode" →
"Load unpacked" → select `dist-extension/`.

---

## Adding a visualizer (plugin)

**Just add a single `~Visualizer.ts` file to `src/visualizers/`** — registration and addition to the ⚙ menu happen automatically
([`gen-plugins.mjs`](gen-plugins.mjs) generates `plugins.generated.ts`).

### Only two rules
1. Name the file `~Visualizer.ts`
2. Use `export default class`

### Two plugin types
- **2D (`Visualizer`)**: just write `draw(features, { ctx, width, height })`. The host provides a Canvas2D. Easy to write.
- **Custom surface (`SurfaceVisualizer`)**: `mount(container) / frame(features) / unmount()`.
  You build your own canvas/renderer. For rich rendering with WebGL, three.js, or PixiJS.

See the contract at [`src/visualizers/Visualizer.ts`](src/visualizers/Visualizer.ts),
and reference examples at
[`BarsVisualizer.ts`](src/visualizers/BarsVisualizer.ts) (2D) and
[`ThreeTerrainVisualizer.ts`](src/visualizers/ThreeTerrainVisualizer.ts) (Surface).

### Things to keep in mind
- **You don't need to know anything about audio analysis.** Multiplying by `features` (values normalized to 0–1) is enough to make it react to sound
  (the exception is `loudestHz`, a raw Hz value). The full range and meaning of each field is in [docs/features.md](docs/features.md).
- `id` must be unique within the project (it becomes the `storage` key). `name` is the display name in the ⚙ menu.
- Feel free to add your own credit in `author` (it appears in the tooltip).
- Keep `constructor` light (one instance is built as a trial at registration time). Do heavy setup in `init()` (2D) / `mount()` (Surface) instead.
- **Don't break the transparency** of the extension overlay: for three.js-based plugins, avoid EffectComposer bloom, and
  express glow using additive blending + fog instead (follow the existing three.js samples).
- If you add a **new file** while `npm run watch` is running, restart watch (to regenerate the registration). Editing existing files reloads automatically.

---

## Before opening a pull request

- `npm run typecheck` must pass.
- Confirm that new plugins actually render, in either the extension or the standalone build.
- Please add a short note about the intent of the change to the PR description (especially if there's a behavior change).

## License

By contributing code, you agree that it will be released under the same **MIT License** ([LICENSE](LICENSE))
as this project.
