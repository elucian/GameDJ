
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';
import type { PlaybackState, InstrumentSet } from '../types';
import { uiSounds } from '../utils/UISounds';
import { DURATION_STEPS } from './MasterVolumePanel';
import { MUSIC_DATA, getBandPool } from './TopToolbar';


import { FALLBACK_POOLS, getLyriaPool, VOICE_CHANNEL_POOLS, LYRIA_INSTRUMENTAL_POOLS, LEAD_VOICE_OPTIONS } from '../constants/instruments';
import { isVocalInstrument, isTraditionalGenre } from '../utils/LiveMusicHelper';


const FIBONACCI_SERIES = [1, 2, 3, 5, 8, 13, 21, 34];

type Slot = keyof InstrumentSet;
type TrackSource = 'Band' | 'Lyria';
const SLOTS: Slot[] = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'];

/**
 * The sound tracks the user can add (up to 5, one per engine channel). A track type fixes the channel it plays on and
 * which instrument family it draws from: `Band` = the genre's band pool of that channel, `Lyria` = its voice / orchestra / brass pool.
 */
const TRACK_TYPES: Record<string, { slots: Slot[]; source: TrackSource; voice?: boolean }> = {
  SOLO:       { slots: ['lead'], source: 'Band' },
  VOICE:      { slots: ['lead'], source: 'Lyria', voice: true },
  CHOIR:      { slots: ['alto'], source: 'Lyria', voice: true },
  HARMONY:    { slots: ['harmonic', 'alto'], source: 'Band' },
  BASS:       { slots: ['bass'], source: 'Band' },
  PERCUSSION: { slots: ['rhythm'], source: 'Band' },
  ORCHESTRA:  { slots: ['harmonic'], source: 'Lyria' },
  FANFARE:    { slots: ['bass'], source: 'Lyria' }
};
const DEFAULT_SLOT_TYPES: Record<TrackSource, Record<Slot, string>> = {
  Band: { lead: 'SOLO', alto: 'HARMONY', harmonic: 'HARMONY', bass: 'BASS', rhythm: 'PERCUSSION' },
  Lyria: { lead: 'VOICE', alto: 'CHOIR', harmonic: 'ORCHESTRA', bass: 'FANFARE', rhythm: 'PERCUSSION' }
};
const MAX_TRACKS = 5;
/** The voice track type each channel can turn into when a voice is put on it */
const VOICE_TRACK_OF: Partial<Record<Slot, string>> = { lead: 'VOICE', alto: 'CHOIR' };
/** How many tracks a dice roll switches on, per genre (min, max) */
const DICE_TRACK_COUNT: Record<string, [number, number]> = {
  Pop: [3, 5], 'Hip Hop': [3, 5], Blues: [3, 4], Jazz: [3, 5], Electronic: [3, 5], Rock: [4, 5], Ambient: [2, 3], Gaming: [3, 5],
  Classic: [3, 5], Renascentist: [2, 4], Victorian: [3, 4], Spiritual: [2, 4], African: [3, 5], Indian: [3, 4], Irish: [3, 4],
  Spanish: [3, 4], Oriental: [2, 4], Romanian: [3, 4], European: [3, 4], Western: [3, 4], Hawaiian: [2, 3], Marching: [4, 5], Opera: [3, 5]
};
/** Genres driven by rhythm and bass: the dice prefer those tracks for them */
const RHYTHMIC_GENRES = ['Pop', 'Hip Hop', 'Electronic', 'Rock', 'Gaming', 'Marching', 'African', 'Western', 'Blues'];
/** What each track type is called on screen */
const TRACK_LABELS: Record<string, string> = {
  SOLO: 'LEAD INSTRUMENT', VOICE: 'LEAD VOICE', CHOIR: 'BACKGROUND CHOIR', HARMONY: 'HARMONIC INSTRUMENT',
  BASS: 'BASS INSTRUMENT', PERCUSSION: 'RHYTHM INSTRUMENT', ORCHESTRA: 'ORCHESTRA INSTRUMENTS', FANFARE: 'BRASS INSTRUMENTS'
};

@customElement('right-sidebar')
export class RightSidebar extends LitElement {
  @property({ type: String }) genre: string = 'Pop';
  @property({ type: String }) musicStyle: string = 'Synth-Pop';

  // The dropdowns only ever offer recommended instruments: the orchestra/voice/choir pool of the genre on the
  // Lyria tab, and the generous genre pool on the Band tab.
  // Voice instruments are only offered while the voice master mode is on
  @property({ type: Boolean }) voiceEnabled: boolean = false;

  private getRecommendedInstruments(channel: keyof InstrumentSet): string[] {
      const base = this.getBaseRecommended(channel);
      if (!this.voiceEnabled) {
          const plain = base.filter(i => !isVocalInstrument(i));
          if (plain.length > 0) return plain;
          // A voice channel whose pool has only voices: use its instrumental fallback, never a voice
          const instrumental = this.slotSource(channel) === 'Lyria' ? LYRIA_INSTRUMENTAL_POOLS[channel] : undefined;
          return instrumental || (FALLBACK_POOLS[channel] || []).filter(i => !isVocalInstrument(i));
      }
      if (this.slotSource(channel) === 'Lyria') return base;
      // Band also offers the voice instruments (solo / duet / quartet, choirs) on the alto and harmonic channels
      // REMOVED: Band no longer offers voice instruments, only Lyria tab can have them.
      // const voices = (VOICE_CHANNEL_POOLS[channel] || []).filter(v => !base.includes(v));
      // return [...base, ...voices];
      return base;
  }

  private getBaseRecommended(channel: keyof InstrumentSet): string[] {
      if (this.slotTypes[channel].type === 'VOICE') return LEAD_VOICE_OPTIONS;
      if (this.slotSource(channel) === 'Lyria') return getLyriaPool(this.genre, channel);

      const genreDef = MUSIC_DATA[this.genre];
      if (!genreDef) return FALLBACK_POOLS[channel] || [];

      const pool = getBandPool(this.genre, channel);
      if (pool.length > 0) return pool;

      // Restrict fallback for traditional genres
      if (isTraditionalGenre(this.genre)) {
          return (FALLBACK_POOLS[channel] || []).filter(inst => 
              !['Synthesizer', 'Electronic Drums', 'Synth Bass', 'Bell Synth', 'Pads'].includes(inst)
          );
      }

      return FALLBACK_POOLS[channel] || [];
  }

  protected updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('genre') && !this.channelsLocked) {
      this.auditAndCommit({ ...this.settings });
    }
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--surface-color);
      border-left: 1px solid var(--border-color);
      box-sizing: border-box;
      color: var(--text-color);
      font-family: 'Google Sans', sans-serif;
      transition: background-color 0.3s ease, border-color 0.3s ease;
      overflow: hidden;
    }
    
    .sidebar-tabs-container {
      display: flex;
      background: var(--surface-header);
      border-bottom: 1px solid var(--border-color);
      flex-shrink: 0;
      align-items: center;
      justify-content: flex-start;
      padding: 0 12px;
      gap: 16px;
      height: 32px;
    }
    .sidebar-tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 4px 8px;
      font-size: 13px;
      font-weight: bold;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: color 0.2s, border-bottom-color 0.2s;
    }
    .sidebar-tab-btn.active {
      color: var(--accent-color);
      border-bottom-color: var(--accent-color);
    }
    .top-header {
      text-align: center;
      padding: 6px 0;
      font-size: 11.5px;
      font-weight: bold;
      letter-spacing: 1.2px;
      color: var(--accent-color);
      background: var(--surface-header);
      text-transform: uppercase;
    }
    .lira-control {
      background: var(--surface-active);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
      font-size: 12.65px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      --channel-color: var(--accent-color);
    }
    .lira-control.active {
      border-color: var(--accent-color);
      background: color-mix(in srgb, var(--accent-color) 10%, transparent);
      color: var(--accent-color);
    }

    .lira-control input[type="checkbox"].channel-toggle {
      pointer-events: none;
    }

    .section-header {
      background: var(--surface-header);
      padding: 0 12px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: flex-start;
      align-items: center;
      flex-shrink: 0;
      height: 24px;
      position: relative;
    }
    .section-title {
      color: var(--accent-color);
      font-size: 13.2px;
      font-weight: bold;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      position: absolute;
      left: 12px;
    }

    .header-btns {
      display: flex;
      align-items: center;
      gap: 4px;
      position: absolute;
      right: 12px;
    }

    .content {
      flex: 1;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-y: auto;
    }
    
    .channel-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: opacity 0.2s;
    }
    .channel-group.deactivated {
      /* solid colours: an off channel is shown by its hollow (transparent) toggle ring, not by fading the whole group */
    }

    .label-row {
      display: flex;
      align-items: center;
      justify-content: space-between; 
      width: 100%;
    }
    .channel-label {
      font-size: 10.5px;
      text-transform: uppercase;
      color: var(--text-muted);
      font-weight: 700;
      letter-spacing: 0.8px;
    }
    .channel-control {
      background: var(--surface-active);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      box-shadow: var(--inner-shadow);
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    input[type="checkbox"].channel-toggle {
      appearance: none;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      aspect-ratio: 1;
      /* Always the channel's own colour: a ring when the channel is off (transparent inside), a solid disc when it is on (no glow) */
      border: 2px solid var(--channel-color);
      box-sizing: border-box;
      border-radius: 50%;
      cursor: pointer;
      position: relative;
      margin: 0;
      background: transparent;
    }

    input[type="checkbox"].channel-toggle:checked {
      background: var(--channel-color);
    }
    
    input[type="checkbox"].channel-toggle:disabled {
      cursor: default;
    }

    select, select::picker(select) {
      appearance: base-select; /* Unlock picker styling */
    }

    select {
      width: 100%;
      background: var(--surface-color);
      color: var(--text-heading);
      border: 1px solid var(--border-color);
      outline: none;
      font-size: 15.18px;
      cursor: pointer;
      padding: 0 2px;
      font-family: monospace;
      border-radius: 2px;
      height: 25px;
      display: flex; align-items: center; line-height: 20px;
    }
    

    option, optgroup { 
      font-size: 15.18px; 
      padding-top: 0px;
      padding-bottom: 0px;
      margin: 0px;
      line-height: 0.54; 
    }

    @media (max-width: 1200px) {
      option, optgroup {
        padding-top: 0px;
        padding-bottom: 0px;
        line-height: 0.54;
      }
    }

    optgroup { 
      background: #111; 
      color: var(--accent-color); 
      font-weight: 800; 
      text-decoration: underline;
      margin-top: 0px;
    }
    
    .weight-slider { width: 100%; display: flex; align-items: center; gap: 8px; margin-top: 4px; }
    .weight-slider input[type=range] { flex: 1; min-width: 0; }
    input[type=range] {
      -webkit-appearance: none; width: 100%; background: transparent; height: 4px;
      border-radius: 2px; background: var(--border-color); outline: none; border: none;
    }
    input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none; height: 12px; width: 8px; border-radius: 1px;
      background: silver; margin-top: -4px; border: 1px solid #666;
    }
    .blocked { cursor: not-allowed; }
    .blocked > * { pointer-events: none; }

    .lock-btn {
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.08);
      padding: 3px; 
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #777;
      transition: all 0.15s ease-out;
      width: 20px; 
      height: 20px;
      box-sizing: border-box;
      box-shadow: inset 0 1px 1px rgba(255,255,255,0.05);
    }
    .lock-btn { transition: all 0.15s ease-out; }
    .lock-btn:hover {
      background: rgba(255,255,255,0.18);
      color: #fff;
      transform: scale(1.1);
      box-shadow: 0 0 6px rgba(255,255,255,0.25);
    }
    .lock-btn.locked {
      color: #ffcc00;
      background: rgba(255, 204, 0, 0.15);
      border-color: rgba(255, 204, 0, 0.3);
      box-shadow: 0 0 10px rgba(255, 204, 0, 0.1);
    }
    .lock-btn svg {
      width: 12px; height: 12px; fill: currentColor;
    }

    .bottom-controls {
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      background: var(--surface-color);
      border-top: 1px solid var(--border-color);
    }

    .manifest-panel {
      padding: 8px;
      background: rgba(0, 0, 0, 0.1);
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 4px;
    }

    .switch-unit {
      display: flex; flex-direction: column; align-items: center; gap: 0; cursor: pointer; pointer-events: auto;
    }
    
    /* Disabled: the switch body goes gray, but a lit LED stays lit (brighter) so the state is still readable */
    /* Unresponsive but never dimmed: same look, forbidden cursor */
    .switch-unit.disabled { cursor: not-allowed; }

    .switch-label {
      font-size: 8.8px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin-top: 4px;
    }

    .bottom-controls .section-title {
      font-size: 12.65px;
    }
    
    .switch-integrated-box {
      background: #0a0a0a; border: 1px solid #333; border-radius: 4px; padding: 4px 3px 3px 3px; display: flex; flex-direction: column; align-items: center; gap: 2px; transition: background 0.2s;
    }

    .switch-recess {
      width: 14px; height: 24px; background: #000; border-radius: 3px; position: relative; box-shadow: inset 0 2px 6px rgba(0,0,0,0.8); transition: opacity 0.2s;
    }
    .toggle-handle {
      width: 8px; height: 10px; background: linear-gradient(180deg, #888 0%, #444 100%); border-radius: 1px; position: absolute; transition: top 0.15s; left: 3px;
    }
    
    .switch-unit.on .toggle-handle { top: 2px; }
    .switch-unit:not(.on) .toggle-handle { top: 12px; }

    .led-dot {
      width: 5px; height: 5px; flex-shrink: 0; aspect-ratio: 1; border-radius: 50%; background-color: #5a2a1a; box-shadow: inset 0 0 2px rgba(0,0,0,0.5); transition: background-color 0.2s, box-shadow 0.2s;
    }
    .switch-unit.on .led-dot {
      background-color: #ff2a2a; box-shadow: 0 0 8px 2px #ff3a3a, 0 0 3px #ff8080;
    }

    master-volume-panel { flex-shrink: 0; }
    /* The song manifest stays as it was when the lyrics were asked for (instruments can still be chosen) */
    :host([lyricsbusy]) master-volume-panel.manifest-box, :host([lyricsbusy]) .header-btns { pointer-events: none; opacity: 0.55; }
    master-volume-panel.manifest-box { height: 112px; border-bottom: 1px solid var(--border-color); }
    master-volume-panel.volume-box { height: 112px; }
    .volume-header { border-top: 1px solid var(--border-color); }
    .header-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
    .mini-label { font-size: 9px; font-weight: 800; letter-spacing: 0.5px; color: var(--text-muted); width: 24px; flex-shrink: 0; }

    .tracks-title {
      font-size: 13px; font-weight: bold; letter-spacing: 1.2px; text-transform: uppercase; color: var(--accent-color);
      border-bottom: 2px solid var(--accent-color); padding: 4px 0 2px;
    }
    .add-wrap { position: relative; }
    .add-btn {
      width: 22px; height: 22px; padding: 0; border-radius: 50%; box-sizing: border-box;
      background: transparent; color: var(--accent-color); border: 1px solid var(--accent-color);
      font-size: 16px; font-weight: bold; line-height: 1; display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: background 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s;
    }
    .add-btn:hover { background: var(--accent-color); color: #000; box-shadow: 0 0 8px var(--accent-color); transform: scale(1.1); }
    .add-arrow { display: block; transition: transform 0.15s; }
    .add-arrow.open { transform: rotate(180deg); }
    .add-btn.blocked { cursor: not-allowed; opacity: 0.6; }
    .add-btn.blocked:hover { background: transparent; color: var(--accent-color); box-shadow: none; transform: none; }
    .add-menu {
      position: absolute; top: 100%; right: 0; margin-top: 3px; z-index: 50; width: max-content; min-width: 210px;
      background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 4px;
      box-shadow: 0 6px 16px rgba(0,0,0,0.5); display: flex; flex-direction: column; padding: 2px 0;
    }
    .add-item {
      display: flex; align-items: center; gap: 10px; white-space: nowrap; width: 100%;
      background: transparent; border: none; border-bottom: 1px solid var(--border-color); color: var(--text-heading);
      text-align: left; cursor: pointer; font-size: 12px; font-weight: 700; letter-spacing: 0.6px; padding: 7px 12px;
      transition: background 0.12s, color 0.12s;
    }
    .add-item:last-child { border-bottom: none; }
    .add-item:hover { background: var(--surface-active); color: var(--accent-color); }
    .add-item.disabled { color: var(--text-muted); cursor: not-allowed; opacity: 0.5; }
    .add-item.disabled:hover { background: transparent; color: var(--text-muted); }
    .add-check { margin: 0; width: 14px; height: 14px; flex-shrink: 0; accent-color: var(--accent-color); pointer-events: none; }
    .no-tracks { color: var(--text-muted); font-size: 12px; text-align: center; padding: 18px 8px; }
    .remove-x {
      width: 16px; height: 16px; padding: 0; border-radius: 50%; flex-shrink: 0; cursor: pointer;
      background: rgba(0,0,0,0.3); color: var(--text-muted); border: 1px solid var(--border-color);
      font-size: 9px; line-height: 1; display: flex; align-items: center; justify-content: center;
    }
    .remove-x:hover { color: #ff6666; border-color: #ff6666; }
    .remove-x.blocked { cursor: not-allowed; opacity: 0.5; }

    /* Phones: the sidebar dissolves into the page column (display: contents) so its sections can be
       placed apart: the master volume meters right below the record bar, the manifest and the sound
       tracks below the knobs (orders match index.css). */
    @media (max-width: 700px) {
      .volume-header, master-volume-panel.volume-box { order: 5; }
      .section-header:not(.volume-header), master-volume-panel.manifest-box { order: 8; }
      .sidebar-tabs-container, .content { order: 9; }
      master-volume-panel, .content { background: var(--surface-color); }
      .volume-header { border-top: none; }
      master-volume-panel.volume-box { border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
      master-volume-panel.manifest-box { flex-shrink: 0; }
      .content { flex: 0 0 auto; overflow: visible; }
    }
  `;

  @property({ type: String }) playbackState: PlaybackState = 'stopped';
  /** Lyrics are being written in the background: the song settings are frozen until they are ready. */
  @property({ type: Boolean, reflect: true }) lyricsBusy = false;
  @property({ type: Number }) volume = 0.8;
  @property({ type: Number }) audioLevelL = 0;
  @property({ type: Number }) audioLevelR = 0;
  @property({ type: Boolean }) isStereo = true;
  @property({ type: Boolean }) conductorActive = false;
  @property({ type: Number }) seed = 0;
  /** Song length in bars, shown under EVL */
  @property({ type: Number }) bars = 16;
  @property({ type: Boolean }) seedLocked = false;
  @property({ type: Boolean }) genreLocked = false;
  
  @state() private channelsLocked = false;
  @state() private manifestLocked = false;
  @state() private durationIndex = DURATION_STEPS.length - 1; // 3:00
  @property({ type: Number }) evolution = 0; 
  
  /** What each channel plays (track type) and where its instruments come from */
  @state() private slotTypes: Record<Slot, { type: string; source: TrackSource }> = {
    lead: { type: 'SOLO', source: 'Band' }, alto: { type: 'HARMONY', source: 'Band' }, harmonic: { type: 'HARMONY', source: 'Band' },
    bass: { type: 'BASS', source: 'Band' }, rhythm: { type: 'PERCUSSION', source: 'Band' }
  };
  @state() private addMenuOpen = false;

  private slotSource(slot: Slot): TrackSource { return this.slotTypes[slot].source; }

  /** A voice left a LEAD VOICE / BACKGROUND CHOIR track: the track goes back to the Band instrument of that channel. */
  public releaseVoiceTrack(slot: Slot) {
    if (TRACK_TYPES[this.slotTypes[slot].type]?.voice) {
      this.slotTypes = { ...this.slotTypes, [slot]: { type: DEFAULT_SLOT_TYPES.Band[slot], source: 'Band' } };
    }
  }

  /**
   * 'Lyria' while any track on stage draws from the Lyria families (voice, choir, orchestra, fanfare), else 'Band'.
   * Setting it puts every channel on that family's default track types.
   */
  get currentTab(): TrackSource {
    return SLOTS.some(s => this.settings[s].visible !== false && this.slotTypes[s].source === 'Lyria') ? 'Lyria' : 'Band';
  }
  set currentTab(tab: TrackSource) {
    const next = { ...this.slotTypes };
    SLOTS.forEach(s => { next[s] = { type: DEFAULT_SLOT_TYPES[tab][s], source: tab }; });
    this.slotTypes = next;
  }

  @property({ type: Number }) bpm = 110;
  @property({ type: Number }) bpmMin = 40;
  @property({ type: Number }) bpmMax = 200;


  @state() private savedWeights: Record<string, number> = { lead: 1, alto: 1, harmonic: 1, bass: 1, rhythm: 1 };

  @state() public settings: InstrumentSet = {
    lead: { instrument: FALLBACK_POOLS.lead[0], active: true, weight: 1.0, visible: true },
    alto: { instrument: FALLBACK_POOLS.alto[0], active: false, weight: 1.0, visible: false },
    harmonic: { instrument: FALLBACK_POOLS.harmonic[0], active: true, weight: 1.0, visible: true },
    bass: { instrument: FALLBACK_POOLS.bass[0], active: false, weight: 1.0, visible: false },
    rhythm: { instrument: FALLBACK_POOLS.rhythm[0], active: false, weight: 1.0, visible: false }
  };

  public get locks() { return { channels: this.channelsLocked, manifest: this.manifestLocked, duration: this.manifestLocked }; }

  private auditAndCommit(newSettings: InstrumentSet, channelToValidate?: keyof InstrumentSet) {
      if (channelToValidate) {
          const st = newSettings[channelToValidate];
          const instName = (st.instrument || "").trim().toLowerCase();
          const isNoInstrument = instName === 'none' || instName === 'n/a' || instName === "";
          
          if (isNoInstrument) {
              if (!this.channelsLocked) {
                  st.visible = false;
                  st.active = false;
                  st.instrument = "";
              } else {
                  st.instrument = this.getRecommendedInstruments(channelToValidate)[0];
                  st.active = true;
                  st.visible = true;
              }
          } else {
              this.validateCurrentInstrument(channelToValidate, st, newSettings);
          }
      } else {
          // Fallback behavior if no channel specified (validate all)
          const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
          channels.forEach(ch => {
              const st = newSettings[ch];
              const instName = (st.instrument || "").trim().toLowerCase();
              const isNoInstrument = instName === 'none' || instName === 'n/a' || instName === "";
              
              if (isNoInstrument) {
                  if (!this.channelsLocked) {
                      st.visible = false;
                      st.active = false;
                      st.instrument = "";
                  } else {
                      st.instrument = this.getRecommendedInstruments(ch)[0];
                      st.active = true;
                      st.visible = true;
                  }
              } else {
                  this.validateCurrentInstrument(ch, st, newSettings);
              }
          });
      }
      
      // Post-check for every change (dice, DJ, add track, locked channels...): a channel on stage must have an
      // instrument. When none could be chosen it is not included.
      SLOTS.forEach(ch => {
          const st = newSettings[ch];
          const name = (st.instrument || '').trim().toLowerCase();
          if (st.visible !== false && (name === '' || name === 'none' || name === 'n/a')) {
              newSettings[ch] = { ...st, instrument: '', visible: false, active: false };
          }
      });

      this.settings = { ...newSettings };
      
      (this as any).requestUpdate();
      this.dispatchChannelsChanged();
  }

  private validateCurrentInstrument(channel: keyof InstrumentSet, st: any, all?: Record<string, any>) {
      if (!st.instrument) return;
      const recommended = this.getRecommendedInstruments(channel);

      // If it's in recommended (style pool or fallback), it's valid — keep it
      if (recommended.includes(st.instrument)) return;

      // Anything else is replaced by a recommended instrument, preferably one no other channel plays
      const used = all ? Object.values(all).map(s => s.instrument) : [];
      const unused = recommended.filter(i => !used.includes(i));
      const pool = unused.length > 0 ? unused : recommended;
      if (pool.length > 0) st.instrument = pool[Math.floor(Math.random() * pool.length)];
  }

  public applyMatrixUpdate(detail: { manifest: any, instruments: any, weights?: any, style: string, pools: any }) {
      
      const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
      const newSettings = { ...this.settings };
      channels.forEach(ch => {
          if (!this.channelsLocked) {
              const recommended = detail.instruments[ch];
              if (recommended) {
                  newSettings[ch].instrument = recommended;
                  newSettings[ch].active = true;
                  if (detail.weights && detail.weights[ch] !== undefined) {
                      newSettings[ch].weight = detail.weights[ch];
                  }
              }
          }
      });
      this.auditAndCommit(newSettings);
  }

  /** Puts the duration slider on the first step that holds `mins` (the longest step when it is longer than all). `force` ignores the lock. */
  public setDuration(mins: number, force = false): number {
      const idx = DURATION_STEPS.findIndex(s => s.value >= mins - 1e-6);
      const i = idx === -1 ? DURATION_STEPS.length - 1 : idx;
      if (this.manifestLocked && !force) return DURATION_STEPS[this.durationIndex].value;
      this.durationIndex = i;
      (this as any).requestUpdate();
      return DURATION_STEPS[i].value;
  }

  /** The DJ mixes during play: sets the volume of the tracks on stage (0..1) and sends it to the engine. */
  public setChannelVolumes(vols: Partial<Record<keyof InstrumentSet, number>>) {
    const next = { ...this.settings };
    (Object.keys(vols) as Array<keyof InstrumentSet>).forEach(ch => {
      if (next[ch].visible === false) return;
      next[ch] = { ...next[ch], volume: Math.max(0, Math.min(1, vols[ch] ?? 1)) };
    });
    this.settings = next;
    this.requestUpdate();
    this.dispatchChannelsChanged();
  }

  /** Current song length in minutes (the DUR slider). */
  public get durationMinutes(): number { return DURATION_STEPS[this.durationIndex].value; }

  public setEvolution(val: number) {
      this.evolution = val;
      (this as any).requestUpdate();
  }

  private toggleChannelsLock() { 
    uiSounds.playTick(); 
    this.channelsLocked = !this.channelsLocked; 
    this.dispatch('locks-changed', this.locks);
  }
  private toggleManifestLock() { 
    uiSounds.playTick(); 
    this.manifestLocked = !this.manifestLocked; 
    this.dispatch('locks-changed', this.locks);
  }

  public reset() {
    this.evolution = 0;
    this.dispatch('evolution-changed', 0);
    if (!this.manifestLocked) {
        this.durationIndex = DURATION_STEPS.length - 1; 
        this.dispatch('duration-changed', DURATION_STEPS[DURATION_STEPS.length - 1].value);
    }
    this.resetWeights();
  }

  public resetWeights() {
    const newSettings = { ...this.settings };
    const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
    channels.forEach(ch => { if (!this.channelsLocked) newSettings[ch].weight = 1.0; });
    this.auditAndCommit(newSettings);
  }

  public resetWeightsToZero() {
    const newSettings = { ...this.settings };
    const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
    channels.forEach(ch => { if (!this.channelsLocked) newSettings[ch].weight = 0; });
    this.auditAndCommit(newSettings);
  }

  /**
   * The Voice dialog picked solo voices or a choir: switch the matching channels to a random appropriate voice
   * instrument (chosen among the candidates, else any recommended voice for that channel).
   */
  public setVoiceInstruments(pick: Partial<Record<keyof InstrumentSet, string[]>>) {
    const newSettings = { ...this.settings };
    (Object.keys(pick) as Array<keyof InstrumentSet>).forEach(ch => {
        // Band tracks offer no voices: the lead becomes a LEAD VOICE track, the alto a BACKGROUND CHOIR track
        const voiceType = VOICE_TRACK_OF[ch];
        if (voiceType && !this.getRecommendedInstruments(ch).some(i => isVocalInstrument(i))) {
            this.slotTypes = { ...this.slotTypes, [ch]: { type: voiceType, source: TRACK_TYPES[voiceType].source } };
        }
        const recommended = this.getRecommendedInstruments(ch);
        const candidates = (pick[ch] || []).filter(i => recommended.includes(i));
        const pool = candidates.length > 0 ? candidates : recommended.filter(i => isVocalInstrument(i));
        if (pool.length === 0) return;
        const old = newSettings[ch];
        newSettings[ch] = {
            ...old,
            instrument: pool[Math.floor(Math.random() * pool.length)],
            active: true,
            visible: this.manifestLocked ? old.visible : true,
            weight: old.weight > 0 ? old.weight : 1.0
        };
    });
    this.auditAndCommit(newSettings);
  }

  /**
   * Dice roll: switch on a number of tracks that suits the genre (not all five every time).
   * The count is random within the genre's range; the lead always plays, and the others are drawn by genre taste:
   * rhythm and bass first for rhythm-driven genres, harmony and countermelody first for melodic ones.
   */
  public enableAllChannels() {
    if (this.manifestLocked || this.channelsLocked) return;
    const [min, max] = DICE_TRACK_COUNT[this.genre] ?? [3, 5];
    const count = min + Math.floor(Math.random() * (max - min + 1));
    const weights: Record<Slot, number> = RHYTHMIC_GENRES.includes(this.genre)
      ? { lead: 10, rhythm: 8, bass: 6, harmonic: 5, alto: 3 }
      : { lead: 10, harmonic: 8, alto: 6, bass: 4, rhythm: 3 };
    const candidates = SLOTS.filter(ch => !!this.settings[ch].instrument);
    const chosen: Slot[] = candidates.includes('lead') ? ['lead'] : [];
    const rest = candidates.filter(ch => !chosen.includes(ch));
    while (chosen.length < count && rest.length > 0) {
      const total = rest.reduce((sum, ch) => sum + weights[ch], 0);
      let r = Math.random() * total;
      const i = rest.findIndex(ch => (r -= weights[ch]) < 0);
      chosen.push(rest.splice(i === -1 ? 0 : i, 1)[0]);
    }
    const newSettings = { ...this.settings };
    SLOTS.forEach(ch => {
      const on = chosen.includes(ch);
      newSettings[ch] = { ...newSettings[ch], visible: on, active: on };
    });
    this.auditAndCommit(newSettings);
  }

  /**
   * Last step of a dice roll: every channel ends with a valid instrument or disappears.
   * - The style's manifest switches a channel off: it disappears.
   * - No instrument, or one that does not fit: roll again for that channel (one no other channel plays).
   * - Nothing fits (no instrument can be chosen): the channel is not included, whatever the manifest lock.
   * A locked manifest keeps its channels; a locked channel set keeps its instruments.
   */
  public finalizeDiceChannels() {
    if (this.channelsLocked) return;
    const manifest = MUSIC_DATA[this.genre]?.styles[this.musicStyle]?.manifest as Record<string, boolean> | undefined;
    const newSettings = { ...this.settings };
    const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
    const hide = (ch: keyof InstrumentSet) => {
        newSettings[ch] = { ...newSettings[ch], instrument: '', visible: false, active: false };
    };
    channels.forEach(ch => {
        if (!this.manifestLocked && manifest && manifest[ch] === false) { hide(ch); return; }
        const st = newSettings[ch];
        if (st.visible === false) return; // already out of the manifest
        const recommended = this.getRecommendedInstruments(ch);
        if (st.instrument && recommended.includes(st.instrument)) return;
        const used = channels.filter(c => c !== ch).map(c => newSettings[c].instrument);
        const unused = recommended.filter(i => !used.includes(i));
        const pool = unused.length > 0 ? unused : recommended;
        if (pool.length > 0) {
            newSettings[ch] = { ...st, instrument: pool[Math.floor(Math.random() * pool.length)], active: true, weight: st.weight > 0 ? st.weight : 1.0 };
        } else {
            // No instrument could be chosen for this channel: it is not included (even with a locked manifest)
            hide(ch);
        }
    });
    // Post-check: a channel on stage must have a real instrument, else it is dropped
    channels.forEach(ch => {
        const st = newSettings[ch];
        const name = (st.instrument || '').trim().toLowerCase();
        if (st.visible !== false && (name === '' || name === 'none' || name === 'n/a')) hide(ch);
    });
    this.auditAndCommit(newSettings);
  }

  /** DJ manifesto: only the `keep` channels stay in the manifest, the rest are disabled completely. */
  public applyDjManifest(keep: Array<keyof InstrumentSet>) {
    if (this.manifestLocked || this.channelsLocked) return;
    const newSettings = { ...this.settings };
    (['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const).forEach(ch => {
        const on = keep.includes(ch) && !!newSettings[ch].instrument;
        newSettings[ch].visible = on;
        newSettings[ch].active = on;
    });
    this.auditAndCommit(newSettings);
  }

  private dispatchChannelsChanged() { (this as unknown as HTMLElement).dispatchEvent(new CustomEvent('channels-changed', { detail: this.settings })); }
  private dispatch(name: string, detail: any) { (this as unknown as HTMLElement).dispatchEvent(new CustomEvent(name, { detail })); }

  private onInstrumentChange(channel: keyof InstrumentSet, e: Event) {
    if (this.playbackState === 'playing') return;
    uiSounds.playTick();
    const select = e.target as HTMLSelectElement;
    
    // Deep clone to ensure reactivity
    const newSettings = { ...this.settings };
    newSettings[channel] = { ...this.settings[channel], instrument: select.value, active: true }; // Force active
    
    // Auto-lock when user manually changes instrument
    if (!this.channelsLocked) {
        this.channelsLocked = true;
        this.dispatch('locks-changed', this.locks);
    }
    
    this.auditAndCommit(newSettings, channel);
    this.dispatch('instrument-interacted', channel);
  }

  private onActiveChange(channel: keyof InstrumentSet, e: Event) {
    if (this.playbackState === 'playing') {
        // The browser already flipped the checkbox: put it back so the dot always shows the real state
        const box = e.target as HTMLInputElement;
        box.checked = this.settings[channel].active;
        return;
    }
    uiSounds.playTick();
    const isActive = (e.target as HTMLInputElement).checked;
    const newSettings = { ...this.settings };
    
    if (!isActive) {
        if (newSettings[channel].weight > 0) {
            this.savedWeights[channel] = newSettings[channel].weight;
        }
        newSettings[channel].weight = 0;
    } else {
        newSettings[channel].weight = this.savedWeights[channel] || 1.0;
    }
    
    newSettings[channel].active = isActive;
    this.auditAndCommit(newSettings, channel);
    this.dispatch('instrument-interacted', channel);
  }

  private get isPlaybackRestricted() {
    return this.playbackState === 'playing' || this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading';
  }

  private get trackCount() { return SLOTS.filter(s => this.settings[s].visible !== false).length; }

  /** The channel a new track of this type would take: its first free one, or null when none is free / the type is not allowed now. */
  private freeSlotFor(typeKey: string): Slot | null {
    const t = TRACK_TYPES[typeKey];
    if (!t || this.trackCount >= MAX_TRACKS) return null;
    if (t.voice && !this.voiceEnabled) return null;
    return t.slots.find(s => this.settings[s].visible === false) ?? null;
  }

  /** The channel a track of this type is on now (null when there is none). */
  private slotOfType(typeKey: string): Slot | null {
    return SLOTS.find(s => this.settings[s].visible !== false && this.slotTypes[s].type === typeKey) ?? null;
  }

  /** A checkbox in the + menu: checked adds the track, unchecked removes it (the menu stays open). */
  private toggleTrack(typeKey: string) {
    const on = this.slotOfType(typeKey);
    if (on) this.removeTrack(on);
    else this.addTrack(typeKey);
  }

  private addTrack(typeKey: string) {
    const slot = this.freeSlotFor(typeKey);
    if (!slot || this.isPlaybackRestricted) return;
    const t = TRACK_TYPES[typeKey];
    const previous = this.slotTypes[slot];
    this.slotTypes = { ...this.slotTypes, [slot]: { type: typeKey, source: t.source } };
    const recommended = this.getRecommendedInstruments(slot);
    // No instrument of this kind suits the genre: the track is not added
    if (recommended.length === 0) { this.slotTypes = { ...this.slotTypes, [slot]: previous }; return; }
    uiSounds.playSwitch();
    const used = SLOTS.filter(s => s !== slot && this.settings[s].visible !== false).map(s => this.settings[s].instrument);
    const unused = recommended.filter(i => !used.includes(i));
    const pool = unused.length > 0 ? unused : recommended;
    const newSettings = { ...this.settings };
    newSettings[slot] = {
      ...newSettings[slot],
      instrument: pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : newSettings[slot].instrument,
      active: true, visible: true, weight: 1.0
    };
    this.savedWeights[slot] = 1.0;
    this.lockChannelsAfterUserEdit();
    this.auditAndCommit(newSettings, slot);
    this.dispatch('instrument-interacted', slot);
  }

  private removeTrack(slot: Slot) {
    if (this.isPlaybackRestricted) return;
    uiSounds.playSwitch();
    const newSettings = { ...this.settings };
    newSettings[slot] = { ...newSettings[slot], visible: false, active: false };
    this.slotTypes = { ...this.slotTypes, [slot]: { type: DEFAULT_SLOT_TYPES.Band[slot], source: 'Band' } };
    this.lockChannelsAfterUserEdit();
    this.auditAndCommit(newSettings, slot);
  }

  /** Tracks you picked yourself stay: dice and DJ no longer reshuffle the channels (same as choosing an instrument by hand). */
  private lockChannelsAfterUserEdit() {
    if (!this.channelsLocked) {
      this.channelsLocked = true;
      this.dispatch('locks-changed', this.locks);
    }
  }

  private onWindowClick = () => { if (this.addMenuOpen) this.addMenuOpen = false; };
  connectedCallback() { super.connectedCallback(); window.addEventListener('click', this.onWindowClick); }
  disconnectedCallback() { super.disconnectedCallback(); window.removeEventListener('click', this.onWindowClick); }

  private renderLock(isLocked: boolean, clickHandler: () => void) {
    return html`
      <button class="lock-btn ${isLocked ? 'locked' : ''}" @click=${clickHandler} title=${isLocked ? 'Unlock' : 'Lock'}>
        <svg viewBox="0 0 24 24">
          <path d="${isLocked 
            ? 'M12,2A5,5,0,0,0,7,7v3H6a2,2,0,0,0-2,2v8a2,2,0,0,0,2,2H18a2,2,0,0,0,2-2V12a2,2,0,0,0-2-2H17V7A5,5,0,0,0,12,2ZM9,10V7a3,3,0,0,1,6,0v3Z' 
            : 'M12,2A5,5,0,0,0,7,7v3H6c-1.1,0-2,.9-2,2v8c0,1.1,.9,2,2,2H18c1.1,0,2-.9,2-2V12c0-1.1-.9-2-2-2H18c1.1,0,2-.9,2-2V12c0-1.1-.9-2-2-2H9V7c0-1.66,1.34-3,3-3s3,1.34,3,3v2h2V7c0-2.76-2.24-5-5-5S7,4.24,7,7v3H6c-1.1,0-2,.9-2,2v8c0,1.1,.9,2,2,2H18c1.1,0,2-.9,2-2V12c0-1.1-.9-2-2-2H9V7c0-.55,.45-1,1-1s1,.45,1,1v1h2V7c0-.55-.45-1-1-1Z'}"/>
        </svg>
      </button>
    `;
  }

  private renderChannel(key: keyof InstrumentSet) {
    const ch = this.settings[key];
    const label = (TRACK_LABELS[this.slotTypes[key].type] || this.slotTypes[key].type) + (key === 'alto' && this.slotTypes[key].type === 'HARMONY' ? ' 2' : '');
    // A channel switched off in the manifest disappears from the panel
    if (ch.visible === false) return html``;
    const isInteractionDisabled = this.playbackState === 'playing';
    
    // Recommended are those in the current pool (style specific)
    const recommended = this.getRecommendedInstruments(key);
    
    // Keep the current instrument selectable so the dropdown is never blank
    const options = ch.instrument && !recommended.includes(ch.instrument) ? [ch.instrument, ...recommended] : recommended;
    
    return html`
      <div class="channel-group ${!ch.active ? 'deactivated' : ''}" style="--channel-color: var(--ch-${key})">
        <div class="label-row">
          <div class="channel-label" style="color: var(--text-color)">${label}</div>
          <button class="remove-x ${this.isPlaybackRestricted ? 'blocked' : ''}" title="Remove this track" @click=${() => this.removeTrack(key)}>✕</button>
        </div>
        <div class="channel-control">
          <div class="row ${isInteractionDisabled ? 'blocked' : ''}">
            <input type="checkbox" class="channel-toggle" .checked=${live(ch.active)} ?disabled=${!ch.instrument} @change=${(e: Event) => this.onActiveChange(key, e)}>
            <!-- Selection is set on each option (live property), not with select.value: lit sets select.value before the
                 new options exist, so after a dice roll the box showed blank or a stale instrument -->
            <select @change=${(e: Event) => this.onInstrumentChange(key, e)} tabindex=${isInteractionDisabled ? '-1' : '0'}>
              ${options.map((inst: string) => html`<option value=${inst} .selected=${live(inst === ch.instrument)}>${inst}</option>`)}
            </select>
          </div>
          <div class="weight-slider ${isInteractionDisabled ? 'blocked' : ''}" title="Weight: how strongly this track is asked for">
            <span class="mini-label">WGT</span>
            <input type="range" min="0" max="1.0" step="0.01" .value=${ch.weight} tabindex=${isInteractionDisabled ? '-1' : '0'} @input=${(e: any) => {
              if (!isInteractionDisabled) {
                  const val = parseFloat(e.target.value);
                  this.settings[key].weight = val;
                  if (val > 0) this.savedWeights[key] = val;
                  uiSounds.playTick();
                  this.dispatchChannelsChanged();
                  this.dispatch('instrument-interacted', key);
              }
          }}/>
          </div>
          <div class="weight-slider ${isInteractionDisabled ? 'blocked' : ''}" title="Volume: how loud this track is in the mix">
            <span class="mini-label">VOL</span>
            <input type="range" min="0" max="1.0" step="0.01" .value=${ch.volume ?? 1} tabindex=${isInteractionDisabled ? '-1' : '0'} @input=${(e: any) => {
              if (!isInteractionDisabled) {
                  this.settings[key].volume = parseFloat(e.target.value);
                  uiSounds.playTick();
                  this.dispatchChannelsChanged();
                  this.dispatch('instrument-interacted', key);
              }
          }}/>
          </div>
        </div>
      </div>
    `;
  }

  private switchTab(tab: 'Band' | 'Lyria') {
      if (this.channelsLocked) return;
      if (this.currentTab === tab) return;
      uiSounds.playTick();
      this.currentTab = tab;
      const newSettings = { ...this.settings };
      const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)] || '';
      (['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const).forEach(ch => {
          newSettings[ch].instrument = pick(this.getRecommendedInstruments(ch));
      });
      this.auditAndCommit(newSettings);
      this.dispatchChannelsChanged();
      this.dispatchEvent(new CustomEvent('tab-changed', { detail: tab, bubbles: true, composed: true }));
  }

  render() {
    const isEvolutionLocked = (this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading') && this.conductorActive;
    
    const types = Object.keys(TRACK_TYPES);
    const visibleSlots = SLOTS.filter(k => this.settings[k].visible !== false);

    return html`
      <div class="section-header">
        <span class="section-title">SONG MANIFEST</span>
        <div class="header-btns">
          ${this.renderLock(this.manifestLocked, () => this.toggleManifestLock())}
        </div>
      </div>
      <master-volume-panel class="manifest-box" mode="manifest"
          .bpm=${this.bpm} .bpmMin=${this.bpmMin} .bpmMax=${this.bpmMax}
          @bpm-input=${(e: any) => this.dispatch('bpm-input', e.detail)}
          .evolution=${this.evolution}
          .durationIndex=${this.durationIndex}
          .isLocked=${isEvolutionLocked}
          .seed=${this.seed}
          .bars=${this.bars}
          .seedLocked=${this.seedLocked}
          @seed-lock-changed=${(e: any) => this.dispatch('seed-lock-changed', e.detail)}
          @duration-changed=${(e: any) => { this.durationIndex = DURATION_STEPS.findIndex(s => s.value === e.detail); this.dispatch('duration-changed', e.detail); }}
          @evolution-changed=${(e: any) => { this.evolution = e.detail; this.dispatch('evolution-changed', e.detail); }}>
      </master-volume-panel>

      <div class="sidebar-tabs-container">
          <span class="tracks-title">SOUND TRACKS</span>
          <div class="header-actions">
            <div class="add-wrap" @click=${(e: Event) => e.stopPropagation()}>
              <button class="add-btn ${this.isPlaybackRestricted ? 'blocked' : ''}"
                title=${this.addMenuOpen ? 'Close' : 'Choose the sound tracks'}
                @click=${() => { if (!this.isPlaybackRestricted) this.addMenuOpen = !this.addMenuOpen; }}>
                <svg class="add-arrow ${this.addMenuOpen ? 'open' : ''}" viewBox="0 0 10 10" width="10" height="10"><path d="M1 3 L9 3 L5 8 Z" fill="currentColor"/></svg>
              </button>
              ${this.addMenuOpen ? html`
                <div class="add-menu">
                  ${types.map(t => {
                    const checked = this.slotOfType(t) !== null;
                    const free = checked || this.freeSlotFor(t) !== null;
                    const why = free ? '' : TRACK_TYPES[t].voice && !this.voiceEnabled ? 'Needs the voice mode' : this.trackCount >= MAX_TRACKS ? 'Up to 5 sound tracks' : 'Its channel is taken';
                    return html`<button class="add-item ${free ? '' : 'disabled'}" title=${why} @click=${() => free && this.toggleTrack(t)}>
                      <input type="checkbox" class="add-check" tabindex="-1" .checked=${checked} ?disabled=${!free} />
                      <span>${TRACK_LABELS[t] || t}</span>
                    </button>`;
                  })}
                </div>` : ''}
            </div>
            ${this.renderLock(this.channelsLocked, () => this.toggleChannelsLock())}
          </div>
      </div>

      <div class="content">
        ${visibleSlots.length === 0 ? html`<div class="no-tracks">No sound tracks. Press +</div>` : visibleSlots.map(k => this.renderChannel(k))}
      </div>

      <div class="section-header volume-header">
        <span class="section-title">MASTER VOLUME</span>
      </div>
      <master-volume-panel class="volume-box" mode="volume"
          .volume=${this.volume}
          .audioLevelL=${this.audioLevelL}
          .audioLevelR=${this.audioLevelR}
          .isStereo=${this.isStereo}
          .isLocked=${isEvolutionLocked}
          @volume-changed=${(e: any) => { this.volume = e.detail; this.dispatch('volume-changed', this.volume); }}
          @stereo-changed=${(e: any) => { this.isStereo = e.detail; this.dispatch('stereo-changed', e.detail); }}>
      </master-volume-panel>
    `;
  }
}
declare global { interface HTMLElementTagNameMap { 'right-sidebar': RightSidebar; } }
