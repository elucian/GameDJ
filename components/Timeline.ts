
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { dragSongSeconds } from '../constants/durations';

interface TimeSegment {
  start: number;
  end: number | null;
}

interface ChannelHistory {
  lead: TimeSegment[];
  alto: TimeSegment[];
  harmonic: TimeSegment[];
  bass: TimeSegment[];
  rhythm: TimeSegment[];
  ghost: TimeSegment[]; 
}

export interface TimelineEvents {
  /** Ruler drag: the new song length in minutes */
  'duration-changed-manually': number;
  /** Seconds */
  'seek': number;
  'fade-changed': { fadeIn: number; fadeOut: number };
}

@customElement('bottom-timeline')
export class Timeline extends LitElement {
  /** The events it sends (a type only: see utils/events.ts) */
  declare readonly __events?: TimelineEvents;
  static styles = css`
    :host {
      display: block;
      height: 100%;
      background: var(--bg-color);
      border-top: 1px solid var(--border-color);
      position: relative;
      overflow: hidden; 
      color: var(--text-muted);
      font-size: 12.65px;
    }
    .ruler {
      height: 24px;
      background: var(--surface-header);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: flex-end;
      padding-left: 100px;
      position: relative;
      user-select: none;
      font-size: 10.5px;
      overflow: hidden; 
      cursor: crosshair;
    }
    .ruler-marker {
        position: absolute;
        bottom: 0;
        transform: translateX(-50%);
        white-space: nowrap;
        display: flex;
        flex-direction: column;
        align-items: center;
        color: var(--text-color);
        pointer-events: none;
    }
    .ruler-marker::after {
        content: '';
        display: block;
        width: 1px;
        height: 5px;
        background: var(--text-color);
        margin-top: 3px;
    }
    /* Phones: every second time label is hidden (its tick stays), so the labels do not run into each other */
    @media (max-width: 700px) {
      .ruler-marker.minor { color: transparent; }
    }
    .tracks {
      display: flex;
      flex-direction: column;
      height: calc(100% - 24px);
      user-select: none;
      position: relative;
      overflow: hidden;
    }
    .track-container {
      flex: 1;
      display: flex;
      position: relative;
      height: 100%;
    }
    .track-header {
      width: 100px;
      background: var(--tl-header-bg);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 8px 0;
      flex-shrink: 0;
      z-index: 50;
      box-shadow: inset -2px 0 10px var(--tl-header-shadow);
      box-sizing: border-box;
    }


    .time-display {
      color: var(--accent-color);
      font-family: monospace;
      font-size: 18.5px;
      font-weight: bold;
      line-height: 1.2;
      text-align: center;
    }

    .status-text {
      font-size: 10.5px;
      font-weight: bold;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 6px;
      line-height: 1;
      text-align: center;
    }
    .status-rec { color: var(--accent-secondary); animation: blink 1s infinite; }
    .status-warm { color: var(--tl-warn); animation: blink 0.5s infinite; }
    .status-prep { color: var(--tl-fade-color); animation: blink 0.2s infinite; }
    .status-play { color: var(--accent-color); }
    .status-waiting { color: var(--tl-warn); animation: blink 0.2s infinite; }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

    .track-lane {
      flex: 1;
      position: relative;
      background: var(--bg-color);
      display: flex;
      flex-direction: column;
      padding: 0; /* Removing padding as we control bounds via child left/right */
      box-sizing: border-box;
      cursor: text;
      overflow: hidden;
    }

    .bars-area {
      position: absolute;
      top: 0;
      bottom: 20px;
      left: 20px; /* Fixed margins to match playhead and ruler content */
      right: 20px;
      display: flex;
      flex-direction: column;
      justify-content: stretch;
      padding: 2px 0; 
      z-index: 20;
      gap: 2px;
    }
    .channel-row {
      position: relative;
      width: 100%;
      flex: 1; 
      /* Outlined in one colour for all channels (silver / dark gray) with a transparent fill, so a silent channel is still visible; active time is solid in the channel colour */
      background: transparent;
      border: 1px solid var(--tl-row-border);
      box-sizing: border-box;
      border-radius: 1px;
      overflow: hidden;
    }
    .channel-row.hidden {
      display: none;
      flex: 0;
    }
    .channel-segment {
      position: absolute;
      top: 0;
      bottom: 0;
      border-radius: 1px;
      min-width: 1px;
      background: var(--channel-color);
    }

    .ghost-layer {
      position: absolute;
      top: 0;
      bottom: 20px;
      left: 20px; /* Constrain to active timeline width */
      right: 20px;
      pointer-events: none;
      z-index: 5;
    }
    .ghost-segment {
      position: absolute;
      top: 15%; 
      bottom: 15%;
      background: var(--tl-ghost-bg);
      backdrop-filter: blur(2px);
      border-radius: 4px;
      box-shadow: inset 0 0 8px var(--tl-ghost-shadow);
      border: 1px solid var(--tl-ghost-border);
    }

    .label-gutter {
      height: 20px; 
      background: var(--tl-gutter-bg);
      border-top: 1px solid var(--border-color);
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 60;
    }
    

    .fade-handle {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 30px; 
      z-index: 80;
      cursor: ew-resize;
      transform: translateX(-50%);
      display: flex;
      justify-content: center;
      pointer-events: auto;
    }
    .fade-handle.locked {
        cursor: not-allowed;
        opacity: 0.5;
    }
    .fade-handle::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 10px;
      height: 10px;
      background: var(--tl-fade-color);
      border-radius: 50%;
    }
    .fade-handle::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 20px;
      left: 50%;
      width: 2px;
      background: var(--tl-fade-color);
      transform: translateX(-50%);
    }

    .fade-label {
      position: absolute;
      top: 3px;
      font-size: 10.58px;
      white-space: nowrap;
      background: var(--tl-label-bg);
      color: var(--tl-label-text);
      padding: 1px 6px;
      font-weight: 900;
      pointer-events: none;
      border-radius: 2px;
      text-transform: uppercase;
      border: 1px solid var(--tl-label-border);
      transform: translateX(-50%);
      backdrop-filter: blur(2px);
      z-index: 90;
    }


    .fade-overlay {
      position: absolute;
      top: 0;
      bottom: 20px;
      background: color-mix(in srgb, var(--tl-fade-color) 10%, transparent);
      pointer-events: none;
      z-index: 10;
    }

    /* Cursor track: matches the 20px margins of the lane, pure % positioning inside */
    .cursor-track {
      position: absolute;
      top: 0;
      bottom: 20px;
      left: 20px;
      right: 20px;
      pointer-events: none;
      z-index: 100;
    }
    .playhead {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      pointer-events: none;
      transform: translateX(-50%);
    }
    .playhead.playback {
      background: var(--tl-playback); /* Green - audible playback position (behind) */
      width: 4px;
      opacity: 0.9;
      box-shadow: 0 0 6px color-mix(in srgb, var(--tl-playback) 60%, transparent);
    }
    .playhead.recording {
      background: var(--tl-recording); /* Red - buffer write position (ahead) */
      box-shadow: 0 0 6px color-mix(in srgb, var(--tl-recording) 60%, transparent);
    }
    .playhead::after {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 10px solid var(--accent-secondary);
    }
    .playhead.playback::after {
      border-top-color: var(--tl-playback);
    }
    .playhead.recording::after {
      border-top-color: var(--tl-recording);
    }
    /* Buffered region between green (playback) and red (write) cursors */
    .buffer-region {
      position: absolute;
      top: 0;
      bottom: 0;
      background: linear-gradient(90deg, color-mix(in srgb, var(--tl-playback) 8%, transparent), color-mix(in srgb, var(--tl-recording) 15%, transparent));
      border-top: 1px dashed var(--tl-buffer-border);
      pointer-events: none;
      z-index: 60;
    }
    
    .label-container {
      position: relative;
      height: 100%;
      width: 100%;
      padding: 0; 
    }
  `;

  @property({ type: Number }) maxDuration = 34; 
  @property({ type: Number }) recordedDuration = 0; 
  @property({ type: Boolean, reflect: true }) hasRecording = false;
  @property({ type: Boolean }) isLooping = false;
  @property({ type: Number }) bpm = 120;
  @property({ type: Boolean }) showGhost = true; 
  @property({ type: Number }) fadeIn = 5.0; 
  @property({ type: Number }) fadeOut = 10.0; 
  @property({ type: Object }) activeChannels = { lead: true, alto: true, harmonic: true, bass: true, rhythm: true };
  @property({ type: Object }) visibleChannels = { lead: true, alto: true, harmonic: true, bass: true, rhythm: true };
  
  @property({ type: Number }) elapsedSeconds = 0;
  @property({ type: Boolean }) isRewinding = false;
  @property({ type: String }) playbackState: string = 'stopped';

  @state() private history: ChannelHistory = { lead: [], alto: [], harmonic: [], bass: [], rhythm: [], ghost: [] };
  private isDragging = false;
  private dragTarget: 'playhead' | 'fadeIn' | 'fadeOut' | 'duration' | null = null;
  /** Ruler drag: where it started, the length then and the last length sent */
  private durationDrag = { startX: 0, startSecs: 0, lastSecs: 0 };

  private _baseFadeIn = 5.0;
  private _baseFadeOut = 10.0;

  @query('.track-lane') private laneElement!: HTMLElement;

  constructor() {
    super();
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointermove', this.handlePointerMove);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointermove', this.handlePointerMove);
  }

  private get effectiveDuration(): number {
    return this.maxDuration;
  }

  private getFadeScale(duration: number): number {
    return Math.log2(duration / 60 + 1);
  }

  willUpdate(changed: Map<string, any>) {
    if (changed.has('maxDuration')) {
      const scale = this.getFadeScale(this.maxDuration);
      this.fadeIn = Math.max(0.1, this._baseFadeIn * scale);
      this.fadeOut = Math.max(0.1, this._baseFadeOut * scale);
      this.dispatchFade();
    }
  }

  updated(changed: Map<string, any>) {
    if (changed.has('playbackState')) {
      const oldState = changed.get('playbackState');
      if (this.playbackState === 'recording' && oldState !== 'paused' && oldState !== 'loading') {
          this.resetHistory();
      }
      if (this.playbackState === 'recording') this.updateHistoryOnChannelChange();
      if (this.playbackState === 'stopped' || this.playbackState === 'paused' || this.playbackState === 'loop-waiting') {
          this.closeAllHistorySegments();
      }
    }

    if (changed.has('activeChannels') && this.playbackState === 'recording') {
        this.updateHistoryOnChannelChange();
    }
  }

  public resetHistory(forceEmpty = false) {
      this.history = { lead: [], alto: [], harmonic: [], bass: [], rhythm: [], ghost: [] };
      if (!forceEmpty && this.playbackState === 'recording') {
          this.initHistorySegments(0);
      }
      this.requestUpdate();
  }

  private initHistorySegments(startTime: number) {
      const keys = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
      keys.forEach(k => { if (this.activeChannels[k]) this.history[k].push({ start: startTime, end: null }); });
      this.history.ghost.push({ start: startTime, end: null });
  }

  private closeAllHistorySegments() {
      const keys = ['lead', 'alto', 'harmonic', 'bass', 'rhythm', 'ghost'] as const;
      keys.forEach(k => {
          const segments = this.history[k];
          const last = segments[segments.length - 1];
          if (last && last.end === null) last.end = this.elapsedSeconds;
      });
  }

  private updateHistoryOnChannelChange() {
      let segmentModified = false;
      const keys = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
      keys.forEach(k => {
          const isActive = this.activeChannels[k];
          const segments = this.history[k];
          const lastSegment = segments[segments.length - 1];
          
          if (isActive) { 
              if (!lastSegment || lastSegment.end !== null) {
                  segments.push({ start: this.elapsedSeconds, end: null }); 
                  segmentModified = true;
              }
          }
          else { 
              if (lastSegment && lastSegment.end === null) {
                  lastSegment.end = this.elapsedSeconds; 
                  segmentModified = true;
              }
          }
      });
      if (segmentModified) this.requestUpdate();
  }

  private getTimeFromEvent(e: PointerEvent): number {
    const rect = this.laneElement.getBoundingClientRect();
    let x = e.clientX - rect.left - 20; 
    const effectiveWidth = rect.width - 40;
    x = Math.max(0, Math.min(x, effectiveWidth));
    const pct = x / effectiveWidth;
    return pct * this.effectiveDuration;
  }

  private handlePointerDown(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('.ruler')) {
      // The song length, as the Duration slider: not while a take is being recorded
      if (this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading') return;
      this.durationDrag = { startX: e.clientX, startSecs: this.maxDuration, lastSecs: this.maxDuration };
      this.isDragging = true; this.dragTarget = 'duration'; return;
    }
    if (target.closest('.fade-in')) { if (this.playbackState === 'recording' || this.playbackState === 'playing' || this.playbackState === 'warmup' || this.playbackState === 'preparing') return; this.dragTarget = 'fadeIn'; this.isDragging = true; }
    else if (target.closest('.fade-out')) { if (this.playbackState === 'playing') return; this.dragTarget = 'fadeOut'; this.isDragging = true; }
    else { 
      if (this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading' || this.playbackState === 'loop-waiting' || this.playbackState === 'rewinding' || this.isRewinding) return;
      this.dragTarget = 'playhead'; 
      this.isDragging = true; 
      this.handlePointerMove(e);
    }
  }

  private handlePointerMove(e: PointerEvent) {
    if (!this.isDragging) return;
    const rawTime = this.getTimeFromEvent(e);
    const scale = this.getFadeScale(this.maxDuration);
    
    if (this.dragTarget === 'fadeIn') { 
      this.fadeIn = Math.max(0.1, Math.min(rawTime, this.maxDuration / 2.5)); 
      this._baseFadeIn = this.fadeIn / scale;
      this.dispatchFade(); 
    }
    else if (this.dragTarget === 'fadeOut') { 
      const newFadeOut = this.maxDuration - rawTime; 
      this.fadeOut = Math.max(0.1, Math.min(newFadeOut, this.maxDuration / 2.5)); 
      this._baseFadeOut = this.fadeOut / scale;
      this.dispatchFade(); 
    }
    else if (this.dragTarget === 'duration') {
        // Drag right for a longer song, left for a shorter one: the lane's width spans the whole range,
        // in the Duration slider's 10 s steps (the app answers with the length it applied, the ruler redraws)
        const width = this.laneElement.getBoundingClientRect().width - 40;
        const d = this.durationDrag;
        const secs = dragSongSeconds(d.startSecs, e.clientX - d.startX, width);
        if (secs !== d.lastSecs) {
            d.lastSecs = secs;
            this.dispatchEvent(new CustomEvent('duration-changed-manually', { detail: secs / 60 }));
        }
    } else if (this.dragTarget === 'playhead') {
      const bpmSnap = 60 / this.bpm;
      const playheadSnapped = Math.max(0, Math.min(Math.round(rawTime / bpmSnap) * bpmSnap, this.effectiveDuration));
      let targetTime = playheadSnapped;
      if (this.recordedDuration > 0) {
          targetTime = Math.min(playheadSnapped, this.recordedDuration);
      }
      this.dispatchEvent(new CustomEvent('seek', { detail: targetTime }));
    }
  }

  private handlePointerUp() {
    this.isDragging = false;
    this.dragTarget = null;
  }

  private dispatchFade() { this.dispatchEvent(new CustomEvent('fade-changed', { detail: { fadeIn: this.fadeIn, fadeOut: this.fadeOut } })); }
  private formatTime(seconds: number): string { const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60); return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`; }
  
  private renderStatus() {
    switch (this.playbackState) {
      case 'recording': return html`<div class="status-text status-rec">REC</div>`;
      case 'warmup':
      case 'loading': return html`<div class="status-text status-warm">WAIT</div>`;
      case 'preparing': return html`<div class="status-text status-prep">PREP</div>`;
      case 'playing': return html`<div class="status-text status-play">PLAY</div>`;
      case 'loop-waiting': return html`<div class="status-text status-waiting">LOOP</div>`;
      case 'paused': return html`<div class="status-text">PAUSE</div>`;
      case 'rewinding': return html`<div class="status-text">REW</div>`;
      default: return html`<div class="status-text">IDLE</div>`;
    }
  }

  private renderRuler() {
      const markers = [];
      const duration = this.effectiveDuration;
      for (let i = 0; i <= 10; i++) {
          const left = (i / 10) * 100;
          markers.push(html`<div class="ruler-marker ${i % 2 ? 'minor' : ''}" style="left: calc(120px + (100% - 140px) * ${left/100})">${this.formatTime((i/10)*duration)}</div>`);
      }
      return markers;
  }

  private renderGhostLayer() {
    if (!this.showGhost) return null;
    const duration = this.effectiveDuration;
    return html`<div class="ghost-layer">${this.history.ghost.map((segment) => { const startPct = (segment.start / duration) * 100; const end = segment.end === null ? this.elapsedSeconds : segment.end; const widthPct = ((end - segment.start) / duration) * 100; return html`<div class="ghost-segment" style="left: ${startPct}%; width: ${widthPct}%"></div>`; })}</div>`;
  }

  private renderChannelHistory(key: keyof ChannelHistory) {
    if (key === 'ghost') return null;
    const duration = this.effectiveDuration;
    return this.history[key].map((segment) => { 
        const startPct = (segment.start / duration) * 100; 
        const end = segment.end === null ? this.elapsedSeconds : segment.end; 
        const widthPct = ((end - segment.start) / duration) * 100; 
        if (widthPct <= 0) return null;
        return html`<div class="channel-segment" style="left: ${startPct}%; width: ${widthPct}%"></div>`; 
    });
  }

  @property({ type: Number }) bufferTime = 3.0;


  render() {
    const isManifestEmpty = !this.visibleChannels.lead && !this.visibleChannels.alto && !this.visibleChannels.harmonic && !this.visibleChannels.bass && !this.visibleChannels.rhythm;
    const duration = this.effectiveDuration;
    const fadeInPct = (this.fadeIn / duration) * 100;
    const fadeOutStartPct = ((this.maxDuration - this.fadeOut) / duration) * 100;
    const fadeOutWidthPct = (this.fadeOut / duration) * 100;
    
    const handleLeft = (pct: number) => `calc(20px + (100% - 40px) * ${pct/100})`;

    const isRecording = this.playbackState === 'recording';
    const isPlaying = this.playbackState === 'playing';
    const isPaused = this.playbackState === 'paused';

    // RED cursor = buffer write head (ahead) — where Lyria is generating music
    const writeHeadPct = (this.elapsedSeconds / duration) * 100;
    // GREEN cursor = audible playback position (behind by buffer/cache amount)
    // Stays at 0 until the buffer has filled (elapsed > bufferTime)
    const bufferFilled = this.elapsedSeconds >= this.bufferTime;
    const playbackHeadPct = bufferFilled ? ((this.elapsedSeconds - this.bufferTime) / duration) * 100 : 0;
    // Buffer region spans between green and red cursors
    const bufferRegionWidthPct = Math.max(0, writeHeadPct - playbackHeadPct);

    return html`
      <div class="ruler" title="Drag left or right to change the song length" @pointerdown=${this.handlePointerDown}>${this.renderRuler()}</div>
      <div class="tracks">
        <div class="track-container">
           <div class="track-header">
             <div class="time-display">${this.formatTime(this.elapsedSeconds)}</div>
             ${this.renderStatus()}
           </div>
           <div class="track-lane" @pointerdown=${this.handlePointerDown}>
             ${isManifestEmpty ? this.renderGhostLayer() : html`
               <div class="bars-area">
                 <div class="channel-row ${!this.visibleChannels.lead ? 'hidden' : ''}" style="--channel-color: var(--ch-lead)">${this.renderChannelHistory('lead')}</div>
                 <div class="channel-row ${!this.visibleChannels.alto ? 'hidden' : ''}" style="--channel-color: var(--ch-alto)">${this.renderChannelHistory('alto')}</div>
                 <div class="channel-row ${!this.visibleChannels.harmonic ? 'hidden' : ''}" style="--channel-color: var(--ch-harmonic)">${this.renderChannelHistory('harmonic')}</div>
                 <div class="channel-row ${!this.visibleChannels.bass ? 'hidden' : ''}" style="--channel-color: var(--ch-bass)">${this.renderChannelHistory('bass')}</div>
                 <div class="channel-row ${!this.visibleChannels.rhythm ? 'hidden' : ''}" style="--channel-color: var(--ch-rhythm)">${this.renderChannelHistory('rhythm')}</div>
               </div>
             `}
             <div class="fade-overlay" style="left: 20px; width: calc((100% - 40px) * ${fadeInPct/100})"></div>
             <div class="fade-overlay" style="left: ${handleLeft(fadeOutStartPct)}; width: calc((100% - 40px) * ${fadeOutWidthPct/100})"></div>
             <div class="fade-handle fade-in" style="left: ${handleLeft(fadeInPct)}"></div>
             <div class="fade-handle fade-out" style="left: ${handleLeft(fadeOutStartPct)}"></div>
             
             <!-- Cursor track: pure % positioning, no mixed-unit calc = no vibration -->
             <div class="cursor-track">
               ${isRecording ? html`
                 <div class="buffer-region" style="left: ${playbackHeadPct}%; width: ${bufferRegionWidthPct}%"></div>
                 ${bufferFilled ? html`<div class="playhead playback" style="left: ${playbackHeadPct}%"></div>` : ''}
                 <div class="playhead recording" style="left: ${writeHeadPct}%"></div>
               ` : ''}
               ${isPlaying || isPaused || this.playbackState === 'rewinding' ? html`
                 <div class="playhead playback" style="left: ${writeHeadPct}%"></div>
               ` : ''}
             </div>
             
             <div class="label-gutter"><div class="label-container"><div class="fade-label" style="left: ${handleLeft(fadeInPct)}">IN: ${this.fadeIn.toFixed(1)}s</div><div class="fade-label" style="left: ${handleLeft(fadeOutStartPct)}">OUT: ${this.fadeOut.toFixed(1)}s</div></div></div>
           </div>
        </div>
      </div>
    `;
  }
}

declare global { interface HTMLElementTagNameMap { 'bottom-timeline': Timeline; } }
