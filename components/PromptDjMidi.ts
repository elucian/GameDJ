
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import './PromptController';
import type { PlaybackState, Prompt } from '../types';

/** The grid of prompt inputs. */
@customElement('prompt-dj-midi')
export class PromptDjMidi extends LitElement {
  static styles = css`
    :host {
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: center;
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
      background-color: var(--panel-bg);
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
      background-blend-mode: overlay;
      padding: 8px 0;
    }
    
    .display-panel {
      width: 100%;
      padding: 4px 12px;
      box-sizing: border-box;
      flex-shrink: 0;
    }
    
    .display-box {
      font-family: 'Courier New', Courier, monospace;
      font-weight: 700;
      font-size: clamp(9px, 1.5vw, 11px);
      letter-spacing: 1px;
      /* Removed text-transform: uppercase to support mixed case messages */
      width: 100%;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 0 16px;
      border-radius: 4px;
      background: #000;
      box-shadow: inset 0 2px 8px rgba(0,0,0,1);
      box-sizing: border-box;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    .display-box.info {
      color: var(--accent-color);
      text-shadow: 0 0 8px rgba(61, 255, 171, 0.4);
    }
    .display-box.error {
      color: #FF3B30;
      text-shadow: 0 0 8px rgba(255, 59, 48, 0.4);
    }

    .grid-container {
      flex: 1;
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 4px 12px;
      min-height: 0;
      box-sizing: border-box;
    }

    #grid {
      height: 100%;
      width: 100%;
      max-width: 1200px;
      aspect-ratio: 2 / 0.95; 
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      grid-template-rows: repeat(3, 1fr);
      gap: 3px;
      box-sizing: border-box;
    }

    prompt-controller {
      width: 100%;
      height: 100%;
    }

    @media (max-width: 900px) {
      #grid {
        aspect-ratio: 2 / 1.1;
        gap: 2px;
      }
    }

    @media (max-width: 600px) {
      :host { 
        padding: 24px 0; 
      }
      .display-panel { 
        padding: 2px 8px; 
      }
      .display-box { 
        height: 24px; 
        font-size: 8px; 
        padding: 0 10px;
      }
      .grid-container { 
        padding: 12px 6px; 
      }
      #grid { 
        aspect-ratio: 1.5 / 1; 
        gap: 1.5px;
      }
    }
  `;

  private prompts: Map<string, Prompt> = new Map();

  @property({ type: String }) public playbackState: PlaybackState = 'stopped';
  @state() public audioLevel = 0;
  @state() private message = 'SYSTEM READY';
  @state() private messageType: 'info' | 'error' = 'info';
  
  @property({ type: Boolean }) public interactionEnabled = false;

  @property({ type: Object })
  private filteredPrompts = new Set<string>();

  constructor() {
    super();
  }

  public setMessage(text: string, type: 'info' | 'error' = 'info') {
    this.message = text;
    this.messageType = type;
  }

  public setPrompts(prompts: Map<string, Prompt>) {
    this.prompts = prompts;
    (this as any).requestUpdate();
  }

  public updatePromptWeight(text: string, weight: number) {
      const prompt = Array.from(this.prompts.values()).find(p => p.text === text);
      if (prompt) {
          prompt.weight = weight;
          prompt.volume = weight / 2;
          (this as any).requestUpdate();
      }
  }

  public reset() {
    for (const prompt of this.prompts.values()) {
        prompt.weight = 0;
        prompt.volume = 0;
    }
    const newPrompts = new Map(this.prompts);
    this.prompts = newPrompts;
    this.message = 'SYSTEM READY';
    this.messageType = 'info';
    (this as any).requestUpdate();

    (this as unknown as HTMLElement).dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.prompts }),
    );
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const { promptId, text, weight, volume, cc } = e.detail;
    const prompt = this.prompts.get(promptId);

    if (!prompt) return;

    if (this.interactionEnabled && weight !== prompt.weight) {
        if (text === 'Guidance') {
            this.setMessage(`GUIDANCE SET: ${Math.round(weight * 3)}`, 'info');
        } else {
            this.setMessage(`EVOLVING ${text.toUpperCase()}: ${(weight * 5).toFixed(0)}%`, 'info');
        }
        
        (this as unknown as HTMLElement).dispatchEvent(
          new CustomEvent('prompt-interacted', { detail: promptId })
        );
    }

    prompt.text = text;
    prompt.weight = weight;
    prompt.volume = volume;
    prompt.cc = cc;

    const newPrompts = new Map(this.prompts);
    newPrompts.set(promptId, prompt);

    this.prompts = newPrompts;
    (this as any).requestUpdate();

    (this as unknown as HTMLElement).dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.prompts }),
    );
  }

  public addFilteredPrompt(prompt: string) {
    this.filteredPrompts = new Set([...this.filteredPrompts, prompt]);
  }

  render() {
    return html`
      <div class="display-panel">
        <div class="display-box ${this.messageType}">
          ${this.message}
        </div>
      </div>
      <div class="grid-container">
        <div id="grid">${this.renderPrompts()}</div>
      </div>`;
  }

  private renderPrompts() {
    return [...this.prompts.values()].map((prompt) => {
      return html`<prompt-controller
        promptId=${prompt.promptId}
        ?filtered=${this.filteredPrompts.has(prompt.text)}
        text=${prompt.text}
        weight=${prompt.weight}
        volume=${prompt.volume}
        color=${prompt.color}
        audioLevel=${this.audioLevel}
        ?readonly=${!this.interactionEnabled}
        ?isActive=${true}
        @prompt-changed=${this.handlePromptChanged}>
      </prompt-controller>`;
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'prompt-dj-midi': PromptDjMidi;
  }
}
