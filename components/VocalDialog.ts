import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import songsData from '../data/songs.json';
const LYRIC_TEMPLATES: Record<string, string> = {
  "Bohemian Rhapsody": "Is this the real life?\nIs this just fantasy?\nCaught in a landslide,\nNo escape from reality.",
  "Imagine": "Imagine there's no heaven,\nIt's easy if you try.",
  "Hotel California": "On a dark desert highway,\nCool wind in my hair.",
  "Yesterday": "Yesterday,\nAll my troubles seemed so far away.",
  "Smells Like Teen Spirit": "Load up on guns, bring your friends,\nIt's fun to lose and to pretend.",
  "Billie Jean": "She was more like a beauty queen from a movie scene.",
  "Hallelujah": "I've heard there was a secret chord,\nThat David played, and it pleased the Lord.",
  "Like a Rolling Stone": "Once upon a time you dressed so fine,\nYou threw the bums a dime in your prime.",
  "Purple Haze": "Purple haze all in my brain,\nLately things don't seem the same.",
  "Sweet Child O' Mine": "She's got a smile that it seems to me,\nReminds me of childhood memories."
};

const GENRE_LYRICS: Record<string, string> = {
    "Pop": "[Verse 1]\nNeon lights, city night, feeling the beat.\n[Chorus]\nOh, we're living for the sound.",
    "Jazz": "[Verse 1]\nBlue notes drifting in the smoke.\n[Chorus]\nSyncopated dreams in the night.",
    "Opera": "[Verse 1]\nO mio babbino caro,\nDestiny calls."
};


@customElement('vocal-dialog')
export class VocalDialog extends LitElement {
  @property({ type: Boolean }) show = false;
  @property({ type: String }) genre = 'Pop';
  @state() public vocalText = '';
  @state() private showLangPopup = false;
  @state() private showSongPopup = false;
  @state() private selectedLang = 'English';
  @state() private verseCount = 3;
  @state() private lineCount = 4;

  static styles = css`
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
      width: 400px;
      height: 480px;
      position: relative;
    }
    .vocal-prompt-overlay .close-btn {
      position: absolute;
      top: 10px;
      right: 15px;
      background: transparent;
      border: none;
      color: var(--text-color);
      cursor: pointer;
      font-size: 18px;
    }
    .vocal-prompt-overlay .dialog-controls {
      display: flex;
      gap: 8px;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .vocal-prompt-overlay .dialog-controls button {
      flex: 1;
      padding: 8px 16px;
      cursor: pointer;
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      color: var(--text-color);
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .vocal-prompt-overlay .dialog-controls button:hover {
      background: var(--accent-color);
      color: #000;
    }
    .vocal-prompt-overlay textarea {
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      color: var(--text-color);
      padding: 12px;
      font-size: 14px;
      border-radius: 12px;
      resize: none;
      width: 100%;
      flex-grow: 1;
      box-sizing: border-box;
      min-height: 100px;
    }
    .vocal-prompt-overlay .send-btn {
      padding: 10px 40px;
      cursor: pointer;
      background: var(--accent-color);
      border: none;
      color: #000;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 700;
      align-self: center;
      margin-top: 10px;
      display: inline-flex;
      justify-content: center;
      align-items: center;
      white-space: nowrap;
      text-transform: uppercase;
      opacity: 1 !important;
      width: fit-content;
      min-width: 150px;
    }
    .vocal-prompt-overlay .send-btn:hover {
      opacity: 0.9 !important;
    }
    .popup-panel {
      position: absolute;
      top: 60px;
      left: 10px;
      background: var(--surface-color);
      border: 1px solid var(--border-color);
      padding: 5px;
      width: 200px;
      max-height: 200px;
      overflow-y: auto;
      z-index: 20001;
      border-radius: 6px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    }
    .popup-panel div {
      padding: 8px;
      cursor: pointer;
      font-size: 13px;
    }
    .popup-panel div:hover {
      background: var(--accent-color);
      color: #000;
    }
  `;

  render() {
    if (!this.show) return html``;
    return html`
      <div class="modal-backdrop" @click=${(e: Event) => { if (e.target === e.currentTarget) this.show = false; }}>
        <div class="vocal-prompt-overlay">
            <button class="close-btn" @click=${() => this.show = false}>✕</button>
            <div class="dialog-controls">
                <button @click=${() => { this.showLangPopup = !this.showLangPopup; this.showSongPopup = false; }}>Lang: ${this.selectedLang}</button>
                <button @click=${() => { this.showSongPopup = !this.showSongPopup; this.showLangPopup = false; }}>Song</button>
                <button @click=${() => this.generateLyrics()}>Make</button>
            </div>
            <div class="dialog-controls">
                <div style="display:flex; align-items:center; gap:4px;">
                   <span style="font-size:10px; color:var(--text-muted)">Verses</span>
                   <button style="width:24px; padding:2px;" @click=${() => this.verseCount = Math.max(1, this.verseCount - 1)}>-</button>
                   <span style="min-width:16px; text-align:center">${this.verseCount}</span>
                   <button style="width:24px; padding:2px;" @click=${() => this.verseCount++}>+</button>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                   <span style="font-size:10px; color:var(--text-muted)">Lines</span>
                   <button style="width:24px; padding:2px;" @click=${() => this.lineCount = Math.max(1, this.lineCount - 1)}>-</button>
                   <span style="min-width:16px; text-align:center">${this.lineCount}</span>
                   <button style="width:24px; padding:2px;" @click=${() => this.lineCount++}>+</button>
                </div>
            </div>
            ${this.showLangPopup ? html`
                <div class="popup-panel">
                    ${['English', 'French', 'Spanish', 'German', 'Italian', 'Japanese', 'Chinese', 'Korean', 'Russian', 'Portuguese'].map(lang => html`
                        <div @click=${() => { this.selectedLang = lang; this.showLangPopup = false; }}>${lang}</div>
                    `)}
                </div>
            ` : ''}
            ${this.showSongPopup ? html`
                <div class="popup-panel">
                    ${songsData.songs.map(song => html`
                        <div @click=${() => { 
                            this.dispatchEvent(new CustomEvent('request-song-translation', {
                                detail: { genre: this.genre, lang: this.selectedLang, songTitle: song.title }
                            }));
                            this.showSongPopup = false; 
                        }}>${song.title}</div>
                    `)}
                </div>
            ` : ''}
            <textarea 
                placeholder="Enter vocal lyrics..."
                .value=${this.vocalText}
                @input=${(e: any) => this.vocalText = e.target.value}
            ></textarea>
            <button class="send-btn" @click=${() => this.sendVocalCommand()}>Save & Send</button>
        </div>
      </div>
    `;
  }

  private generateLyrics() {
      // Emit event to parent to handle generation
      this.dispatchEvent(new CustomEvent('request-lyrics-generation', {
          detail: { genre: this.genre, lang: this.selectedLang, verseCount: this.verseCount, lineCount: this.lineCount }
      }));
  }

  private sendVocalCommand() {
      if (!this.vocalText.trim()) return;
      
      // Update instruction before dispatching to ensure lyrics are included
      (this as any).dispatchEvent(new CustomEvent('send-vocal-command', { detail: this.vocalText.trim() }));
      
      this.vocalText = '';
      this.show = false;
  }
}
