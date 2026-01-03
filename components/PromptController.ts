
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import './WeightKnob';
import type { WeightKnob } from './WeightKnob';

import type { Prompt, PlaybackState } from '../types';
import { uiSounds } from '../utils/UISounds';

/** A single prompt input. */
@customElement('prompt-controller')
export class PromptController extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      padding: 0.5px;
      box-sizing: border-box;
      height: 100%;
      min-width: 0;
    }
    .prompt {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      background: rgba(25, 25, 25, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 3px;
      padding: 3px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      box-sizing: border-box;
      overflow: hidden;
    }
    :host-context(body.light-theme) .prompt {
      background: rgba(85, 55, 35, 0.75); 
      border-color: rgba(60, 40, 20, 0.4);
      box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 4px 8px rgba(0, 0, 0, 0.2);
    }

    .control-area {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      flex: 1;
      min-height: 0;
      gap: 3px;
    }

    .fader-panel {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 85%;
      padding: 0 4px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 2px;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);
      flex-shrink: 0;
    }
    :host-context(body.light-theme) .fader-panel {
      background: rgba(42, 27, 18, 0.4);
    }

    .fader-track {
      width: clamp(3px, 0.5vw, 5px);
      height: 100%;
      background: #050505;
      border-radius: 3px;
      position: relative;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.8);
      cursor: ns-resize;
      touch-action: none;
    }

    .fader-cap {
      width: clamp(8px, 1.2vw, 12px);
      height: 6px;
      background: linear-gradient(180deg, #ccc 0%, #666 100%);
      border-radius: 1px;
      border: 1px solid #333;
      box-shadow: 0 2px 4px rgba(0,0,0,0.6);
      position: absolute;
      top: 0;
      left: 50%;
      transform: translate(-50%, -50%);
      transition: top 0.05s linear;
      z-index: 2;
    }

    weight-knob {
      flex: 1;
      min-width: 0;
      max-height: 100%;
      aspect-ratio: 1 / 1;
      display: block;
    }
    
    .vu-meter {
      width: clamp(4px, 0.8vw, 8px);
      height: 85%;
      background: #020202;
      border-radius: 1px;
      padding: 1px;
      display: flex;
      flex-direction: column-reverse;
      justify-content: flex-start;
      align-items: center;
      box-shadow: inset 0 1px 3px rgba(0,0,0,1);
      box-sizing: border-box;
      flex-shrink: 0;
      gap: 2px;
      overflow: hidden;
    }
    .led {
      width: 100%;
      height: 4px;
      background: #0a0a0a;
      flex-shrink: 0;
      border-radius: 0.5px;
    }
    .led.active {
      background: var(--led-color, #fff);
      box-shadow: 0 0 5px var(--led-color);
    }
    
    #text {
      font-weight: 700;
      font-size: clamp(5px, 0.8vw, 8px);
      letter-spacing: 0.05px;
      text-transform: uppercase;
      width: 100%;
      padding: 1px 1px;
      margin-top: 3px;
      flex-shrink: 0;
      border-radius: 1.5px;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      background: #000;
      color: #ccc;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.9);
      cursor: text;
    }
    :host-context(body.light-theme) #text {
      background: #1a0f08;
      color: #e5e0d8;
      border: 1px solid #000;
    }

    @media (max-width: 600px) {
      .prompt {
        padding: 2px;
      }
      .control-area {
        gap: 2px;
      }
      .fader-panel {
        padding: 0 3px;
      }
      #text {
        font-size: 6px;
        margin-top: 1px;
      }
    }

    :host([filtered]) { opacity: 0.4; }
    :host([filtered]) #text { background: #300; }
    :host([readonly]) .control-area { opacity: 0.7; pointer-events: none; filter: grayscale(0.5); }
    :host([readonly]) #text { pointer-events: none; }
  `;

  @property({ type: String }) promptId = '';
  @property({ type: String }) text = '';
  @property({ type: Number }) weight = 0;
  @property({ type: Number }) volume = 0;
  @property({ type: String }) color = '';
  @property({ type: Boolean, reflect: true }) filtered = false;
  @property({ type: Boolean, reflect: true }) readonly = false;
  @property({ type: Boolean }) isActive = true;
  @property({ type: String }) playbackState: PlaybackState = 'stopped';

  @query('weight-knob') private weightInput!: WeightKnob;
  @query('#text') private textInput!: HTMLInputElement;

  @property({ type: Number }) audioLevel = 0;

  private lastValidText!: string;

  firstUpdated() {
    this.textInput.setAttribute('contenteditable', 'plaintext-only');
    this.textInput.textContent = this.text;
    this.lastValidText = this.text;
  }

  update(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('text') && this.textInput) {
      this.textInput.textContent = this.text;
    }
    super.update(changedProperties);
  }

  private dispatchPromptChange() {
    (this as unknown as HTMLElement).dispatchEvent(
      new CustomEvent<Prompt>('prompt-changed', {
        detail: {
          promptId: this.promptId,
          text: this.text,
          weight: this.weight,
          volume: this.volume,
          cc: -1,
          color: this.color,
        },
      }),
    );
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.textInput.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.resetText();
      this.textInput.blur();
    }
  }

  private resetText() {
    this.text = this.lastValidText;
    this.textInput.textContent = this.lastValidText;
  }

  private async updateText() {
    const newText = this.textInput.textContent?.trim();
    if (!newText) {
      this.resetText();
    } else {
      this.text = newText;
      this.lastValidText = newText;
    }
    this.dispatchPromptChange();
    this.textInput.scrollLeft = 0;
  }

  private onFocus() {
    if (this.readonly) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(this.textInput);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  private updateWeight() {
    if (this.readonly) return;
    this.weight = this.weightInput.value;
    this.volume = this.weight / 2;
    this.dispatchPromptChange();
  }

  private onFaderPointerDown(e: PointerEvent) {
    if (this.readonly) return;
    const track = e.currentTarget as HTMLElement;
    const updateFader = (pe: PointerEvent) => {
      const rect = track.getBoundingClientRect();
      const rawPct = 1 - Math.max(0, Math.min(1, (pe.clientY - rect.top) / rect.height));
      const snappedVolume = Math.round(rawPct * 10) / 10;
      if (snappedVolume !== this.volume) {
        uiSounds.playTick();
        this.volume = snappedVolume;
        this.weight = this.volume * 2;
        this.dispatchPromptChange();
      }
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', updateFader);
      window.removeEventListener('pointerup', onPointerUp);
      document.body.classList.remove('dragging');
    };
    window.addEventListener('pointermove', updateFader);
    window.addEventListener('pointerup', onPointerUp);
    document.body.classList.add('dragging');
    updateFader(e);
  }

  private renderLeds(level: number) {
    const numLeds = 14;
    const leds = [];
    for (let i = 0; i < numLeds; i++) {
        const threshold = i / numLeds;
        const isActive = level > threshold;
        leds.push(html`<div class="led ${isActive ? 'active' : ''}"></div>`);
    }
    return leds;
  }

  render() {
    const classes = classMap({ 'prompt': true });
    // Force level to 0 if channel is not active, even if knob is turned up
    const levelToRender = (this.filtered || !this.isActive) ? 0 : this.audioLevel;
    const currentLevel = (levelToRender * 8.0) * (this.weight / 2.0) * this.volume;
    const faderTop = (1 - this.volume) * 100;

    return html`<div class=${classes}>
      <div class="control-area">
        <div class="vu-meter" style="--led-color: ${this.color}">
          ${this.renderLeds(currentLevel)}
        </div>

        <weight-knob
          id="weight"
          .value=${this.weight}
          color=${(this.filtered || !this.isActive) ? '#444' : this.color}
          audioLevel=${levelToRender}
          ?readonly=${this.readonly}
          @input=${this.updateWeight}></weight-knob>

        <div class="fader-panel">
          <div class="fader-track" @pointerdown=${this.onFaderPointerDown}>
             <div class="fader-cap" style="top: ${faderTop}%"></div>
          </div>
        </div>
      </div>

      <span
        id="text"
        spellcheck="false"
        @focus=${this.onFocus}
        @keydown=${this.onKeyDown}
        @blur=${this.updateText}></span>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'prompt-controller': PromptController;
  }
}
