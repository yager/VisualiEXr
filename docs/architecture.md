[日本語](architecture.ja.md) | **English**

# Design notes: structure of the plugin-based visualizer

A summary of the design intent and assumptions behind the original build (`src/`).
The goal is a state where **you can write a visualizer without knowing anything about audio analysis**.

Related: [../README.md](../README.md) (overview) / [audio-basics.md](audio-basics.md) (Japanese; audio fundamentals) / [visualizer-basics.md](visualizer-basics.md) (Japanese; rendering fundamentals — shaders/WebGL etc.) / [features.md](features.md) (list of available material)

---

## Overview

```
<video> → AnalyserNode ─┐
TimeDomain ─────────────┴─▶ FeatureEngine.update() (every frame)
                                   │
                                   ▼
                            AudioFeatures   ← a "value set of the sound" normalized to 0–1
                                   │
              ┌──────────┬─────────┼─────────┐
            Bars    Analyzer   custom plugin  …   ← draws by reading only features
```

The core idea is the **"feature bus"**: plugins never touch the raw `AnalyserNode`. They only read
[`AudioFeatures`](../src/audio/AudioFeatures.ts), which `FeatureEngine` builds every frame.

---

## File layout (`src/`)

| File | Role |
|------|------|
| [`src/audio/AudioFeatures.ts`](../src/audio/AudioFeatures.ts) | The type definition for the "value set of the sound" passed to plugins (the common language of this project) |
| [`src/audio/FeatureEngine.ts`](../src/audio/FeatureEngine.ts) | The core that computes AudioFeatures from the AnalyserNode every frame |
| [`src/audio/AutoGain.ts`](../src/audio/AutoGain.ts) | Adaptive gain that squeezes unbounded metrics into 0–1 |
| [`src/audio/TempoTracker.ts`](../src/audio/TempoTracker.ts) | Estimates BPM via autocorrelation of the onset envelope |
| **`src/visualizers/`** | The folder that holds **only plugins and their contract** |
| [`src/visualizers/Visualizer.ts`](../src/visualizers/Visualizer.ts) | The interface (contract) plugins implement |
| [`src/visualizers/BarsVisualizer.ts`](../src/visualizers/BarsVisualizer.ts) | Sample plugin (frequency bars) |
| [`src/visualizers/CircleVisualizer.ts`](../src/visualizers/CircleVisualizer.ts) | Sample plugin (radial bars + waveform + tonal color) |
| [`src/visualizers/PlasmaScopeVisualizer.ts`](../src/visualizers/PlasmaScopeVisualizer.ts) | An electric-discharge-style oscilloscope that rotates the waveform by tonalAngle, plus a center ring (Canvas2D) |
| [`src/visualizers/PlasmaBallVisualizer.ts`](../src/visualizers/PlasmaBallVisualizer.ts) | A fractal-discharge plasma ball (Canvas2D) |
| [`src/visualizers/PixiNeonVisualizer.ts`](../src/visualizers/PixiNeonVisualizer.ts) | A neon effect using PixiJS + pixi-filters (Glow/Shockwave) (custom surface, SurfaceVisualizer) |
| [`src/visualizers/PixiFireworksVisualizer.ts`](../src/visualizers/PixiFireworksVisualizer.ts) | Fireworks (chrysanthemum bursts) using PixiJS's ParticleContainer for large sprite counts |
| [`src/visualizers/CyberFlightVisualizer.ts`](../src/visualizers/CyberFlightVisualizer.ts) | A three.js cyber-city drive with a circular HUD |
| [`src/visualizers/EqFieldVisualizer.ts`](../src/visualizers/EqFieldVisualizer.ts) | A three.js 3D equalizer field (InstancedMesh, orbiting overhead view) |
| [`src/visualizers/KaleidoShardsVisualizer.ts`](../src/visualizers/KaleidoShardsVisualizer.ts) | A three.js kaleidoscope stained-glass effect (overlapping translucent panels) |
| [`src/visualizers/WaterCausticsVisualizer.ts`](../src/visualizers/WaterCausticsVisualizer.ts) | GLSL underwater caustics (translucent, so the video appears to be underwater) |
| [`src/visualizers/LofiRainVisualizer.ts`](../src/visualizers/LofiRainVisualizer.ts) | Chill: city lights through a rainy window (audio only affects texture; translucent) |
| [`src/visualizers/FlowFieldVisualizer.ts`](../src/visualizers/FlowFieldVisualizer.ts) | Chill: particle trails following a flow field (Canvas2D) |
| [`src/visualizers/ThreeTerrainVisualizer.ts`](../src/visualizers/ThreeTerrainVisualizer.ts) | A three.js (3D) flight over audio-driven terrain (custom surface, SurfaceVisualizer) |
| [`src/visualizers/PlasmaVisualizer.ts`](../src/visualizers/PlasmaVisualizer.ts) | "Chroma Flow" — a single-shader GLSL piece where color flows like plasma (raw WebGL, no library, transparent) |
| [`src/visualizers/TunnelVisualizer.ts`](../src/visualizers/TunnelVisualizer.ts) | A single-shader GLSL grid tunnel (raw WebGL, no library, transparent) |
| [`src/visualizers/shaderSurface.ts`](../src/visualizers/shaderSurface.ts) | A reusable base for fullscreen fragment shaders (not `*Visualizer.ts`, so excluded from auto-registration) |
| [`src/visualizers/AnalyzerVisualizer.ts`](../src/visualizers/AnalyzerVisualizer.ts) | An analysis/debug display that lays out AudioFeatures on screen (UI name "Analyzer (All Features)", id=`analyzer`) |
| **`src/app/`** | **The runtime core and mechanisms** (input/output-agnostic) |
| [`src/app/AudioGraph.ts`](../src/app/AudioGraph.ts) | Web Audio wiring + the feature engine. **Supports both video and stream input** (built once per input) |
| [`src/app/Stage.ts`](../src/app/Stage.ts) | The abstract render target `Stage`, plus `VideoStage` (video overlay) / `ViewportStage` (full-viewport overlay for audio-only sites) / `WindowStage` (fullscreen) |
| [`src/app/VisualizerApp.ts`](../src/app/VisualizerApp.ts) | The orchestrator. Has `graph`/`stage` **injected** and switches the current plugin, drives the render loop |
| [`src/app/ControlPanel.ts`](../src/app/ControlPanel.ts) | The ⚙ in the top-right of the video (the overlay UI for the extension host) |
| [`src/app/registry.ts`](../src/app/registry.ts) | The plugin registry (list / create / register) |
| `src/app/plugins.generated.ts` | **Auto-generated** (by gen-plugins.mjs). Collects and registers `visualizers/*Visualizer.ts`. Don't edit by hand |
| [`src/app/settings.ts`](../src/app/settings.ts) | Persists/restores settings (extension = chrome.storage / standalone = localStorage) |
| **`src/hosts/`** | **Hosts (both ends — input and output)**. The layer that assembles the core and starts it up |
| [`src/hosts/extension/content.ts`](../src/hosts/extension/content.ts) | The extension host's entry point: injects into supported sites and assembles them via adapters (site-agnostic) |
| [`src/hosts/extension/adapters.ts`](../src/hosts/extension/adapters.ts) | Per-site adapters (YouTube / YouTube Music): define how to grab the media element, how to overlay it, and where to put the ⚙. Sites without a media element in the DOM (SoundCloud/Bandcamp, etc.) aren't supported by this approach |
| [`src/hosts/standalone/output.ts`](../src/hosts/standalone/output.ts) | Standalone output: microphone/device input + fullscreen output |
| [`src/hosts/standalone/control.ts`](../src/hosts/standalone/control.ts) | Standalone control: the device-selection/switching UI in a separate window |
| [`src/hosts/standalone/bus.ts`](../src/hosts/standalone/bus.ts) | Message definitions between the output and control windows |
| [`electron/main.cjs`](../electron/main.cjs) | The Electron main process: serves over localhost + opens the output/control windows |
| [`src/hosts/web/main.ts`](../src/hosts/web/main.ts) | The web host: microphone/tab-audio input + fullscreen output + a same-page overlay UI (for static hosting such as GitHub Pages; doesn't call the folder-plugin loader) |
| [`src/hosts/web/index.html`](../src/hosts/web/index.html) | The web host's landing page (hero, built-in plugin list, links, the demo's overlay DOM) |

> See [features.md](features.md) for the range, meaning, and rendering hints of each field.

Type checking: `npm run typecheck`, after `npm install`.

---

## Runtime structure (3 layers)

The runtime core is split cleanly into three parts by **lifetime and responsibility** — the foundation that makes adding, switching, and toggling plugins painless.

```
[AudioGraph]  AudioContext / source / analyser / L-R / FeatureEngine
   (once per video. untouched by switching)
        │ features
        ▼
[Stage]  tracks the canvas / video. provides a view (rendering context)
        │
        ▼
[VisualizerApp]  setVisualizer(id) / start() / stop() / setOptions()
   every frame: stage.fit() → graph.update() → current.draw(features, view)
```

- **AudioGraph**: Web Audio wiring and the feature engine. Built once per video/stream input.
- **Stage**: The render target. Swappable between `VideoStage` (video overlay) / `WindowStage` (fullscreen).
- **VisualizerApp**: Has `graph`/`stage` **injected from outside**, and drives the loop while swapping the "current plugin" on top of them.
- **Hosts (`src/hosts/`)**: The layer that prepares these two ends (input = which audio, output = where to draw) and hands them to the App.
  - Extension: video input + VideoStage + ⚙ overlay (ControlPanel)
  - Standalone: microphone/device input + WindowStage + a separate control-window UI
  - Web: microphone/tab-audio input + WindowStage + a same-page overlay UI (static hosting, no folder plugins)

> Because **the core (audio / visualizers / app) is input/output-agnostic**, you can add output destinations —
> YouTube, standalone (projector/OBS), web (a live demo on static hosting), and more — just by adding a host.

### Why we don't rebuild the audio graph (important)
`createMediaElementSource()` can only be called **once per `<video>`** (calling it a second time throws).
So "rebuild everything on every switch" isn't an option. **Keep the audio graph (AudioGraph) alive, and
swap only the plugin being drawn via `VisualizerApp.setVisualizer()`.** This is the main reason for this three-layer split.
(For the same reason, if another audio-related extension grabs the same video first, a later one can't connect and they conflict.)

---

## Design assumptions & policy

### 1. Scalar values are normalized to 0–1 by default
So that plugin authors can just multiply to draw something.
Example: `barHeight = features.bass * canvas.height`.
- **The exception is `loudestHz`** (a raw Hz value). Normalizing it to 0–1 would erase its meaning as a pitch, so it's kept as-is.

### 2. Raw arrays are included too
For drawing that uses "all the bins," like bars or a waveform, `spectrum` (0–255 × 1024 entries) and
`waveform` (−1 to 1) are passed through as-is. Use these alongside the normalized scalars, as appropriate.

### 3. Separate "smoothed values" and "sharp values"
- Smoothed (EMA-smoothed): `rms` `bass` `mid` `treble` `brightness` `flux` `bands`, etc.
  → good for slow pulsing and color changes.
- Sharp (no smoothing): `peak` `impulse` `beat` `kick`/`snare`/`hat`
  → good for a punchy reaction to beats and attacks.

From the same underlying signal (flux), we expose both a smoothed version, `flux`, and an unsmoothed version, `impulse`.

### 4. The normalization method varies by metric
| Type | Method | Targets | Reason |
|------|------|------|------|
| Naturally 0–1 | as-is | rolloff (a ratio) / flatness / noisiness / spectrum (÷255) | Already bounded by nature |
| Bounded but small | fixed division | bass/mid/treble/bands (÷255) / brightness (÷binCount) | Want to preserve the relative balance (individually maximizing each band would erase the difference between ranges) |
| Unbounded | **auto-gain** | rms / flux(=impulse) / onset* | Swings wildly depending on the track's volume, so it's adapted by dividing by the recent peak |

Auto-gain ([`AutoGain`](../src/audio/AutoGain.ts)) is just "remember the recent peak, and divide by it."
It tracks a new large value immediately, then decays slowly afterward. This makes it react even in quiet passages while not clipping in loud ones.

### 5. Heavy computation and state stay inside the engine
The previous frame's spectrum (for flux), auto-gain's peak history, smoothing's retained values,
the beat-detection refractory period, the tempo-estimation ring buffer, the accumulated chroma for key estimation, and so on are all
kept inside `FeatureEngine`. Plugins only ever read the return value of `update()`.

### 6. Bin → Hz conversion is centralized in one place
`frequency (Hz) = bin index × sampleRate ÷ fftSize`.
Since band energy, chroma, and peak frequency all depend on this conversion, it's centralized in
`hzToBin()` / `binWidth` inside `FeatureEngine`.

---

## Implemented metrics (Tier A + Tier B highlights)

We think of the material as split into "Tier A," which is cheap to obtain in a single frame, and "Tier B," which requires several seconds of accumulation.
See [features.md](features.md) for the range and meaning of each field.

**Tier A (single-frame)**: `spectrum` / `waveform` / `rms` / `peak` / `bass` `mid` `treble` `bands` / `brightness` / `flux` / `impulse` / `rolloff` / `flatness` / `noisiness` / `chroma` (large FFT + peak picking + whitening + interpolation) / `loudestHz` / `tonal*` (circle-of-fifths vector)

**Tier B (accumulated over time / additional analysis)**:
- `bpm` / `beatPhase` … tempo estimation via autocorrelation of the onset envelope ([`TempoTracker`](../src/audio/TempoTracker.ts)) + beat phase.
  **Accuracy is low** (double/half errors, and it can lock onto a value unrelated to the actual tempo in a full mix). Stops and resets after 0.6 seconds of silence.
- `onsetLow/Mid/High` + `kick`/`snare`/`hat` … **adaptive-threshold** detection on per-band flux ([`AdaptiveOnset`](../src/audio/AdaptiveOnset.ts))
- `energyDelta` / `drop` / `silence` … increases/decreases in volume, sudden surges, and silence
- `pan` / `stereoWidth` … from the L/R analyzers (stereo)
- `keyIndex` / `keyIsMajor` / `keyConfidence` … correlating accumulated chroma against the Krumhansl-Schmuckler profile
- `beat` … an **adaptive threshold** on impulse ([`AdaptiveOnset`](../src/audio/AdaptiveOnset.ts)) + a refractory period

> `bpm` is a simple estimate (subject to double/half errors; `beat`/`kick`/`snare`/`hat` already use adaptive thresholds). If you want to improve accuracy,
> swap the implementation inside the engine (if you don't want to write it yourself and want named features, try
> **Meyda**; for a serious BPM/key implementation, **essentia.js**, etc.). You can improve accuracy without changing any plugin code.

### Deliberately not implemented (out of scope)
Things that would be overkill for driving visuals and too heavy for realtime in a browser. Out of scope for now:
- **True source separation** (extracting drums/bass/vocals as separate audio; requires AI such as Demucs/Spleeter)
- **Accurate melody transcription** (turning the main melody of a full mix into notes)

> "I want it to react to drums/bass" is approximated without separation, using **per-band onsets** (`kick`/`snare`/`hat`).

---

## How to add a new plugin

**Just add a single `~Visualizer.ts` file to `src/visualizers/` and build it.** Registration and addition to the ⚙ menu both happen automatically.

```ts
// src/visualizers/MyVisualizer.ts
import { AudioFeatures } from '../audio/AudioFeatures';
import { Visualizer, VisualizerContext } from './Visualizer';

export default class MyVisualizer implements Visualizer {   // ← default export
  readonly id = 'my';           // unique ID (also becomes the storage key)
  readonly name = 'My';         // display name in the ⚙ menu
  readonly author = 'you';      // optional: author credit (shown in the ⚙ menu tooltip)
  readonly description = 'one line about what it does'; // optional: description (same tooltip)
  readonly order = 500;         // optional: display order (lower = earlier; unspecified goes last)

  draw(f: AudioFeatures, { ctx, width, height }: VisualizerContext): void {
    // Just read features and draw to the canvas. No audio-analysis knowledge required.
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, height * (1 - f.bass), width, height * f.bass);
  }
}
```

- At build time, [`gen-plugins.mjs`](../gen-plugins.mjs) collects `*Visualizer.ts` files and
  auto-generates `plugins.generated.ts` (`registry.register(() => new MyVisualizer())`).
- **Only two rules**: name the file `~Visualizer.ts`, and use `export default`.
- Keep `constructor` light (only one instance is built as a trial at registration time, to read id/name). Do heavy setup in `init()` instead.
- See [`BarsVisualizer.ts`](../src/visualizers/BarsVisualizer.ts) for a real example.

> Restart watch **only when you add a new file** while `npm run watch` is running (to regenerate the registration).
> Editing existing files reloads automatically.

### Two plugin types (2D / custom surface)
Plugins come in two types, and both coexist in the `registry` (see [`Visualizer.ts`](../src/visualizers/Visualizer.ts)).

- **2D (`Visualizer`)**: just write `draw(features, {ctx,width,height})`. The host provides a Canvas2D. Easy to write.
- **Custom surface (`SurfaceVisualizer`)**: `mount(container)/frame(features)/unmount()`. You build your own canvas/renderer.
  Enables **rich rendering with WebGL / PixiJS / three.js** (a single canvas can't mix 2D and WebGL, so surfaces are kept separate).
  See [visualizer-basics.md](visualizer-basics.md) (Japanese) for terms like shader, WebGL, and GLSL.

  Heavy libraries are handled in two ways:
  - **Built-in plugins** import the library directly, e.g. `import * as PIXI from 'pixi.js'`, and **bundle it in** (loaded into both the extension and standalone builds).
    Example: [`PixiNeonVisualizer.ts`](../src/visualizers/PixiNeonVisualizer.ts) (pixi.js + pixi-filters). **The bundle gets heavier** (content.js grows by several hundred KB), but the size cost is accepted in exchange for richer visuals.
  - **Standalone folder plugins** can't be bundled that way, so the host provides `window.MV.THREE` (3D) / `window.MV.PIXI` (GPU 2D) instead.
  - three.js is also **built in** (see [`ThreeTerrainVisualizer.ts`](../src/visualizers/ThreeTerrainVisualizer.ts)), bundled into both the extension and standalone builds. It's also exposed as `window.MV.THREE` for standalone folder plugins.
  - Note: to preserve the (extension) overlay's transparency, the built-in three.js samples express glow/depth using **additive blending + fog instead of post-FX bloom** (EffectComposer bloom tends to break transparency).

### Runtime plugins (standalone only)
In the standalone (Electron) build, you can **add JS plugins without building**.

- Drop a `.js` file (an ES module with `export default class`) in the plugin folder (`userData/plugins`), then
  click "Reload" in the control window to pick it up (see [`examples/plugins/`](../examples/plugins)).
- [`output.ts`](../src/hosts/standalone/output.ts) dynamically `import()`s it over localhost, and
  registers it in the **same `registry`** (coexisting with built-in plugins). The design doesn't branch.
- ⚠️ Because this runs third-party code at runtime, it's meant **for direct (non-sandboxed) distribution only**.
  Store-distributed builds (Chrome extension / Mac App Store) are limited to **built-in plugins only**, due to remote-code restrictions.

---

## Building and running (three hosts)

`npm run build` outputs all three hosts: `dist-extension/` (extension), `dist-app/` (Electron), and `dist-web/` (web demo).

### A. Extension (YouTube overlay)

1. In Chrome, go to `chrome://extensions` → turn on Developer mode
2. "Load unpacked" → select `dist-extension/`
3. Play something on YouTube → it appears on screen. Use the ⚙ in the top right to switch plugins / turn it Off

### B. Standalone (VJ / projector / OBS)

```bash
npm install   # once, includes electron
npm start     # build → launch Electron (output window + control window)
```

- **Output window**: fullscreen canvas (go fullscreen manually → capture it as a window in a projector or OBS)
- **Control window**: for your eyes only. Select input device, switch plugins, Off (not shown to the audience)
- Fully local (served over localhost, no network needed). Takes input from a microphone/line-in/virtual device (e.g. BlackHole)
- Output ⇔ control communicate via messages defined in [`bus.ts`](../src/hosts/standalone/bus.ts) (BroadcastChannel)

> Structure: [`electron/main.cjs`](../electron/main.cjs) serves `dist-app/` over localhost and opens two windows →
> [`output.ts`](../src/hosts/standalone/output.ts) (microphone input + WindowStage + App) /
> [`control.ts`](../src/hosts/standalone/control.ts) (control UI).
> Note: Electron is still **unpackaged** (only runnable via `npm start`; `.app`/`.dmg` packaging is planned for later).

### C. Web live demo (no install)

A demo plus official landing page that runs on static hosting such as GitHub Pages, reacting to microphone/tab audio ([`src/hosts/web/`](../src/hosts/web/)).

```bash
npm run build
npm run serve:web   # = npx serve dist-web (for local checks)
```

- Input comes from the microphone (`getUserMedia`), plus, on Chrome, tab/screen audio (`getDisplayMedia({ video:true, audio:true })`, with the video track stopped immediately)
- Input, fullscreen, and starting audio are **all triggered by a user click** (due to autoplay restrictions)
- The folder-plugin mechanism (dynamic `import()` via `/plugins.json`) is not used on static hosting. Only the bundled built-in plugins are included
- The control UI is a **same-page overlay**, not a separate window (unlike standalone, this doesn't use two windows / BroadcastChannel)
- See [`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml) for publishing to GitHub Pages
  (requires a one-time manual step: set the repository's Settings > Pages > Source to "GitHub Actions")
- Because github.io serves from a subpath (`username.github.io/repo-name/`), asset references inside `dist-web/` use relative paths

---

## Future extension possibilities

- **Dual-analyzer (already implemented)**: reactive metrics use a small FFT (`fftSize 2048`), while tonal metrics (`chroma`/`key`/`loudestHz`) are
  computed from a dedicated large FFT (`fftSize 16384`, binWidth ≈ 3Hz). This gets both accurate low-note names and fast reactivity
  ([`AudioGraph`](../src/app/AudioGraph.ts) creates the second analyzer, and [`FeatureEngine.computePitchFeatures`](../src/audio/FeatureEngine.ts) uses it).
- **Improving Tier B accuracy**: beat/onset detection (kick/snare/hat) already uses an **adaptive threshold** ([`AdaptiveOnset`](../src/audio/AdaptiveOnset.ts)) and works well.
  **BPM and beat position remain low-accuracy.** We tried prior distributions, harmonic integration, stickiness, and more, but with a lightweight autocorrelation approach,
  the result was either "jittery" or "stuck on a wrong lock," with poor cost/benefit — so we reverted to a plain autocorrelation.
  If you want to do this properly, use a **dedicated library like essentia.js**, or for VJ use cases, **manual tap tempo** is more reliable than automatic detection.
- **Adding more plugins**: Analyzer / Bars / Circle / Plasma Scope / Plasma Ball / Lo-Fi Rain / Flow Field / PixiNeon / Fireworks / ThreeTerrain / Cyber Flight / EQ Field / Kaleido Glass / Chroma Flow / Tunnel / Water Caustics. The material is in place, so more work can be added.
  For GLSL pieces, [`shaderSurface.ts`](../src/visualizers/shaderSurface.ts) lets you add one just by **writing the fragment shader itself** (no library needed, and the bundle barely grows).
  In standalone, you can also add WebGL/three.js runtime plugins (see [`examples/plugins/three-orb.js`](../examples/plugins/three-orb.js)).
- **Packaging Electron**: currently runnable only via `npm start`. Distributing it would need Developer ID signing + notarization + `.dmg` packaging (direct distribution).
- **Per-plugin settings UI**: let parameters like color and sensitivity be adjusted from the control window/⚙.
