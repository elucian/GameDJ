
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
    /* A raised bezel around the two displays, like the front panel of a real device */
    .bezel {
      display: flex;
      gap: 8px;
      align-items: stretch;
      padding: 8px;
      border-radius: 10px;
      background: linear-gradient(145deg, #3a3d40 0%, #23262a 55%, #17191c 100%);
      border: 2px solid;
      border-color: #5b5f64 #101214 #0a0b0c #4a4e53;
      box-shadow:
        0 3px 6px rgba(0, 0, 0, 0.6),
        0 1px 0 rgba(255, 255, 255, 0.12) inset,
        0 -1px 0 rgba(0, 0, 0, 0.5) inset;
    }
    .display-box { flex: 1 1 0; min-width: 0; }

    /* Right panel: what is actually sent to Lyria (voices, lyrics, prompt) */
    .prompt-box {
      flex: 1.4 1 0;
      min-width: 0;
      border-radius: 4px;
      background: #000;
      border: 1px solid rgba(255, 255, 255, 0.05);
      box-shadow: inset 0 2px 8px rgba(0,0,0,1);
      overflow-y: auto;
      color: #9fb8ad;
      scrollbar-width: thin;
      scrollbar-color: #555 #000;
    }
    .prompt-box .p-head { color: var(--accent-color); font-weight: 700; letter-spacing: 1px; margin-right: 6px; }
    .prompt-box .p-row { overflow-wrap: anywhere; }
    .prompt-box .p-empty { opacity: 0.4; }

    .display-box {
      font-family: 'Courier New', Courier, monospace;
      font-weight: 700;
      font-size: clamp(12px, 2vw, 14.55px);
      letter-spacing: 1px;
      /* Removed text-transform: uppercase to support mixed case messages */
      width: 100%;
      position: relative;
      /* Message log: a fixed 4-line window with a scroll bar; the newest line is at the bottom and older ones fade */
      line-height: 1.5em;
      height: calc(4 * 1.5em + 12px);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: #555 #000;
      padding: 6px 16px;
      border-radius: 4px;
      background: #000;
      box-shadow: inset 0 2px 8px rgba(0,0,0,1);
      box-sizing: border-box;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    /* Both displays share the same font, size, line height, padding and height */
    .display-box, .prompt-box {
      font-family: 'Courier New', Courier, monospace;
      font-weight: 700;
      font-size: clamp(12px, 2vw, 14.55px);
      letter-spacing: 1px;
      line-height: 1.5em;
      height: calc(4 * 1.5em + 12px);
      padding: 6px 16px;
      box-sizing: border-box;
    }

    /* Long messages wrap; a short log sits at the bottom of the window */
    .log-line { white-space: normal; overflow-wrap: anywhere; min-height: 1.5em; flex-shrink: 0; opacity: 0.4; }
    .log-line:first-child { margin-top: auto; }
    .log-line.latest { opacity: 1; }
    .log-line.error { color: #FF3B30; }

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
      /* Same raised bezel as the message displays, around all the knobs */
      padding: 8px;
      border-radius: 10px;
      background: linear-gradient(145deg, #3a3d40 0%, #23262a 55%, #17191c 100%);
      border: 2px solid;
      border-color: #5b5f64 #101214 #0a0b0c #4a4e53;
      box-shadow:
        0 3px 6px rgba(0, 0, 0, 0.6),
        0 1px 0 rgba(255, 255, 255, 0.12) inset,
        0 -1px 0 rgba(0, 0, 0, 0.5) inset;
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
      .bezel { flex-direction: column; padding: 6px; }
      .display-box, .prompt-box { 
        font-size: 10.5px; 
        padding: 4px 10px;
        height: calc(4 * 1.5em + 8px);
      }
      .grid-container { 
        padding: 2px 8px; 
      }
      #grid { 
        aspect-ratio: 1.5 / 1; 
        gap: 1.5px;
        padding: 6px;
      }
    }
  `;

  private prompts: Map<string, Prompt> = new Map();

  @property({ type: String }) public playbackState: PlaybackState = 'stopped';
  @state() public audioLevel = 0;
  @state() private messageType: 'info' | 'error' = 'info';
  @state() private log: { text: string; type: 'info' | 'error' }[] = [{ text: 'SYSTEM READY', type: 'info' }];
  @state() private voicesInfo = '';
  @state() private lyricsInfo = '';
  @state() private promptInfo = '';

  /** Right panel content: the voices, the lyrics (or vocal prompt) and the prompt currently sent to Lyria. */
  protected updated(changed: Map<string, unknown>) {
    // Keep the newest message in view
    if (changed.has('log')) {
      const box = this.shadowRoot?.querySelector('.display-box') as HTMLElement | null;
      if (box) box.scrollTop = box.scrollHeight;
    }
  }

  public setPromptInfo(info: { voices?: string; lyrics?: string; prompt?: string }) {
    if (info.voices !== undefined) this.voicesInfo = info.voices;
    if (info.lyrics !== undefined) this.lyricsInfo = info.lyrics;
    if (info.prompt !== undefined) this.promptInfo = info.prompt;
  }
  
  @property({ type: Boolean }) public interactionEnabled = false;

  @property({ type: Object })
  private filteredPrompts = new Set<string>();

  constructor() {
    super();
  }

  /** Empties both top text panels (dice, reset): the message log restarts and the prompt info goes blank. */
  public clearPanels() {
    this.log = [];
    this.voicesInfo = ''; this.lyricsInfo = ''; this.promptInfo = '';
  }

  public setMessage(text: string, type: 'info' | 'error' = 'info') {
    this.messageType = type;
    const last = this.log[this.log.length - 1];
    // Countdowns and other repeating messages ("... IN 5S", "... IN 4S") update their line in place instead of
    // pushing a new one, so the log does not scroll and flicker.
    const shape = (t: string) => t.replace(/[0-9]+(.[0-9]+)?/g, '#');
    if (last && last.text !== text && shape(last.text) === shape(text)) {
      this.log = [...this.log.slice(0, -1), { text, type }];
    } else if (last?.text !== text) {
      this.log = [...this.log, { text, type }].slice(-60);
    }
  }

  public setPrompts(prompts: Map<string, Prompt>) {
    this.prompts = prompts;
    (this as any).requestUpdate();
  }

  public reset() {
    for (const prompt of this.prompts.values()) {
        prompt.weight = 0;
        prompt.volume = 0;
    }
    const newPrompts = new Map(this.prompts);
    this.prompts = newPrompts;
    this.messageType = 'info';
    this.log = [{ text: 'SYSTEM READY', type: 'info' }];
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

  render() {
    return html`
      <div class="display-panel">
       <div class="bezel">
        <div class="display-box ${this.messageType}">
          ${this.log.map((l, i) => html`<div class="log-line ${l.type} ${i === this.log.length - 1 ? 'latest' : ''}" title=${l.text}>${l.text}</div>`)}
        </div>
        <div class="prompt-box">
          <div class="p-row"><span class="p-head">VOICES</span>${this.voicesInfo || html`<span class="p-empty">none</span>`}</div>
          <div class="p-row"><span class="p-head">LYRICS</span>${this.lyricsInfo || html`<span class="p-empty">none</span>`}</div>
          <div class="p-row"><span class="p-head">PROMPT</span>${this.promptInfo || html`<span class="p-empty">waiting for the first prompt</span>`}</div>
        </div>
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
