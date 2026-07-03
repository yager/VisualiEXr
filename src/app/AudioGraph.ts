import { FeatureEngine } from '../audio/FeatureEngine';
import { AudioFeatures } from '../audio/AudioFeatures';

/** 音声の入力元。動画要素（拡張）または MediaStream（マイク/デバイス＝スタンドアロン）。 */
export type AudioSource =
  | { kind: 'element'; element: HTMLMediaElement }
  | { kind: 'stream'; stream: MediaStream };

/**
 * AudioGraph — 1入力ぶんの Web Audio 配線と特徴量エンジンを保持する。
 *
 * `createMediaElementSource()` は要素につき一度しか呼べないため、動画入力のときは
 * 入力ごとに1回だけ作る。ストリーム入力（マイク等）は差し替え可能。
 * resume() のタイミング（ユーザー操作）はホスト側が決める。
 */
export class AudioGraph {
  private readonly ctx: AudioContext;
  private readonly engine: FeatureEngine;
  private readonly source: AudioSource;

  constructor(source: AudioSource) {
    this.source = source;
    this.ctx = new AudioContext();

    const srcNode = source.kind === 'element'
      ? this.ctx.createMediaElementSource(source.element)
      : this.ctx.createMediaStreamSource(source.stream);

    const analyser = this.ctx.createAnalyser();
    srcNode.connect(analyser);                 // 分析用（モノ統合）
    // 動画は再生音をスピーカーへ。マイク/ライン入力はスピーカーに出すとハウリングするので出さない。
    if (source.kind === 'element') srcNode.connect(this.ctx.destination);

    // ステレオ解析用：L/R を分けて解析（pan / stereoWidth 用）
    const splitter = this.ctx.createChannelSplitter(2);
    const analyserL = this.ctx.createAnalyser();
    const analyserR = this.ctx.createAnalyser();
    srcNode.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);

    // ピッチ解析用の大FFT（分解能を上げて低音の音名を分ける）。chroma/key/loudestHz に使う。
    const pitchAnalyser = this.ctx.createAnalyser();
    pitchAnalyser.fftSize = 16384;
    srcNode.connect(pitchAnalyser);

    this.engine = new FeatureEngine(analyser, {}, { left: analyserL, right: analyserR }, pitchAnalyser);
  }

  /** AudioContext がサスペンド中なら再開（ユーザー操作のタイミングでホストが呼ぶ）。 */
  resume(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** 毎フレームの特徴量。 */
  update(): AudioFeatures {
    return this.engine.update();
  }

  dispose(): void {
    // ストリーム入力ならデバイスを解放する
    if (this.source.kind === 'stream') {
      for (const track of this.source.stream.getTracks()) track.stop();
    }
    void this.ctx.close();
  }
}
