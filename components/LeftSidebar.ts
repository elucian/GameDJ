
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PlaybackState, MusicGenerationMode } from '../types';
import { uiSounds } from '../utils/UISounds';

@customElement('left-sidebar')
export class LeftSidebar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--surface-color);
      border-right: 1px solid var(--border-color);
      align-items: center;
      padding: 10px 0 12px 0; 
      box-sizing: border-box;
      gap: 12px;
      overflow-y: auto;
      scrollbar-width: none;
      transition: background-color 0.3s ease, border-color 0.3s ease;
    }
    :host::-webkit-scrollbar {
      display: none;
    }
    
    .button-group {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 4px 0;
    }

    .group-divider {
      width: 60%;
      height: 1px;
      background: var(--border-color);
      margin: 4px 0;
      opacity: 0.5;
    }

    button {
      background: #333;
      border: 1px solid #111;
      cursor: pointer;
      padding: 0;
      width: 36px;
      height: 36px;
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

    button:disabled {
      cursor: not-allowed;
      pointer-events: none;
      opacity: 0.2;
    }

    button:not(:disabled):hover {
      transform: scale(1.1);
      filter: brightness(1.2);
    }

    button.theme-btn { color: #ffdd28; }
    button.reset-btn { color: #aa0000; }
    button.shuffle-btn { color: #0088ff; }
    button.dj-btn { color: #0088ff; }
    button.stop-btn { color: #fff; }
    button.back-start-btn { color: #ff8c00; }
    button.loop-btn { color: #00ccff; }
    button.play-btn { color: #3dffab; }
    button.pause-btn { color: #fff; }
    button.download-btn { color: #3dffab; }
    button.record-btn:not(:disabled) { color: #aa0000; }

    button.active-red,
    button.active-recording { 
      opacity: 1 !important; 
      background: #ff4444 !important; 
      color: #000 !important;
      border-color: #222;
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
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    button.rotary-btn {
      background: #222;
      border: 2px solid #444;
      color: #fff;
      width: 32px;
      height: 32px;
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
      font-size: 8px;
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
    [data-pos="2"] .rotary-inner { transform: rotate(45deg); }

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

    .dot-0 { transform: translate(-14.14px, -14.14px); }
    .dot-1 { transform: translate(0, -20px); }
    .dot-2 { transform: translate(14.14px, -14.14px); }

    @keyframes inner-circle-blink {
      0%, 100% { fill: #000; opacity: 1; }
      50% { fill: #cc0000; opacity: 0.8; }
    }

    button.active-blue { background: #0088ff !important; color: #000 !important; }
    button.active-green { background: #3dffab !important; color: #000 !important; box-shadow: 0 0 10px #3dffab !important; }
    
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
  @property({ type: String }) primaryMode: MusicGenerationMode = 'QUALITY';
  @state() private downloadFormat: 'mp3' | 'wav' | 'webm' = 'mp3';

  private toggleTheme() {
    uiSounds.playButton();
    this.isDarkTheme = !this.isDarkTheme;
    this.dispatch('theme-changed', this.isDarkTheme);
  }

  private toggleDj() {
    uiSounds.playButton();
    this.isConductorActive = !this.isConductorActive;
    this.dispatch('dj-changed', this.isConductorActive);
  }

  private cyclePrimaryMode() {
    uiSounds.playTick();
    const modes: MusicGenerationMode[] = ['QUALITY', 'DIVERSITY'];
    if (this.hasVocalInstrument) {
        modes.push('VOCALIZATION');
    }
    
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
    const isWarmup = this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading';
    return html`
      <button 
        class="record-btn ${isRecording || isWarmup ? 'active-recording' : ''}"
        @click=${this.onRecordClick} 
        ?disabled=${isRecording || isWarmup}
        title="Record (Overwrite)">
        <span class="icon-span">
            <svg width="24" height="24" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="6" fill="currentColor"/>
            </svg>
        </span>
      </button>
    `;
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

    const modes = ['QUALITY', 'DIVERSITY'];
    if (this.hasVocalInstrument) modes.push('VOCALIZATION');
    
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
        <button class="dj-btn ${this.isConductorActive ? 'active-blue' : ''}" @click=${this.toggleDj} title="DJ/Conductor">
            <span class="icon-span"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg></span>
        </button>
      </div>

      <div class="group-divider"></div>

      <div class="button-group">
        <button class="stop-btn" @click=${this.onStopClick} ?disabled=${isStopped && !this.isRewinding} title="Stop">
            <span class="icon-span"><svg width="24" height="24" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" fill="currentColor"/></svg></span>
        </button>
        <button class="back-start-btn" @click=${this.onBackStartClick} ?disabled=${(isStopped && this.elapsedSeconds === 0) || isRecording} title="Back to Start">
            <span class="icon-span"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M6,6h2v12H6V6zm3.5,6L18,6v12l-8.5-6z" fill="currentColor"/></svg></span>
        </button>
        <button class="loop-btn ${this.isLooping ? 'active-green' : ''}" @click=${this.onLoopClick} ?disabled=${!this.hasRecording} title="Toggle Loop">
            <span class="icon-span"><svg width="18" height="18" viewBox="0 0 24 24"><path d="M17,17H7V14L3,18l4,4V19H19V13H17V17ZM7,7h10v3l4-4L17,2V5H5V11H7V7Z" fill="currentColor"/></svg></span>
        </button>
        ${this.renderPlayPause()}
        ${this.renderRecordButton()}
      </div>

      <div class="group-divider"></div>

      <div class="button-group">
        <div class="rotary-container">
          <div class="status-dot dot-0 ${modeIdx === 0 ? 'active' : ''}"></div>
          <div class="status-dot dot-1 ${modeIdx === 1 ? 'active' : ''}"></div>
          ${this.hasVocalInstrument ? html`<div class="status-dot dot-2 ${modeIdx === 2 ? 'active' : ''}"></div>` : ''}
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
        
        <button class="download-btn" @click=${this.onDownloadClick} ?disabled=${!this.hasRecording || isRecording} title="Download Audio">
            <span class="icon-span"><svg width="18" height="18" viewBox="0 0 24 24"><path d="M19,9h-4V3H9v6H5l7,7L19,9z M5,18v2h14v-2H5z" fill="currentColor"/></svg></span>
        </button>
      </div>
    `;
  }
}

declare global { interface HTMLElementTagNameMap { 'left-sidebar': LeftSidebar } }
