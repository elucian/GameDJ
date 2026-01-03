
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/** Simple class for getting the current audio levels for Left and Right channels. */
export class AudioAnalyser extends EventTarget {
  readonly node: AudioNode;
  private readonly splitter: ChannelSplitterNode;
  private readonly analyserL: AnalyserNode;
  private readonly analyserR: AnalyserNode;
  private readonly freqDataL: Uint8Array;
  private readonly freqDataR: Uint8Array;
  private rafId: number | null = null;

  constructor(context: AudioContext) {
    super();
    this.splitter = context.createChannelSplitter(2);
    this.analyserL = context.createAnalyser();
    this.analyserR = context.createAnalyser();
    
    this.analyserL.smoothingTimeConstant = 0.2;
    this.analyserR.smoothingTimeConstant = 0.2;
    
    this.splitter.connect(this.analyserL, 0);
    this.splitter.connect(this.analyserR, 1);
    
    // The node property is the entry point for the audio graph
    this.node = this.splitter;
    
    this.freqDataL = new Uint8Array(this.analyserL.frequencyBinCount);
    this.freqDataR = new Uint8Array(this.analyserR.frequencyBinCount);
    
    this.loop = this.loop.bind(this);
  }

  getLevels() {
    this.analyserL.getByteFrequencyData(this.freqDataL);
    this.analyserR.getByteFrequencyData(this.freqDataR);
    
    const avgL = this.freqDataL.reduce((a, b) => a + b, 0) / this.freqDataL.length;
    const avgR = this.freqDataR.reduce((a, b) => a + b, 0) / this.freqDataR.length;
    
    return {
      left: avgL / 0xff,
      right: avgR / 0xff
    };
  }

  loop() {
    this.rafId = requestAnimationFrame(this.loop);
    const levels = this.getLevels();
    this.dispatchEvent(new CustomEvent('audio-levels-changed', { detail: levels }));
  }

  start = this.loop;

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}
