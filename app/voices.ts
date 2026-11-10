import { LYRIA_VOICE_CHANNELS } from '../constants/instruments';
import { isVocalInstrument } from '../music/vocabulary';
import type { InstrumentSet, MusicGenerationMode } from '../types';
import { on } from '../utils/events';
import type { App } from './context';

/** The Voice dialog and the voice channels kept in step: which voices and choir the channels hold, placing the dialog's voices on channels, and leaving voice mode. */
export function setupVoices(app: App) {
  const { leftSidebar, pdjMidi, rightSidebar, vocalDialog } = app;
  const act = app.actions;
  // === Voice dialog <-> voice channels ===
  const VOICE_NAMES = ['Soprano', 'Alto', 'Tenor', 'Baritone'];
  const CHOIR_CANDIDATES: Record<string, string[]> = {
      Church: ['Gregorian Chant', 'Mixed Choir'], Gospel: ['Gospel Choir'], Chamber: ['Chamber Choir'], Military: ['Male Choir'],
      Youth: ['Female Choir', 'Mixed Choir'], Children: ['Childrens Choir'], Mixed: ['Mixed Choir', 'Epic Choir', 'A Cappella Group']
  };
  let syncingFromDialog = false;

  // What the voice channels say about the Voice dialog: choir kind, and how many solo voices (1 solo, 2 duet, 4 quartet).
  // A choir gets an even number of solo voices. Keeps the voices already chosen when the count still fits.
  const voicesFromChannels = (current: { solos: string[]; choir: string }) => {
      const s = rightSidebar.settings;
      let soloCount = 0; let choir = 'None';
      const hints: string[] = [];
      (['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const).forEach(ch => {
          const c = s[ch];
          if (c.visible === false || !c.active || !isVocalInstrument(c.instrument)) return;
          const n = c.instrument.toLowerCase();
          if (n.includes('quartet')) soloCount = Math.max(soloCount, 4);
          else if (n.includes('duet')) soloCount = Math.max(soloCount, 2);
          else if (n.includes('chamber')) choir = 'Chamber';
          else if (n.includes('gospel')) choir = 'Gospel';
          else if (n.includes('gregorian') || n.includes('chant')) choir = 'Church';
          else if (n.includes('male choir') && !n.includes('female')) choir = 'Military';
          else if (n.includes('child') && n.includes('choir')) choir = 'Children';
          else if (n.includes('choir') || n.includes('cappella') || n.includes('ensemble')) choir = 'Mixed';
          else {
              soloCount = Math.max(soloCount, 1);
              if (n.includes('female') || n.includes('soprano') || n.includes('girl') || n.includes('child')) hints.push('Soprano', 'Alto');
              else if (n.includes('male') || n.includes('tenor') || n.includes('rapper') || n.includes('mc ')) hints.push('Tenor', 'Baritone');
          }
      });
      if (soloCount === 0 && choir === 'None') return null;
      if (choir !== 'None' && soloCount % 2 === 1) soloCount++;
      const solos = current.solos.slice(0, soloCount);
      [...hints, ...[...VOICE_NAMES].sort(() => Math.random() - 0.5)].forEach(v => { if (solos.length < soloCount && !solos.includes(v)) solos.push(v); });
      return { solos, choir };
  };

  // Channel changed: mirror it in the Voice dialog (only when something actually differs)
  const syncVoiceDialog = () => {
      // Locked voice settings are the truth: the channels never rewrite them
      if (syncingFromDialog || vocalDialog.locked) return;
      const current = vocalDialog.getVoices();
      const target = voicesFromChannels(current);
      if (target && (target.choir !== current.choir || target.solos.length !== current.solos.length)) {
          vocalDialog.setVoices(target.solos, target.choir);
          app.liveMusicHelper.setVoiceCast(target.solos);
          act.refreshPromptPanel();
      }
  };

  // The Voice dialog's voices go onto the voice channels as a matching random voice instrument.
  // Returns the channels that got a voice (empty when the dialog has none).
  const applyDialogVoices = (solos: string[], choir: string): (keyof InstrumentSet)[] => {
      // Solo voices on the lead (LEAD VOICE track), the choir on the alto (BACKGROUND CHOIR track), whatever the other tracks are
      const soloCh: keyof InstrumentSet = LYRIA_VOICE_CHANNELS.solo;
      const choirCh: keyof InstrumentSet = LYRIA_VOICE_CHANNELS.choir;
      const pick: Partial<Record<keyof InstrumentSet, string[]>> = {};
      if (choir !== 'None') pick[choirCh] = CHOIR_CANDIDATES[choir] || [];
      const isFemale = (v: string) => v === 'Soprano' || v === 'Alto';
      if (solos.length === 1) pick[soloCh] = [isFemale(solos[0]) ? 'Solo Female' : 'Solo Male'];
      else if (solos.length === 2) pick[soloCh] = [solos.every(isFemale) ? 'Duet Female' : solos.some(isFemale) ? 'Duet Mix' : 'Duet Male'];
      else if (solos.length >= 3) pick[soloCh] = ['Quartet Mix'];
      if (!pick[soloCh] && !pick[choirCh]) return [];
      if (!act.songsAvailable()) { pdjMidi.setMessage('NO SONGS LEFT: VOICES NEED A LYRIA 3.5 SONG', 'error'); return []; }
      // Picking voices makes the voice the primary mode: without VOCALIZATION no voice reaches Lyria
      // (and the channels would not even offer voice instruments)
      if (app.liveMusicHelper.generationMode !== 'VOCALIZATION') {
          app.liveMusicHelper.setGenerationMode('VOCALIZATION');
          pdjMidi.setMessage('VOICES SELECTED: MODE VOCALIZATION', 'info');
      }
      syncingFromDialog = true;
      try { rightSidebar.setVoiceInstruments(pick); } finally { syncingFromDialog = false; }
      act.refreshPromptPanel();
      return Object.keys(pick) as (keyof InstrumentSet)[];
  };

  // You picked voices or a choir in the dialog: the voice channels switch to a matching random voice instrument
  on(vocalDialog, 'voices-applied', (e) => {
      if (!act.songsAvailable()) { pdjMidi.setMessage('NO SONGS LEFT: VOICE MODE NOT AVAILABLE', 'error'); return; }
      act.djStepsDownForVoices('THE DJ DOES NOT CONDUCT VOICES');
      app.liveMusicHelper.setGenerationMode('VOCALIZATION');

      rightSidebar.currentTab = 'Lyria';
      applyDialogVoices(e.detail.solos, e.detail.choir);
      // Never defined anywhere: the call threw on every Apply of the Voice dialog
  });

  // Dice in voice mode: locked voice settings put exactly the dialog's voices on stage (and no other voices);
  // otherwise a voice is added only when no channel has one. The DJ never places voices.
  const placeVoices = () => {
      const { solos, choir } = vocalDialog.getVoices();
      if (vocalDialog.locked && app.liveMusicHelper.generationMode === 'VOCALIZATION' && !rightSidebar.locks.channels && (solos.length > 0 || choir !== 'None')) {
          const voiced = applyDialogVoices(solos, choir);
          act.replaceVocalInstruments(voiced, true);
          app.liveMusicHelper.setVoiceCast(solos);
          return;
      }
      act.ensureVoiceChannels();
  };

  // Voice off and primary mode DIVERSITY (DJ activation, power button): voice instruments leave the channels,
  // the voice tracks are no longer offered and the Voice dialog closes. Lyrics and song title are kept.
  const voiceOffToDiversity = (ignoreLock = false, keepQuality = false) => {
      const mode: MusicGenerationMode = keepQuality ? 'QUALITY' : 'DIVERSITY';
      app.liveMusicHelper.setGenerationMode(mode);
      leftSidebar.primaryMode = mode;
      rightSidebar.voiceEnabled = false;
      vocalDialog.show = false;
      act.replaceVocalInstruments([], true, ignoreLock);
      act.refreshPromptPanel();
  };
  return { applyDialogVoices, placeVoices, syncVoiceDialog, voiceOffToDiversity };
}
