import type { InstrumentSet } from '../types';
import { on } from '../utils/events';
import type { App } from './context';

/** While the DJ records live it works the master controls and the track volumes per section, and the display counts the warm-up down. */
export function setupStage(app: App) {
  const { pdjMidi, rightSidebar, topToolbar } = app;
  // While the DJ conducts a live recording it also works the master controls (volume, evolution) and the volume of
  // each track — even though they are disabled for the user — and varies tempo, key and rhythm. It never touches
  // manifest or instruments.
  type Mix = [number, number, number, number, number]; // lead, alto, harmonic, bass, rhythm
  const STAGE_MIX: Record<string, Mix> = {
      intro: [0.6, 0.6, 0.9, 0.5, 0.4],  verse: [0.9, 0.7, 0.8, 0.8, 0.7],
      main: [0.9, 0.9, 0.9, 0.9, 0.9],     build: [0.8, 0.8, 0.8, 0.9, 0.9],  chorus: [1, 0.9, 0.9, 1, 1],
      climax: [1, 1, 1, 1, 1],             breakdown: [0.8, 0.6, 0.8, 0.5, 0.3], solo: [1, 0.5, 0.7, 0.8, 0.8],
      outro: [0.6, 0.5, 0.8, 0.4, 0.3]
  };
  const STAGE_VOLUME: Record<string, number> = { intro: 0.5, outro: 0.5, breakdown: 0.6, build: 0.7, chorus: 0.9, climax: 0.9 };
  const STAGE_EVOLUTION: Record<string, number> = { intro: -3, outro: -4, breakdown: 0, build: 2, verse: 1, main: 2, chorus: 5, climax: 6, solo: 3 };
  const djStageControls = (type: string | undefined, index: number) => {
      const t = type || 'main';
      const volume = STAGE_VOLUME[t] ?? 0.7;
      rightSidebar.volume = volume;
      app.liveMusicHelper.setVolume(volume);

      const evo = Math.max(-10, Math.min(10, (STAGE_EVOLUTION[t] ?? 1) + Math.round(Math.random() * 2 - 1)));
      rightSidebar.setEvolution(evo);
      app.liveMusicHelper.setEvolution(evo);

      // The DJ mixes the tracks too: each stage has its balance, with a little variation
      const mix = STAGE_MIX[t] ?? [0.85, 0.85, 0.85, 0.85, 0.85];
      const keys = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
      const vols: Partial<Record<keyof InstrumentSet, number>> = {};
      keys.forEach((k, i) => { vols[k] = Math.max(0, Math.min(1, mix[i] + (Math.random() * 0.16 - 0.08))); });
      rightSidebar.setChannelVolumes(vols);

      if (index > 0 && Math.random() < 0.5) {
          const change = topToolbar.djVary();
          if (change) pdjMidi.setMessage(`DJ VARIATION: ${change}`, 'info');
      }
  };

  on(app.liveMusicHelper, 'conductor-stage-changed', (e) => {
      const { name, type, index } = e.detail;
      pdjMidi.setMessage(`DJ: ${name}`, 'info');
      if (type !== undefined && app.liveMusicHelper.conductorMode && app.liveMusicHelper.playbackState === 'recording') {
          djStageControls(type, index ?? 0);
      }
  });
  
  on(app.liveMusicHelper, 'conductor-anticipation', (e) => {
      const { msg } = e.detail;
      pdjMidi.setMessage(msg, 'info');
  });

  // The warm-up countdown in the display; Stop and Reset end it
  let warmupInterval: number | null = null;
  const stopWarmupCountdown = () => { if (warmupInterval) { clearInterval(warmupInterval); warmupInterval = null; } };
  on(app.liveMusicHelper, 'warmup-started', (e) => {
      stopWarmupCountdown();
      const totalMs = e.detail.durationMs;
      const warmupMs = e.detail.warmupMs;
      let remainingMs = totalMs;

      const updateMsg = () => {
          const isTuning = remainingMs > (totalMs - warmupMs);
          const displaySecs = Math.ceil(remainingMs / 1000);
          if (isTuning) {
              pdjMidi.setMessage(`ORCHESTRA TUNING: ${displaySecs}S...`, 'info');
          } else {
              pdjMidi.setMessage(`BATON RAISED: ${displaySecs}S...`, 'info');
          }
      };

      updateMsg();
      warmupInterval = window.setInterval(() => {
          remainingMs -= 1000;
          if (remainingMs > 0 && (app.liveMusicHelper.playbackState === 'warmup' || app.liveMusicHelper.playbackState === 'preparing')) {
              updateMsg();
          } else {
              clearInterval(warmupInterval!);
              warmupInterval = null;
          }
      }, 1000);
  });
  return { stopWarmupCountdown };
}
