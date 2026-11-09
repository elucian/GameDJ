import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

// v3: the DJ roster changed (countries and portraits); settings saved for the old DJs no longer apply
const STORAGE_KEY_PRESETS = 'gamedj.djPresets.v3';
const STORAGE_KEY_SELECTED = 'gamedj.djPresetSelected.v3';
const STORAGE_KEY_APPLIED = 'gamedj.djPresetApplied.v3';
/** The DJ on deck, by id (the index above is from before the Robot DJ was added at the top of the list) */
const STORAGE_KEY_ON_DECK = 'gamedj.djOnDeck';
/** The Robot DJ: an android, first in the list, on deck the first time the app starts and after every dice roll */
export const ROBOT_DJ_ID = 'robot';
/** Its id before it was renamed (saved settings and the DJ on deck are carried over) */
const OLD_ROBOT_ID = 'random';

type ChannelMap = { lead: boolean; alto: boolean; harmonic: boolean; bass: boolean; rhythm: boolean };

/** Everything a DJ personality is made of. The numeric preferences (0-100 unless noted) drive how the DJ conducts. */
export interface DjConfig {
  /** Portrait file (public/djs/<id>.jpg) and the key of the DJ's saved settings */
  id: string;
  name: string;
  gender: 'woman' | 'man' | 'android';
  /** Where the DJ comes from and how old the DJ is (shown under the name) */
  country: string;
  age: number;
  tagline: string;
  /** The folk styles of the DJ's own country, as [genre, style] of the top bar */
  homeStyles: [string, string][];
  /** Chance (0-100) that the DJ, planning a piece, picks one of its home styles (genre, style and channels unlocked) */
  homeBias: number;
  /** How the DJ likes to arrange a piece (solo turns, dialogs, stabs, breaks...), for planning the song */
  arranging: string[];
  /** Chance (0-100) that each arranging habit shows up when the DJ plans a piece */
  habits: number;
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

// Fictional people: the avatars were drawn for GameDJ (tools/make-dj-portraits.mjs) and show no real musician.
const DEFAULT_DJS: DjConfig[] = [
  {
    // An aristocratic ancient android from the heavens (gold and silver, sapphire eyes): no country and no arranging
    // habits, average settings you can change. Its "home" is the music it prefers: every Gaming and Ambient style
    id: ROBOT_DJ_ID, name: 'Robot', gender: 'android', country: 'Android', age: 0,
    tagline: 'An aristocratic ancient android from the celestial spheres, with a bare silver head, a stylish gold headband, sapphire eyes and a headset with a mic and rubies and topazes on his armour. Plain average settings; it prefers game and ambient music.',
    homeStyles: [['Gaming', '8-Bit Retro'], ['Gaming', 'Epic Boss'], ['Gaming', 'RPG Adventure'], ['Gaming', 'Cyberpunk'], ['Gaming', 'Stealth'], ['Gaming', 'Dungeon Crawler'], ['Gaming', 'Racing Arcade'], ['Gaming', 'Cozy Simulation'], ['Gaming', 'Platformer Bounce'], ['Gaming', 'Survival Horror'], ['Gaming', 'Victory Theme'], ['Ambient', 'Deep Space'], ['Ambient', 'Lofi Chill'], ['Ambient', 'Cinematic'], ['Ambient', 'Nature Soundscape'], ['Ambient', 'Dark Ambient'], ['Ambient', 'Arctic Tundra'], ['Ambient', 'Solar Wind'], ['Ambient', 'Industrial Decay'], ['Ambient', 'Deep Forest'], ['Ambient', 'Australian Desert'], ['Ambient', 'African Jungle'], ['Ambient', 'Vast Ocean']], homeBias: 60,
    arranging: [], habits: 50,
    channels: { ...ALL_CHANNELS }, eagerness: 50, diversity: 50, complexity: 50, energy: 50, atmosphere: 50, warmup: 5, temperature: 1.1, maxKnobs: 6
  },
  {
    id: 'diego', name: 'Diego', gender: 'man', country: 'Spain', age: 31,
    tagline: 'Rhythm first. Hot percussion, palmas and stabs, a finale that speeds up.',
    homeStyles: [['Spanish', 'Flamenco'], ['Spanish', 'Paso Doble'], ['Spanish', 'Bolero'], ['Spanish', 'Guitar']], homeBias: 45,
    arranging: ['percussion break', 'stabs', 'call and response', 'accelerando ending'], habits: 80,
    channels: { ...ALL_CHANNELS }, eagerness: 82, diversity: 50, complexity: 55, energy: 86, atmosphere: 30, warmup: 4, temperature: 1.3, maxKnobs: 7
  },
  {
    id: 'jiwoo', name: 'Ji-woo', gender: 'woman', country: 'Korea', age: 24,
    tagline: 'Club energy from Seoul. Hooks first, builds and drops, hands on the knobs from bar one.',
    homeStyles: [['Oriental', 'Korean Folk'], ['Pop', 'K-Pop']], homeBias: 40,
    arranging: ['hook first', 'build and drop', 'stabs', 'call and response'], habits: 85,
    channels: { ...ALL_CHANNELS }, eagerness: 90, diversity: 70, complexity: 60, energy: 92, atmosphere: 35, warmup: 3, temperature: 1.4, maxKnobs: 8
  },
  {
    id: 'aria', name: 'Aria', gender: 'woman', country: 'Italy', age: 29,
    tagline: 'Cinematic and operatic. Layers enter one by one into a slow, rich swell, without drums.',
    homeStyles: [['European', 'Neapolitan Song'], ['European', 'Tarantella'], ['Opera', 'Romantic Opera'], ['Opera', 'Baroque Opera'], ['Western', 'Spaghetti Western']], homeBias: 45,
    arranging: ['layers enter one by one', 'cinematic swell', 'a cappella opening', 'no drums'], habits: 85,
    channels: { ...ALL_CHANNELS, rhythm: false }, eagerness: 45, diversity: 60, complexity: 85, energy: 50, atmosphere: 78, warmup: 10, temperature: 1.2, maxKnobs: 7
  },
  {
    id: 'ioana', name: 'Ioana', gender: 'woman', country: 'Romania', age: 42,
    tagline: 'Lautar spirit. A free doina opening, violin and cimbalom in dialog, a hora that runs faster to the end.',
    homeStyles: [['Romanian', 'Doina'], ['Romanian', 'Hora'], ['Romanian', 'Sârbă'], ['Romanian', 'Lautareasca'], ['Romanian', 'Bănățeană'], ['Romanian', 'Colinde']], homeBias: 50,
    arranging: ['free rubato opening', 'instrument dialog', 'accelerando ending'], habits: 80,
    channels: { ...ALL_CHANNELS }, eagerness: 60, diversity: 65, complexity: 60, energy: 70, atmosphere: 55, warmup: 6, temperature: 1.2, maxKnobs: 6
  },
  {
    id: 'marcus', name: 'Marcus', gender: 'man', country: 'Texas, USA', age: 45,
    tagline: 'Groove classicist from West Texas. Tight pocket, guitar and fiddle trading licks, few surprises.',
    homeStyles: [['Western', 'Country'], ['Western', 'Honky Tonk'], ['Western', 'Texas Swing'], ['Western', 'Bluegrass'], ['Western', 'Cowboy Ballad'], ['Western', 'Western Swing']], homeBias: 45,
    arranging: ['instrument trading', 'stop-time break', 'tag ending'], habits: 70,
    channels: { ...ALL_CHANNELS, alto: false }, eagerness: 55, diversity: 30, complexity: 45, energy: 60, atmosphere: 50, warmup: 7, temperature: 1.0, maxKnobs: 6
  },
  {
    id: 'luc', name: 'Luc', gender: 'man', country: 'France', age: 58,
    tagline: 'Smooth, warm and patient. Impressionist colours, musette waltzes, long intros and slow fades.',
    homeStyles: [['European', 'French Musette'], ['Classic', 'Impressionist'], ['Victorian', 'Parlour Waltz']], homeBias: 40,
    arranging: ['long intro', 'soft dynamics', 'solo turns', 'fade out'], habits: 75,
    channels: { ...ALL_CHANNELS }, eagerness: 35, diversity: 55, complexity: 40, energy: 35, atmosphere: 85, warmup: 12, temperature: 1.0, maxKnobs: 5
  },
  {
    id: 'siobhan', name: 'Siobhán', gender: 'woman', country: 'Ireland', age: 63,
    tagline: 'Session elder. Tunes in sets, a slow air into a jig into a reel, solo turns around the circle.',
    homeStyles: [['Irish', 'Air'], ['Irish', 'Jig'], ['Irish', 'Reel'], ['Irish', 'Folk'], ['Irish', 'Celtic Folk']], homeBias: 50,
    arranging: ['tune set', 'solo turns', 'unaccompanied verse', 'tag ending'], habits: 90,
    channels: { ...ALL_CHANNELS }, eagerness: 50, diversity: 75, complexity: 50, energy: 60, atmosphere: 55, warmup: 8, temperature: 1.1, maxKnobs: 5
  },
  {
    id: 'viktor', name: 'Viktor', gender: 'man', country: 'Russia', age: 66,
    tagline: 'Conservatory veteran turned experimenter. Slow builds, sudden key lifts, surprise solos, a grand finale.',
    homeStyles: [['European', 'Russian Folk'], ['Classic', 'Romantic'], ['Spiritual', 'Byzantine Chant']], homeBias: 40,
    arranging: ['slow build', 'key lift', 'surprise solo', 'grand finale'], habits: 75,
    channels: { ...ALL_CHANNELS }, eagerness: 70, diversity: 92, complexity: 92, energy: 72, atmosphere: 60, warmup: 4, temperature: 2.0, maxKnobs: 9
  },
  {
    id: 'imani', name: 'Imani', gender: 'woman', country: 'Chicago, USA', age: 38,
    tagline: 'Blues lover from the South Side. Slow-burning builds, call and response, stop-time breaks that hit hard.',
    homeStyles: [['Blues', 'Chicago Blues'], ['Blues', 'Delta Blues'], ['Blues', 'Soul Blues'], ['Blues', 'Texas Blues'], ['Spiritual', 'Gospel']], homeBias: 50,
    arranging: ['slow build', 'call and response', 'stop-time break', 'tag ending'], habits: 85,
    channels: { ...ALL_CHANNELS }, eagerness: 55, diversity: 55, complexity: 50, energy: 68, atmosphere: 62, warmup: 6, temperature: 1.1, maxKnobs: 6
  },
  {
    id: 'desmond', name: 'Desmond', gender: 'man', country: 'Jamaica', age: 33,
    tagline: 'Jazz specialist from Kingston. Heads and solos, trading fours, a surprise solo, a cool fade with an island lilt.',
    homeStyles: [['Jazz', 'Bebop'], ['Jazz', 'Cool Jazz'], ['Jazz', 'Jazz Fusion'], ['Jazz', 'Acid Jazz'], ['Jazz', 'Smooth Jazz'], ['Hawaiian', 'Island Reggae']], homeBias: 50,
    arranging: ['instrument trading', 'solo turns', 'surprise solo', 'fade out'], habits: 85,
    channels: { ...ALL_CHANNELS }, eagerness: 60, diversity: 80, complexity: 80, energy: 58, atmosphere: 55, warmup: 5, temperature: 1.3, maxKnobs: 7
  },
  {
    id: 'hao', name: 'Hao', gender: 'man', country: 'Beijing, China', age: 23,
    tagline: 'Sophisticated Beijing youngster with a conservatory ear and club taste. Guzheng meets deep house: layers enter one by one, instruments in dialog, a key lift and a polished drop.',
    homeStyles: [['Oriental', 'Chinese Traditional'], ['Electronic', 'Deep House'], ['Pop', 'Synth-Pop'], ['Classic', 'Modern Classical']], homeBias: 40,
    arranging: ['layers enter one by one', 'instrument dialog', 'key lift', 'build and drop'], habits: 80,
    channels: { ...ALL_CHANNELS }, eagerness: 70, diversity: 65, complexity: 75, energy: 72, atmosphere: 60, warmup: 4, temperature: 1.2, maxKnobs: 7
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
  { key: 'maxKnobs', label: 'Max knobs', hint: 'Knobs held at once', min: 0, max: 10 },
  { key: 'homeBias', label: 'Homeland', hint: 'Chance to play a folk style of home', min: 0, max: 100, unit: '%' },
  { key: 'habits', label: 'Signature', hint: 'How often its arranging habits show up', min: 0, max: 100, unit: '%' }
];

const NUMERIC_KEYS = ['eagerness', 'diversity', 'complexity', 'energy', 'atmosphere', 'warmup', 'temperature', 'maxKnobs', 'homeBias', 'habits'] as const;

const isAndroid = (d: DjConfig) => d.id === ROBOT_DJ_ID;
/** Under the name: where the DJ comes from and the age (the android has neither) */
const origin = (d: DjConfig) => isAndroid(d) ? 'Celestial android' : `${d.country} · ${d.age}`;

const clone = (list: DjConfig[]): DjConfig[] => list.map(d => ({ ...d, channels: { ...d.channels }, homeStyles: d.homeStyles.map(h => [...h] as [string, string]), arranging: [...d.arranging] }));

/** Raise when a portrait is redrawn: browsers keep the old picture in their cache otherwise */
const PORTRAIT_VERSION = 11;
/** The DJ's avatar (public/djs/<id>.jpg); the initial shows while it loads or when it is missing. */
function portrait(d: DjConfig) {
  return html`<div class="portrait" data-initial=${d.name[0]}><img src="/djs/${d.id}.jpg?v=${PORTRAIT_VERSION}" alt="Portrait of DJ ${d.name}" loading="lazy" @error=${(e: Event) => ((e.target as HTMLElement).style.display = 'none')}></div>`;
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
      width: min(830px, 94vw); max-height: 92vh; color: var(--text-color);
      display: flex; flex-direction: column; overflow: hidden; position: relative;
    }
    .title { padding: 12px 20px 8px; font-size: 15px; font-weight: bold; margin: 0; }
    .body { display: grid; grid-template-columns: 210px 1fr; min-height: 0; flex: 1; border-top: 1px solid var(--border-color); }
    /* One column that scrolls: contain: size keeps the list from making the dialog taller (the settings panel sets the height) */
    .list { display: flex; flex-direction: column; contain: size; gap: 5px; padding: 10px; border-right: 1px solid var(--border-color); overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--muted-teal) transparent; }
    .dj-item {
      display: flex; flex: none; align-items: center; gap: 8px; padding: 4px 6px; cursor: pointer; min-width: 0;
      border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-color); transition: background 0.2s;
    }
    .dj-item:hover { background: var(--surface-active); }
    .dj-item.selected { border-color: var(--muted-teal); box-shadow: 0 0 0 1px var(--muted-teal) inset; }
    .dj-item .thumb { width: 42px; height: 42px; border-radius: 50%; overflow: hidden; flex: none; }
    .dj-item .nm { font-weight: bold; font-size: 13px; }
    .dj-item > div:last-child { min-width: 0; }
    .dj-item .sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dj-item .sub { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .dj-item .live { color: #3ddc97; font-weight: bold; }
    .detail { padding: 12px 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
    .head { display: flex; gap: 16px; align-items: center; }
    .head .big { width: 104px; height: 104px; border-radius: 16px; overflow: hidden; flex: none; border: 1px solid var(--border-color); }
    .head h3 { margin: 0 0 2px; font-size: 18px; }
    .head p { margin: 0; font-size: 12px; color: var(--text-muted); }
    .portrait { width: 100%; height: 100%; display: block; position: relative; background: #2a1d12; }
    .portrait::before { content: attr(data-initial); position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; color: #c9a77a; }
    .portrait img { position: relative; width: 100%; height: 100%; object-fit: cover; display: block; }
    .head .home { margin-top: 6px; font-size: 11px; color: var(--text-muted); }
    .head .home b { color: var(--text-color); font-weight: 600; }
    .label { font-size: 11px; color: var(--text-muted); font-weight: bold; margin-bottom: 2px; display: flex; justify-content: space-between; }
    .hint { font-size: 9px; color: var(--text-muted); opacity: 0.8; margin-top: 0; }
    .slider-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 22px; }
    .control { display: flex; flex-direction: column; }
    input[type=range] { width: 100%; margin: 2px 0 0; accent-color: var(--muted-teal); filter: brightness(0.8); opacity: 0.8; }
    input[type=range]:hover { filter: brightness(1); opacity: 1; }
    .channels { display: flex; flex-wrap: wrap; gap: 4px 18px; }
    .chan-check { display: flex; align-items: center; gap: 5px; cursor: pointer; font-size: 11px; letter-spacing: 0.5px; user-select: none; }
    .chan-check input { margin: 0; accent-color: var(--muted-teal); cursor: pointer; }
    .chan-check.off { color: var(--text-muted); }
    .dialog-buttons { display: flex; gap: 10px; padding: 10px 20px; border-top: 1px solid var(--border-color); justify-content: flex-end; }
    button { padding: 8px 24px; cursor: pointer; border: none; border-radius: 8px; font-weight: 600; transition: opacity 0.2s; }
    .apply-btn { background: #1e601e; color: #fff; }
    .cancel-btn { background: transparent; border: 1px solid var(--border-color); color: var(--text-color); }
    .apply-btn:hover, .cancel-btn:hover { background: var(--accent-color); color: #000; }
    @media (max-width: 640px) { .body { grid-template-columns: 1fr; } .list { contain: none; overflow-x: auto; flex-direction: row; border-right: none; border-bottom: 1px solid var(--border-color); } .slider-grid { grid-template-columns: 1fr; } }
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
                      const s = saved.find(x => x && (x.id === def.id || (isAndroid(def) && x.id === OLD_ROBOT_ID)));
                      if (!s) return def;
                      const merged: DjConfig = { ...def, channels: { ...def.channels, ...(s.channels || {}) } };
                      NUMERIC_KEYS.forEach(k => { if (typeof s[k] === 'number') (merged as any)[k] = s[k]; });
                      return merged;
                  });
              }
          }
          // The DJ on deck when the app was closed; the first time, the Robot DJ
          let id = localStorage.getItem(STORAGE_KEY_ON_DECK);
          if (id === OLD_ROBOT_ID) id = ROBOT_DJ_ID;
          if (!id && localStorage.getItem(STORAGE_KEY_APPLIED) === '1') {
              // Saved before the Robot DJ existed: the index counts the list without it
              const old = DEFAULT_DJS.filter(d => !isAndroid(d))[parseInt(localStorage.getItem(STORAGE_KEY_SELECTED) || '', 10)];
              id = old?.id ?? null;
          }
          const idx = this.presets.findIndex(d => d.id === (id || ROBOT_DJ_ID));
          this.appliedIndex = idx >= 0 ? idx : 0;
      } catch { /* localStorage unavailable or corrupt: keep defaults */ }
      this.draft = clone(this.presets);
      this.selectedIndex = this.appliedIndex;
      // The DJ on deck sends its personality at once (the app switches it on when it starts)
      setTimeout(() => this.emitConfig(), 0);
  }

  private saveToStorage() {
      try {
          localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(this.presets));
          localStorage.setItem(STORAGE_KEY_ON_DECK, this.presets[this.appliedIndex].id);
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
                  <div class="thumb">${portrait(d)}</div>
                  <div><div class="nm">${d.name}</div><div class="sub">${i === this.appliedIndex ? html`<span class="live">● On deck</span>` : origin(d)}</div></div>
                </div>`)}
            </div>
            <div class="detail">
              <div class="head">
                <div class="big">${portrait(p)}</div>
                <div><h3>${p.name}</h3><p>${origin(p)}</p><p>${p.tagline}</p>
                  <div class="home">${isAndroid(p) ? html`Prefers: <b>${[...new Set(p.homeStyles.map(h => h[0]))].join(' and ')}</b>` : html`Home styles: <b>${p.homeStyles.map(h => h[1]).join(', ')}</b>`}</div></div>
              </div>

              <div>
                <span class="label">PREFERRED CHANNELS</span>
                <div class='channels'>${(Object.keys(p.channels) as (keyof ChannelMap)[]).map(c => html`<label class='chan-check ${p.channels[c] ? '' : 'off'}'><input type='checkbox' .checked=${p.channels[c]} @change=${() => this.toggleChan(c)}>${c.toUpperCase()}</label>`)}</div>
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
    const dj = this.draft[this.selectedIndex];
    const val = dj[s.key] as number;
    // The android's Homeland is the chance to play the genres it prefers
    const android = isAndroid(dj) && s.key === 'homeBias';
    return html`<div class='control'>
      <span class='label'>${android ? 'Favourites' : s.label}<span>${step < 1 ? val.toFixed(1) : val}${s.unit ?? ''}</span></span>
      <input type='range' .min=${String(s.min)} .max=${String(s.max)} .step=${String(step)} .value=${String(val)}
        @input=${(e: any) => this.updateValue(s.key, step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value))}>
      <span class="hint">${android ? 'Chance to play a Gaming or Ambient style' : s.hint}</span>
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

  /** Put a DJ on deck without the dialog (the dice hand over to the Robot DJ); saved like Apply. */
  public putOnDeck(id: string) {
    const idx = this.presets.findIndex(d => d.id === id);
    if (idx < 0) return;
    this.appliedIndex = idx;
    this.selectedIndex = idx;
    this.saveToStorage();
    this.emitConfig();
  }

  private emitConfig() {
    const p = this.presets[this.appliedIndex];
    this.dispatchEvent(new CustomEvent('send-dj-config', { detail: { name: p.name, config: p }, bubbles: true, composed: true }));
  }
}
