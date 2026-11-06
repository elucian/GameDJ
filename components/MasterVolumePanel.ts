
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { uiSounds } from '../utils/UISounds';

/** 13 stops: 12 equal intervals of 10 seconds from 1:00 to 3:00 (values in minutes) */
export const DURATION_STEPS = Array.from({ length: 13 }, (_, i) => {
    const secs = 60 + i * 10;
    return { label: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, value: secs / 60 };
});

@customElement('master-volume-panel')
export class MasterVolumePanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--surface-color);
      box-sizing: border-box;
      /* Aligned with timeline labels */
      padding-top: 8px; 
      padding-bottom: var(--mvp-padding-bottom, 12px); 
      overflow: hidden;
    }
    
    .control-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      width: 100%;
      padding: 0 12px;
      box-sizing: border-box;
    }

    .side-by-side {
      display: flex;
      gap: 16px;
      width: 100%;
      margin-bottom: 4px;
    }

    .column {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 14px;
      margin-bottom: 4px;
    }

    .seed-chip { font-size: 9px; font-weight: bold; letter-spacing: 0.5px; color: var(--text-muted); border: 1px solid var(--border-color); border-radius: 3px; padding: 1px 5px; cursor: pointer; white-space: nowrap; }
    .seed-chip.locked { color: var(--accent-color); border-color: var(--accent-color); }
    .volume-label {
      font-size: 10.58px; 
      font-weight: bold;
      color: var(--text-muted);
      letter-spacing: 0.6px;
      text-transform: uppercase;
      line-height: 1;
      white-space: nowrap;
    }

    .value-display {
      font-family: monospace;
      font-size: 12.1px;
      color: var(--accent-color);
      font-weight: bold;
    }

    /* Stereo/Mono Switch */
    .stereo-toggle {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      user-select: none;
    }
    .toggle-text {
      font-size: 9.2px;
      font-weight: 900;
      color: var(--text-muted);
    }
    .toggle-text.active {
      color: var(--accent-color);
    }
    .switch-track {
      width: 14px;
      height: 7px;
      background: #000;
      border-radius: 4px;
      position: relative;
      border: 1px solid #333;
    }
    .switch-thumb {
      position: absolute;
      top: 1px;
      left: 1px;
      width: 3px;
      height: 3px;
      background: #888;
      border-radius: 50%;
      transition: transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28);
    }
    .stereo-toggle.on .switch-thumb {
      transform: translateX(7px);
      background: var(--accent-color);
    }

    .blocked { cursor: not-allowed; }
    .blocked > * { pointer-events: none; }
    .stereo-toggle.disabled { cursor: not-allowed; }
    .slider-row {
      display: flex;
      align-items: center;
      width: 100%;
      height: 12px; 
      position: relative;
      margin-bottom: 8px; 
    }

    .range-markers {
      display: flex;
      justify-content: space-between;
      width: 100%;
      padding: 0 2px;
      margin-top: -6px;
      margin-bottom: 6px;
    }

    .metric-text {
      font-size: 8px;
      color: var(--text-muted);
      font-weight: bold;
    }

    input[type=range] {
      -webkit-appearance: none; 
      background: transparent; 
      width: 100%; 
      height: 3px; 
      border-radius: 1px; 
      background: #000; 
      outline: none; 
      border: none;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.8);
      margin: 0;
      padding: 0;
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
    }

    input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none; 
      height: 12px; 
      width: 100%;  /* Fader thumb */
      max-width: 10px;
      border-radius: 1px;
      background: linear-gradient(to right, 
        #888 0%, 
        #eee 10%, 
        #bbb 31%, 
        #000 33%, 
        #000 37%, 
        #bbb 39%, 
        #eee 80%, 
        #888 100%
      );
      margin-top: -4.5px; 
      box-shadow: 0 2px 4px rgba(0,0,0,0.7);
      border: 1px solid #444;
      cursor: ew-resize;
      z-index: 5;
    }

    /* Stacked sliders: label on the left, slider in the middle, value on the right */
    .srow {
      display: grid;
      grid-template-columns: 38px 1fr 34px;
      align-items: center;
      gap: 8px;
      height: 24px;
    }
    .srow .value-display { text-align: right; font-size: 11.5px; }
    .tools-row { display: flex; align-items: center; justify-content: space-between; height: 18px; margin: 4px 0 6px; }

    .meters-container {
      display: flex;
      flex-direction: column;
      gap: 2px;
      width: 100%;
    }

    .vu-meter {
      width: 100%;
      height: 22px; 
      background: #050505;
      border-radius: 1px;
      display: flex;
      flex-direction: row;
      justify-content: flex-start; /* LEDs start on a whole pixel; a centred row started on a fraction and blurred some LEDs */
      align-items: stretch;
      box-shadow: inset 0 1px 3px rgba(0,0,0,1);
      border: 1px solid #111;
      flex-shrink: 0;
      overflow: hidden;
      padding: 1px;
      box-sizing: border-box;
      gap: 3px; /* space between the LEDs */
      transition: height 0.2s ease;
    }

    .vu-meter.mono-expanded {
      height: 48px; 
    }

    .led-segment {
      width: 5px; /* whole pixels */
      flex: 0 0 5px;
      min-width: 5px;
      max-width: 5px;
      transform: translateZ(0); /* its own layer: the glow of one LED cannot change its neighbours' size */
      background: #0a0a0a;
      transition: background 0.05s;
      border-radius: 0;
    }

    .led-segment.active {
      background: var(--led-color, #3dffab);
      /* A wide glow filled the gap and made the spacing look uneven: keep it inside the LED */
      box-shadow: 0 0 2px var(--led-color);
    }
  `;

  @state() private meterWidth = 0;
  private meterObserver?: ResizeObserver;
  private observedMeter: Element | null = null;

  /** Keeps the LED count in step with the meter's width */
  private observeMeter() {
    const box = this.renderRoot.querySelector('.meters-container');
    if (box && box !== this.observedMeter) {
      this.meterObserver?.disconnect();
      this.meterObserver = new ResizeObserver(entries => { this.meterWidth = Math.floor(entries[0].contentRect.width); });
      this.meterObserver.observe(box);
      this.observedMeter = box;
    }
  }

  disconnectedCallback() { super.disconnectedCallback(); this.meterObserver?.disconnect(); this.observedMeter = null; }

  @property({ type: Number }) volume = 0.8;
  @property({ type: Number }) bpm = 110;
  @property({ type: Number }) bpmMin = 40;
  @property({ type: Number }) bpmMax = 200;
  /** 'manifest': TMP, DUR, EVOL and the seed. 'volume': master volume, stereo switch and the VU meters. */
  @property({ type: String }) mode: 'manifest' | 'volume' = 'manifest';
  @property({ type: Number }) evolution = 0;
  @property({ type: Number }) durationIndex = 12; // Default to 3:00
  @property({ type: Number }) audioLevelL = 0;
  @property({ type: Number }) audioLevelR = 0;
  @property({ type: Boolean }) isStereo = true;
  @property({ type: Boolean }) isLocked = false;
  @property({ type: Number }) seed = 0;
  @property({ type: Boolean }) seedLocked = false;
  
  @state() private smoothedLevelL = 0;
  @state() private smoothedLevelR = 0;

  protected updated(changedProperties: Map<string, unknown>): void {
    this.observeMeter();
    if (changedProperties.has('audioLevelL') || changedProperties.has('volume')) {
      const targetLevel = this.audioLevelL * this.volume;
      if (this.audioLevelL === 0) this.smoothedLevelL = 0;
      else this.smoothedLevelL = (this.smoothedLevelL * 0.7) + (targetLevel * 0.3);
    }
    if (changedProperties.has('audioLevelR') || changedProperties.has('volume')) {
      const targetLevel = this.audioLevelR * this.volume;
      if (this.audioLevelR === 0) this.smoothedLevelR = 0;
      else this.smoothedLevelR = (this.smoothedLevelR * 0.7) + (targetLevel * 0.3);
    }
  }

  private toggleSeedLock() {
    uiSounds.playSwitch();
    (this as any).dispatchEvent(new CustomEvent('seed-lock-changed', { detail: !this.seedLocked }));
  }

  private toggleStereo() {
    if (this.isLocked) return;
    uiSounds.playSwitch();
    this.isStereo = !this.isStereo;
    (this as any).dispatchEvent(new CustomEvent('stereo-changed', { detail: this.isStereo }));
  }

  private onVolumeChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const rawValue = parseInt(input.value);
    const snappedValue = Math.round(rawValue / 10) * 10;
    const oldVal = Math.round(this.volume * 100);
    
    if (oldVal !== snappedValue) {
        uiSounds.playTick();
        this.volume = snappedValue / 100;
        (this as any).dispatchEvent(new CustomEvent('volume-changed', { detail: this.volume }));
        (this as any).requestUpdate();
    }
  }

  private onBpmInput(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (val === this.bpm) return;
    uiSounds.playTick();
    this.bpm = val;
    (this as any).dispatchEvent(new CustomEvent('bpm-input', { detail: val }));
  }

  private onEvolutionChange(e: Event) {
    if (this.isLocked) return;
    const input = e.target as HTMLInputElement;
    const val = parseInt(input.value, 10);
    if (val !== this.evolution) {
        uiSounds.playTick();
        this.evolution = val;
        (this as any).dispatchEvent(new CustomEvent('evolution-changed', { detail: this.evolution }));
        (this as any).requestUpdate();
    }
  }

  private onDurationChange(e: Event) {
      if (this.isLocked) return;
      const input = e.target as HTMLInputElement;
      const idx = parseInt(input.value, 10);
      if (idx !== this.durationIndex) {
          uiSounds.playTick();
          this.durationIndex = idx;
          const mins = DURATION_STEPS[idx].value;
          (this as any).dispatchEvent(new CustomEvent('duration-changed', { detail: mins }));
          (this as any).requestUpdate();
      }
  }

  private renderLeds(level: number) {
    // Enough LEDs to fill the meter: each is 5px wide with a 3px gap (8px per LED); the last one may be cut off
    const numSegments = this.meterWidth > 0 ? Math.max(12, Math.ceil((this.meterWidth - 4) / 8)) : 32;
    const segments = [];
    for (let i = 0; i < numSegments; i++) {
        const threshold = i / numSegments;
        const isActive = level > threshold;
        // Green: 0-55%, Yellow: 55-70%, Red: 70-100%
        let color = '#3dffab'; // Green
        if (i >= numSegments * 0.7) color = '#ff4444'; // Red
        else if (i >= numSegments * 0.55) color = '#ffbb00'; // Bright Yellow-Orange
        segments.push(html`<div class="led-segment ${isActive ? 'active' : ''}" style="--led-color: ${color}"></div>`);
    }
    return segments;
  }

  render() {
    // Cap level to volume knob position — meter must not overshoot the knob
    const maxLevel = this.volume;
    const visualLevelL = Math.min(this.smoothedLevelL * 7.0, maxLevel); 
    const visualLevelR = Math.min(this.smoothedLevelR * 7.0, maxLevel); 

    if (this.mode === 'volume') {
      return html`
        <div class="control-wrapper">
          <div class="srow" title="Master volume">
            <div class="volume-label">VOL</div>
            <input type="range" min="0" max="100" step="1" .value=${String(Math.round(this.volume * 100))} @input=${this.onVolumeChange} />
            <div class="value-display">${Math.round(this.volume * 100)}</div>
          </div>
          <div class="tools-row">
            <span></span>
            <div class="stereo-toggle ${this.isStereo ? 'on' : ''} ${this.isLocked ? 'disabled' : ''}" @click=${this.toggleStereo}>
              <span class="toggle-text ${!this.isStereo ? 'active' : ''}">MONO</span>
              <div class="switch-track">
                <div class="switch-thumb"></div>
              </div>
              <span class="toggle-text ${this.isStereo ? 'active' : ''}">STEREO</span>
            </div>
          </div>
          <div class="meters-container">
            <div class="vu-meter ${!this.isStereo ? 'mono-expanded' : ''}">
              ${this.renderLeds(this.isStereo ? visualLevelL : (visualLevelL + visualLevelR) / 2)}
            </div>
            ${this.isStereo ? html`
              <div class="vu-meter">
                ${this.renderLeds(visualLevelR)}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }
    return html`
      <div class="control-wrapper">
        <div class="srow" title="Tempo (BPM)">
          <div class="volume-label">TMP</div>
          <input type="range" .min=${String(this.bpmMin)} .max=${String(this.bpmMax)} step="1" .value=${String(this.bpm)} @input=${this.onBpmInput} />
          <div class="value-display">${this.bpm}</div>
        </div>
        <div class="srow ${this.isLocked ? 'blocked' : ''}" title="Duration">
          <div class="volume-label">DUR</div>
          <input type="range" min="0" max="${DURATION_STEPS.length - 1}" step="1" .value=${String(this.durationIndex)}
            @input=${this.onDurationChange} tabindex=${this.isLocked ? '-1' : '0'} />
          <div class="value-display">${DURATION_STEPS[this.durationIndex].label}</div>
        </div>
        <div class="srow ${this.isLocked ? 'blocked' : ''}" title="Evolution">
          <div class="volume-label">EVL</div>
          <input type="range" min="-10" max="10" step="1" .value=${String(this.evolution)}
            @input=${this.onEvolutionChange} tabindex=${this.isLocked ? '-1' : '0'} />
          <div class="value-display">${this.evolution > 0 ? '+' : ''}${this.evolution}</div>
        </div>
        <div class="tools-row">
          <span></span>
          <div class="seed-chip ${this.seedLocked ? 'locked' : ''}" title="Lock the seed to repeat the same take on the next recording" @click=${this.toggleSeedLock}>SEED ${this.seedLocked ? '🔒 ' + this.seed : 'AUTO'}</div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'master-volume-panel': MasterVolumePanel;
  }
}
