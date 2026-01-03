
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { uiSounds } from '../utils/UISounds';

const FIBONACCI_SERIES = [1, 2, 3, 5, 8, 13, 21, 34, 55];

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

    .volume-label {
      font-size: 8px; 
      font-weight: bold;
      color: var(--text-muted);
      letter-spacing: 0.6px;
      text-transform: uppercase;
      line-height: 1;
      white-space: nowrap;
    }

    .value-display {
      font-family: monospace;
      font-size: 9px;
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
      font-size: 7px;
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
      font-size: 7px;
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

    .meters-container {
      display: flex;
      flex-direction: column;
      gap: 2px;
      width: 100%;
    }

    .vu-meter {
      width: 100%;
      height: 9px; 
      background: #050505;
      border-radius: 1px;
      display: flex;
      flex-direction: row;
      justify-content: flex-start;
      align-items: stretch;
      box-shadow: inset 0 1px 3px rgba(0,0,0,1);
      border: 1px solid #111;
      flex-shrink: 0;
      overflow: hidden;
      padding: 1px;
      box-sizing: border-box;
      gap: 2px;
      transition: height 0.2s ease;
    }

    .vu-meter.mono-expanded {
      height: 20px; 
    }

    .led-segment {
      width: 4px;
      background: #0a0a0a;
      transition: background 0.05s;
      border-radius: 0.5px;
      flex-shrink: 0;
    }

    .led-segment.active {
      background: var(--led-color, #3dffab);
      box-shadow: 0 0 6px var(--led-color);
    }
  `;

  @property({ type: Number }) volume = 0.8;
  @property({ type: Number }) evolution = 0;
  @property({ type: Number }) durationIndex = 2; // Default to 3m
  @property({ type: Number }) audioLevelL = 0;
  @property({ type: Number }) audioLevelR = 0;
  @property({ type: Boolean }) isStereo = true;
  @property({ type: Boolean }) isLocked = false;
  
  @state() private smoothedLevelL = 0;
  @state() private smoothedLevelR = 0;

  protected updated(changedProperties: Map<string, unknown>): void {
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

  private onEvolutionChange(e: Event) {
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
      const input = e.target as HTMLInputElement;
      const idx = parseInt(input.value, 10);
      if (idx !== this.durationIndex) {
          uiSounds.playTick();
          this.durationIndex = idx;
          const mins = FIBONACCI_SERIES[idx];
          (this as any).dispatchEvent(new CustomEvent('duration-changed', { detail: mins }));
          (this as any).requestUpdate();
      }
  }

  private renderLeds(level: number) {
    const numSegments = 30; 
    const segments = [];
    for (let i = 0; i < numSegments; i++) {
        const threshold = i / numSegments;
        const isActive = level > threshold;
        let color = '#3dffab';
        if (i > numSegments * 0.9) color = '#ff4444';
        else if (i > numSegments * 0.7) color = '#ffdd28';
        segments.push(html`<div class="led-segment ${isActive ? 'active' : ''}" style="--led-color: ${color}"></div>`);
    }
    return segments;
  }

  render() {
    const visualLevelL = this.smoothedLevelL * 7.0; 
    const visualLevelR = this.smoothedLevelR * 7.0; 

    return html`
      <div class="control-wrapper">
        <div class="side-by-side">
          <div class="column">
            <div class="label-row">
              <div class="volume-label">DUR.</div>
              <div class="value-display">${FIBONACCI_SERIES[this.durationIndex]}m</div>
            </div>
            <div class="slider-row">
              <input 
                type="range" 
                min="0" max="${FIBONACCI_SERIES.length - 1}" step="1" 
                .value=${this.durationIndex} 
                @input=${this.onDurationChange}
                ?disabled=${this.isLocked}
              />
            </div>
            <div class="range-markers">
               <span class="metric-text">1m</span>
               <span class="metric-text">55m</span>
            </div>
          </div>

          <div class="column">
            <div class="label-row">
              <div class="volume-label">EVO.</div>
              <div class="value-display">${this.evolution > 0 ? '+' : ''}${this.evolution}</div>
            </div>
            <div class="slider-row">
              <input 
                type="range" 
                min="-10" max="10" step="1" 
                .value=${this.evolution} 
                @input=${this.onEvolutionChange}
                ?disabled=${this.isLocked}
              />
            </div>
            <div class="range-markers">
               <span class="metric-text">-10</span>
               <span class="metric-text">+10</span>
            </div>
          </div>
        </div>

        <div class="label-row">
          <div class="volume-label">VOLUME</div>
          <div class="stereo-toggle ${this.isStereo ? 'on' : ''} ${this.isLocked ? 'disabled' : ''}" @click=${this.toggleStereo}>
            <span class="toggle-text ${!this.isStereo ? 'active' : ''}">MONO</span>
            <div class="switch-track">
              <div class="switch-thumb"></div>
            </div>
            <span class="toggle-text ${this.isStereo ? 'active' : ''}">STEREO</span>
          </div>
        </div>
        <div class="slider-row">
          <input 
            type="range" 
            min="0" max="100" step="1" 
            .value=${Math.round(this.volume * 100)} 
            @input=${this.onVolumeChange}
          />
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
}

declare global {
  interface HTMLElementTagNameMap {
    'master-volume-panel': MasterVolumePanel;
  }
}
