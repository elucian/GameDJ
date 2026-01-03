
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

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

@customElement('bottom-timeline')
export class Timeline extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      background: var(--bg-color);
      border-top: 1px solid var(--border-color);
      position: relative;
      overflow: hidden; 
      color: var(--text-muted);
      font-size: 11px;
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
      font-size: 9px;
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
      background: #000;
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 8px 0;
      flex-shrink: 0;
      z-index: 50;
      box-shadow: inset -2px 0 10px rgba(0,0,0,0.5);
      box-sizing: border-box;
    }

    :host-context(body.light-theme) .track-header {
      background: #e0e0e0;
    }

    .time-display {
      color: var(--accent-color);
      font-family: monospace;
      font-size: 16px;
      font-weight: bold;
      line-height: 1.2;
      text-align: center;
    }
    :host-context(body.light-theme) .time-display {
      color: #008f5d;
    }

    .status-text {
      font-size: 9px;
      font-weight: bold;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-top: 6px;
      line-height: 1;
      text-align: center;
    }
    .status-rec { color: var(--accent-secondary); animation: blink 1s infinite; }
    .status-warm { color: #ffdd28; animation: blink 0.5s infinite; }
    .status-prep { color: #007bff; animation: blink 0.2s infinite; }
    .status-play { color: var(--accent-color); }
    .status-waiting { color: #ffdd28; animation: blink 0.2s infinite; }
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
      background: rgba(255,255,255,0.02);
      border-radius: 1px;
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
      box-shadow: inset 0 0 4px rgba(0,0,0,0.2);
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
      top: 5%; 
      bottom: 5%;
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(1px);
      border-radius: 1px;
    }
    :host-context(body.light-theme) .ghost-segment {
      background: rgba(0, 0, 0, 0.08);
    }

    .label-gutter {
      height: 20px; 
      background: #151515; 
      border-top: 1px solid var(--border-color);
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 60;
    }
    
    :host-context(body.light-theme) .label-gutter {
      background: #dcdcdc;
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
      background: #007bff;
      border-radius: 50%;
    }
    .fade-handle::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 20px;
      left: 50%;
      width: 2px;
      background: #007bff;
      transform: translateX(-50%);
    }

    .fade-label {
      position: absolute;
      top: 3px;
      font-size: 8px;
      white-space: nowrap;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      padding: 1px 6px;
      font-weight: 900;
      pointer-events: none;
      border-radius: 2px;
      text-transform: uppercase;
      border: 1px solid rgba(255, 255, 255, 0.4);
      transform: translateX(-50%);
      backdrop-filter: blur(2px);
      z-index: 90;
    }

    :host-context(body.light-theme) .fade-label {
      background: rgba(255, 255, 255, 0.85);
      color: #000;
      border-color: rgba(0, 0, 0, 0.6);
    }

    .fade-overlay {
      position: absolute;
      top: 0;
      bottom: 20px;
      background: rgba(0, 123, 255, 0.1);
      pointer-events: none;
      z-index: 10;
    }

    .playhead {
      position: absolute;
      top: 0;
      bottom: 20px;
      width: 2px;
      background: var(--accent-secondary);
      z-index: 100;
      pointer-events: none;
      transform: translateX(-50%);
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
    
    .label-container {
      position: relative;
      height: 100%;
      width: 100%;
      padding: 0; 
    }
  `;

  @property({ type: String }) playbackState = 'stopped';
  @property({ type: Number }) maxDuration = 55; 
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

  @state() private history: ChannelHistory = { lead: [], alto: [], harmonic: [], bass: [], rhythm: [], ghost: [] };
  private isDragging = false;
  private dragTarget: 'playhead' | 'fadeIn' | 'fadeOut' | 'duration' | null = null;

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

    if (changed.has('maxDuration')) {
      const scale = this.getFadeScale(this.maxDuration);
      this.fadeIn = Math.max(0.1, this._baseFadeIn * scale);
      this.fadeOut = Math.max(0.1, this._baseFadeOut * scale);
      this.dispatchFade();
    }
  }

  public resetHistory(forceEmpty = false) {
      this.history = { lead: [], alto: [], harmonic: [], bass: [], rhythm: [], ghost: [] };
      if (!forceEmpty && this.playbackState === 'recording') {
          this.initHistorySegments(0);
      }
      (this as any).requestUpdate();
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
      if (segmentModified) (this as any).requestUpdate();
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
    if (target.closest('.ruler')) { this.isDragging = true; this.dragTarget = 'duration'; return; }
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
        const rect = this.laneElement.getBoundingClientRect();
        let x = e.clientX - rect.left - 20; 
        const pct = Math.max(0.05, Math.min(1, x / (rect.width - 40)));
        const finalSeconds = Math.max(1, Math.round(pct * 55));
        (this as any).dispatchEvent(new CustomEvent('duration-changed-manually', { detail: finalSeconds }));
    } else if (this.dragTarget === 'playhead') {
      const bpmSnap = 60 / this.bpm;
      const playheadSnapped = Math.max(0, Math.min(Math.round(rawTime / bpmSnap) * bpmSnap, this.effectiveDuration));
      let targetTime = playheadSnapped;
      if (this.recordedDuration > 0) {
          targetTime = Math.min(playheadSnapped, this.recordedDuration);
      }
      (this as any).dispatchEvent(new CustomEvent('seek', { detail: targetTime }));
    }
  }

  private handlePointerUp() {
    this.isDragging = false;
    this.dragTarget = null;
  }

  private dispatchFade() { (this as any).dispatchEvent(new CustomEvent('fade-changed', { detail: { fadeIn: this.fadeIn, fadeOut: this.fadeOut } })); }
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
          markers.push(html`<div class="ruler-marker" style="left: calc(120px + (100% - 140px) * ${left/100})">${this.formatTime((i/10)*duration)}</div>`);
      }
      return markers;
  }

  private renderGhostLayer() {
    if (!this.showGhost) return null;
    const duration = this.effectiveDuration;
    return html`<div class="ghost-layer">${this.history.ghost.map((segment) => { const startPct = (segment.start / duration) * 100; const end = segment.end === null ? this.elapsedSeconds : segment.end; const widthPct = ((end - segment.start) / duration) * 100; return html`<div class="ghost-segment" style="left: ${startPct}%; width: ${widthPct}%"></div>`; })}</div>`;
  }

  private renderChannelHistory(key: keyof ChannelHistory, color: string) {
    if (key === 'ghost') return null;
    const duration = this.effectiveDuration;
    return this.history[key].map((segment) => { 
        const startPct = (segment.start / duration) * 100; 
        const end = segment.end === null ? this.elapsedSeconds : segment.end; 
        const widthPct = ((end - segment.start) / duration) * 100; 
        if (widthPct <= 0) return null;
        return html`<div class="channel-segment" style="left: ${startPct}%; width: ${widthPct}%; background: ${color}"></div>`; 
    });
  }

  render() {
    const duration = this.effectiveDuration;
    const playheadPct = (this.elapsedSeconds / duration) * 100;
    const fadeInPct = (this.fadeIn / duration) * 100;
    const fadeOutStartPct = ((this.maxDuration - this.fadeOut) / duration) * 100;
    const fadeOutWidthPct = (this.fadeOut / duration) * 100;
    
    const handleLeft = (pct: number) => `calc(20px + (100% - 40px) * ${pct/100})`;

    return html`
      <div class="ruler" @pointerdown=${this.handlePointerDown}>${this.renderRuler()}</div>
      <div class="tracks">
        <div class="track-container">
           <div class="track-header">
             <div class="time-display">${this.formatTime(this.elapsedSeconds)}</div>
             ${this.renderStatus()}
           </div>
           <div class="track-lane" @pointerdown=${this.handlePointerDown}>
             ${this.renderGhostLayer()}
             <div class="bars-area">
               <div class="channel-row ${!this.visibleChannels.lead ? 'hidden' : ''}">${this.renderChannelHistory('lead', 'var(--ch-lead)')}</div>
               <div class="channel-row ${!this.visibleChannels.alto ? 'hidden' : ''}">${this.renderChannelHistory('alto', 'var(--ch-alto)')}</div>
               <div class="channel-row ${!this.visibleChannels.harmonic ? 'hidden' : ''}">${this.renderChannelHistory('harmonic', 'var(--ch-harmonic)')}</div>
               <div class="channel-row ${!this.visibleChannels.bass ? 'hidden' : ''}">${this.renderChannelHistory('bass', 'var(--ch-bass)')}</div>
               <div class="channel-row ${!this.visibleChannels.rhythm ? 'hidden' : ''}">${this.renderChannelHistory('rhythm', 'var(--ch-rhythm)')}</div>
             </div>
             <div class="fade-overlay" style="left: 20px; width: calc((100% - 40px) * ${fadeInPct/100})"></div>
             <div class="fade-overlay" style="left: ${handleLeft(fadeOutStartPct)}; width: calc((100% - 40px) * ${fadeOutWidthPct/100})"></div>
             <div class="fade-handle fade-in" style="left: ${handleLeft(fadeInPct)}"></div>
             <div class="fade-handle fade-out" style="left: ${handleLeft(fadeOutStartPct)}"></div>
             <div class="playhead" style="left: ${handleLeft(playheadPct)}"></div>
             <div class="label-gutter"><div class="label-container"><div class="fade-label" style="left: ${handleLeft(fadeInPct)}">IN: ${this.fadeIn.toFixed(1)}s</div><div class="fade-label" style="left: ${handleLeft(fadeOutStartPct)}">OUT: ${this.fadeOut.toFixed(1)}s</div></div></div>
           </div>
        </div>
      </div>
    `;
  }
}

declare global { interface HTMLElementTagNameMap { 'bottom-timeline': Timeline; } }
