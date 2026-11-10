import { on } from '../utils/events';
import { track } from '@vercel/analytics';
import type { App } from './context';

/** Export: the Download button saves the take in the chosen format, one export at a time, with progress in the display. */
export function setupExport(app: App) {
  const { leftSidebar, pdjMidi, vocalDialog } = app;
  const act = app.actions;
  let exporting = false;
  on(leftSidebar, 'download', (e) => {
    act.cancelAutoLoop();
    // Download counter in Vercel Web Analytics (custom event, no personal data), only when there is something to save
    if (leftSidebar.hasRecording) track('download', { format: String(e.detail) });
    // One export at a time: an MP3 is encoded in the background and takes a few seconds per minute of music
    if (exporting) { pdjMidi.setMessage('EXPORT IN PROGRESS...', 'info'); return; }
    const format = e.detail;
    exporting = true;
    if (format !== 'webm') pdjMidi.setMessage(`EXPORTING ${format.toUpperCase()}...`, 'info');
    let shown = -1;
    app.liveMusicHelper.download(format, vocalDialog.songName, done => {
        const pct = Math.floor(done * 10) * 10; // every 10%
        if (pct !== shown && pct < 100) { shown = pct; pdjMidi.setMessage(`EXPORTING ${format.toUpperCase()}... ${pct}%`, 'info'); }
    }).then(r => {
        if (r) pdjMidi.setMessage(`SAVED ${r.filename}${r.note ? ` (${r.note.toUpperCase()})` : ''}`, 'info');
    }).catch(err => pdjMidi.setMessage(`EXPORT FAILED: ${String(err?.message || err).toUpperCase()}`, 'error'))
      .finally(() => { exporting = false; });
  });
}
