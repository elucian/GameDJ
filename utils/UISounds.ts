
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

class UISounds {
  private ctx: AudioContext | null = null;
  private rewindOsc: OscillatorNode | null = null;
  private rewindGain: GainNode | null = null;

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /** Deep mechanical thud for switches (like heavy toggles). */
  public playSwitch() {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.04);
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.06);

    this.playNoise(0.05, 0.08, 1200);
  }

  /** Sharper mechanical "click-clak" for tool buttons. */
  public playButton() {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    
    // Part 1: The "Click" (High frequency transient)
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'sine';
    clickOsc.frequency.setValueAtTime(4000, now);
    clickOsc.frequency.exponentialRampToValueAtTime(1500, now + 0.005);
    clickGain.gain.setValueAtTime(0.15, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.005);
    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.005);

    // Part 2: The "Clak" (Lower resonant body)
    const clakOsc = ctx.createOscillator();
    const clakGain = ctx.createGain();
    clakOsc.type = 'triangle';
    // Slightly offset for double-action feel
    const clakStart = now + 0.012;
    clakOsc.frequency.setValueAtTime(800, clakStart);
    clakOsc.frequency.exponentialRampToValueAtTime(200, clakStart + 0.03);
    clakGain.gain.setValueAtTime(0.1, clakStart);
    clakGain.gain.exponentialRampToValueAtTime(0.001, clakStart + 0.04);
    clakOsc.connect(clakGain);
    clakGain.connect(ctx.destination);
    clakOsc.start(clakStart);
    clakOsc.stop(clakStart + 0.04);

    // Part 3: Noise texture
    this.playNoise(0.04, 0.02, 3000);
  }

  /** Chunkier tick for sliders and knobs, darker and louder. */
  public playTick() {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.015);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
    
    const bufferSize = ctx.sampleRate * 0.02;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    
    osc.connect(filter);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    noise.start(now);
    
    osc.stop(now + 0.02);
    noise.stop(now + 0.02);
  }

  public startRewindSound() {
    const ctx = this.getContext();
    this.stopRewindSound();
    
    this.rewindOsc = ctx.createOscillator();
    this.rewindGain = ctx.createGain();
    
    this.rewindOsc.type = 'sawtooth';
    this.rewindOsc.frequency.setValueAtTime(150, ctx.currentTime);
    this.rewindOsc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 3);
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 5;
    
    this.rewindGain.gain.setValueAtTime(0, ctx.currentTime);
    this.rewindGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.1);
    
    this.rewindOsc.connect(filter);
    filter.connect(this.rewindGain);
    this.rewindGain.connect(ctx.destination);
    
    this.rewindOsc.start();
  }

  public stopRewindSound() {
    if (this.rewindGain) {
        const ctx = this.getContext();
        this.rewindGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
    }
    if (this.rewindOsc) {
      const osc = this.rewindOsc;
      setTimeout(() => { try { osc.stop(); } catch(e) {} }, 100);
      this.rewindOsc = null;
    }
  }

  private playNoise(vol: number, duration: number, freq: number) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }
}

export const uiSounds = new UISounds();
