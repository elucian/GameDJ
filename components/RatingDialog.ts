import { css, html, LitElement, svg } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { djPortraitUrl } from './DjPresetDialog';
import type { RatedTake } from '../utils/TakeRating';

const thumb = svg`<path d="M2 21h3V9H2v12zm19.8-10.6c0-1.1-.9-2-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13 1.4 6.6 7.8c-.4.4-.6.9-.6 1.4V19c0 1.1.9 2 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.1-.5.1-.7v-1.6z"/>`;

/**
 * "Like this?" pops up when the music stops after a DJ's take: a thumb up or down counts for that DJ (its stars in the
 * DJ dialog) and for the genre and style. Closing it (✕, Esc or a click outside) skips the vote.
 */
export interface RatingDialogEvents {
  'take-rated': { take: RatedTake; like: boolean };
}

@customElement('rating-dialog')
export class RatingDialog extends LitElement {
  /** The events it sends (a type only: see utils/events.ts) */
  declare readonly __events?: RatingDialogEvents;
  @property({ type: Boolean, reflect: true }) show = false;
  @property({ attribute: false }) take: RatedTake | null = null;

  static styles = css`
    :host { pointer-events: none; display: block; }
    :host([show]) { pointer-events: auto; }
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 999999; }
    .dialog {
      position: relative; width: 300px; max-width: calc(100vw - 32px); box-sizing: border-box;
      background: var(--surface-color); color: var(--text-color); border: 1px solid var(--border-color);
      border-radius: 20px; padding: 24px 22px 22px; box-shadow: 0 0 30px rgba(0,0,0,0.8);
      display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; font-family: 'Google Sans', sans-serif;
    }
    .close {
      position: absolute; top: 10px; right: 10px; width: 26px; height: 26px; padding: 0; border-radius: 50%;
      background: transparent; color: var(--text-muted); border: 1px solid var(--border-color);
      font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s;
    }
    .close:hover { color: #ff6666; border-color: #ff6666; transform: scale(1.1); }
    .portrait { width: 72px; height: 72px; border-radius: 50%; overflow: hidden; border: 2px solid var(--accent-color); background: #222; }
    .portrait img { width: 100%; height: 100%; object-fit: cover; display: block; }
    h2 { margin: 4px 0 0; font-size: 20px; color: var(--accent-color); }
    .what { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
    .what b { color: var(--text-color); }
    .thumbs { display: flex; gap: 18px; margin-top: 8px; }
    .thumbs button {
      width: 64px; height: 64px; border-radius: 50%; cursor: pointer; background: transparent;
      border: 2px solid var(--border-color); display: flex; align-items: center; justify-content: center; transition: all 0.15s;
    }
    .thumbs svg { width: 30px; height: 30px; fill: var(--text-muted); transition: fill 0.15s; }
    .thumbs .up:hover { border-color: #3ddc84; transform: scale(1.08); }
    .thumbs .up:hover svg { fill: #3ddc84; }
    .thumbs .down svg { transform: rotate(180deg); }
    .thumbs .down:hover { border-color: #ff6666; transform: scale(1.08); }
    .thumbs .down:hover svg { fill: #ff6666; }
  `;

  private onKey = (e: KeyboardEvent) => { if (this.show && e.key === 'Escape') this.close(); };
  connectedCallback() { super.connectedCallback(); window.addEventListener('keydown', this.onKey); }
  disconnectedCallback() { window.removeEventListener('keydown', this.onKey); super.disconnectedCallback(); }

  private close() { this.show = false; }

  private vote(like: boolean) {
    if (this.take) this.dispatchEvent(new CustomEvent('take-rated', { detail: { take: this.take, like }, bubbles: true, composed: true }));
    this.close();
  }

  render() {
    if (!this.show || !this.take) return html``;
    const t = this.take;
    return html`
      <div class="backdrop" @click=${(e: MouseEvent) => e.target === e.currentTarget && this.close()}>
        <div class="dialog" role="dialog" aria-label="Like this?">
          <button class="close" title="Skip" @click=${this.close}>✕</button>
          <div class="portrait"><img src=${djPortraitUrl(t.djId)} alt="Portrait of DJ ${t.djName}"></div>
          <h2>Like this?</h2>
          <div class="what">DJ <b>${t.djName}</b>${t.genre ? html` · ${t.genre}${t.style ? html`, ${t.style}` : ''}` : ''}</div>
          <div class="thumbs">
            <button class="up" title="Yes, I like it" aria-label="Like" @click=${() => this.vote(true)}><svg viewBox="0 0 24 24">${thumb}</svg></button>
            <button class="down" title="No, not for me" aria-label="Dislike" @click=${() => this.vote(false)}><svg viewBox="0 0 24 24">${thumb}</svg></button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'rating-dialog': RatingDialog }
}
