**English** | [日本語](README.ja.md)

<p align="center"><img src="img/visualiexr_logo.png" alt="VisualiEXr logo" width="120"></p>

# VisualiEXr

**[▶ Try the live demo](https://yager.github.io/VisualiEXr/)** — no install required, reacts to your microphone/tab audio right in the browser.

VisualiEXr is a Chrome extension that overlays **graphics that react to the audio of the YouTube video you're watching** (the name is a play on "Visualizer" with the extension's "EX", pronounced "visualizer"). The same core also powers a standalone (Electron) build and a browser-only web demo — no install needed for the latter.

The goal is to make it possible to **freely add visualizers as plugins**, and it's built from scratch while taking cues from existing extensions.

At the center of it all is a single, simple flow: **convert the audio into easy-to-use numbers before handing them to plugins**.

```
YouTube audio → feature engine → AudioFeatures (a value set normalized to 0–1) → plugin draws
```

Plugins don't need to know anything about audio analysis — you can draw something that reacts to sound just by **multiplying a number**, e.g. `features.bass * canvas.height`.

---

## Quick start

There are three hosts. `npm install` → `npm run build` outputs all of them (`dist-extension/` = extension, `dist-app/` = Electron, `dist-web/` = web demo).

### A. Chrome extension (YouTube overlay)
1. In Chrome, go to `chrome://extensions` → turn on "Developer mode"
2. Click "Load unpacked" → select `dist-extension/`
3. Play something on YouTube → use the **⚙ in the top-right of the video** to switch visualizers / turn it **Off**. Your selection is saved and restored next time.

### B. Standalone (VJ / projector / OBS)
```bash
npm install   # once, includes electron
npm start     # build → launch Electron (output window + control window)
```
- **Output window** = fullscreen canvas (for a projector, or an OBS window capture)
- **Control window** = for your eyes only. Select input device, switch visualizers, Off (not shown to the audience)
- Fully local (localhost, no network needed). Takes input from a microphone/line-in/virtual device (e.g. BlackHole)

### C. Web live demo (no install)
A demo plus official landing page that runs on static hosting such as GitHub Pages, reacting to microphone/tab audio (`src/hosts/web/`).
```bash
npm run build
npm run serve:web   # = npx serve dist-web (for local checks)
```
See [`.github/workflows/deploy-web.yml`](.github/workflows/deploy-web.yml) for publishing to GitHub Pages
(requires a one-time manual step: set the repository's Settings > Pages > Source to "GitHub Actions").

Type checking: `npm run typecheck`. **To add a plugin, just drop a `~Visualizer.ts` file into [`src/visualizers/`](src/visualizers) and build** — it's automatically added to the list (see [docs/architecture.md](docs/architecture.md#how-to-add-a-new-plugin) for how).

---

## Documentation

| Document | Content |
|------|------|
| [docs/audio-basics.md](docs/audio-basics.md) (Japanese) | **Audio fundamentals** (frequency, FFT, harmonics, logarithms, key, rhythm, etc.). An introduction you can read top to bottom even without a music background. |
| [docs/visualizer-basics.md](docs/visualizer-basics.md) (Japanese) | **Rendering fundamentals** (shaders, WebGL, GLSL, three.js/PixiJS, particles, etc.). Explains CG/game-dev vocabulary for web developers. |
| [docs/features.md](docs/features.md) | **AudioFeatures reference**. The complete definition of the value set passed to plugins, plus an explanation of the debug display. |
| [docs/architecture.md](docs/architecture.md) | **Design**. The feature engine, normalization policy, plugin mechanism, build/runtime. |
| [docs/original-extension.md](docs/original-extension.md) (Japanese) | Notes on the **original extension** this project drew inspiration from. |

If you want to understand the sound side first, start with audio-basics; for rich rendering (shaders/WebGL), visualizer-basics; for the available materials, features; and for the internals, architecture. Reading in that order tends to work well.

---

## Repository layout (overview)

| Path | Role |
|------|------|
| `src/audio/` | The feature engine (`FeatureEngine` → `AudioFeatures`) and helpers (`AutoGain` / `TempoTracker`) |
| `src/visualizers/` | Plugins and their contract (`Visualizer`), plus samples (`Analyzer` / `Bars` / `Circle` / `Plasma Scope` / `Plasma Ball` / `Lo-Fi Rain` / `Flow Field` / `PixiNeon` / `Fireworks` / `ThreeTerrain` / `Cyber Flight` / `EQ Field` / `Kaleido Glass` / `Chroma Flow` / `Tunnel` / `Water Caustics`) |
| `src/app/` | The runtime core (input/output-agnostic): `AudioGraph` / `Stage` (`VideoStage`/`WindowStage`) / `VisualizerApp` / `registry` |
| `src/hosts/extension/` | The extension host (YouTube video input + video overlay) |
| `src/hosts/standalone/` | The standalone host (microphone input + fullscreen output + control window) |
| `src/hosts/web/` | The web host (static hosting such as GitHub Pages, microphone/tab-audio input + a single-page landing page and demo) |
| `electron/main.cjs` | The Electron main process (serves over localhost + two windows) |
| `public/manifest.json`, `build.mjs`, `gen-plugins.mjs` | The extension manifest, esbuild build, and automatic plugin registration |

See [docs/architecture.md](docs/architecture.md#how-to-add-a-new-plugin) for how to write a new visualizer.

---

## License

MIT License ([LICENSE](LICENSE)). Free to use, modify, redistribute, and use commercially (the only condition is including the copyright notice; no warranty).
Plugins are welcome in the same spirit — add your credit in `author` and share freely.

Attribution for the bundled third-party libraries (three.js / PixiJS / pixi-filters, all MIT) is collected in
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

---

## Support & sponsorship

VisualiEXr is free and open source. If you'd like to support continued development, donations of any amount are welcome (no goods or services are provided in return).

- Donate (Stripe): <https://donate.stripe.com/7sY3cw6r7aaI7rIczv18c00>
- GitHub Sponsors: via the **Sponsor** button at the top of the repository (once enabled)

For legal notices, see the web version's (GitHub Pages) [privacy policy / terms of use / commercial transactions act disclosure](https://yager.github.io/VisualiEXr/legal/support/).
