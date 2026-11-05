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
  /** Locked: the DJ keeps these voices and this language, and only writes lyrics when there are none yet. */
  @property({ type: Boolean }) locked = false;
  private languages = ['Auto', 'English', 'Spanish', 'French', 'Portuguese', 'Italian', 'German', 'Latin', 'Korean', 'Japanese', 'Mandarin Chinese', 'Hindi', 'Romanian', 'Swahili', 'Irish Gaelic', 'Hawaiian'];
  @state() private activeSoloVoices = {
    'Soprano': false,
    'Alto': false,
    'Tenor': false,
    'Baritone': false
  };
  @state() private selectedChoir = 'None';
  private choirOptions = ['None', 'Church', 'Chamber', 'Gospel', 'Military', 'Youth', 'Children', 'Mixed'];

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
      width: 352px; /* 10% wider than 320px */
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
    .lyrics-tools { display: flex; gap: 8px; align-items: stretch; margin-bottom: 4px; }
    .lyrics-tools select {
      flex: 1; min-width: 0; padding: 6px; border-radius: 6px; background: var(--bg-color);
      color: var(--text-color); border: 1px solid var(--border-color); font-size: 12px;
    }
    .generate-btn, .copy-btn { flex: 1; padding: 6px 10px; background: #0b4c0b; color: #fff; cursor: pointer; border: none; border-radius: 6px; font-size: 12px; }
    .generate-btn:hover, .copy-btn:hover { background: #1e601e; }
    .generate-btn[disabled], .copy-btn[disabled] { cursor: not-allowed; background: #333; }
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
    .lock-btn { right: 40px; font-size: 12px; }
    .lock-btn.active { border-color: var(--accent-color); background: var(--accent-color); color: #000; }
    .random-dice-btn {
      width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--border-color);
      background: var(--bg-color); color: var(--text-color); cursor: pointer;
      display: flex; align-items: center; justify-content: center; font-size: 14px;
    }
    .random-dice-btn:hover { background: var(--accent-color); color: #000; }
    
    .apply-btn { background: #1e601e; color: #fff; }
    .cancel-btn { background: transparent; border: 1px solid var(--border-color); color: var(--text-color); }
    .apply-btn:hover, .cancel-btn:hover { background: var(--accent-color); color: #000; }
  `;

  render() {
    if (!this.show) return html``;
    return html`
      <div class="modal-backdrop" @click=${(e: Event) => { if (e.target === e.currentTarget) this.show = false; }}>
        <div class="vocal-prompt-overlay">
            <button class="close-x-btn" style="right: 160px" @click=${this.randomizeFormation} title="Randomize Formation">🎲</button>
            <button class="close-x-btn" style="right: 130px" @click=${this.triggerUpload} title="Upload Settings">⬆</button>
            <button class="close-x-btn" style="right: 100px" @click=${this.saveSongFile} title="Download Settings">⬇</button>
            <button class="close-x-btn lock-btn ${this.locked ? 'active' : ''}" style="right: 70px" @click=${() => this.toggleLock()}
                    title=${this.locked ? 'Voice settings locked: the DJ keeps your voices and language, and writes lyrics only when there are none' : 'Lock the voice settings so the DJ cannot change them'}>${this.locked ? '🔒' : '🔓'}</button>
            <input type="file" id="uploadInput" style="display:none" @change=${this.loadSongFile} accept=".json">
            <button class="close-x-btn" @click=${() => this.show = false}>✕</button>
            <h3>Voice Configuration</h3>
            <div class="slider-container">
              <label class="label">SONG TITLE</label>
              <input type="text" .value=${this.songName} @input=${(e: any) => this.songName = e.target.value} style="width:100%; box-sizing:border-box; padding:4px;">
            </div>

            ${this.renderSolo()}

            <div class="tabs">
                <button class="tab-btn ${this.tab === 'voices' ? 'active' : ''}" @click=${() => this.tab = 'voices'}>CHOIR</button>
                <button class="tab-btn ${this.tab === 'lyrics' ? 'active' : ''}" @click=${() => this.tab = 'lyrics'}>LYRICS</button>
            </div>

            ${this.tab === 'voices' ? this.renderChoir() : this.renderLyrics()}

            <div class="dialog-buttons">
                <button class="cancel-btn" @click=${() => this.cancelSelection()}>Cancel</button>
                <button class="apply-btn" @click=${() => this.applySelection()}>Apply</button>
            </div>
        </div>
      </div>
    `;
  }

  private cancelSelection() {
      this.activeSoloVoices = { Soprano: false, Alto: false, Tenor: false, Baritone: false };
      this.selectedChoir = 'None';
      this.vocalText = '';
      this.songName = '';
      window.dispatchEvent(new CustomEvent('vocal-state-changed', { 
          detail: { active: false }
      }));
      this.dispatchEvent(new CustomEvent('vocal-dialog-cancelled', { 
          bubbles: true, 
          composed: true 
      }));
      this.show = false;
  }

  private async randomizeFormation() {
      // Randomize individual voices (the grid items)
      const voices = Object.keys(this.activeSoloVoices) as (keyof typeof this.activeSoloVoices)[];
      // Ensure at least one voice is selected
      let anySelected = false;
      voices.forEach(v => {
          this.activeSoloVoices[v] = Math.random() > 0.5;
          if (this.activeSoloVoices[v]) anySelected = true;
      });
      if (!anySelected) this.activeSoloVoices[voices[Math.floor(Math.random() * voices.length)]] = true;
      
      // Randomize choir
      this.selectedChoir = this.choirOptions[Math.floor(Math.random() * this.choirOptions.length)];
      
      // Generate a new song title based on genre
      const title = await this.generateTitleTheme(this.genre, this.vocalText || 'new song');
      this.songName = title;
      
      this.requestUpdate();
  }

  private async generateTitleTheme(genre: string, lyrics: string): Promise<string> {
      this.generating = true;
      try {
          // Use the liveMusicHelper properly
          const helper = (window as any).liveMusicHelper || (this.getRootNode() as any)?.liveMusicHelper;
          if (!helper) {
              console.error("LiveMusicHelper not found for title generation");
              this.generating = false;
              return 'Untitled';
          }
          const prompt = `Style: ${genre}. Lyrics: "${lyrics.substring(0, 100)}...".\n\nGenerate a catchy song title for this. Output only the title.`;
          const result = await helper.generateLyrics(genre, 'Auto', 1, 1, prompt);
          this.generating = false;
          return result.trim().replace(/^TITLE:\s*/i, '');
      } catch (e) {
          console.error("Title generation failed:", e);
          this.generating = false;
          return 'Untitled';
      }
  }

  private renderSolo() {
    return html`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <span class="label">FORMATION</span>
      </div>
      <div class="voice-grid">
          ${Object.keys(this.activeSoloVoices).map(voice => html`
              <div class="checkbox-item ${this.activeSoloVoices[voice as keyof typeof this.activeSoloVoices] ? 'active' : ''}"
                   @click=${() => this.toggleSolo(voice as keyof typeof this.activeSoloVoices)}>
                  <input type="checkbox" .checked=${this.activeSoloVoices[voice as keyof typeof this.activeSoloVoices]} style="pointer-events:none">
                  ${voice}
              </div>
          `)}
      </div>`;
  }

  // The CHOIR label is replaced by the CHOIR / LYRICS tab buttons above
  private renderChoir() {
    return html`
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
          <button class="generate-btn" ?disabled=${this.generating} @click=${() => this.requestGeneration()}>${this.generating ? 'Writing...' : 'Generate'}</button>
          <button class="copy-btn" ?disabled=${!this.vocalText.trim()} @click=${this.copyLyrics}>Copy</button>
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

  private toggleLock() {
      this.locked = !this.locked;
      this.dispatchEvent(new CustomEvent('voice-lock-changed', { detail: this.locked, bubbles: true, composed: true }));
  }

  /** Language chosen for the lyrics ('Auto' = picked by genre). */
  public get language() { return this.lyricsLang; }
  public setLanguage(language: string) { if (this.languages.includes(language)) this.lyricsLang = language; }

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

  private triggerUpload() {
    this.shadowRoot?.getElementById('uploadInput')?.click();
  }

  private saveSongFile() {
      const data = JSON.stringify({
          solos: this.getVoices().solos,
          choir: this.getVoices().choir,
          vocalText: this.vocalText,
          lyricsLang: this.lyricsLang,
          genre: this.genre,
          style: (window as any).topToolbar?.musicStyle || 'Synth-Pop',
          songName: this.songName
      });
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.songName.replace(/\s+/g, '_') || 'voice_settings'}.json`;
      a.click();
      URL.revokeObjectURL(url);
  }

  private loadSongFile(e: Event) {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          const data = JSON.parse(event.target?.result as string);
          this.setVoices(data.solos, data.choir);
          this.vocalText = data.vocalText;
          this.lyricsLang = data.lyricsLang;
          this.genre = data.genre;
          this.songName = data.songName;
          if (data.style && (window as any).topToolbar) {
              (window as any).topToolbar.musicStyle = data.style;
          }
          this.requestUpdate();
      };
      reader.readAsText(file);
  }

  private copyLyrics() {
      navigator.clipboard.writeText(this.vocalText).then(() => {
          this.dispatchEvent(new CustomEvent('toast', { detail: 'Lyrics copied to clipboard', bubbles: true, composed: true }));
      });
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
