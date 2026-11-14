import { AboutDialog } from '../components/AboutDialog';
import { djProfile } from '../components/DjPresetDialog';
import { SupportDialog } from '../components/SupportDialog';
import { ThanksDialog } from '../components/ThanksDialog';
import { claimSupport, clearSupportPending, getSupportEmail, quotaStatus, refreshCredits, supportIntent, supportPending } from '../utils/UserQuota';
import { on } from '../utils/events';
import type { App } from './context';

/** Ko-fi support: the thanks page (/thanks) that claims bought songs, the Support dialog before the shop, and the About dialog with this browser's quota. */
export function setupSupportDialogs(app: App) {
  const act = app.actions;
  // Ko-fi "Unlock N songs": the item's custom URL is /thanks. The dialog shows the bought songs (the webhook may need
  // a few seconds) and lets the buyer claim them with the Ko-fi e-mail.
  const thanksDialog = new ThanksDialog();
  document.body.appendChild(thanksDialog);
  const showThanks = async () => {
      thanksDialog.show = true; thanksDialog.waiting = true; thanksDialog.credits = null;
      for (let i = 0; i < 8; i++) {
          const credits = await refreshCredits();
          if (credits !== null) thanksDialog.credits = credits;
          if (credits) { act.syncVoiceBlocked(); break; }
          await new Promise(r => setTimeout(r, 4000));
      }
      thanksDialog.waiting = false;
      // Not credited to this browser (another browser paid, or no e-mail was given first): claim with the remembered e-mail
      const email = getSupportEmail();
      if (!thanksDialog.credits && email) {
          const r = await claimSupport(email);
          if (r) { thanksDialog.credits = r.credits; act.syncVoiceBlocked(); thanksDialog.claimResult(r); }
      }
  };
  if (location.pathname.replace(/\/+$/, '') === '/thanks') showThanks();
  on(thanksDialog, 'claim-support', async (e) => {
      const r = await claimSupport(e.detail);
      thanksDialog.claimResult(r);
      if (r) { thanksDialog.credits = r.credits; act.syncVoiceBlocked(); }
  });

  // Ko-fi button: ask for the e-mail first, then open the shop item
  const supportDialog = new SupportDialog();
  document.body.appendChild(supportDialog);
  window.addEventListener('show-support', () => { supportDialog.show = true; });
  on(supportDialog, 'continue-support', (e) => {
      supportIntent(e.detail);
      window.open('https://ko-fi.com/s/3901d91669', '_blank', 'noopener');
  });

  // About dialog: opens when the GameDJ label is pressed, with this browser's quota counts
  const aboutDialog = new AboutDialog();
  document.body.appendChild(aboutDialog);
  const fillAbout = () => {
      const song = quotaStatus('song'), live = quotaStatus('live');
      aboutDialog.songsUsed = song.used; aboutDialog.songsLimit = song.limit;
      aboutDialog.liveUsed = live.used; aboutDialog.liveLimit = live.limit;
      aboutDialog.dj = djProfile(app.liveMusicHelper.djPersonalityInfo?.name);
  };
  window.addEventListener('show-about', () => {
      fillAbout();
      aboutDialog.show = true;
      // Songs bought on Ko-fi are kept on the server: ask for the current count when the dialog opens
      refreshCredits().then(c => { if (c !== null) { fillAbout(); act.syncVoiceBlocked(); } });
  });
  // Back from Ko-fi after pressing Support: look for the new songs once
  window.addEventListener('focus', async () => {
      if (!supportPending()) return;
      const c = await refreshCredits();
      if (c) {
          clearSupportPending();
          act.syncVoiceBlocked(); fillAbout();
          app.toastMessage.show(`Thank you! ${c} extra songs unlocked.`);
      }
  });
}
