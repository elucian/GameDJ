import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

interface DjConfig {
  name: string; bass: number; reverb: number; filter: number; bpm: number;
  channels: { lead: boolean; alto: boolean; harmonic: boolean; bass: boolean; rhythm: boolean };
  warmup: number; eagerness: number; diversity: number; pause: number; duration: number;
}

@customElement('dj-preset-dialog')
export class DjPresetDialog extends LitElement {
  @property({ type: Boolean, reflect: true }) show = false;
  @state() private selectedIndex = 0;
  @state() private presets: DjConfig[] = [
    { name: 'Shadow', bass: 85, reverb: 40, filter: 70, bpm: 0, channels: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true }, warmup: 5, eagerness: 60, diversity: 40, pause: 10, duration: 30 },
    { name: 'Tiësto', bass: 70, reverb: 80, filter: 90, bpm: 4, channels: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true }, warmup: 2, eagerness: 90, diversity: 60, pause: 5, duration: 60 },
    { name: 'Krush', bass: 60, reverb: 90, filter: 50, bpm: -5, channels: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true }, warmup: 10, eagerness: 30, diversity: 80, pause: 15, duration: 45 },
    { name: 'Daft', bass: 80, reverb: 30, filter: 85, bpm: 2, channels: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true }, warmup: 3, eagerness: 70, diversity: 50, pause: 8, duration: 40 }
  ];

  static styles = css`
    :host { pointer-events: none; display: block; --muted-teal: #1f6b52; }
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
    .dj-preset-overlay {
      background: var(--surface-color);
      border: 1px solid var(--border-color);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 0 30px rgba(0,0,0,0.8);
      border-radius: 20px;
      width: 380px;
      color: var(--text-color);
      position: relative;
    }
    h3 { margin: 0 0 5px 0; color: var(--text-color); font-size: 16px; }
    .label { font-size: 12px; color: var(--text-muted); font-weight: bold; margin-bottom: 4px; display: flex; justify-content: space-between; }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 12px;
    }
    .preset-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--text-color);
      cursor: pointer;
      padding: 8px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-color);
      transition: background 0.2s;
      font-size: 13px;
    }
    .preset-btn:hover { background: var(--surface-active); }
    .preset-btn.active {
      border-color: var(--muted-teal);
      background: var(--bg-color);
      color: var(--muted-teal);
      font-weight: bold;
    }
    .channels {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .chan-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-color);
      cursor: pointer;
      padding: 6px 4px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      transition: background 0.2s;
      font-size: 11px;
    }
    .chan-toggle:hover { background: var(--surface-active); }
    .chan-toggle.active {
      border-color: var(--muted-teal);
      background: var(--bg-color);
      color: var(--muted-teal);
      font-weight: bold;
    }
    .slider-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
    .control { display: flex; flex-direction: column; margin-bottom: 4px; }
    input[type=range] {
      width: 100%;
      margin-top: 4px;
      accent-color: var(--muted-teal);
      filter: brightness(0.8);
      opacity: 0.8;
    }
    input[type=range]:hover { filter: brightness(1); opacity: 1; }
    .dialog-buttons { display: flex; gap: 10px; margin-top: 10px; }
    button {
      flex: 1;
      padding: 10px;
      cursor: pointer;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      transition: opacity 0.2s;
    }
    .apply-btn { background: #1e601e; color: #fff; }
    .cancel-btn { background: transparent; border: 1px solid var(--border-color); color: var(--text-color); }
    .apply-btn:hover, .cancel-btn:hover { background: var(--accent-color); color: #000; }
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
  `;

  connectedCallback() {
      super.connectedCallback();
      window.addEventListener('keydown', this.handleKeyDown);
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      window.removeEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
      if (this.show && e.key === 'Escape') this.cancelSelection();
  };

  render() {
    if (!this.show) return html``;
    const p = this.presets[this.selectedIndex];
    return html`
      <div class='modal-backdrop' @click=${(e: MouseEvent) => e.target === e.currentTarget && this.cancelSelection()}>
        <div class='dj-preset-overlay'>
          <button class="close-x-btn" @click=${this.cancelSelection}>✕</button>
          <h3>DJ: ${p.name}</h3>

          <span class="label">PRESET</span>
          <div class='row'>${this.presets.map((_, i) => html`<div class='preset-btn ${this.selectedIndex === i ? 'active' : ''}' @click=${() => this.selectedIndex = i}>${this.presets[i].name}</div>`)}</div>

          <span class="label">CHANNELS</span>
          <div class='channels'>${Object.keys(p.channels).map(c => html`<div class='chan-toggle ${p.channels[c as keyof typeof p.channels] ? 'active' : ''}' @click=${() => this.toggleChan(c as keyof typeof p.channels)}>${c.toUpperCase()}</div>`)}</div>

          <div class='slider-grid'>
            ${this.renderSlider('Bass', 'bass', 0, 100)} ${this.renderSlider('Reverb', 'reverb', 0, 100)}
            ${this.renderSlider('Filter', 'filter', 0, 100)} ${this.renderSlider('BPM Off', 'bpm', -20, 20)}
            ${this.renderSlider('Warmup', 'warmup', 0, 20)} ${this.renderSlider('Eager', 'eagerness', 0, 100)}
            ${this.renderSlider('Diversity', 'diversity', 0, 100)} ${this.renderSlider('Pause', 'pause', 0, 30)}
          </div>
          <div class='dialog-buttons'>
            <button class='cancel-btn' @click=${this.cancelSelection}>Cancel</button>
            <button class='apply-btn' @click=${this.applySelection}>Apply</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderSlider(label: string, key: keyof DjConfig, min: number, max: number) {
    const val = (this.presets[this.selectedIndex] as any)[key];
    return html`<div class='control'><span class='label'>${label}<span>${val}</span></span><input type='range' .min=${min.toString()} .max=${max.toString()} .value=${val.toString()} @input=${(e: any) => this.updateValue(key, parseInt(e.target.value))}></div>`;
  }

  private toggleChan(chan: keyof DjConfig['channels']) {
    const p = { ...this.presets[this.selectedIndex] };
    p.channels = { ...p.channels };
    p.channels[chan] = !p.channels[chan];
    this.updatePreset(p);
  }

  private updateValue(key: keyof DjConfig, val: number) {
    const p = { ...this.presets[this.selectedIndex] };
    (p as any)[key] = val;
    this.updatePreset(p);
  }

  private updatePreset(p: DjConfig) {
    const newPresets = [...this.presets];
    newPresets[this.selectedIndex] = p;
    this.presets = newPresets;
  }

  private cancelSelection() { this.show = false; }

  private applySelection() {
    const p = this.presets[this.selectedIndex];
    const directive = `DJ: ${p.name}, BASS:${p.bass}%, REVERB:${p.reverb}%, FILTER:${p.filter}%, BPM:${p.bpm}, WARMUP:${p.warmup}s, EAGER:${p.eagerness}%, DIVERSITY:${p.diversity}%, PAUSE:${p.pause}s, CHANNELS:${Object.keys(p.channels).filter(c => p.channels[c as keyof typeof p.channels]).join(',')}`;
    this.dispatchEvent(new CustomEvent('send-dj-config', { detail: { directive, name: p.name }, bubbles: true, composed: true }));
    this.show = false;
  }
}
