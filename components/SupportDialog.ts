/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { getSupportEmail } from '../utils/UserQuota';

/** Opened by the Ko-fi button: asks for the e-mail used on Ko-fi, so the bought songs find their way back to this visitor. */
@customElement('support-dialog')
export class SupportDialog extends LitElement {
  @property({ type: Boolean, reflect: true }) show = false;
  @state() private email = getSupportEmail();

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
    .hint { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
    input {
      height: 32px; box-sizing: border-box; padding: 0 12px; border-radius: 16px; width: 100%;
      background: var(--bg-color, #111); color: var(--text-color); border: 1px solid var(--border-color); outline: none; font-size: 13px;
    }
    button.go {
      height: 34px; border-radius: 17px; border: none; cursor: pointer; font-weight: 700; font-size: 13px;
      background: #ff5e5b; color: #fff; transition: transform 0.15s, box-shadow 0.15s;
    }
    button.go:hover { transform: scale(1.03); box-shadow: 0 0 10px rgba(255,94,91,0.6); }
    button.skip { background: none; border: none; color: var(--text-muted); font-size: 11px; cursor: pointer; text-decoration: underline; }
  `;

  private close() { this.show = false; }

  private go(withEmail: boolean) {
    this.dispatchEvent(new CustomEvent('continue-support', { detail: withEmail ? this.email.trim() : '', bubbles: true, composed: true }));
    this.show = false;
  }

  render() {
    if (!this.show) return html``;
    return html`
      <div class="backdrop" @click=${(e: Event) => { if (e.target === e.currentTarget) this.close(); }}>
        <div class="dialog" role="dialog" aria-label="Support GameDJ">
          <button class="close" title="Close" @click=${this.close}>✕</button>
          <h2>Support GameDJ</h2>
          <div class="hint">Buy "Unlock N songs" on Ko-fi for extra songs. Enter the e-mail you will use there, and the songs are added to your quota automatically.</div>
          <input type="email" placeholder="e-mail used on Ko-fi" .value=${this.email}
            @input=${(e: Event) => { this.email = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.go(true); }} />
          <button class="go" @click=${() => this.go(true)}>Continue to Ko-fi</button>
          <button class="skip" @click=${() => this.go(false)}>Continue without e-mail</button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'support-dialog': SupportDialog }
}
