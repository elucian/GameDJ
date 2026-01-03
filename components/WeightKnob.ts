
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { uiSounds } from '../utils/UISounds';

/** A knob for adjusting and visualizing prompt weight with 10 snapping points proportional with range. */
@customElement('weight-knob')
export class WeightKnob extends LitElement {
  static styles = css`
    :host {
      position: relative;
      width: 100%;
      aspect-ratio: 1 / 1;
      flex-shrink: 0;
      touch-action: none;
      outline: none;
      display: block;
      margin: auto;
    }

    :host(:focus) {
      outline: none;
    }
    
    :host(:focus-visible) {
      outline: 2px solid var(--accent-color);
      outline-offset: 4px;
      border-radius: 50%;
    }

    svg {
      width: 100%;
      height: 100%;
      display: block;
      overflow: visible;
    }

    .dots-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .dot {
      position: absolute;
      width: 4.5%; 
      min-width: 3px;
      max-width: 4px;
      aspect-ratio: 1;
      border-radius: 50%;
      background: var(--dot-color, #fff); 
      filter: brightness(0.3) saturate(0.1); 
      opacity: 0.8;
      transform: translate(-50%, -50%);
      pointer-events: auto;
      cursor: pointer;
      box-shadow: inset 0 1px 1px rgba(0,0,0,0.8);
      transition: all 0.1s ease-out;
      z-index: 10;
    }

    .dot.active {
      opacity: 1;
      filter: brightness(1.3) saturate(1.3);
      box-shadow: 0 0 10px var(--dot-color), inset 0 1px 1px rgba(255,255,255,0.4);
    }

    :host-context(body.light-theme) .dot {
      filter: brightness(0.2) saturate(0.1);
      opacity: 0.6;
    }

    :host-context(body.light-theme) .dot.active {
      background: #fff !important;
      filter: none;
      opacity: 1;
      box-shadow: 0 0 8px #fff, 0 1px 2px rgba(0,0,0,0.4);
    }

    .snap-zone { cursor: pointer; pointer-events: auto; }
    .increment-zone { cursor: pointer; pointer-events: auto; }
    .drag-zone { cursor: pointer; pointer-events: auto; } 
    .pointer-g { pointer-events: none; }
    
    :host([readonly]) .snap-zone,
    :host([readonly]) .increment-zone,
    :host([readonly]) .drag-zone {
        cursor: default;
    }

    .shadow-circle { 
      fill: transparent; 
      stroke: none;
      pointer-events: auto;
    }

    /* Visual indicators for the physical limits of the knob */
    .stop-indicator {
      stroke: var(--text-muted);
      stroke-width: 1;
      stroke-linecap: round;
      opacity: 0.3;
    }
  `;

  @property({ type: Number }) value = 0;
  @property({ type: String }) color = '#000';
  @property({ type: Number }) audioLevel = 0;
  @property({ type: Boolean, reflect: true }) readonly = false;

  private dragStartPos = 0;
  private dragStartValue = 0;
  private isPointerDown = false;
  private clickZone: 'snap' | 'increment' | 'drag' | null = null;

  constructor() {
    super();
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    const el = this as unknown as HTMLElement;
    if (!el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '0');
    }
    el.addEventListener('keydown', this.handleKeyDown);
    el.addEventListener('contextmenu', this.handleContextMenu);
  }

  private handleContextMenu(e: MouseEvent) {
    if (this.readonly) return;
    e.preventDefault();
    const step = 2.0 / 9.0;
    const newVal = Math.max(0, Math.round((this.value - step) * (9 / 2)) * (2 / 9));
    if (Math.abs(newVal - this.value) > 0.01) {
      uiSounds.playTick();
      this.value = newVal;
      (this as unknown as HTMLElement).dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
    }
  }

  private getValueFromAngle(angle: number): number {
    const rotationRange = Math.PI * 2 * 0.75; 
    const minRot = -rotationRange / 2 - Math.PI / 2; 
    
    let diff = angle - minRot;
    const normalizedDiff = ((diff % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);

    let val: number;
    if (normalizedDiff <= rotationRange) {
      val = (normalizedDiff / rotationRange) * 2;
    } else {
      const midGap = rotationRange + (Math.PI * 2 - rotationRange) / 2;
      // Strictly end-stopped, no wrap around conceptually in the gap
      val = normalizedDiff > midGap ? 0 : 2;
    }
    
    // Snapping to 10 points (0.0 to 2.0 with 9 intervals)
    return Math.max(0, Math.min(2, Math.round((val / 2) * 9) / 9 * 2));
  }

  private handlePointerDown(e: PointerEvent) {
    if (this.readonly) return;
    if (e.button === 0) {
      const target = e.target as HTMLElement;
      this.clickZone = null;
      if (target.closest('.snap-zone')) this.clickZone = 'snap';
      else if (target.closest('.increment-zone')) this.clickZone = 'increment';
      else if (target.closest('.drag-zone')) this.clickZone = 'drag';

      this.dragStartPos = e.clientY;
      this.dragStartValue = this.value;
      this.isPointerDown = true;
      window.addEventListener('pointermove', this.handlePointerMove);
      window.addEventListener('pointerup', this.handlePointerUp);
    }
  }

  private handlePointerMove(e: PointerEvent) {
    const delta = this.dragStartPos - e.clientY;
    if (Math.abs(delta) > 3) {
      this.clickZone = 'drag'; 
      // STRICT CLAMP to 0 - 2 range
      const rawValue = Math.max(0, Math.min(2, this.dragStartValue + delta * 0.015));
      const snapped = Math.round((rawValue / 2) * 9) / 9 * 2;
      if (Math.abs(snapped - this.value) > 0.01) {
        uiSounds.playTick();
        this.value = snapped;
        (this as unknown as HTMLElement).dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
      }
    }
  }

  private handlePointerUp(e: PointerEvent) {
    const deltaY = Math.abs(this.dragStartPos - e.clientY);
    
    if (deltaY < 3 && this.isPointerDown && e.button === 0) {
      const step = 2.0 / 9.0;
      if (this.clickZone === 'increment' || this.clickZone === 'drag') {
        // Strict increment with END STOP, no wrap around
        const nextVal = Math.round((this.value + step) * (9 / 2)) * (2 / 9);
        if (nextVal <= 2.001) {
            uiSounds.playTick();
            this.value = Math.min(2, nextVal);
            (this as unknown as HTMLElement).dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
        }
      } else if (this.clickZone === 'snap') {
        const rect = (this as unknown as HTMLElement).getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const angle = Math.atan2(dy, dx);
        const newValue = this.getValueFromAngle(angle);
        if (Math.abs(newValue - this.value) > 0.01) {
          uiSounds.playTick();
          this.value = newValue;
          (this as unknown as HTMLElement).dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
        }
      }
    }
    
    this.isPointerDown = false;
    this.clickZone = null;
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
  }

  private handleDotClick(val: number, e: MouseEvent) {
    if (this.readonly) return;
    e.stopPropagation();
    if (Math.abs(this.value - val) > 0.01) {
      uiSounds.playTick();
      this.value = val;
      (this as unknown as HTMLElement).dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
    }
  }

  private handleWheel(e: WheelEvent) {
    if (this.readonly) return;
    e.preventDefault();
    const delta = e.deltaY;
    // STRICT CLAMP to 0 - 2 range
    const rawValue = Math.max(0, Math.min(2, this.value + delta * -0.0015));
    const snapped = Math.round((rawValue / 2) * 9) / 9 * 2;
    if (Math.abs(snapped - this.value) > 0.01) {
       uiSounds.playTick();
       this.value = snapped;
       (this as unknown as HTMLElement).dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (this.readonly) return;
    let changed = false;
    const step = 2.0 / 9.0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      const target = Math.min(2, Math.round((this.value + step) * (9 / 2)) * (2 / 9));
      if (Math.abs(target - this.value) > 0.01) { this.value = target; changed = true; }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      const target = Math.max(0, Math.round((this.value - step) * (9 / 2)) * (2 / 9));
      if (Math.abs(target - this.value) > 0.01) { this.value = target; changed = true; }
    }
    if (changed) {
      uiSounds.playTick();
      e.preventDefault();
      (this as unknown as HTMLElement).dispatchEvent(new CustomEvent('input', { detail: this.value }));
    }
  }

  render() {
    const rotationRange = Math.PI * 2 * 0.75;
    const minRot = -rotationRange / 2 - Math.PI / 2;
    const maxRot = rotationRange / 2 - Math.PI / 2;
    
    // Explicitly clamp value to ensure pointer never overturns visually
    const clampedValue = Math.max(0, Math.min(2, this.value));
    const rot = minRot + (clampedValue / 2) * (maxRot - minRot);

    const rotationStyle = styleMap({
      transform: `translate(40px, 40px) rotate(${rot}rad)`,
    });
    
    return html`
      <svg
        viewBox="0 0 80 80"
        @pointerdown=${this.handlePointerDown}
        @wheel=${this.handleWheel}
        preserveAspectRatio="xMidYMid meet">
        
        <defs>
          <linearGradient id="aluminum-linear" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#a0a0a0" />
            <stop offset="45%" style="stop-color:#dcdcdc" />
            <stop offset="50%" style="stop-color:#fefefe" />
            <stop offset="55%" style="stop-color:#dcdcdc" />
            <stop offset="100%" style="stop-color:#a0a0a0" />
          </linearGradient>
          <filter id="knob-depth" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="0" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.4" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle class="shadow-circle snap-zone" cx="40" cy="40" r="39.5" />

        <!-- Static markers for start/stop positions -->
        <line class="stop-indicator" x1="40" y1="40" x2="${40 + 32 * Math.cos(minRot)}" y2="${40 + 32 * Math.sin(minRot)}" />
        <line class="stop-indicator" x1="40" y1="40" x2="${40 + 32 * Math.cos(maxRot)}" y2="${40 + 32 * Math.sin(maxRot)}" />

        <g filter="url(#knob-depth)" class="drag-zone">
          <circle cx="40" cy="40" r="28" fill="#666" />
          <circle cx="40" cy="40" r="27.5" fill="url(#aluminum-linear)" />
          <circle cx="40" cy="40" r="27.5" fill="transparent" stroke="rgba(255,255,255,0.2)" stroke-width="0.5" />
        </g>
        
        <g style=${rotationStyle} class="pointer-g">
          <line x1="12" y1="0" x2="26" y2="0" stroke="#333" stroke-width="3" stroke-linecap="round" />
        </g>

        <g class="increment-zone">
          <circle cx="40" cy="40" r="18" fill="rgba(0,0,0,0.12)" />
          <circle cx="40" cy="40" r="17" fill="url(#aluminum-linear)" />
          <circle cx="40" cy="40" r="17" fill="transparent" stroke="rgba(255,255,255,0.1)" stroke-width="0.5" />
        </g>
      </svg>
      <div class="dots-container" style="--dot-color: ${this.color}">
        ${this.renderDots(minRot, maxRot)}
      </div>
    `;
  }

  private renderDots(minRot: number, maxRot: number) {
    const dots = [];
    const radius = 46; 
    for (let i = 0; i < 10; i++) {
      const val = (i / 9) * 2;
      const angle = minRot + (val / 2) * (maxRot - minRot);
      const x = 50 + radius * Math.cos(angle);
      const y = 50 + radius * Math.sin(angle);
      const isActive = this.value > 0 && val <= this.value + 0.01;
      dots.push(html`
        <div 
          class="dot ${isActive ? 'active' : ''}" 
          style="left: ${x}%; top: ${y}%"
          @click=${(e: MouseEvent) => this.handleDotClick(val, e)}>
        </div>
      `);
    }
    return dots;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'weight-knob': WeightKnob;
  }
}
