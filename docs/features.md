[日本語](features.ja.md) | **English**

# AudioFeatures reference (definition of the implemented value set)

The **complete definition** of the value set that [`FeatureEngine`](../src/audio/FeatureEngine.ts) produces every frame and passes to a plugin's `draw(features, ctx)`. The type is [`AudioFeatures.ts`](../src/audio/AudioFeatures.ts).

If you're not familiar with audio terms (frequency, spectrum, FFT, bins, harmonics, logarithms, etc.), read [audio-basics.md](audio-basics.md) (Japanese) first.

Legend:
- **Range**: the range of values it can take.
- **Smoothing**: "yes" = smoothed via EMA (good for slow, relaxed effects) / "no" = a sharp instantaneous value (good for beats/attacks).
- **Normalization**: how it's mapped to 0–1 (see the policy in [architecture.md](architecture.md)).

---

## Scalar values (single numbers)

| Field | Type | Range | Smoothing | Normalization | Meaning / rendering hint |
|------|------|------|------|------|------|
| `rms` | number | 0–1 | yes | auto-gain | **Overall loudness.** Good for the scale/brightness of the whole image. |
| `peak` | number | 0–1 | no | bounded (≤1) | **The largest instantaneous swing.** Flashes on a sudden loud hit. |
| `bass` | number | 0–1 | yes | ÷255 | **Bass** (default 20–150Hz). The bass/kick-drum range. Good for background pulsing. |
| `mid` | number | 0–1 | yes | ÷255 | **Mids** (default 150–2000Hz). The vocal/main-instrument range. |
| `treble` | number | 0–1 | yes | ÷255 | **Treble** (default 2k–16kHz). The cymbal/hi-hat range. Good for particles. |
| `brightness` | number | 0–1 | yes | ÷binCount | **Brightness of the sound** (centroid). Larger with more high-frequency content. Good for hue. |
| `flux` | number | 0–1 | yes | auto-gain | **Amount of change in the sound** (smoothed version). How intense the motion is. |
| `impulse` | number | 0–1 | no | auto-gain | **Sharpness of an onset** (the sharp version of flux). A seed for beats. |
| `rolloff` | number | 0–1 | yes | ratio (≤1) | **How far the sound spreads upward.** The fraction of the height below which 85% of the energy sits. |
| `flatness` | number | 0–1 | yes | geometric/arithmetic (≤1) | **Leans noisy (1) ⇄ leans tonal/clean (0).** Good for switching texture. |
| `noisiness` | number | 0–1 | yes | ratio (≤1) | **Grittiness / how "high" the sound feels** (zero-crossing rate). |
| `loudestHz` | number | 0–~16000 | no | **raw value (Hz)** | **The pitch of the strongest sound.** The one field that is not normalized. |
| `tonalAngle` | number | 0–1 (cyclic) | yes | circle-of-fifths angle | **Tonal direction.** An angle that folds chroma into a single direction around the circle of fifths. Good for hue, rotation angle, etc. 0 and 1 are the same point. |
| `tonalStrength` | number | 0–1 | yes | mean resultant length | **How clear the tonality is.** 1 = a clear chord/single note, 0 = no tonality (noise/percussion). When this is low, angle is meaningless. |
| `tonalX` / `tonalY` | number | each −1 to 1 | yes | — | Components of the tonal vector. Usable without worrying about wraparound. `tonalX²+tonalY² = tonalStrength²`, angle = `tonalAngle`. |
| `bpm` | number | 0 or ~70–180 | yes | raw value (BPM) | **Estimated tempo** (Tier B). 0 = undetermined. **Accuracy is low**: besides double/half errors, in a full mix it can lock onto a value unrelated to the actual tempo (due to the lightweight autocorrelation approach). Treat it as a rough aid for effects. Goes to 0 during sustained silence. |
| `beatPhase` | number | 0–1 | no | phase | **Phase within the beat** (resets to 0 on a beat, increases toward the next beat). Good for tempo-synced pulsing. Extrapolated from a clock, so **it stops at 0 during sustained silence** (to prevent it from running on its own with no sound). Naturally drifts if `bpm` is inaccurate. |
| `onsetLow` | number | 0–1 | no | auto-gain | **Low-band onset strength** (≈ kick attack). |
| `onsetMid` | number | 0–1 | no | auto-gain | **Mid-band onset strength** (≈ snare). |
| `onsetHigh` | number | 0–1 | no | auto-gain | **High-band onset strength** (≈ hi-hat). |
| `energyDelta` | number | −1 to 1 | yes | auto-gain | **Change in volume** (+ louder / − quieter). Good for detecting a build. |
| `pan` | number | −1 to 1 | yes | L/R RMS ratio | **Left/right balance** (− left / + right). Only meaningful when stereo analysis is enabled. |
| `stereoWidth` | number | 0–1 | yes | 1 − correlation | **Stereo width** (0 = mono / 1 = wide). Only meaningful when stereo analysis is enabled. |
| `keyConfidence` | number | 0–1 | — | correlation | **Confidence of the key estimate** (Tier B). Stabilizes after a few seconds. |
| `keyIndex` | number | −1 or 0–11 | — | raw value | **Tonic** (0=C … 11=B, −1=undetermined). Used together with `keyIsMajor`. |
| `sampleRate` | number | e.g. 44100/48000 | — | — | The sample rate (Hz). Used for bin→frequency conversion (Nyquist = sampleRate/2). This is the output device's rate, not the video's audio quality (see [audio-basics.md](audio-basics.md), Japanese, chapter 15). |
| `time` | number | 0– (seconds) | — | — | Elapsed seconds relative to the AudioContext. Good for animation phase calculations. |

## Booleans

| Field | Type | Meaning |
|------|------|------|
| `beat` | boolean | **True only at the instant a beat lands.** Detected via an **adaptive threshold** (recent envelope mean + k × standard deviation) plus a refractory period. Automatically adapts to how dense the track is. |
| `kick` | boolean | **True only at the instant of a low-band hit** (≈ kick drum). Adaptive-threshold detection on the per-band onset. |
| `snare` | boolean | **True only at the instant of a mid-band hit** (≈ snare). Adaptive-threshold detection on the per-band onset. |
| `hat` | boolean | **True only at the instant of a high-band hit** (≈ hi-hat). Adaptive-threshold detection on the per-band onset. |
| `drop` | boolean | **True only at the instant of a sudden loud surge** (a drop/impact). |
| `silence` | boolean | True when the audio is **nearly silent** (absolute volume is below a threshold). |
| `keyIsMajor` | boolean | true = major / false = minor (used together with `keyIndex`). |

## Arrays (multiple numbers)

| Field | Type | Length | Range | Smoothing | Meaning / rendering hint |
|------|------|------|------|------|------|
| `chroma` | number[] | 12 | each 0–1 | no | **How much of each of the 12 pitch classes is present** (0=C, 1=C#, … 11=B; normalized so the max is 1). Moves even for chords. Computed by taking the spectrum from a **dedicated large FFT (fftSize 16384)**, **collecting only peaks**, then **whitening (subtracting a local average to remove peaks buried in noise/percussion) + parabolic interpolation for precision + linear weighting into neighboring pitch classes** (to reduce misattribution at semitone boundaries). The threshold is `chromaPeakFloor` (default 24). `key`/`loudestHz` also come from the same large FFT. |
| `bands` | number[] | 8 by default | each 0–1 | yes | **Log-spaced multi-band** energy (see [audio-basics.md](audio-basics.md), Japanese, chapter 10, for why it's split logarithmically). Good for general-purpose multi-bar drawing. |

## Raw data arrays (for "use all bins" drawing)

| Field | Type | Length | Range | Meaning |
|------|------|------|------|------|
| `spectrum` | Uint8Array | fftSize/2 (default 1024) | each 0–255 | **Frequency bins** (low → high). Use directly for bar height. |
| `waveform` | Float32Array | fftSize (default 2048) | each roughly −1 to 1 | **Waveform** (time domain). Good for an oscilloscope-style line. |

> ⚠️ `spectrum` / `waveform` are returned by **mutating the same array** every frame (to avoid GC pressure).
> If you need to keep a value across frames, copy it (e.g. `spectrum.slice()`).

---

## Engine configuration (defaults)

Configurable via the second argument to the [`FeatureEngine`](../src/audio/FeatureEngine.ts) constructor.

| Option | Default | Description |
|------|------|------|
| `fftSize` | 2048 | FFT length for the reactive metrics (spectrum/bands/flux, etc.). Bin count is half that (1024). Larger is more detailed but reacts more sluggishly. |

> The tonal metrics (`chroma` / `key` / `loudestHz`) use a separate, **dedicated large FFT (fftSize 16384, binWidth ≈ 3Hz)** apart from the reactive metrics ([`AudioGraph`](../src/app/AudioGraph.ts) sets up a second analyzer for this). This can separate pitch names even in low notes, but its longer time window (≈0.34 seconds) means it reacts more slowly — trading speed for stability.
| `smoothing` | 0.8 | The EMA coefficient for smoothed metrics. Larger = smoother (more sluggish). |
| `analyserSmoothing` | 0.5 | The AnalyserNode's own built-in smoothing. |
| `bandCount` | 8 | The number of divisions in `bands[]`. |
| `bands` | Hz for bass/mid/treble | The boundaries of the per-range energy bands. |
| `rolloffThreshold` | 0.85 | The fraction of energy that rolloff looks for. |
| `chromaPeakFloor` | 24 | The threshold (0–255) for chroma's peak picking. Raising it ignores weak sounds and reduces how many pitch classes light up. |
| `dropThreshold` | 0.6 | The energyDelta threshold that triggers `drop`. |
| `dropRefractoryMs` | 800 | The refractory period for `drop` detection. |
| `silenceThreshold` | 0.01 | The absolute-volume threshold for `silence` detection (raw RMS, 0–1). |

> Stereo analysis (`pan` / `stereoWidth`) is only active when L/R analyzers are passed as the third argument to `FeatureEngine` (which [`AudioGraph`](../src/app/AudioGraph.ts) does). Otherwise both are 0.

> `beat` / `kick` / `snare` / `hat` use **adaptive-threshold detection** ([`AdaptiveOnset`](../src/audio/AdaptiveOnset.ts)). The sensitivity `k`, floor `floor`, window width `win`, and refractory period are specified where `FeatureEngine` constructs it (currently tuned in code).

---

## Analyzer (analysis/debug display mode)

We bundle [`AnalyzerVisualizer`](../src/visualizers/AnalyzerVisualizer.ts) (UI name "Analyzer (All Features)", id=`analyzer`), which **lays out the implemented values on screen** so you can check them. It's just a regular plugin like any other, and also doubles as a reference for every feature a plugin author can use.

The display **overlays exactly the video's display area** and follows fullscreen, theater mode, and resizing (it sits on a layer above YouTube's own controls).

A **4-column layout** (left → right) that makes use of a wide video area:

1. **spectrum** … frequency on a **vertical, linear (evenly-spaced) axis** (low = bottom / high = top), as horizontal bars. Faithful to the raw FFT bins. Uses the full height.
2. **bands** … frequency on a **vertical, logarithmic axis**, as horizontal bars (a musically meaningful grouping that's finer at the low end).
3. **Scalar bars** … `rms` through `pan`, listed as label + horizontal bar + value (including each tonal value, onset, energyDelta, stereoWidth, keyConfidence; ± values use a bar centered at 0).
4. **chroma** → **key** → **bpm/loudestHz/sampleRate/time** → **the tonal-vector dial** (circle + dot) → **lamps** (beat/kick/snare/hat/drop/silence) → **waveform**.

> ⚠️ `spectrum` (linear axis) and `bands` (log axis) **deliberately use different vertical scales**.
> `bands` is a musical summary of `spectrum`, but because the axes differ, the peaks won't line up between them (treat them as separate things).
> **Why bands is spaced logarithmically** → see [audio-basics.md](audio-basics.md) (Japanese), chapter 10.

### How to use (on-screen, recommended)

The same three-layer wiring as the real host ([`content.ts`](../src/hosts/extension/content.ts)).
Build an `AudioGraph` (audio input) and a `Stage` (render target), and inject them into `VisualizerApp`.

```ts
import { registry } from '../app/registry';
import '../app/plugins.generated';                // side-effect import registers built-in plugins
import { AudioGraph } from '../app/AudioGraph';
import { VideoStage } from '../app/Stage';
import { VisualizerApp } from '../app/VisualizerApp';

const video = document.querySelector<HTMLVideoElement>('video.video-stream')!;
const graph = new AudioGraph({ kind: 'element', element: video });
graph.resume();                                   // resume the AudioContext

const app = new VisualizerApp(graph, new VideoStage(video), registry);
app.setVisualizer('analyzer');
app.start();
// switch (doesn't rebuild the audio graph): app.setVisualizer('bars');
// stop: app.stop();   dispose: app.dispose();
```

The values change every frame, but the **horizontal bars, vertical bars, and graphs** make the motion intuitive to follow.
Use this to get a feel for "which metric moves how, with which sound" before building a real visualizer.

### Viewing in the console (optional)

Calling `console.log` every frame scrolls by too fast to read, so **throttling it and using `console.table`** is recommended.

```ts
let lastLog = 0;
function loop() {
  const f = engine.update();
  visualizer.draw(f, view);
  if (f.time - lastLog > 0.25) {        // every 0.25s (every frame is too much)
    lastLog = f.time;
    console.table({
      rms: +f.rms.toFixed(2), bass: +f.bass.toFixed(2), mid: +f.mid.toFixed(2),
      treble: +f.treble.toFixed(2), brightness: +f.brightness.toFixed(2),
      flux: +f.flux.toFixed(2), impulse: +f.impulse.toFixed(2),
      beat: f.beat, bpm: +f.bpm.toFixed(1),
    });
  }
  requestAnimationFrame(loop);
}
```

> Arrays (spectrum/chroma/waveform) are hard to read in the console, so the on-screen `AnalyzerVisualizer` is recommended instead.
> The console is better suited to a pinpoint check of "does this particular scalar behave as expected."
