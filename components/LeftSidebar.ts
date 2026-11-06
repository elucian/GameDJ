
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PlaybackState, MusicGenerationMode } from '../types';
import { uiSounds } from '../utils/UISounds';
import { supportIntent } from '../utils/UserQuota';



@customElement('left-sidebar')
export class LeftSidebar extends LitElement {
  @state() private isVocalActive = false;

  private _handleVocalStateChange = ((e: CustomEvent) => {
      this.isVocalActive = e.detail.active;
  }) as EventListener;

  private _handleModeChange = ((e: CustomEvent) => {
      this.primaryMode = e.detail.mode;
  }) as EventListener;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('vocal-state-changed', this._handleVocalStateChange);
    window.addEventListener('change-primary-mode', this._handleModeChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('vocal-state-changed', this._handleVocalStateChange);
    window.removeEventListener('change-primary-mode', this._handleModeChange);
  }

  static styles = css`
    /* Unified active button state */
    button.active-state {
      opacity: 1 !important;
      background: #1e601e !important;
      color: #fff !important;
      border-color: #000;
      box-shadow: 0 1px 2px rgba(0,0,0,0.6), inset 0 1px 3px rgba(0,0,0,0.4) !important;
    }

    @keyframes blink {
      0% { box-shadow: 0 0 5px #1e601e; }
      50% { box-shadow: 0 0 20px #1e601e; }
      100% { box-shadow: 0 0 5px #1e601e; }
    }
    .mic-btn.active {
      animation: blink 1.5s infinite;
      background: #1e601e !important;
      color: #fff !important;
      opacity: 1 !important;
      border: 1px solid #000;
    }
    .vocal-prompt-overlay {
      position: fixed;
      top: 80px;
      left: 70px; /* Sidebar width */
      background: var(--surface-color);
      border: 1px solid var(--border-color);
      padding: 20px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: 0 0 20px rgba(0,0,0,0.5);
      border-radius: 12px;
      width: 300px;
      height: 360px;
      pointer-events: auto;
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
      opacity: 1 !important; /* Force override */
      width: fit-content;
      min-width: 150px;
    }
    .vocal-prompt-overlay .send-btn:hover {
      opacity: 0.9 !important;
    }
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      container-type: size; /* lets children size from the sidebar height (cqh) */
      background: var(--surface-color);
      border-right: 1px solid var(--border-color);
      align-items: center;
      padding: 10px 0;
      box-sizing: border-box;
      overflow-y: auto; /* last resort: scroll once everything is at minimum size */
      overflow-x: hidden;
      scrollbar-width: none;
      transition: background-color 0.3s ease, border-color 0.3s ease;
      justify-content: flex-start;
    }
    :host::-webkit-scrollbar { display: none; }

    /* Shrink order as the window gets shorter (14 buttons, 11 in-group gaps, 2 group gaps):
       1) the gaps between groups shrink down to the in-group gap (--g)
       2) --g shrinks from 12px to 3px (spacers follow, always >= --g)
       3) the buttons shrink from 36px to 26px
       4) scrolling */
    .button-group, .spacer-group {
      --g: clamp(3px, calc((100cqh - 504px) / 15), 12px);
      --s: clamp(26px, calc((100cqh - 15 * var(--g)) / 14), 36px);
    }

    .button-group {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--g);
      width: 100%;
      padding: 0;
      flex-shrink: 0;
    }

    .spacer-group {
      flex: 1 0 var(--g);
      min-height: var(--g);
    }

    button {
      background: #333;
      border: 1px solid #111;
      cursor: pointer;
      padding: 0;
      width: var(--s, 36px);
      height: var(--s, 36px);
      border-radius: 50%;
      transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      flex-shrink: 0;
      box-shadow: 0 3px 6px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.05);
      outline: none;
      color: currentColor;
    }

    :host-context(body.light-theme) button {
      background: #e0e0e0; 
      border-color: #ccc;
      color: #333; 
      box-shadow: 0 2px 4px rgba(0,0,0,0.1), inset 0 1px 1px rgba(255,255,255,0.8);
    }

    /* A physical device: unresponsive, never dimmed */
    button:disabled {
      cursor: not-allowed;
    }

    button:not(:disabled):hover {
      transform: scale(1.1);
      filter: brightness(1.2);
    }

    button.theme-btn { color: #ffdd28; }
    button.kofi-btn { color: #ff5e5b; }
    button.reset-btn { color: #aa0000; }
    button.shuffle-btn { color: #0088ff; }
    button.dj-btn { color: #0088ff; }
    button.stop-btn { color: #fff; }
    button.back-start-btn { color: #ff8c00; }
    button.preset-btn { color: #ccc; }

    button.loop-btn { color: #005500; }
    button.play-btn { color: #3dffab; }
    button.pause-btn { color: #fff; }
    button.download-btn { color: #3dffab; }
    button.record-btn:not(:disabled) { color: #aa0000; }

    button.active-red,
    button.active-state,
    button.active-green { 
      opacity: 1 !important; 
      background: #1e601e !important; 
      color: #fff !important;
      border-color: #000;
      box-shadow: 0 1px 2px rgba(0,0,0,0.6), inset 0 1px 3px rgba(0,0,0,0.4) !important;
      pointer-events: none; 
    }

    /* DJ on: looks pressed like the other active buttons, but stays clickable so it can be switched off
       (while recording it is disabled: forbidden cursor) */
    button.dj-on {
      opacity: 1 !important;
      background: #1e601e !important;
      color: #fff !important;
      border-color: #000;
      box-shadow: 0 1px 2px rgba(0,0,0,0.6), inset 0 1px 3px rgba(0,0,0,0.4) !important;
    }
    /* Recording button is disabled while recording: let the forbidden cursor show */
    button.record-btn.active-recording { pointer-events: auto; }

    button.active-recording,
    button.active-red {
      opacity: 1 !important; 
      background: #ff4444 !important; 
      color: #000 !important;
      border-color: #000;
      box-shadow: 0 1px 2px rgba(0,0,0,0.6), inset 0 1px 3px rgba(0,0,0,0.4) !important;
      pointer-events: none;
    }

    :host-context(body.light-theme) button.active-red,
    :host-context(body.light-theme) button.active-recording {
      background: #c02b2b !important; 
      color: #fff !important;
      box-shadow: 0 1px 1px rgba(0,0,0,0.2), inset 0 1px 2px rgba(0,0,0,0.1) !important;
      border-color: #900;
    }

    .rotary-container {
      position: relative;
      width: var(--s, 36px);
      height: var(--s, 36px);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    button.rotary-btn {
      background: #222;
      border: 2px solid #444;
      color: #fff;
      width: 100%;
      height: 100%;
      position: relative;
      z-index: 10;
      transition: none;
    }
    :host-context(body.light-theme) button.rotary-btn {
      background: #ddd;
      border-color: #bbb;
      color: #333;
    }

    .rotary-inner {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .rotary-indicator {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
      pointer-events: none;
    }
    .rotary-indicator::after {
      content: '';
      position: absolute;
      top: 0; 
      left: 50%;
      transform: translateX(-50%);
      width: 2px;
      height: 8px; 
      background: #888;
      border-radius: 0 0 1px 1px;
      box-shadow: 0 0 1px rgba(255,255,255,0.2);
    }
    .rotary-indicator::before {
      content: '';
      position: absolute;
      bottom: 0; 
      left: 50%;
      transform: translateX(-50%);
      width: 2px;
      height: 8px; 
      background: #888;
      border-radius: 1px 1px 0 0;
      box-shadow: 0 0 1px rgba(255,255,255,0.2);
    }
    .rotary-text {
      position: relative;
      z-index: 2;
      font-size: 9.2px;
      font-weight: 900;
      letter-spacing: -0.5px;
      pointer-events: none;
      color: #fff;
    }
    :host-context(body.light-theme) .rotary-text {
      color: #333;
    }

    [data-pos="0"] .rotary-inner { transform: rotate(-45deg); }
    [data-pos="1"] .rotary-inner { transform: rotate(0deg); }
    [data-pos="2"] .rotary-inner { transform: rotate(60deg); }

    .status-dot {
      position: absolute;
      width: 4px;
      height: 4px;
      background: #555; 
      border-radius: 50%;
      transition: all 0.3s ease;
      box-shadow: inset 0 1px 1px rgba(0,0,0,0.5);
      z-index: 5;
    }
    :host-context(body.light-theme) .status-dot {
      background: #999;
    }

    .status-dot.active {
      background: #ff1100 !important; 
      box-shadow: 0 0 8px #ff1100, 0 0 2px rgba(255, 0, 0, 0.8) !important;
    }

    .dot-0 { transform: translate(calc(var(--s, 36px) * -0.3536 - 2.1px), calc(var(--s, 36px) * -0.3536 - 2.1px)); }
    .dot-1 { transform: translate(0, calc(var(--s, 36px) * -0.5 - 3px)); }
    .dot-2 { transform: translate(calc(var(--s, 36px) * 0.3536 + 2.1px), calc(var(--s, 36px) * -0.3536 - 2.1px)); }

    @keyframes inner-circle-blink {
      0%, 100% { fill: #000; opacity: 1; }
      50% { fill: #cc0000; opacity: 0.8; }
    }

    @keyframes icon-blink {
      0%, 100% { opacity: 1; filter: drop-shadow(0 0 4px #3dffab) brightness(1.2); }
      50% { opacity: 0.5; filter: drop-shadow(0 0 0px #3dffab) brightness(0.8); }
    }

    button.active-blue { 
      color: #00aaff !important; 
      background: rgba(0, 170, 255, 0.15) !important;
      border-color: rgba(0, 170, 255, 0.5) !important;
      box-shadow: 0 0 12px rgba(0, 170, 255, 0.6) !important; 
    }
    button.active-green { 
      color: #3dffab !important; 
      background: rgba(61, 255, 171, 0.15) !important; 
      border-color: rgba(61, 255, 171, 0.5) !important;
      box-shadow: 0 0 12px rgba(61, 255, 171, 0.6) !important; 
    }
    button.active-green .icon-span svg {
      animation: icon-blink 1.5s infinite ease-in-out;
    }
    
    @keyframes loop-play-flash {
      0%, 100% { opacity: 1; transform: scale(1); filter: brightness(1.2); }
      50% { opacity: 0.5; transform: scale(1.06); filter: brightness(1.8); }
    }
    button.loop-btn.playing-flash {
      animation: loop-play-flash 0.8s infinite ease-in-out;
    }

    button.active-recording .icon-span svg circle {
      animation: inner-circle-blink 1.0s infinite ease-in-out;
    }

    .icon-span { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
  `;

  @property({ type: String }) playbackState: PlaybackState = 'stopped';
  @property({ type: Number }) elapsedSeconds = 0;
  @property({ type: Boolean }) isLooping = false;
  @property({ type: Boolean }) isRewinding = false;
  @property({ type: Boolean }) hasRecording = false;
  @property({ type: Boolean }) isDarkTheme = true;
  @property({ type: Boolean }) isShuffling = false;
  @property({ type: Boolean }) isResetting = false;
  @property({ type: Boolean }) isConductorActive = false;
  @property({ type: Boolean }) hasVocalInstrument = false;
  /** The monthly song quota is used up: the voice dialog is closed (forbidden cursor on the button) */
  @property({ type: Boolean }) voiceBlocked = false;
  @property({ type: String }) primaryMode: MusicGenerationMode = 'QUALITY';
  @state() private downloadFormat: 'mp3' | 'wav' | 'webm' = 'mp3';

  protected updated(changed: Map<string, unknown>) {
    if (changed.has('isConductorActive')) {
      window.dispatchEvent(new CustomEvent('dj-active-changed', { detail: { active: this.isConductorActive } }));
    }
  }

  private onPresetsClick() {
    this.dispatchEvent(new CustomEvent('toggle-dj-preset-dialog', { bubbles: true, composed: true }));
  }

  private toggleTheme() {
    uiSounds.playButton();
    this.isDarkTheme = !this.isDarkTheme;
    this.dispatch('theme-changed', this.isDarkTheme);
  }

  /** DJ button: off -> opens the DJ dialog (Apply switches the DJ on, Cancel leaves it off); on -> switches the DJ off. */
  private toggleDj() {
    uiSounds.playButton();
    if (this.isConductorActive) {
      this.isConductorActive = false;
      this.dispatch('dj-changed', false);
    } else {
      this.onPresetsClick();
    }
  }

  private cyclePrimaryMode() {
    uiSounds.playTick();
    const modes: MusicGenerationMode[] = ['QUALITY', 'DIVERSITY', 'VOCALIZATION'];
    const currentIdx = modes.indexOf(this.primaryMode);
    const nextIdx = (currentIdx + 1) % modes.length;
    this.primaryMode = modes[nextIdx];
    this.dispatch('mode-changed', this.primaryMode);
  }


  private cycleFormat() {
    uiSounds.playTick();
    const formats: Array<'mp3' | 'wav' | 'webm'> = ['mp3', 'wav', 'webm'];
    const idx = formats.indexOf(this.downloadFormat);
    this.downloadFormat = formats[(idx + 1) % formats.length];
  }

  private onResetClick() { uiSounds.playButton(); this.dispatch('reset'); }
  private onRandomizeClick() { uiSounds.playButton(); this.dispatch('randomize'); }
  private onRecordClick() { uiSounds.playButton(); this.dispatch('record'); }
  private onStopClick() { uiSounds.playButton(); this.dispatch('stop'); }
  
  private onPlayClick() { 
    uiSounds.playButton(); 
    this.dispatch('play-recording', 0); 
  }
  
  private onPauseClick() { uiSounds.playButton(); this.dispatch('pause'); }
  private onResumeClick() { uiSounds.playButton(); this.dispatch('resume'); }
  private onBackStartClick() { uiSounds.playButton(); this.dispatch('back-to-start'); }
  
  private onLoopClick() { 
    uiSounds.playButton(); 
    this.isLooping = !this.isLooping; 
    this.dispatch('loop-changed', this.isLooping); 
  }

  private onDownloadClick() { uiSounds.playButton(); this.dispatch('download', this.downloadFormat); }

  private dispatch(name: string, detail?: any) { (this as any).dispatchEvent(new CustomEvent(name, { detail })); }

  private renderRecordButton() {
    const isRecording = this.playbackState === 'recording';
    const isSongRendering = this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading';
    const active = isRecording || isSongRendering;
    return html`
      <button 
        class="record-btn ${active ? 'active-recording' : ''}"
        @click=${this.onRecordClick} 
        ?disabled=${isRecording && !isSongRendering}
        title="Record (Overwrite)">
        <span class="icon-span">
            <svg width="24" height="24" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="${isSongRendering ? 6 : 6}" fill="currentColor"/>
            </svg>
        </span>
      </button>`;
  }

  private renderPlayPause() {
    const isPaused = this.playbackState === 'paused';
    const isPlaying = this.playbackState === 'playing';
    const isRecording = this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading';

    if (isPaused) {
        return html`<button class="play-btn" @click=${this.onResumeClick} ?disabled=${!this.hasRecording} title="Resume"><span class="icon-span"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M8,5v14l11-7L8,5z" fill="currentColor"/></svg></span></button>`;
    } else if (isPlaying || isRecording) {
        return html`<button class="pause-btn" @click=${this.onPauseClick} title="Pause"><span class="icon-span"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M6,19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/></svg></span></button>`;
    } else {
        return html`<button class="play-btn" @click=${this.onPlayClick} ?disabled=${!this.hasRecording} title="Play Recording"><span class="icon-span"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M8,5v14l11-7L8,5z" fill="currentColor"/></svg></span></button>`;
    }
  }

  private renderThemeIcon() {
    if (this.isDarkTheme) {
      return html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
    } else {
      return html`<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    }
  }

  private getModeChar() {
    switch (this.primaryMode) {
      case 'QUALITY': return 'QAL';
      case 'DIVERSITY': return 'DIV';
      case 'VOCALIZATION': return 'VOC';
      default: return 'QAL';
    }
  }

    render() {
    const isStopped = this.playbackState === 'stopped';
    const isRecording = this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading';

    const modes = ['QUALITY', 'DIVERSITY', 'VOCALIZATION'];
    
    const modeIdx = modes.indexOf(this.primaryMode);
    const formatIdx = ['mp3', 'wav', 'webm'].indexOf(this.downloadFormat);

    return html`
      <div class="button-group">
        <button class="theme-btn" @click=${this.toggleTheme} title="Toggle Theme">
            <span class="icon-span">${this.renderThemeIcon()}</span>
        </button>
        <button class="reset-btn ${this.isResetting ? 'active-red' : ''}" @click=${this.onResetClick} title="Engine Reset (Power)">
            <span class="icon-span">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"/>
              </svg>
            </span>
        </button>
        <button class="shuffle-btn ${this.isShuffling ? 'active-blue' : ''}" @click=${this.onRandomizeClick} ?disabled=${isRecording} title="3D Dice Shuffle">
            <span class="icon-span"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01 20.73 6.96M12 22.08V12"/><circle cx="12" cy="7" r="1" fill="currentColor"/><circle cx="7" cy="14" r="1" fill="currentColor"/><circle cx="17" cy="14" r="1" fill="currentColor"/></svg></span>
        </button>
        <button class="dj-btn ${this.isConductorActive ? 'dj-on' : ''}" @click=${this.toggleDj} ?disabled=${isRecording} title="DJ/Conductor">
            <span class="icon-span"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg></span>
        </button>

        <button class="theme-btn mic-btn ${this.isVocalActive ? 'active' : ''}" ?disabled=${isRecording || this.voiceBlocked} @click=${() => (this as any).dispatchEvent(new CustomEvent('toggle-vocal-dialog', { bubbles: true, composed: true }))} title=${this.voiceBlocked ? "Monthly free quota used up" : "Vocal Commands"}>
          <span class="icon-span"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg></span>
        </button>
      </div>

      <div class="spacer-group"></div>

      <div class="button-group">
        <button class="stop-btn" @click=${this.onStopClick} ?disabled=${isStopped && !this.isRewinding} title="Stop">
            <span class="icon-span"><svg width="24" height="24" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" fill="currentColor"/></svg></span>
        </button>
        <button class="back-start-btn ${this.isRewinding ? 'active-state' : ''}" @click=${this.onBackStartClick} ?disabled=${(isStopped && this.elapsedSeconds === 0) || isRecording} title="Back to Start">
            <span class="icon-span"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M6,6h2v12H6V6zm3.5,6L18,6v12l-8.5-6z" fill="currentColor"/></svg></span>
        </button>
        <button class="loop-btn ${this.isLooping ? 'active-state' : ''} ${this.playbackState === 'playing' && this.isLooping ? 'playing-flash' : ''}" @click=${this.onLoopClick} ?disabled=${!this.hasRecording || !isStopped} title="Toggle Loop">
            <span class="icon-span"><svg width="18" height="18" viewBox="0 0 24 24"><path d="M17,17H7V14L3,18l4,4V19H19V13H17V17ZM7,7h10v3l4-4L17,2V5H5V11H7V7Z" fill="currentColor"/></svg></span>
        </button>
        ${this.renderPlayPause()}
        ${this.renderRecordButton()}
        <button class="kofi-btn" @click=${() => { supportIntent(); window.open('https://ko-fi.com/s/3901d91669', '_blank', 'noopener'); }} title="Support GameDJ on Ko-fi">
          <span class="icon-span"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.351 2.715c-2.7 0-4.986.025-6.83.26C2.078 3.285 0 5.154 0 8.61c0 3.506.182 6.13 1.585 8.493 1.584 2.701 4.233 4.182 7.662 4.182h.83c4.209 0 6.494-2.234 7.637-4a9.5 9.5 0 0 0 1.091-2.338C21.792 14.688 24 12.22 24 9.208v-.415c0-3.247-2.13-5.507-5.792-5.87-1.558-.156-2.65-.208-6.857-.208m0 1.947c4.208 0 5.09.052 6.571.182 2.624.311 4.13 1.584 4.13 4v.39c0 2.156-1.792 3.844-3.87 3.844h-.935l-.156.649c-.208 1.013-.597 1.818-1.039 2.546-.909 1.428-2.545 3.064-5.922 3.064h-.805c-2.571 0-4.831-.883-6.078-3.195-1.09-2-1.298-4.155-1.298-7.506 0-2.181.857-3.402 3.012-3.714 1.533-.233 3.559-.26 6.39-.26m6.547 2.287c-.416 0-.65.234-.65.546v2.935c0 .311.234.545.65.545 1.324 0 2.051-.754 2.051-2s-.727-2.026-2.052-2.026m-10.39.182c-1.818 0-3.013 1.48-3.013 3.142 0 1.533.858 2.857 1.949 3.897.727.701 1.87 1.429 2.649 1.896a1.47 1.47 0 0 0 1.507 0c.78-.467 1.922-1.195 2.623-1.896 1.117-1.039 1.974-2.364 1.974-3.897 0-1.662-1.247-3.142-3.039-3.142-1.065 0-1.792.545-2.338 1.298-.493-.753-1.246-1.298-2.312-1.298"/></svg></span>
        </button>
      </div>

      <div class="spacer-group"></div>

      <div class="button-group">
        <div class="rotary-container">
          <div class="status-dot dot-0 ${modeIdx === 0 ? 'active' : ''}"></div>
          <div class="status-dot dot-1 ${modeIdx === 1 ? 'active' : ''}"></div>
          <div class="status-dot dot-2 ${modeIdx === 2 ? 'active' : ''}"></div>
          <button class="rotary-btn mode-btn" @click=${this.cyclePrimaryMode} ?disabled=${isRecording} data-pos="${modeIdx}" title="Primary Mode: ${this.primaryMode}">
            <div class="rotary-inner">
              <div class="rotary-indicator"></div>
              <span class="rotary-text">${this.getModeChar()}</span>
            </div>
          </button>
        </div>
        
        <div class="rotary-container">
          <div class="status-dot dot-0 ${formatIdx === 0 ? 'active' : ''}"></div>
          <div class="status-dot dot-1 ${formatIdx === 1 ? 'active' : ''}"></div>
          <div class="status-dot dot-2 ${formatIdx === 2 ? 'active' : ''}"></div>
          <button class="rotary-btn format-btn" @click=${this.cycleFormat} ?disabled=${isRecording} data-pos="${formatIdx}" title="Export Format: ${this.downloadFormat.toUpperCase()}">
            <div class="rotary-inner">
              <div class="rotary-indicator"></div>
              <span class="rotary-text">${this.downloadFormat.toUpperCase()}</span>
            </div>
          </button>
        </div>

        <button class="download-btn" @click=${this.onDownloadClick} title="Download Recording">
          <span class="icon-span"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span>
        </button>
      </div>
    `;
  }
}
declare global {
  interface HTMLElementTagNameMap { 'left-sidebar': LeftSidebar }
}
