/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getSupportEmail } from '../utils/UserQuota';

/** Opened by the Ko-fi custom URL (/thanks): shows the bought songs and lets the buyer claim them with the Ko-fi e-mail. */
export interface ThanksDialogEvents {
  /** The e-mail used on Ko-fi */
  'claim-support': string;
}

@customElement('thanks-dialog')
export class ThanksDialog extends LitElement {
  /** The events it sends (a type only: see utils/events.ts) */
  declare readonly __events?: ThanksDialogEvents;
  @property({ type: Boolean, reflect: true }) show = false;
  /** Extra songs available (null while the server has not answered) */
  @property({ type: Number }) credits: number | null = null;
  /** True while we wait for Ko-fi to confirm the payment */
  @property({ type: Boolean }) waiting = false;
  @state() private email = getSupportEmail();
  @state() private message = '';
  @state() private busy = false;

  static styles = css`
    :host { pointer-events: none; display: block; }
    :host([show]) { pointer-events: auto; }
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 999999; }
    .dialog {
      position: relative; width: 360px; max-width: calc(100vw - 32px); box-sizing: border-box;
      background: var(--surface-color); color: var(--text-color); border: 1px solid var(--border-color);
      border-radius: 20px; padding: 28px 24px 22px; box-shadow: 0 0 30px rgba(0,0,0,0.8);
      display: flex; flex-direction: column; gap: 14px; text-align: center; font-family: 'Google Sans', sans-serif;
    }
    .close {
      position: absolute; top: 10px; right: 10px; width: 26px; height: 26px; padding: 0; border-radius: 50%;
      background: transparent; color: var(--text-muted); border: 1px solid var(--border-color);
      font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s;
    }
    .close:hover { color: #ff6666; border-color: #ff6666; transform: scale(1.1); }
    h2 { margin: 0; font-size: 20px; color: var(--accent-color); }
    .big { font-size: 15px; font-weight: 700; }
    .big .n { font-family: monospace; color: var(--accent-color); font-size: 18px; }
    .hint { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
    .row { display: flex; gap: 8px; }
    input {
      flex: 1; min-width: 0; height: 30px; box-sizing: border-box; padding: 0 10px; border-radius: 15px;
      background: var(--bg-color, #111); color: var(--text-color); border: 1px solid var(--border-color); outline: none; font-size: 13px;
    }
    button.claim {
      height: 30px; padding: 0 16px; border-radius: 15px; border: none; cursor: pointer; font-weight: 700; font-size: 12px;
      background: var(--accent-color); color: #000;
    }
    button.claim:disabled { opacity: 0.5; cursor: not-allowed; }
    .msg { font-size: 12px; color: var(--accent-color); min-height: 16px; }
  `;

  private close() {
    this.show = false;
    // Back to the app's own address
    if (location.pathname !== '/') history.replaceState(null, '', '/');
  }

  private async claim() {
    if (!this.email.trim() || this.busy) return;
    this.busy = true;
    this.message = '';
    this.dispatchEvent(new CustomEvent('claim-support', { detail: this.email.trim(), bubbles: true, composed: true }));
  }

  /** The app answers a claim: songs added, already claimed (the dialog closes), or nothing found */
  public claimResult(r: { claimed: number; status: 'claimed' | 'already' | 'none' } | null) {
    this.busy = false;
    if (!r) { this.message = 'The server did not answer. Try again in a moment.'; return; }
    if (r.status === 'claimed') this.message = `Done: ${r.claimed} songs added.`;
    else if (r.status === 'already') this.message = 'Already claimed. Your songs are in your quota.';
    else { this.message = 'No purchase found for this e-mail yet.'; return; }
    setTimeout(() => this.close(), 2200);
  }

  /** Shows the e-mail remembered from the Support dialog or an earlier claim */
  protected willUpdate(changed: Map<string, unknown>) {
    if (changed.has('show') && this.show && !this.email) this.email = getSupportEmail();
  }

  render() {
    if (!this.show) return html``;
    return html`
      <div class="backdrop">
        <div class="dialog" role="dialog" aria-label="Thank you">
          <button class="close" title="Close" @click=${this.close}>✕</button>
          <h2>Thank you for your support!</h2>
          <div class="big">
            ${this.credits === null ? 'Checking your songs...'
              : html`Extra songs available: <span class="n">${this.credits}</span>`}
          </div>
          ${this.waiting && !this.credits ? html`<div class="hint">Waiting for Ko-fi to confirm the payment...</div>` : ''}
          <div class="hint">Not credited yet? Enter the e-mail you used on Ko-fi:</div>
          <div class="row">
            <input type="email" placeholder="you@example.com" .value=${this.email}
              @input=${(e: Event) => { this.email = (e.target as HTMLInputElement).value; }}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.claim(); }} />
            <button class="claim" ?disabled=${this.busy || !this.email.trim()} @click=${this.claim}>Claim</button>
          </div>
          <div class="msg">${this.message}</div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'thanks-dialog': ThanksDialog }
}
