
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PlaybackState, InstrumentSet } from '../types';
import { uiSounds } from '../utils/UISounds';
import './MasterVolumePanel';

const LEAD_INSTRUMENTS = [
  'Synthesizer', 'Electric Guitar', 'Acoustic Guitar', 'Saxophone', 'Trumpet', 'Clarinet', 'Flute', 'Violin', 'Cello', 'Harmonica', 'Diatonic Harmonica', 'Chromatic Harmonica', 'Tremolo Harmonica', 'Blues Harp', 'Vocal Chops', 'Choir', 'Accordion', 'Banjo', 'Mandolin', 'Sitar', 'Koto', 'Erhu', 'Oud', 'Bagpipes', 'Bell Synth', 'Whistle', 'Didgeridoo', 'Recorder', 'Sopranino Recorder', 'Soprano Recorder', 'Alto Recorder', 'Pan Flute', 'Pipe Flute'
].sort();

const ALTO_INSTRUMENTS = [
  'Saxophone', 'Trumpet', 'Clarinet', 'Viola', 'French Horn', 'Trombone', 'Brass Section', 'Strings', 'Flute', 'Recorder', 'Alto Recorder', 'Tenor Recorder', 'Accordion', 'Synthesizer', 'Electric Piano', 'Vibraphone', 'Harp', 'Low Whistle', 'Mandocello', 'Pan Flute', 'Harmonica', 'Chromatic Harmonica', 'Tremolo Harmonica', 'Electric Violin', 'Pipe Flute'
].sort();

const HARMONIC_INSTRUMENTS = [
  'Piano', 'Electric Piano', 'Acoustic Guitar', 'Electric Guitar', 'Organ', 'Strings', 'Pads', 'Choir', 'Harpsichord', 'Harp', 'Marimba', 'Cimbalom', 'Tanpura', 'Synthesizer', 'Stab Chords', 'Accordion', 'Harmonium', 'Guzheng', 'Qanun'
].sort();

const BASS_INSTRUMENTS = [
  'Electric Bass', 'Synth Bass', 'Double Bass', 'Tuba', 'Cello', 'Bassoon', 'Trombone', 'Didgeridoo', 'Timpani', 'Harmonica', 'Bass Harmonica', 'Recorder', 'Bass Recorder', 'Great Bass Recorder'
].sort();

const RHYTHM_INSTRUMENTS = [
  'Drum Kit', 'Electronic Drums', 'Hand Drum', 'Tabla', 'Djembe', 'Congas', 'Bongos', 'Timbales', 'Taiko Drums', 'Percussion', 'Shakers', 'Tambourine', 'Bells', 'Stomps', 'Industrial Percussion', 'Woodblock', 'Cowbell'
].sort();

const FIBONACCI_SERIES = [1, 2, 3, 5, 8, 13, 21, 34, 55];

@customElement('right-sidebar')
export class RightSidebar extends LitElement {
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

    .section-header {
      background: var(--surface-header);
      padding: 0 12px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      height: 24px;
    }
    .section-title {
      color: var(--accent-color);
      font-size: 10px;
      font-weight: bold;
      letter-spacing: 1.2px;
      text-transform: uppercase;
    }

    .header-btns {
      display: flex;
      align-items: center;
      gap: 4px;
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
      font-size: 9px;
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
      font-size: 10px;
      cursor: pointer;
      padding: 0 2px;
      font-family: monospace;
      border-radius: 2px;
      height: 18px;
    }
    
    select:disabled {
      cursor: default;
      opacity: 0.8;
    }

    option, optgroup { 
      font-size: 10px; 
      padding-top: 0.5px;
      padding-bottom: 0.5px;
      line-height: 1; 
    }

    @media (max-width: 1200px) {
      option, optgroup {
        padding-top: 0.25px;
        padding-bottom: 0.25px;
      }
    }

    optgroup { 
      background: #111; 
      color: var(--accent-color); 
      font-weight: 800; 
      text-decoration: underline;
      margin-top: 1px;
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
    
    .switch-unit.disabled { 
      cursor: not-allowed; pointer-events: none; opacity: 0.4;
    }

    .switch-label {
      font-size: 7px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin-top: 4px;
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
  
  @state() private currentPools: any = {};
  @state() private currentStyleManifest: any = { lead: true, alto: true, harmonic: true, bass: true, rhythm: true };
  @state() private channelsLocked = false;
  @state() private manifestLocked = false;
  @state() private durationIndex = 2; 
  @state() private evolution = 0; 
  
  @state() private dynamicLead = [...LEAD_INSTRUMENTS];
  @state() private dynamicAlto = [...ALTO_INSTRUMENTS];
  @state() private dynamicHarmonic = [...HARMONIC_INSTRUMENTS];
  @state() private dynamicBass = [...BASS_INSTRUMENTS];
  @state() private dynamicRhythm = [...RHYTHM_INSTRUMENTS];

  @state() private savedWeights: Record<string, number> = { lead: 1, alto: 1, harmonic: 1, bass: 1, rhythm: 1 };

  @state() public settings: InstrumentSet = {
    lead: { instrument: LEAD_INSTRUMENTS[0], active: true, weight: 1.0, visible: true },
    alto: { instrument: ALTO_INSTRUMENTS[0], active: true, weight: 1.0, visible: true },
    harmonic: { instrument: HARMONIC_INSTRUMENTS[0], active: true, weight: 1.0, visible: true },
    bass: { instrument: BASS_INSTRUMENTS[0], active: true, weight: 1.0, visible: true },
    rhythm: { instrument: RHYTHM_INSTRUMENTS[0], active: true, weight: 1.0, visible: true }
  };

  public get locks() { return { channels: this.channelsLocked, manifest: this.manifestLocked, duration: this.manifestLocked }; }

  private auditAndCommit(newSettings: InstrumentSet) {
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
                  st.instrument = this.getAllForChannel(ch)[0];
                  st.active = true;
                  st.visible = true;
              }
          } else {
              this.ensureInstrumentExists(ch, st.instrument);
          }
      });
      
      this.settings = { ...newSettings };
      (this as any).requestUpdate();
      this.dispatchChannelsChanged();
  }

  private ensureInstrumentExists(channel: keyof InstrumentSet, instrument: string) {
      if (!instrument) return;
      const list = this.getDynamicList(channel);
      if (!list.includes(instrument)) {
          const newList = [...list, instrument].sort();
          this.setDynamicList(channel, newList);
      }
  }

  private getDynamicList(channel: keyof InstrumentSet): string[] {
    switch(channel) {
        case 'lead': return this.dynamicLead;
        case 'alto': return this.dynamicAlto;
        case 'harmonic': return this.dynamicHarmonic;
        case 'bass': return this.dynamicBass;
        case 'rhythm': return this.dynamicRhythm;
    }
  }

  private setDynamicList(channel: keyof InstrumentSet, list: string[]) {
    switch(channel) {
        case 'lead': this.dynamicLead = list; break;
        case 'alto': this.dynamicAlto = list; break;
        case 'harmonic': this.dynamicHarmonic = list; break;
        case 'bass': this.dynamicBass = list; break;
        case 'rhythm': this.dynamicRhythm = list; break;
    }
  }

  public applyMatrixUpdate(detail: { manifest: any, instruments: any, style: string, pools: any }) {
      this.currentPools = detail.pools || {};
      this.currentStyleManifest = detail.manifest;
      
      const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
      channels.forEach(ch => {
          const pool = this.currentPools[ch] || [];
          pool.forEach((inst: string) => this.ensureInstrumentExists(ch, inst));
      });

      const newSettings = { ...this.settings };
      channels.forEach(ch => {
          if (!this.manifestLocked) {
              newSettings[ch].visible = detail.manifest[ch] === true;
          }
          if (!this.channelsLocked) {
              const recommended = detail.instruments[ch];
              newSettings[ch].instrument = recommended || "";
          }
      });
      this.auditAndCommit(newSettings);
  }

  public applySessionConfig(config: any) {
      const newSettings = { ...this.settings };
      const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
      channels.forEach(ch => {
          if (!this.manifestLocked) newSettings[ch].visible = config.manifest[ch] === true;
          if (!this.channelsLocked) newSettings[ch].instrument = config.instruments[ch] || "";
      });
      this.auditAndCommit(newSettings);
      if (config.durationIndex !== undefined && !this.manifestLocked) {
          this.durationIndex = config.durationIndex;
          (this as any).requestUpdate();
      }
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

  private getAllForChannel(channel: keyof InstrumentSet): string[] {
    return this.getDynamicList(channel);
  }

  public reset() {
    this.evolution = 0;
    this.dispatch('evolution-changed', 0);
    if (!this.manifestLocked) {
        this.durationIndex = 2; 
        this.dispatch('duration-changed', FIBONACCI_SERIES[2]);
    }
    const newSettings = { ...this.settings };
    const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
    channels.forEach(ch => { if (!this.channelsLocked) newSettings[ch].weight = 1.0; });
    this.auditAndCommit(newSettings);
  }

  private dispatchChannelsChanged() { (this as unknown as HTMLElement).dispatchEvent(new CustomEvent('channels-changed', { detail: this.settings })); }
  private dispatch(name: string, detail: any) { (this as unknown as HTMLElement).dispatchEvent(new CustomEvent(name, { detail })); }

  private onInstrumentChange(channel: keyof InstrumentSet, e: Event) {
    if (this.playbackState === 'playing') return;
    uiSounds.playTick();
    const select = e.target as HTMLSelectElement;
    const newSettings = { ...this.settings };
    newSettings[channel].instrument = select.value;
    this.auditAndCommit(newSettings);
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
    this.auditAndCommit(newSettings);
    this.dispatch('instrument-interacted', channel);
  }

  private onVisibilityChange(channel: keyof InstrumentSet) {
    const isPlaybackRestricted = this.playbackState === 'playing' || this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading';
    if (isPlaybackRestricted) return;
    uiSounds.playSwitch();
    const newSettings = { ...this.settings };
    newSettings[channel].visible = !newSettings[channel].visible;
    this.auditAndCommit(newSettings);
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

  private renderChannel(label: string, key: keyof InstrumentSet, fallbackOptions: string[]) {
    const ch = this.settings[key];
    if (ch.visible === false) return ''; 
    const stylePool = (this.currentPools[key] || []).filter((i: string) => !!i && i.toLowerCase() !== 'none' && i.toLowerCase() !== 'n/a');
    const isInteractionDisabled = this.playbackState === 'playing';
    return html`
      <div class="channel-group ${!ch.active ? 'deactivated' : ''}" style="--channel-color: var(--ch-${key})">
        <div class="label-row"><div class="channel-label" style="color: var(--ch-${key})">${label}</div></div>
        <div class="channel-control">
          <div class="row">
            <input type="checkbox" class="channel-toggle" .checked=${ch.active} ?disabled=${!ch.instrument || isInteractionDisabled} @change=${(e: Event) => this.onActiveChange(key, e)}>
            <select @change=${(e: Event) => this.onInstrumentChange(key, e)} .value=${ch.instrument} ?disabled=${isInteractionDisabled}>
              ${stylePool.length > 0 ? html`<optgroup label="STYLE SPECIFIC">${stylePool.map((inst: string) => html`<option value=${inst}>${inst}</option>`)}</optgroup>` : ''}
              <optgroup label="GENERAL LIST">${fallbackOptions.map(inst => html`<option value=${inst}>${inst}</option>`)}</optgroup>
            </select>
          </div>
          <div class="weight-slider"><input type="range" min="0" max="2.0" step="0.222" .value=${ch.weight} ?disabled=${isInteractionDisabled} @input=${(e: any) => { 
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

  render() {
    const isEvolutionLocked = (this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading') && this.conductorActive;
    return html`
      <div class="section-header">
          <span class="section-title">CHANNELS</span>
          <div class="header-btns">${this.renderLock(this.channelsLocked, () => this.toggleChannelsLock())}</div>
      </div>
      <div class="content">
        ${this.renderChannel('LEAD', 'lead', this.dynamicLead)}
        ${this.renderChannel('ALTO', 'alto', this.dynamicAlto)}
        ${this.renderChannel('HARMONIC', 'harmonic', this.dynamicHarmonic)}
        ${this.renderChannel('BASS', 'bass', this.dynamicBass)}
        ${this.renderChannel('RHYTHM', 'rhythm', this.dynamicRhythm)}
      </div>
      <div class="bottom-controls">
        <div class="section-header">
          <span class="section-title">MANIFEST</span>
          <div class="header-btns">
            ${this.renderLock(this.manifestLocked, () => this.toggleManifestLock())}
          </div>
        </div>
        <div class="manifest-panel">
           ${['lead', 'alto', 'harmonic', 'bass', 'rhythm'].map(key => {
               const isOn = this.settings[key as keyof InstrumentSet].visible !== false;
               const isInteractionDisabled = this.playbackState === 'playing' || this.playbackState === 'recording';
               return html`
                <div class="switch-unit ${isOn ? 'on' : ''} ${isInteractionDisabled ? 'disabled' : ''}" @click=${() => this.onVisibilityChange(key as keyof InstrumentSet)}>
                    <div class="switch-integrated-box">
                        <div class="led-dot"></div>
                        <div class="switch-recess"><div class="toggle-handle"></div></div>
                    </div>
                    <div class="switch-label">${key.substring(0, 4).toUpperCase()}</div>
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
