import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('vocal-dialog')
export class VocalDialog extends LitElement {
  @property({ type: Boolean, reflect: true }) show = false;
  @property({ type: String }) genre = 'Pop';
  
  /** Lyrics the DJ (or you) wrote for this song: real words in the genre's language, or open vowels. */
  @property({ type: String }) vocalText = '';
  @property({ type: Boolean }) generating = false;
  @state() private tab: 'voices' | 'lyrics' = 'voices';
  @state() private lyricsLang = 'Auto';
  private languages = ['Auto', 'English', 'Spanish', 'French', 'Portuguese', 'Italian', 'German', 'Latin', 'Korean', 'Japanese', 'Mandarin Chinese', 'Hindi', 'Romanian', 'Swahili', 'Irish Gaelic', 'Hawaiian'];
  @state() private activeSoloVoices = {
    'Soprano': false,
    'Alto': false,
    'Tenor': false,
    'Baritone': false
  };
  @state() private selectedChoir = 'None';
  private choirOptions = ['None', 'Church', 'Chamber', 'Military', 'Youth', 'Children', 'Mixed'];

  static styles = css`
    :host { pointer-events: none; display: block; }
    :host([show]) { pointer-events: auto; }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 999999;
      pointer-events: auto;
    }
    .vocal-prompt-overlay {
      background: var(--surface-color);
      border: 1px solid var(--border-color);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 0 30px rgba(0,0,0,0.8);
      border-radius: 20px;
      width: 320px;
      position: relative;
    }
    h3 { margin: 0 0 5px 0; color: var(--text-color); font-size: 16px; }
    .label { font-size: 12px; color: var(--text-muted); font-weight: bold; margin-bottom: 4px; display: block; }
    .voice-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 12px;
    }
    .checkbox-item, .radio-item {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-color);
      cursor: pointer;
      padding: 6px 8px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      transition: background 0.2s;
      font-size: 13px;
    }
    .checkbox-item:hover, .radio-item:hover { background: var(--bg-color); }
    .radio-item {
      position: relative;
      padding-left: 28px !important;
    }
    .radio-item::before {
      content: '';
      position: absolute;
      left: 8px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 1px solid var(--border-color);
      background: var(--bg-color);
    }
    .radio-item.active::before {
      background: var(--accent-color);
      border-color: var(--accent-color);
      box-shadow: inset 0 0 0 2px var(--bg-color);
    }
    .checkbox-item.active, .radio-item.active { 
      border-color: var(--accent-color); 
      background: var(--bg-color); 
      color: var(--accent-color);
      font-weight: bold;
    }
    
    .tabs { display: flex; gap: 6px; }
    .tab-btn {
      flex: 1; padding: 6px; border: 1px solid var(--border-color); border-radius: 6px;
      background: var(--bg-color); color: var(--text-muted); font-size: 12px; letter-spacing: 1px;
    }
    .tab-btn.active { border-color: var(--accent-color); color: var(--accent-color); }
    .lyrics-tools { display: flex; gap: 8px; align-items: stretch; margin-bottom: 8px; }
    .lyrics-tools select {
      flex: 1; min-width: 0; padding: 6px; border-radius: 6px; background: var(--bg-color);
      color: var(--text-color); border: 1px solid var(--border-color); font-size: 12px;
    }
    .generate-btn { flex: 1; padding: 6px 10px; background: var(--accent-color); color: #000; }
    .generate-btn[disabled] { cursor: not-allowed; }
    .slider-container { margin: 0 0 12px 0; }
    input[type=range] { 
      width: 100%; 
      margin-top: 4px; 
      accent-color: var(--accent-color); 
      filter: brightness(0.8);
      opacity: 0.8;
    }
    input[type=range]:hover { filter: brightness(1); opacity: 1; }

    .dialog-buttons {
      display: flex;
      gap: 10px;
      margin-top: 10px;
    }
    button {
      flex: 1;
      padding: 10px;
      cursor: pointer;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      transition: opacity 0.2s;
    }
    .close-x-btn {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 1px solid var(--border-color);
      background: var(--bg-color);
      color: var(--text-color);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      font-size: 14px;
    }
    .close-x-btn:hover { background: var(--accent-color); color: #000; }

    .apply-btn { background: #1e601e; color: #fff; }
    .cancel-btn { background: transparent; border: 1px solid var(--border-color); color: var(--text-color); }
    .apply-btn:hover, .cancel-btn:hover { background: var(--accent-color); color: #000; }
  `;

  render() {
    if (!this.show) return html``;
    return html`
      <div class="modal-backdrop" @click=${(e: Event) => { if (e.target === e.currentTarget) this.show = false; }}>
        <div class="vocal-prompt-overlay">
            <button class="close-x-btn" @click=${() => this.show = false}>✕</button>
            <h3>Voice Configuration</h3>
            
            <div class="tabs">
                <button class="tab-btn ${this.tab === 'voices' ? 'active' : ''}" @click=${() => this.tab = 'voices'}>CHOIR</button>
                <button class="tab-btn ${this.tab === 'lyrics' ? 'active' : ''}" @click=${() => this.tab = 'lyrics'}>LYRICS</button>
            </div>

            ${this.tab === 'voices' ? this.renderVoices() : this.renderLyrics()}

            <div class="dialog-buttons">
                <button class="cancel-btn" @click=${() => this.cancelSelection()}>Cancel</button>
                <button class="apply-btn" @click=${() => this.applySelection()}>Apply</button>
            </div>
        </div>
      </div>
    `;
  }

  private renderVoices() {
    return html`
      <span class="label">SOLO</span>
      <div class="voice-grid">
          ${Object.keys(this.activeSoloVoices).map(voice => html`
              <div class="checkbox-item ${this.activeSoloVoices[voice as keyof typeof this.activeSoloVoices] ? 'active' : ''}"
                   @click=${() => this.toggleSolo(voice as keyof typeof this.activeSoloVoices)}>
                  <input type="checkbox" .checked=${this.activeSoloVoices[voice as keyof typeof this.activeSoloVoices]} style="pointer-events:none">
                  ${voice}
              </div>
          `)}
      </div>
      <span class="label">CHOIR</span>
      <div class="voice-grid">
          ${this.choirOptions.map(option => html`
              <div class="radio-item ${this.selectedChoir === option ? 'active' : ''}" @click=${() => this.selectedChoir = option}>${option}</div>
          `)}
      </div>`;
  }

  private renderLyrics() {
    return html`
      <div class="lyrics-tools">
          <select .value=${this.lyricsLang} @change=${(e: any) => this.lyricsLang = e.target.value} title="Language of the lyrics">
              ${this.languages.map(l => html`<option value=${l} ?selected=${l === this.lyricsLang}>${l === 'Auto' ? 'Auto (by genre)' : l}</option>`)}
          </select>
          <button class="generate-btn" ?disabled=${this.generating} @click=${() => this.requestGeneration()}>${this.generating ? 'Writing...' : 'Generate Lyrics'}</button>
      </div>
      <textarea rows="7" style="width:100%;box-sizing:border-box;background:var(--bg-color);color:var(--text-color);border:1px solid var(--border-color);border-radius:6px;padding:6px;font-size:12px;resize:vertical"
                placeholder="Write your own lyrics or generate them. Lyria treats them as a hint for the language and mood of the vocals."
                .value=${this.vocalText} @input=${(e: any) => this.vocalText = e.target.value}></textarea>`;
  }

  private requestGeneration() {
      if (this.generating) return;
      this.dispatchEvent(new CustomEvent('request-lyrics-generation', {
          detail: { genre: this.genre, lang: this.lyricsLang, verseCount: 2, lineCount: 4 }, bubbles: true, composed: true
      }));
  }

  private toggleSolo(voice: keyof typeof this.activeSoloVoices) {
      this.activeSoloVoices = { ...this.activeSoloVoices, [voice]: !this.activeSoloVoices[voice] };
  }

  public getVoices(): { solos: string[]; choir: string } {
      return { solos: Object.entries(this.activeSoloVoices).filter(([, on]) => on).map(([v]) => v), choir: this.selectedChoir };
  }

  /** Set the options without sending anything (used to mirror the channels). */
  public setVoices(solos: string[], choir: string) {
      this.activeSoloVoices = { Soprano: false, Alto: false, Tenor: false, Baritone: false };
      solos.forEach(v => { if (v in this.activeSoloVoices) this.activeSoloVoices[v as keyof typeof this.activeSoloVoices] = true; });
      this.selectedChoir = this.choirOptions.includes(choir) ? choir : 'None';
  }

  /** The DJ sets the voice options itself when it picks a voice channel. */
  public djConfigure(solos: string[], choir: string) {
      this.setVoices(solos, choir);
      this.applySelection(true);
  }

  private cancelSelection() {
      this.activeSoloVoices = { Soprano: false, Alto: false, Tenor: false, Baritone: false };
      this.selectedChoir = 'None';
      window.dispatchEvent(new CustomEvent('vocal-state-changed', { 
          detail: { active: false }
      }));
      this.dispatchEvent(new CustomEvent('vocal-dialog-cancelled', { 
          bubbles: true, 
          composed: true 
      }));
      this.show = false;
  }

  private applySelection(fromDj = false) {
      const solos = Object.entries(this.activeSoloVoices)
          .filter(([_, active]) => active)
          .map(([voice]) => voice);
          
      const choirPart = this.selectedChoir !== 'None' ? `${this.selectedChoir} Choir` : '';
      
      const config = [...solos];
      if (choirPart) config.push(choirPart);
      
      const active = config.length > 0;
      
      // Instruction for Lyira with routing and volume
      // Lyria has no routing or per-voice volume: it only understands a short description of the voices
      const directive = active ? `VOCAL CONFIG: ${config.join(', ')}` : 'VOCAL CONFIG: None';
      
      // Your own choice re-tunes the voice channels (the DJ's choice already came from the channels)
      if (!fromDj) this.dispatchEvent(new CustomEvent('voices-applied', { detail: this.getVoices() }));
      this.dispatchEvent(new CustomEvent('send-vocal-command', { detail: directive }));
      this.dispatchEvent(new CustomEvent('lyrics-set', { detail: this.vocalText, bubbles: true, composed: true }));
      window.dispatchEvent(new CustomEvent('vocal-state-changed', { 
          detail: { active: active }
      }));
      this.show = false;
  }
}
