
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PlaybackState, InstrumentSet } from '../types';
import { uiSounds } from '../utils/UISounds';
import './MasterVolumePanel';
import { MUSIC_DATA, getBandPool } from './TopToolbar';


import { FALLBACK_POOLS, getLyriaPool } from '../constants/instruments';
import { isVocalInstrument, isTraditionalGenre } from '../utils/LiveMusicHelper';


const FIBONACCI_SERIES = [1, 2, 3, 5, 8, 13, 21, 34];

@customElement('right-sidebar')
export class RightSidebar extends LitElement {
  @property({ type: String }) genre: string = 'Pop';
  @property({ type: String }) musicStyle: string = 'Synth-Pop';

  // The dropdowns only ever offer recommended instruments: the orchestra/voice/choir pool of the genre on the
  // Lyria tab, and the generous genre pool on the Band tab.
  private getRecommendedInstruments(channel: keyof InstrumentSet): string[] {
      if (this.currentTab === 'Lyria') return getLyriaPool(this.genre, channel);

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
      --channel-color: #3dffab;
    }
    .lira-control.active {
      border-color: #3dffab;
      background: rgba(61, 255, 171, 0.1);
      color: #3dffab;
    }

    .lira-control input[type="checkbox"].channel-toggle {
      pointer-events: none;
    }

    .section-header {
      background: var(--surface-header);
      padding: 0 12px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: center;
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
      left: 50%;
      transform: translateX(-50%);
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
      opacity: 0.5;
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
      border: 1px solid rgba(0,0,0,0.6);
      border-radius: 50%;
      cursor: pointer;
      position: relative;
      background: #2a1b0a;
    }

    input[type="checkbox"].channel-toggle:checked {
      background: var(--channel-color);
      box-shadow: 0 0 12px var(--channel-color);
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
    
    select:disabled {
      cursor: default;
      opacity: 0.8;
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
    
    input[type=range] {
      -webkit-appearance: none; width: 100%; background: transparent; height: 4px;
      border-radius: 2px; background: var(--border-color); outline: none; border: none;
    }
    input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none; height: 12px; width: 8px; border-radius: 1px;
      background: silver; margin-top: -4px; border: 1px solid #666;
    }
    input[type=range]:disabled { cursor: default; }

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
    .lock-btn:hover {
      background: rgba(255,255,255,0.1);
      color: #bbb;
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
    .switch-unit.disabled { cursor: not-allowed; pointer-events: none; }
    .switch-unit.disabled .switch-label,
    .switch-unit.disabled .switch-recess { opacity: 0.4; filter: grayscale(1); }
    .switch-unit.disabled .switch-integrated-box { border-color: #222; }
    .switch-unit.disabled.on .led-dot {
      background-color: #ff5a5a; box-shadow: 0 0 10px #ff4444, 0 0 3px #ffb0b0;
    }

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
      width: 5px; height: 5px; flex-shrink: 0; aspect-ratio: 1; border-radius: 50%; background-color: #222; transition: background-color 0.2s, box-shadow 0.2s;
    }
    .switch-unit.on .led-dot { 
      background-color: #ff4444; box-shadow: 0 0 6px #ff4444; 
    }

    master-volume-panel {
      flex-shrink: 0;
      height: 125px; 
    }
  `;

  @property({ type: String }) playbackState: PlaybackState = 'stopped';
  @property({ type: Number }) volume = 0.8;
  @property({ type: Number }) audioLevelL = 0;
  @property({ type: Number }) audioLevelR = 0;
  @property({ type: Boolean }) isStereo = true;
  @property({ type: Boolean }) conductorActive = false;
  @property({ type: Boolean }) genreLocked = false;
  
  @state() private channelsLocked = false;
  @state() private manifestLocked = false;
  @state() private durationIndex = 2; 
  @property({ type: Number }) evolution = 0; 
  
  @property({ type: String }) currentTab: 'Band' | 'Lyria' = 'Band';

  @state() private savedWeights: Record<string, number> = { lead: 1, alto: 1, harmonic: 1, bass: 1, rhythm: 1 };

  @state() public settings: InstrumentSet = {
    lead: { instrument: FALLBACK_POOLS.lead[0], active: true, weight: 1.0, visible: true },
    alto: { instrument: FALLBACK_POOLS.alto[0], active: true, weight: 1.0, visible: true },
    harmonic: { instrument: FALLBACK_POOLS.harmonic[0], active: true, weight: 1.0, visible: true },
    bass: { instrument: FALLBACK_POOLS.bass[0], active: true, weight: 1.0, visible: true },
    rhythm: { instrument: FALLBACK_POOLS.rhythm[0], active: true, weight: 1.0, visible: true }
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
              this.validateCurrentInstrument(channelToValidate, st);
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
                  this.validateCurrentInstrument(ch, st);
              }
          });
      }
      
      this.settings = { ...newSettings };
      
      const isAnyVocal = Object.values(newSettings).some(st => isVocalInstrument(st.instrument));
      if (isAnyVocal) {
          window.dispatchEvent(new CustomEvent('change-primary-mode', { detail: { mode: 'VOCALIZATION' } }));
      }

      (this as any).requestUpdate();
      this.dispatchChannelsChanged();
  }

  private validateCurrentInstrument(channel: keyof InstrumentSet, st: any) {
      if (!st.instrument) return;
      const recommended = this.getRecommendedInstruments(channel);
      
      // If it's in recommended (style pool or fallback), it's valid — keep it
      if (recommended.includes(st.instrument)) return;

      // Anything else is replaced by a recommended instrument
      if (recommended.length > 0) st.instrument = recommended[Math.floor(Math.random() * recommended.length)];
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

  public setDuration(mins: number) {
      if (this.manifestLocked) return;
      const idx = FIBONACCI_SERIES.findIndex(m => m >= mins);
      if (idx !== -1) {
          this.durationIndex = idx;
          (this as any).requestUpdate();
      }
  }

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
        this.durationIndex = 2; 
        this.dispatch('duration-changed', FIBONACCI_SERIES[2]);
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

  /** Dice roll: bring every channel (with an instrument) back into the manifest and switch it on. */
  public enableAllChannels() {
    if (this.manifestLocked) return;
    const newSettings = { ...this.settings };
    (['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const).forEach(ch => {
        if (newSettings[ch].instrument) { newSettings[ch].visible = true; newSettings[ch].active = true; }
    });
    this.auditAndCommit(newSettings);
  }

  /** DJ manifesto: only the `keep` channels stay in the manifest, the rest are disabled completely. */
  public applyDjManifest(keep: Array<keyof InstrumentSet>) {
    if (this.manifestLocked) return;
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
    if (this.playbackState === 'playing') return;
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

  private onVisibilityChange(channel: keyof InstrumentSet) {
    const isPlaybackRestricted = this.playbackState === 'playing' || this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading';
    if (isPlaybackRestricted) return;
    uiSounds.playSwitch();
    const newSettings = { ...this.settings };
    newSettings[channel].visible = !newSettings[channel].visible;
    this.auditAndCommit(newSettings, channel);
  }

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

  private renderChannel(label: string, key: keyof InstrumentSet) {
    const ch = this.settings[key];
    const isInteractionDisabled = this.playbackState === 'playing';
    
    // Recommended are those in the current pool (style specific)
    const recommended = this.getRecommendedInstruments(key);
    
    // Keep the current instrument selectable so the dropdown is never blank
    const options = ch.instrument && !recommended.includes(ch.instrument) ? [ch.instrument, ...recommended] : recommended;
    
    return html`
      <div class="channel-group ${!ch.active ? 'deactivated' : ''}" style="--channel-color: var(--ch-${key})">
        <div class="label-row"><div class="channel-label" style="color: var(--ch-${key})">${label}</div></div>
        <div class="channel-control">
          <div class="row">
            <input type="checkbox" class="channel-toggle" .checked=${ch.active} ?disabled=${!ch.instrument || isInteractionDisabled} @change=${(e: Event) => this.onActiveChange(key, e)}>
            <select @change=${(e: Event) => this.onInstrumentChange(key, e)} .value=${ch.instrument} ?disabled=${isInteractionDisabled}>
              ${options.map((inst: string) => html`<option value=${inst} ?selected=${inst.toLowerCase() === (ch.instrument || "").toLowerCase()}>${inst}</option>`)}
            </select>
          </div>
          <div class="weight-slider"><input type="range" min="0" max="1.0" step="0.01" .value=${ch.weight} ?disabled=${isInteractionDisabled} @input=${(e: any) => { 
              if (!isInteractionDisabled) { 
                  const val = parseFloat(e.target.value);
                  this.settings[key].weight = val; 
                  if (val > 0) this.savedWeights[key] = val;
                  uiSounds.playTick(); 
                  this.dispatchChannelsChanged();
                  this.dispatch('instrument-interacted', key);
              }
          }}/></div>
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
  }

  render() {
    const isEvolutionLocked = (this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading') && this.conductorActive;
    
    const bandManifestLabels = { lead: 'LEAD', alto: 'ALTO', harmonic: 'HARM', bass: 'BASS', rhythm: 'RHYT' };
    const liraManifestLabels = { lead: 'ORC', alto: 'SOL', harmonic: 'CHR', bass: 'BRS', rhythm: 'DRM' };
    const manifestLabels = (this.currentTab === 'Lyria') ? liraManifestLabels : bandManifestLabels;

    return html`
      <div class="top-header">CHANNELS</div>
      <div class="sidebar-tabs-container">
          <button class="sidebar-tab-btn ${this.currentTab === 'Band' ? 'active' : ''} ${this.channelsLocked ? 'opacity-40 cursor-not-allowed' : ''}" @click=${() => this.switchTab('Band')} title=${this.channelsLocked ? 'Channels are locked' : 'Switch to Band'}>BAND</button>
          <button class="sidebar-tab-btn ${this.currentTab === 'Lyria' ? 'active' : ''} ${this.channelsLocked ? 'opacity-40 cursor-not-allowed' : ''}" @click=${() => this.switchTab('Lyria')} title=${this.channelsLocked ? 'Channels are locked' : 'Switch to Lyria'}>LYRIA</button>
          <div style="margin-left: auto; display: flex; align-items: center;">${this.renderLock(this.channelsLocked, () => this.toggleChannelsLock())}</div>
      </div>
      
      <div class="content">
        ${this.currentTab === 'Band' ? html`
            ${this.renderChannel('LEAD', 'lead')}
            ${this.renderChannel('ALTO', 'alto')}
            ${this.renderChannel('HARMONIC', 'harmonic')}
            ${this.renderChannel('BASS', 'bass')}
            ${this.renderChannel('RHYTHM', 'rhythm')}
        ` : html`
            ${this.renderChannel('ORCHESTRA', 'lead')}
            ${this.renderChannel('SOLO', 'alto')}
            ${this.renderChannel('CHOIR', 'harmonic')}
            ${this.renderChannel('BRASS', 'bass')}
            ${this.renderChannel('DRUMS', 'rhythm')}
        `}
      </div>

      <div class="bottom-controls">
        <div class="section-header">
          <span class="section-title">MANIFEST</span>
          <div class="header-btns">
            ${this.renderLock(this.manifestLocked, () => this.toggleManifestLock())}
          </div>
        </div>
        <div class="manifest-panel">
           ${(['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const).map(key => {
               const isOn = this.settings[key].visible !== false;
               const isInteractionDisabled = this.playbackState === 'playing' || this.playbackState === 'recording';
               return html`
                <div class="switch-unit ${isOn ? 'on' : ''} ${isInteractionDisabled ? 'disabled' : ''}" @click=${() => this.onVisibilityChange(key)}>
                    <div class="switch-integrated-box">
                        <div class="led-dot"></div>
                        <div class="switch-recess"><div class="toggle-handle"></div></div>
                    </div>
                    <div class="switch-label">${manifestLabels[key]}</div>
                </div>`;
           })}
        </div>
        <master-volume-panel 
            .volume=${this.volume} 
            .evolution=${this.evolution}
            .durationIndex=${this.durationIndex}
            .audioLevelL=${this.audioLevelL} 
            .audioLevelR=${this.audioLevelR} 
            .isStereo=${this.isStereo}
            .isLocked=${isEvolutionLocked}
            @volume-changed=${(e: any) => { this.volume = e.detail; this.dispatch('volume-changed', this.volume); }}
            @duration-changed=${(e: any) => { this.durationIndex = FIBONACCI_SERIES.indexOf(e.detail); this.dispatch('duration-changed', e.detail); }}
            @evolution-changed=${(e: any) => { this.evolution = e.detail; this.dispatch('evolution-changed', e.detail); }}
            @stereo-changed=${(e: any) => { this.isStereo = e.detail; this.dispatch('stereo-changed', e.detail); }}>
        </master-volume-panel>
      </div>
    `;
  }
}
declare global { interface HTMLElementTagNameMap { 'right-sidebar': RightSidebar; } }
