import { AudioFeatures } from '../../src/audio/AudioFeatures';

/**
 * makePosterFeatures — OGポスター合成用の「見栄えする凍結フレーム」を作る。
 * 実際の音声解析は行わず、AudioFeatures の全項目を静止画向けの尤もらしい値で埋める。
 */
export function makePosterFeatures(): AudioFeatures {
  // spectrum: 低音を強く効かせ、高音は急峻に減衰する曲線＋軽い起伏（1024本）
  // PixiNeonのバー表示で低音側が画面端まで長く伸びる見た目にするため、
  // 通常の解析結果よりも低音・高音のコントラストを誇張している。
  const spectrum = new Uint8Array(1024);
  for (let i = 0; i < spectrum.length; i++) {
    const t = i / spectrum.length;
    const base = 250 * Math.exp(-t * 4.5);
    const ripple = 12 * Math.sin(t * 40) + 8 * Math.sin(t * 130 + 1.3);
    spectrum[i] = Math.max(0, Math.min(255, Math.round(base + ripple + 5)));
  }

  // waveform: なだらかな正弦（オシロ的に見栄えする程度でよい）
  const waveform = new Float32Array(2048);
  for (let i = 0; i < waveform.length; i++) {
    waveform[i] = Math.sin((i / waveform.length) * Math.PI * 10) * 0.6;
  }

  // bands: 低域から高域へなだらかに減衰する8分割
  const bands = [0.82, 0.74, 0.66, 0.58, 0.5, 0.42, 0.34, 0.26];

  // chroma: 1〜2音（C+G＝完全5度）にピークを置き、和音感を出す
  const chroma = new Array(12).fill(0.08);
  chroma[0] = 0.95; // C
  chroma[7] = 0.55; // G（5度）

  // 調性ベクトル：chromaのピークと整合する向き・強さ
  const tonalAngle = 0.02; // 0〜1の循環値（Cに近い向き）
  const tonalStrength = 0.8;
  const tonalX = Math.cos(tonalAngle * Math.PI * 2) * tonalStrength;
  const tonalY = Math.sin(tonalAngle * Math.PI * 2) * tonalStrength;

  return {
    spectrum,
    waveform,

    rms: 0.68,
    peak: 0.8,

    bass: 0.85,
    mid: 0.6,
    treble: 0.5,
    bands,

    brightness: 0.62,
    flux: 0.55,
    rolloff: 0.6,
    flatness: 0.25,
    noisiness: 0.2,

    chroma,
    loudestHz: 220,

    tonalAngle,
    tonalStrength,
    tonalX,
    tonalY,

    impulse: 0.4,
    beat: false,

    bpm: 120,
    beatPhase: 0,
    onsetLow: 0.3,
    onsetMid: 0.2,
    onsetHigh: 0.15,
    kick: false,
    snare: false,
    hat: false,

    energyDelta: 0.1,
    drop: false,
    silence: false,

    pan: 0,
    stereoWidth: 0.5,

    keyIndex: 0,
    keyIsMajor: true,
    keyConfidence: 0.8,

    sampleRate: 48000,
    time: 0,
  };
}
