import { css, html, LitElement, svg } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

const STORAGE_KEY_PRESETS = 'gamedj.djPresets.v2';
const STORAGE_KEY_SELECTED = 'gamedj.djPresetSelected.v2';
const STORAGE_KEY_APPLIED = 'gamedj.djPresetApplied.v2';

type ChannelMap = { lead: boolean; alto: boolean; harmonic: boolean; bass: boolean; rhythm: boolean };

interface Avatar { skin: string; hair: string; hairStyle: 'long' | 'bob' | 'short' | 'bald-beard' | 'quiff'; shirt: string; bg: string; phones: string; beard?: boolean; glasses?: boolean }

/** Everything a DJ personality is made of. The numeric preferences (0-100 unless noted) drive how the DJ conducts. */
export interface DjConfig {
  name: string;
  gender: 'woman' | 'man';
  tagline: string;
  avatar: Avatar;
  channels: ChannelMap;
  /** How fast the DJ moves knobs and changes sections. */
  eagerness: number;
  /** How much the DJ varies the ensemble (solos, duets, trios) instead of staying with the full band. */
  diversity: number;
  /** How rich the arrangement is: bigger ensembles, ornamentation and complexity knobs. */
  complexity: number;
  /** How intense the DJ plays: sets the evolution slider and the dynamics / brightness / groove knobs. */
  energy: number;
  /** Space, texture and organic colour (organic, space, atmosphere, texture knobs). */
  atmosphere: number;
  /** Seconds the DJ takes to warm the band up (knobs move slowly at first). */
  warmup: number;
  /** Lyria temperature (0.0 to 3.0, Lyria's default is 1.1): higher = more varied, lower = more predictable. */
  temperature: number;
  /** Most knobs the DJ may hold at once in modern styles (default 6). */
  maxKnobs: number;
}

const ALL_CHANNELS: ChannelMap = { lead: true, alto: true, harmonic: true, bass: true, rhythm: true };

const DEFAULT_DJS: DjConfig[] = [
  {
    name: 'Luna', gender: 'woman', tagline: 'Smooth, warm and patient. Lets the band breathe.',
    avatar: { skin: '#e8b88f', hair: '#2b1b3d', hairStyle: 'long', shirt: '#7b4fd1', bg: '#2a1f4a', phones: '#d9c7ff' },
    channels: { ...ALL_CHANNELS }, eagerness: 35, diversity: 55, complexity: 40, energy: 35, atmosphere: 85, warmup: 12, temperature: 1.0, maxKnobs: 5
  },
  {
    name: 'Roxy', gender: 'woman', tagline: 'Club energy. Hands on the knobs from the first bar.',
    avatar: { skin: '#f3c9a5', hair: '#ff3d8b', hairStyle: 'bob', shirt: '#1d1d1d', bg: '#4a1030', phones: '#ff9ac5', glasses: false },
    channels: { ...ALL_CHANNELS }, eagerness: 90, diversity: 70, complexity: 60, energy: 92, atmosphere: 35, warmup: 3, temperature: 1.4, maxKnobs: 8
  },
  {
    name: 'Marcus', gender: 'man', tagline: 'Groove classicist. Tight pocket, few surprises.',
    avatar: { skin: '#8a5a3c', hair: '#141414', hairStyle: 'short', shirt: '#2e7d5b', bg: '#12332a', phones: '#9be3c3', beard: true },
    channels: { ...ALL_CHANNELS, alto: false }, eagerness: 55, diversity: 30, complexity: 45, energy: 60, atmosphere: 50, warmup: 7, temperature: 1.0, maxKnobs: 6
  },
  {
    name: 'Viktor', gender: 'man', tagline: 'Experimental. Layers, twists and unexpected colours.',
    avatar: { skin: '#e9c4a3', hair: '#c9c9c9', hairStyle: 'quiff', shirt: '#c4561f', bg: '#3a1c0c', phones: '#ffb27a', glasses: true },
    channels: { ...ALL_CHANNELS }, eagerness: 70, diversity: 92, complexity: 92, energy: 72, atmosphere: 60, warmup: 4, temperature: 2.0, maxKnobs: 9
  },
  {
    name: 'Aria', gender: 'woman', tagline: 'Cinematic and layered. Builds slow, rich arrangements without drums.',
    avatar: { skin: '#d9a07a', hair: '#8a2a1a', hairStyle: 'long', shirt: '#1f9aa8', bg: '#0e2f36', phones: '#8fe3ee' },
    channels: { ...ALL_CHANNELS, rhythm: false }, eagerness: 45, diversity: 60, complexity: 85, energy: 50, atmosphere: 78, warmup: 10, temperature: 1.2, maxKnobs: 7
  },
  {
    name: 'Diego', gender: 'man', tagline: 'Rhythm first. Hot percussion, big groove, fast hands.',
    avatar: { skin: '#c68a5e', hair: '#3a2012', hairStyle: 'short', shirt: '#d9a21b', bg: '#3b2a08', phones: '#ffe08a' },
    channels: { ...ALL_CHANNELS }, eagerness: 82, diversity: 50, complexity: 55, energy: 86, atmosphere: 30, warmup: 4, temperature: 1.3, maxKnobs: 7
  }
];

const SLIDERS: { key: keyof DjConfig; label: string; hint: string; min: number; max: number; step?: number; unit?: string }[] = [
  { key: 'eagerness', label: 'Eagerness', hint: 'How fast the DJ turns knobs', min: 0, max: 100, unit: '%' },
  { key: 'diversity', label: 'Diversity', hint: 'Solos, duets and trios instead of the full band', min: 0, max: 100, unit: '%' },
  { key: 'complexity', label: 'Complexity', hint: 'Bigger ensembles, ornaments, rich arrangements', min: 0, max: 100, unit: '%' },
  { key: 'energy', label: 'Energy', hint: 'Sets the evolution slider; dynamics, brightness, groove', min: 0, max: 100, unit: '%' },
  { key: 'atmosphere', label: 'Atmosphere', hint: 'Space, texture and organic colour', min: 0, max: 100, unit: '%' },
  { key: 'warmup', label: 'Warm-up', hint: 'Seconds the band is warmed up slowly', min: 0, max: 30, unit: 's' },
  { key: 'temperature', label: 'Lyria temperature', hint: 'Predictable (low) to adventurous (high)', min: 0, max: 3, step: 0.1 },
  { key: 'maxKnobs', label: 'Max knobs', hint: 'Knobs held at once', min: 0, max: 10 }
];

const NUMERIC_KEYS = ['eagerness', 'diversity', 'complexity', 'energy', 'atmosphere', 'warmup', 'temperature', 'maxKnobs'] as const;

const clone = (list: DjConfig[]): DjConfig[] => list.map(d => ({ ...d, avatar: { ...d.avatar }, channels: { ...d.channels } }));

/** A simple illustrated portrait (headphones included), drawn per DJ from its avatar settings. */
function portrait(a: Avatar, gender: 'woman' | 'man') {
  const hairBack = a.hairStyle === 'long'
    ? svg`<path d="M22 58 C16 20 84 20 78 58 L80 92 L20 92 Z" fill="${a.hair}"/>`
    : a.hairStyle === 'bob'
      ? svg`<path d="M24 56 C18 20 82 20 76 56 L76 66 L24 66 Z" fill="${a.hair}"/>`
      : svg``;
  const hairFront = a.hairStyle === 'long' || a.hairStyle === 'bob'
    ? svg`<path d="M26 40 C30 18 70 18 74 40 C62 30 40 28 26 40 Z" fill="${a.hair}"/>`
    : a.hairStyle === 'quiff'
      ? svg`<path d="M26 42 C24 14 60 8 74 30 C76 36 74 40 74 42 C62 32 44 30 26 42 Z" fill="${a.hair}"/>`
      : svg`<path d="M27 40 C28 20 72 20 73 40 C62 31 38 31 27 40 Z" fill="${a.hair}"/>`;
  const beard = a.beard
    ? svg`<path d="M32 56 C32 76 68 76 68 56 C62 66 38 66 32 56 Z" fill="${a.hair}"/>`
    : svg``;
  const glasses = a.glasses
    ? svg`<g fill="none" stroke="#111" stroke-width="1.6"><rect x="34" y="45" width="13" height="9" rx="3"/><rect x="53" y="45" width="13" height="9" rx="3"/><path d="M47 49 H53"/></g>`
    : svg``;
  const lips = gender === 'woman' ? '#c2415d' : '#7a3b2e';
  return html`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="portrait">
      <defs><radialGradient id="bg-${a.shirt.slice(1)}" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="${a.phones}" stop-opacity="0.35"/><stop offset="1" stop-color="${a.bg}"/></radialGradient></defs>
      <rect width="100" height="100" fill="url(#bg-${a.shirt.slice(1)})"/>
      ${hairBack}
      <path d="M12 100 C14 78 32 74 50 74 C68 74 86 78 88 100 Z" fill="${a.shirt}"/>
      <rect x="43" y="62" width="14" height="14" rx="5" fill="${a.skin}"/>
      <ellipse cx="50" cy="46" rx="21" ry="25" fill="${a.skin}"/>
      ${hairFront}
      ${beard}
      <ellipse cx="41" cy="49" rx="2.2" ry="2.6" fill="#1b1b1b"/><ellipse cx="59" cy="49" rx="2.2" ry="2.6" fill="#1b1b1b"/>
      ${glasses}
      <path d="M44 62 Q50 67 56 62" fill="none" stroke="${lips}" stroke-width="2" stroke-linecap="round"/>
      <path d="M27 46 C26 14 74 14 73 46" fill="none" stroke="${a.phones}" stroke-width="4" stroke-linecap="round"/>
      <rect x="22" y="40" width="9" height="17" rx="4.5" fill="${a.phones}"/><rect x="69" y="40" width="9" height="17" rx="4.5" fill="${a.phones}"/>
    </svg>`;
}

@customElement('dj-preset-dialog')
export class DjPresetDialog extends LitElement {
  @property({ type: Boolean, reflect: true }) show = false;
  /** The saved DJs (what Apply wrote). */
  private presets: DjConfig[] = clone(DEFAULT_DJS);
  /** Edits in progress: Apply saves them, Cancel throws them away. */
  @state() private draft: DjConfig[] = clone(DEFAULT_DJS);
  @state() private selectedIndex = 0;
  /** The DJ that was applied last (the one that conducts). */
  @state() private appliedIndex = 0;

  static styles = css`
    :host { pointer-events: none; display: block; --muted-teal: #1f6b52; }
    :host([show]) { pointer-events: auto; }
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7);
      display: flex; justify-content: center; align-items: center;
      z-index: 999999; pointer-events: auto;
    }
    .dialog {
      background: var(--surface-color); border: 1px solid var(--border-color);
      box-shadow: 0 0 30px rgba(0,0,0,0.8); border-radius: 20px;
      width: min(860px, 94vw); max-height: 92vh; color: var(--text-color);
      display: flex; flex-direction: column; overflow: hidden; position: relative;
    }
    .title { padding: 16px 24px 10px; font-size: 16px; font-weight: bold; margin: 0; }
    .body { display: grid; grid-template-columns: 230px 1fr; min-height: 0; flex: 1; border-top: 1px solid var(--border-color); }
    .list { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-right: 1px solid var(--border-color); overflow-y: auto; }
    .dj-item {
      display: flex; align-items: center; gap: 10px; padding: 8px; cursor: pointer;
      border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-color); transition: background 0.2s;
    }
    .dj-item:hover { background: var(--surface-active); }
    .dj-item.selected { border-color: var(--muted-teal); box-shadow: 0 0 0 1px var(--muted-teal) inset; }
    .dj-item .thumb { width: 48px; height: 48px; border-radius: 50%; overflow: hidden; flex: none; }
    .dj-item .nm { font-weight: bold; font-size: 14px; }
    .dj-item .sub { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .dj-item .live { color: #3ddc97; font-weight: bold; }
    .detail { padding: 16px 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
    .head { display: flex; gap: 16px; align-items: center; }
    .head .big { width: 112px; height: 112px; border-radius: 16px; overflow: hidden; flex: none; border: 1px solid var(--border-color); }
    .head h3 { margin: 0 0 4px; font-size: 20px; }
    .head p { margin: 0; font-size: 12px; color: var(--text-muted); }
    .portrait { width: 100%; height: 100%; display: block; }
    .label { font-size: 11px; color: var(--text-muted); font-weight: bold; margin-bottom: 4px; display: flex; justify-content: space-between; }
    .hint { font-size: 9px; color: var(--text-muted); opacity: 0.8; margin-top: 2px; }
    .slider-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 22px; }
    .control { display: flex; flex-direction: column; }
    input[type=range] { width: 100%; margin-top: 4px; accent-color: var(--muted-teal); filter: brightness(0.8); opacity: 0.8; }
    input[type=range]:hover { filter: brightness(1); opacity: 1; }
    .channels { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
    .chan-toggle {
      display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 6px 4px;
      border: 1px solid var(--border-color); border-radius: 6px; font-size: 11px; transition: background 0.2s;
    }
    .chan-toggle:hover { background: var(--surface-active); }
    .chan-toggle.active { border-color: var(--muted-teal); background: var(--bg-color); color: var(--muted-teal); font-weight: bold; }
    .dialog-buttons { display: flex; gap: 10px; padding: 14px 24px; border-top: 1px solid var(--border-color); justify-content: flex-end; }
    button { padding: 10px 26px; cursor: pointer; border: none; border-radius: 8px; font-weight: 600; transition: opacity 0.2s; }
    .apply-btn { background: #1e601e; color: #fff; }
    .cancel-btn { background: transparent; border: 1px solid var(--border-color); color: var(--text-color); }
    .apply-btn:hover, .cancel-btn:hover { background: var(--accent-color); color: #000; }
    @media (max-width: 640px) { .body { grid-template-columns: 1fr; } .list { flex-direction: row; border-right: none; border-bottom: 1px solid var(--border-color); } .slider-grid { grid-template-columns: 1fr; } }
  `;

  connectedCallback() {
      super.connectedCallback();
      window.addEventListener('keydown', this.handleKeyDown);
      this.restoreFromStorage();
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      window.removeEventListener('keydown', this.handleKeyDown);
  }

  protected willUpdate(changed: Map<string, unknown>) {
      // Every time the dialog opens it starts from the saved DJs, with the conducting one selected
      if (changed.has('show') && this.show) {
          this.draft = clone(this.presets);
          this.selectedIndex = this.appliedIndex;
      }
  }

  // Each DJ keeps its own settings; they survive an app restart via localStorage.
  private restoreFromStorage() {
      try {
          const raw = localStorage.getItem(STORAGE_KEY_PRESETS);
          if (raw) {
              const saved = JSON.parse(raw) as Partial<DjConfig>[];
              if (Array.isArray(saved)) {
                  this.presets = this.presets.map(def => {
                      const s = saved.find(x => x && x.name === def.name);
                      if (!s) return def;
                      const merged: DjConfig = { ...def, channels: { ...def.channels, ...(s.channels || {}) } };
                      NUMERIC_KEYS.forEach(k => { if (typeof s[k] === 'number') (merged as any)[k] = s[k]; });
                      return merged;
                  });
              }
          }
          const idx = parseInt(localStorage.getItem(STORAGE_KEY_SELECTED) || '', 10);
          if (idx >= 0 && idx < this.presets.length) this.appliedIndex = idx;
          this.draft = clone(this.presets);
          this.selectedIndex = this.appliedIndex;
          // Re-engage the personality that was applied when the app was closed
          if (localStorage.getItem(STORAGE_KEY_APPLIED) === '1') setTimeout(() => this.emitConfig(), 0);
      } catch { /* localStorage unavailable or corrupt: keep defaults */ }
  }

  private saveToStorage() {
      try {
          localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(this.presets));
          localStorage.setItem(STORAGE_KEY_SELECTED, String(this.appliedIndex));
          localStorage.setItem(STORAGE_KEY_APPLIED, '1');
      } catch { /* ignore */ }
  }

  private handleKeyDown = (e: KeyboardEvent) => {
      if (this.show && e.key === 'Escape') this.cancelSelection();
  };

  render() {
    if (!this.show) return html``;
    const p = this.draft[this.selectedIndex];
    return html`
      <div class='modal-backdrop' @click=${(e: MouseEvent) => e.target === e.currentTarget && this.cancelSelection()}>
        <div class='dialog'>
          <h3 class="title">Choose your DJ</h3>
          <div class="body">
            <div class="list">
              ${this.draft.map((d, i) => html`
                <div class="dj-item ${i === this.selectedIndex ? 'selected' : ''}" @click=${() => { this.selectedIndex = i; }}>
                  <div class="thumb">${portrait(d.avatar, d.gender)}</div>
                  <div><div class="nm">${d.name}</div><div class="sub">${i === this.appliedIndex ? html`<span class="live">● On deck</span>` : d.gender === 'woman' ? 'DJ' : 'DJ'}</div></div>
                </div>`)}
            </div>
            <div class="detail">
              <div class="head">
                <div class="big">${portrait(p.avatar, p.gender)}</div>
                <div><h3>${p.name}</h3><p>${p.tagline}</p></div>
              </div>

              <div>
                <span class="label">PREFERRED CHANNELS</span>
                <div class='channels'>${(Object.keys(p.channels) as (keyof ChannelMap)[]).map(c => html`<div class='chan-toggle ${p.channels[c] ? 'active' : ''}' @click=${() => this.toggleChan(c)}>${c.toUpperCase()}</div>`)}</div>
              </div>

              <div class='slider-grid'>${SLIDERS.map(s => this.renderSlider(s))}</div>
            </div>
          </div>
          <div class='dialog-buttons'>
            <button class='cancel-btn' @click=${this.cancelSelection}>Cancel</button>
            <button class='apply-btn' @click=${this.applySelection}>Apply</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderSlider(s: typeof SLIDERS[number]) {
    const step = s.step ?? 1;
    const val = this.draft[this.selectedIndex][s.key] as number;
    return html`<div class='control'>
      <span class='label'>${s.label}<span>${step < 1 ? val.toFixed(1) : val}${s.unit ?? ''}</span></span>
      <input type='range' .min=${String(s.min)} .max=${String(s.max)} .step=${String(step)} .value=${String(val)}
        @input=${(e: any) => this.updateValue(s.key, step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value))}>
      <span class="hint">${s.hint}</span>
    </div>`;
  }

  private mutateSelected(fn: (d: DjConfig) => void) {
    const next = clone(this.draft);
    fn(next[this.selectedIndex]);
    this.draft = next;
  }

  private toggleChan(chan: keyof ChannelMap) { this.mutateSelected(d => { d.channels[chan] = !d.channels[chan]; }); }
  private updateValue(key: keyof DjConfig, val: number) { this.mutateSelected(d => { (d as any)[key] = val; }); }

  private cancelSelection() {
    this.show = false;
    this.dispatchEvent(new CustomEvent('dj-dialog-cancelled', { bubbles: true, composed: true }));
  }

  private applySelection() {
    this.presets = clone(this.draft);
    this.appliedIndex = this.selectedIndex;
    this.saveToStorage();
    this.emitConfig();
    this.show = false;
    // The DJ button stays selected: the app switches the DJ on
    this.dispatchEvent(new CustomEvent('dj-dialog-applied', { bubbles: true, composed: true }));
  }

  private emitConfig() {
    const p = this.presets[this.appliedIndex];
    this.dispatchEvent(new CustomEvent('send-dj-config', { detail: { name: p.name, config: p }, bubbles: true, composed: true }));
  }
}
