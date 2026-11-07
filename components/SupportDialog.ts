/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { creditsLeft, freeSongsPerMonth, getSupportEmail } from '../utils/UserQuota';

/** Opened by the Ko-fi button: explains the support packs and asks for the e-mail used on Ko-fi, so the songs find their way back. */
@customElement('support-dialog')
export class SupportDialog extends LitElement {
  @property({ type: Boolean, reflect: true }) show = false;
  @state() private email = getSupportEmail();

  static styles = css`
    :host { pointer-events: none; display: block; }
    :host([show]) { pointer-events: auto; }
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 999999; }
    .dialog {
      position: relative; width: 400px; max-width: calc(100vw - 32px); box-sizing: border-box;
      background: var(--surface-color); color: var(--text-color); border: 1px solid var(--border-color);
      border-radius: 20px; padding: 28px 26px 22px; box-shadow: 0 0 30px rgba(0,0,0,0.8);
      display: flex; flex-direction: column; gap: 14px; font-family: 'Google Sans', sans-serif;
    }
    .close {
      position: absolute; top: 10px; right: 10px; width: 26px; height: 26px; padding: 0; border-radius: 50%;
      background: transparent; color: var(--text-muted); border: 1px solid var(--border-color);
      font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s;
    }
    .close:hover { color: #ff6666; border-color: #ff6666; transform: scale(1.1); }
    .head { text-align: center; display: flex; flex-direction: column; gap: 6px; }
    h2 { margin: 0; font-size: 19px; line-height: 1.25; color: var(--accent-color); }
    .lead { font-size: 13px; color: var(--text-muted); line-height: 1.5; }
    .balance {
      align-self: center; font-size: 12px; font-weight: 700; padding: 3px 12px; border-radius: 12px;
      border: 1px solid var(--border-color); color: var(--text-color);
    }
    .balance b { color: var(--accent-color); font-family: monospace; font-size: 14px; }
    p { margin: 0; font-size: 13px; line-height: 1.5; }
    label { font-size: 12px; font-weight: 700; color: var(--text-muted); }
    input {
      height: 34px; box-sizing: border-box; padding: 0 14px; border-radius: 17px; width: 100%; margin-top: 4px;
      background: var(--bg-color, #111); color: var(--text-color); border: 1px solid var(--border-color); outline: none; font-size: 13px;
    }
    input:focus { border-color: #ff5e5b; }
    button.go {
      height: 38px; border-radius: 19px; border: none; cursor: pointer; font-weight: 700; font-size: 14px;
      background: #ff5e5b; color: #fff; transition: transform 0.15s, box-shadow 0.15s;
    }
    button.go:hover { transform: scale(1.03); box-shadow: 0 0 12px rgba(255,94,91,0.6); }
    button.skip { background: none; border: none; color: var(--text-muted); font-size: 13px; padding: 4px 8px; cursor: pointer; text-decoration: underline; align-self: center; }
    button.skip:hover { color: var(--text-color); }
    .fine { font-size: 11px; color: var(--text-muted); text-align: center; line-height: 1.45; }
  `;

  private close() { this.show = false; }

  private go(withEmail: boolean) {
    this.dispatchEvent(new CustomEvent('continue-support', { detail: withEmail ? this.email.trim() : '', bubbles: true, composed: true }));
    this.show = false;
  }

  render() {
    if (!this.show) return html``;
    const extra = creditsLeft();
    return html`
      <div class="backdrop" @click=${(e: Event) => { if (e.target === e.currentTarget) this.close(); }}>
        <div class="dialog" role="dialog" aria-label="Support GameDJ">
          <button class="close" title="Close" @click=${this.close}>✕</button>
          <div class="head">
            <h2>Unlock extra voice songs and help keep GameDJ running</h2>
            <div class="lead">We grant a free quota of ${freeSongsPerMonth()} songs per month. Make a donation to top up.</div>
          </div>
          ${extra > 0 ? html`<div class="balance">Your extra songs: <b>${extra}</b></div>` : ''}
          <p>1. Enter the e-mail you will use on Ko-fi.</p>
          <p>2. Choose a pack: Unlock 10, 25 or 50 songs.</p>
          <p>3. Come back. Your songs are added automatically.</p>
          <div>
            <label for="kofi-email">E-mail used on Ko-fi</label>
            <input id="kofi-email" type="email" placeholder="you@example.com" .value=${this.email}
              @input=${(e: Event) => { this.email = (e.target as HTMLInputElement).value; }}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.go(true); }} />
          </div>
          <button class="go" @click=${() => this.go(true)}>Support on Ko-fi</button>
          <button class="skip" @click=${() => this.go(false)}>Continue without e-mail</button>
          <div class="fine">Bought songs do not expire. Free monthly songs do not accumulate.</div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'support-dialog': SupportDialog }
}
