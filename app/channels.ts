import { isVocalInstrument } from '../music/vocabulary';
import type { ChannelState, InstrumentSet } from '../types';
import { on } from '../utils/events';
import type { App } from './context';

/** Changes on the mixer channels: voices arriving or leaving the stage, and the user taking over a channel from the DJ. */
export function setupChannels(app: App) {
  const { leftSidebar, pdjMidi, rightSidebar, timeline } = app;
  const act = app.actions;
  let hadVoiceOnStage = false;
  on(rightSidebar, 'channels-changed', ((e) => {
      act.cancelAutoLoop();
      const detail = e.detail;
      
      // The prompts name each channel by its role, which differs between the Band and Lyria tabs
      app.liveMusicHelper.isLiraMode = rightSidebar.currentTab === 'Lyria';
      // Each track's volume scales the weight the engine gets (Lyria mixes one stream: no separate gain per instrument)
      const scaled = {} as InstrumentSet;
      (Object.keys(detail) as Array<keyof InstrumentSet>).forEach(k => {
          const ch = detail[k];
          scaled[k] = { ...ch, weight: ch.weight * (ch.volume ?? 1) };
      });
      app.liveMusicHelper.setInstruments(scaled);
      act.syncVoiceDialog();
      
      // ... rest of logic
      
      const vocalInManifest = (Object.values(detail) as ChannelState[]).some(ch => {
          if (ch.visible === false) return false;
          return isVocalInstrument(ch.instrument);
      });
      leftSidebar.hasVocalInstrument = vocalInManifest;

      // A voice just came on stage (preset, locked channels, Voice dialog): the voice becomes the primary mode.
      // Only on the change, so switching the mode off yourself afterwards is respected.
      const voiceOnStage = (Object.values(detail) as ChannelState[]).some(ch => ch.visible !== false && ch.active && isVocalInstrument(ch.instrument));
      if (voiceOnStage && !act.songsAvailable()) {
          // No songs left: a voice cannot be sung, it leaves the stage
          hadVoiceOnStage = false;
          if (app.liveMusicHelper.generationMode === 'VOCALIZATION') act.fallBackToLive(); else act.replaceVocalInstruments([], true);
          pdjMidi.setMessage('NO SONGS LEFT: VOICES NOT AVAILABLE', 'error');
      } else {
          if (voiceOnStage && !hadVoiceOnStage) act.djStepsDownForVoices('A VOICE IS ON STAGE');
          if (voiceOnStage && !hadVoiceOnStage && app.liveMusicHelper.generationMode !== 'VOCALIZATION') {
              app.liveMusicHelper.setGenerationMode('VOCALIZATION');
              pdjMidi.setMessage('VOICE ON STAGE: MODE VOCALIZATION', 'info');
          }
          hadVoiceOnStage = voiceOnStage;
      }

      timeline.visibleChannels = { 
        lead: detail.lead?.visible !== false, 
        alto: detail.alto?.visible !== false,
        harmonic: detail.harmonic?.visible !== false, 
        bass: detail.bass?.visible !== false, 
        rhythm: detail.rhythm?.visible !== false 
      };
      
      timeline.activeChannels = { 
        lead: !!(detail.lead?.active && detail.lead?.weight > 0), 
        alto: !!(detail.alto?.active && detail.alto?.weight > 0),
        harmonic: !!(detail.harmonic?.active && detail.harmonic?.weight > 0), 
        bass: !!(detail.bass?.active && detail.bass?.weight > 0), 
        rhythm: !!(detail.rhythm?.active && detail.rhythm?.weight > 0) 
      };
  }));


  on(rightSidebar, 'instrument-interacted', ((e) => {
      act.cancelAutoLoop();
      const ch = e.detail;
      app.liveMusicHelper.notifyUserInteraction(ch);
      pdjMidi.setMessage(`MIXER OVERRIDE: ${ch.toUpperCase()}`, "info");
  }));
}
