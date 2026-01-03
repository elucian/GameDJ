
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('tutorial-overlay')
export class TutorialOverlay extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2000;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Google Sans', sans-serif;
    }
    :host([open]) {
      pointer-events: auto;
      opacity: 1;
    }
    .backdrop {
      position: absolute;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(5px);
    }
    .card {
      position: relative;
      background: #1e1e1e;
      color: #fff;
      padding: 40px;
      border-radius: 16px;
      max-width: 480px;
      width: 85%;
      border: 1px solid #333;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      align-items: center;
      animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    @keyframes popIn {
      from { transform: scale(0.9); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    h2 {
      margin: 0 0 20px 0;
      font-weight: 400;
      font-size: 24px;
      background: linear-gradient(45deg, #fff, #ccc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .steps {
      display: flex;
      flex-direction: column;
      gap: 15px;
      width: 100%;
      text-align: left;
      margin-bottom: 30px;
    }
    .step {
      display: flex;
      gap: 15px;
      align-items: flex-start;
    }
    .icon {
      background: #333;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 14px;
      color: #aaa;
    }
    .text {
      font-size: 14px;
      line-height: 1.5;
      color: #ddd;
    }
    strong {
      color: #fff;
      font-weight: 500;
    }
    button {
      background: #fff;
      color: #000;
      border: none;
      padding: 12px 32px;
      border-radius: 100px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }
    button:hover {
      transform: scale(1.05);
      box-shadow: 0 0 15px rgba(255,255,255,0.3);
    }
    button:active {
      transform: scale(0.95);
    }
  `;

  @property({ type: Boolean, reflect: true }) open = true;

  private close() {
    this.open = false;
    setTimeout(() => {
        (this as unknown as HTMLElement).dispatchEvent(new CustomEvent('close'));
    }, 300);
  }

  render() {
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <div class="card">
        <h2>Welcome to GameDJ DAW</h2>
        <div class="steps">
          <div class="step">
            <div class="icon">1</div>
            <div class="text">
              <strong>Mix the Music:</strong> Drag the knobs in the central Mixer view, or focus them and use your <strong>Arrow Keys</strong>.
            </div>
          </div>
          <div class="step">
            <div class="icon">2</div>
            <div class="text">
              <strong>Be the DJ:</strong> Click on any text label to type in your own genre, instrument, or vibe.
            </div>
          </div>
          <div class="step">
            <div class="icon">3</div>
            <div class="text">
              <strong>Get Started:</strong> Press the Play button (▶) in the <strong>Top Toolbar</strong> to start generating music.
            </div>
          </div>
        </div>
        <button @click=${this.close}>Let's Jam</button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'tutorial-overlay': TutorialOverlay;
  }
}
