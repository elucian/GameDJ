import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('vocal-dialog')
export class VocalDialog extends LitElement {
  @property({ type: Boolean, reflect: true }) show = false;
  @property({ type: String }) genre = 'Pop';
  
  @state() private soloVolume = 80;
  @state() private choirVolume = 80;
  @state() private activeSoloVoices = {
    'Soprano': false,
    'Alto': false,
    'Tenor': false,
    'Baritone': false
  };
  @state() private selectedChoir = 'None';
  private choirOptions = ['None', 'Church', 'Military', 'Youth', 'Children', 'Mixed'];

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
            <div class="slider-container">
              <span class="label">Solo Volume: ${this.soloVolume}%</span>
              <input type="range" min="0" max="100" .value=${this.soloVolume} @input=${(e: any) => this.soloVolume = parseInt(e.target.value)}>
            </div>
            
            <span class="label">CHOIR</span>
            <div class="voice-grid">
                ${this.choirOptions.map(option => html`
                    <div class="radio-item ${this.selectedChoir === option ? 'active' : ''}" 
                         @click=${() => this.selectedChoir = option}>
                        ${option}
                    </div>
                `)}
            </div>
            <div class="slider-container">
              <span class="label">Choir Volume: ${this.choirVolume}%</span>
              <input type="range" min="0" max="100" .value=${this.choirVolume} @input=${(e: any) => this.choirVolume = parseInt(e.target.value)}>
            </div>
            
            <div class="dialog-buttons">
                <button class="cancel-btn" @click=${() => this.cancelSelection()}>Cancel</button>
                <button class="apply-btn" @click=${() => this.applySelection()}>Apply</button>
            </div>
        </div>
      </div>
    `;
  }

  private toggleSolo(voice: keyof typeof this.activeSoloVoices) {
      this.activeSoloVoices = { ...this.activeSoloVoices, [voice]: !this.activeSoloVoices[voice] };
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

  private applySelection() {
      const solos = Object.entries(this.activeSoloVoices)
          .filter(([_, active]) => active)
          .map(([voice]) => voice);
          
      const choirPart = this.selectedChoir !== 'None' ? `${this.selectedChoir} Choir` : '';
      
      const config = [...solos];
      if (choirPart) config.push(choirPart);
      
      const active = config.length > 0;
      
      // Instruction for Lyira with routing and volume
      const directive = active 
        ? `VOCAL CONFIG: ${config.join(', ')}, ROUTING: SOLO->Ch1, CHOIR->Ch2, SOLO_VOL:${this.soloVolume}%, CHOIR_VOL:${this.choirVolume}%` 
        : 'VOCAL CONFIG: None';
      
      this.dispatchEvent(new CustomEvent('send-vocal-command', { detail: directive }));
      window.dispatchEvent(new CustomEvent('vocal-state-changed', { 
          detail: { active: active }
      }));
      this.show = false;
  }
}
