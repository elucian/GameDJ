/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { djPortraitUrl } from './DjPresetDialog';
import { djVotes, starsFor } from '../utils/DjRatings';

/** The About dialog: opened by pressing the GameDJ label in the top bar. */
@customElement('about-dialog')
export class AboutDialog extends LitElement {
  @property({ type: Boolean, reflect: true }) show = false;
  /** Lyria 3.5 songs this month: used / limit */
  @property({ type: Number }) songsUsed = 0;
  @property({ type: Number }) songsLimit = 3;
  /** Live takes this week: used / limit */
  @property({ type: Number }) liveUsed = 0;
  @property({ type: Number }) liveLimit = 5;
  /** The DJ on deck (there is always one): id for the portrait and the votes, name, country, age, tagline */
  @property({ attribute: false }) dj: { id: string; name: string; country: string; age: number; tagline: string } | null = null;

  static styles = css`
    :host { pointer-events: none; display: block; }
    :host([show]) { pointer-events: auto; }
    .backdrop {
      position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7);
      display: flex; justify-content: center; align-items: center; z-index: 999999;
    }
    .dialog {
      position: relative; width: 340px; max-width: calc(100vw - 32px); box-sizing: border-box;
      background: var(--surface-color); color: var(--text-color);
      border: 1px solid var(--border-color); border-radius: 20px; padding: 28px 24px 22px;
      box-shadow: 0 0 30px rgba(0, 0, 0, 0.8); text-align: center;
      display: flex; flex-direction: column; gap: 14px; font-family: 'Google Sans', sans-serif;
    }
    .close {
      position: absolute; top: 10px; right: 10px; width: 26px; height: 26px; padding: 0; border-radius: 50%;
      background: transparent; color: var(--text-muted); border: 1px solid var(--border-color);
      font-size: 13px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: all 0.15s;
    }
    .close:hover { color: #ff6666; border-color: #ff6666; background: rgba(255, 102, 102, 0.1); transform: scale(1.1); }
    h2 { margin: 0; font-size: 20px; letter-spacing: 0.5px; color: var(--accent-color); }
    .quota { font-size: 15px; font-weight: 700; }
    .quota .n { font-family: monospace; color: var(--accent-color); }
    .quota-sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; font-weight: 600; }
    .dj { display: flex; gap: 12px; align-items: center; text-align: left; padding: 10px; border: 1px solid var(--border-color); border-radius: 12px; background: var(--bg-color); }
    .dj .pic { width: 64px; height: 64px; flex: none; border-radius: 12px; overflow: hidden; border: 2px solid var(--accent-color); background: #2a1d12; position: relative; }
    .dj .pic::before { content: attr(data-initial); position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: bold; color: #c9a77a; }
    .dj .pic img { position: relative; width: 100%; height: 100%; object-fit: cover; display: block; }
    .dj .on-deck { font-size: 10px; font-weight: 800; letter-spacing: 1px; color: var(--text-muted); text-transform: uppercase; }
    .dj .name { font-size: 16px; font-weight: 700; color: var(--text-heading); }
    .dj .meta { font-size: 11.5px; color: var(--text-muted); }
    .dj .stars { position: relative; display: inline-block; line-height: 1; letter-spacing: 1px; font-size: 12px; margin-top: 3px; }
    .dj .stars .bg { color: #555; }
    .dj .stars .fg { position: absolute; left: 0; top: 0; overflow: hidden; white-space: nowrap; color: #ffc940; }
    .tagline { font-size: 11.5px; color: var(--text-color); line-height: 1.4; text-align: left; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .copy { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
    .copy.credits { font-size: 10.5px; margin-top: -4px; }
    a { color: var(--accent-color); text-decoration: none; }
    a:hover { text-decoration: underline; }
  `;

  private close() { this.show = false; }

  private renderDj() {
    const d = this.dj;
    if (!d) return '';
    const stars = starsFor(djVotes(d.id));
    return html`
      <div class="dj">
        <div class="pic" data-initial=${d.name[0]}><img src=${djPortraitUrl(d.id)} alt="Portrait of DJ ${d.name}" @error=${(e: Event) => ((e.target as HTMLElement).style.display = 'none')}></div>
        <div>
          <div class="on-deck">DJ on deck</div>
          <div class="name">${d.name}</div>
          <div class="meta">${d.country}${d.age > 0 ? html` · ${d.age}` : ""}</div>
          ${stars === null ? html`<div class="meta">Not rated yet</div>` : html`<span class="stars" title="${stars} of 5 stars"><span class="bg">★★★★★</span><span class="fg" style="width:${stars * 20}%">★★★★★</span></span>`}
        </div>
      </div>
      <div class="tagline">${d.tagline}</div>`;
  }

  render() {
    if (!this.show) return html``;
    return html`
      <div class="backdrop" @click=${(e: Event) => { if (e.target === e.currentTarget) this.close(); }}>
        <div class="dialog" role="dialog" aria-label="About">
          <button class="close" title="Close" @click=${this.close}>✕</button>
          <h2>Game DJ DAW - APP</h2>
          ${this.renderDj()}
          <div>
            <div class="quota">Your Quota: <span class="n">${this.songsUsed}/${this.songsLimit}</span> songs</div>
            <div class="quota-sub">Live takes this week: ${this.liveUsed}/${this.liveLimit}</div>
          </div>
          <div class="copy">Copyright (c) 2026 Sage-Code<br>(<a href="https://sagecode.org" target="_blank" rel="noopener">https://sagecode.org</a>)</div>
          <div class="copy credits">MP3 export uses <a href="https://lame.sourceforge.io" target="_blank" rel="noopener">LAME</a> (lamejs, <a href="/licenses/lamejs-LICENSE.txt" target="_blank" rel="noopener">LGPL</a>)</div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'about-dialog': AboutDialog }
}
