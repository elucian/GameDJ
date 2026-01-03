
/**
 * @fileoverview Control real time music with a MIDI controller
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlaybackState, Prompt, InstrumentSet, MusicGenerationMode, ChannelState } from './types';
import { GoogleGenAI } from '@google/genai';
import { PromptDjMidi } from './components/PromptDjMidi';
import { ToastMessage } from './components/ToastMessage';
import { TopToolbar, MUSIC_DATA } from './components/TopToolbar';
import { LeftSidebar } from './components/LeftSidebar';
import { RightSidebar } from './components/RightSidebar';
import { Timeline } from './components/Timeline';
import { LiveMusicHelper, VOCAL_STRINGS, SONG_REFERENCES } from './utils/LiveMusicHelper';
import { AudioAnalyser } from './utils/AudioAnalyser';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = 'lyria-realtime-exp';

function main() {
  const initialPrompts = buildInitialPrompts();
  const topToolbar = new TopToolbar();
  const leftSidebar = new LeftSidebar();
  const rightSidebar = new RightSidebar();
  const timeline = new Timeline();
  const pdjMidi = new PromptDjMidi();
  
  let activeMusicSeed = Math.floor(Math.random() * 2147483647);
  let autoLoopCountdownTimer: number | null = null;
  let autoLoopSecondsRemaining = 20;

  const cancelAutoLoop = () => {
    if (autoLoopCountdownTimer) {
      clearInterval(autoLoopCountdownTimer);
      autoLoopCountdownTimer = null;
      if (liveMusicHelper.playbackState === 'stopped' && liveMusicHelper.recordedAudioBlob) {
          pdjMidi.setMessage("RECORDING READY", "info");
      }
    }
  };

  const startAutoLoopGracePeriod = () => {
    if (liveMusicHelper.isLooping) return; 
    cancelAutoLoop();
    autoLoopSecondsRemaining = 20;
    pdjMidi.setMessage(`RECORDING READY. AUTO-LOOP IN ${autoLoopSecondsRemaining}S...`, 'info');
    
    autoLoopCountdownTimer = window.setInterval(() => {
      autoLoopSecondsRemaining--;
      if (autoLoopSecondsRemaining > 0) {
        pdjMidi.setMessage(`RECORDING READY. AUTO-LOOP IN ${autoLoopSecondsRemaining}S...`, 'info');
      } else {
        cancelAutoLoop();
        liveMusicHelper.setLoop(true);
        liveMusicHelper.playRecording(0);
        pdjMidi.setMessage("AUTO-LOOP ENGAGED", "info");
      }
    }, 1000);
  };

  pdjMidi.setPrompts(initialPrompts);
  pdjMidi.interactionEnabled = true; 
  document.body.appendChild(topToolbar as any);
  document.body.appendChild(leftSidebar as any);
  document.body.appendChild(pdjMidi as any);
  document.body.appendChild(rightSidebar as any);
  document.body.appendChild(timeline as any);
  const toastMessage = new ToastMessage();
  document.body.appendChild(toastMessage as any);
  const liveMusicHelper = new LiveMusicHelper(ai, model);
  liveMusicHelper.setWeightedPrompts(initialPrompts);
  liveMusicHelper.setSeed(activeMusicSeed);
  
  liveMusicHelper.setMaxDuration(3); 
  timeline.maxDuration = 180; 
  
  const audioAnalyser = new AudioAnalyser(liveMusicHelper.audioContext);
  liveMusicHelper.masterDestination = audioAnalyser.node;

  let djEngagingCountdown = false;
  let lastHandshakeIsAi = false;
  let warmupInterval: number | null = null;

  const deactivateDj = () => {
    leftSidebar.isConductorActive = false;
    rightSidebar.conductorActive = false;
    liveMusicHelper.setConductorMode(false);
  };

  setTimeout(() => {
      topToolbar.reset();
      liveMusicHelper.setEvolution(0);
      rightSidebar.setEvolution(0);
      topToolbar.randomizeInstruments(); 
      liveMusicHelper.applyAuthenticPresets('Jazz', 'Acid Jazz', 'None', leftSidebar.primaryMode);
  }, 100);

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.getAttribute('contenteditable')) return;
    if (liveMusicHelper.generationMode === 'VOCALIZATION' && !liveMusicHelper.conductorMode) {
      if (e.key.length === 1 && e.key.match(/[a-z]/i)) {
        if (liveMusicHelper.isVocalInstrumentActive()) {
            cancelAutoLoop();
            liveMusicHelper.sendVocalSignal(e.key);
        }
      }
    }
  });

  liveMusicHelper.addEventListener('vocal-signal-received', (e: any) => {
    const sig = e.detail;
    if (sig) {
      pdjMidi.setMessage(`VOCAL SIGNAL: ${sig}`, 'info');
    } else {
      if (liveMusicHelper.generationMode === 'VOCALIZATION') {
          pdjMidi.setMessage(`VOCALIZATION READY`, 'info');
      }
    }
  });

  (topToolbar as any).addEventListener('genre-changed', ((e: Event) => {
      cancelAutoLoop();
      if (!leftSidebar.isShuffling && !leftSidebar.isResetting) {
          activeMusicSeed = Math.floor(Math.random() * 2147483647);
          liveMusicHelper.setSeed(activeMusicSeed);
          pdjMidi.setMessage(`GENRE CHANGE: NEW SEED GENERATED`, 'info');
      }
      liveMusicHelper.setGlobalSettings({ genre: (e as CustomEvent<string>).detail });
      if (liveMusicHelper.playbackState === 'stopped') {
        liveMusicHelper.applyAuthenticPresets(topToolbar.genre, topToolbar.musicStyle, topToolbar.currentMood, leftSidebar.primaryMode);
      }
  }));

  (topToolbar as any).addEventListener('style-changed', ((e: Event) => {
      cancelAutoLoop();
      if (!leftSidebar.isShuffling && !leftSidebar.isResetting) {
          activeMusicSeed = Math.floor(Math.random() * 2147483647);
          liveMusicHelper.setSeed(activeMusicSeed);
          pdjMidi.setMessage(`STYLE CHANGE: NEW SEED GENERATED`, 'info');
      }
      liveMusicHelper.setGlobalSettings({ style: (e as CustomEvent<string>).detail });
      if (liveMusicHelper.playbackState === 'stopped') {
        liveMusicHelper.applyAuthenticPresets(topToolbar.genre, topToolbar.musicStyle, topToolbar.currentMood, leftSidebar.primaryMode);
      }
  }));

  (topToolbar as any).addEventListener('mood-changed', ((e: Event) => {
      cancelAutoLoop();
      const mood = (e as CustomEvent<string>).detail;
      if (!leftSidebar.isShuffling && !leftSidebar.isResetting) {
          activeMusicSeed = Math.floor(Math.random() * 2147483647);
          liveMusicHelper.setSeed(activeMusicSeed);
          pdjMidi.setMessage(`MOOD CHANGE: NEW SEED GENERATED`, 'info');
      }
      liveMusicHelper.setMood(mood);
      if (liveMusicHelper.playbackState === 'stopped') {
        liveMusicHelper.applyAuthenticPresets(topToolbar.genre, topToolbar.musicStyle, topToolbar.currentMood, leftSidebar.primaryMode);
      }
  }));
  (topToolbar as any).addEventListener('key-changed', ((e: Event) => {
      cancelAutoLoop();
      const detail = (e as CustomEvent<any>).detail;
      liveMusicHelper.setGlobalSettings({ key: detail.key, mode: detail.mode });
  }));
  (topToolbar as any).addEventListener('meter-changed', ((e: Event) => {
      cancelAutoLoop();
      liveMusicHelper.setGlobalSettings({ meter: (e as CustomEvent<string>).detail });
  }));
  (topToolbar as any).addEventListener('style-matrix-update', ((e: Event) => {
      cancelAutoLoop();
      const detail = (e as CustomEvent<any>).detail;
      rightSidebar.applyMatrixUpdate(detail);
      pdjMidi.setMessage(`${detail.style.toUpperCase()} READY`, 'info');
  }));
  
  (rightSidebar as any).addEventListener('duration-changed', ((e: Event) => {
      cancelAutoLoop();
      const mins = (e as CustomEvent<number>).detail;
      liveMusicHelper.setMaxDuration(mins); timeline.maxDuration = mins * 60;
  }));

  (rightSidebar as any).addEventListener('evolution-changed', ((e: Event) => {
      cancelAutoLoop();
      const val = (e as CustomEvent<number>).detail;
      liveMusicHelper.setEvolution(val);
  }));

  (topToolbar as any).addEventListener('duration-changed-manually', ((e: Event) => {
      cancelAutoLoop();
      const mins = (e as CustomEvent<number>).detail;
      rightSidebar.setDuration(mins); liveMusicHelper.setMaxDuration(mins); timeline.maxDuration = mins * 60;
  }));

  (timeline as any).addEventListener('seek', ((e: Event) => {
      cancelAutoLoop();
      const time = (e as CustomEvent<number>).detail;
      liveMusicHelper.elapsedSeconds = time;
      if (liveMusicHelper.playbackState === 'playing') {
          liveMusicHelper.playRecording(time);
      }
  }));

  (timeline as any).addEventListener('fade-changed', ((e: Event) => {
      cancelAutoLoop();
      const { fadeIn, fadeOut } = (e as CustomEvent<any>).detail;
      liveMusicHelper.setFades(fadeIn, fadeOut);
  }));

  liveMusicHelper.addEventListener('recording-finished-auto', () => {
      deactivateDj();
      const isLooping = liveMusicHelper.isLooping;
      if (isLooping) pdjMidi.setMessage("LOOP REPLAY IN 5S...", "info");
      else pdjMidi.setMessage("RECORDING FINISHED", "info");
  });

  liveMusicHelper.addEventListener('recording-available', () => {
      deactivateDj();
      timeline.hasRecording = true; 
      leftSidebar.hasRecording = true;
      startAutoLoopGracePeriod();
  });

  liveMusicHelper.addEventListener('recording-cleared', () => {
      timeline.hasRecording = false;
      leftSidebar.hasRecording = false;
      timeline.resetHistory(true);
      cancelAutoLoop();
  });

  liveMusicHelper.addEventListener('handshake-result', (e: any) => {
      lastHandshakeIsAi = e.detail;
      if (djEngagingCountdown) return;
      if (lastHandshakeIsAi) {
          pdjMidi.setMessage("AI CONDUCTOR ACTIVE", "info");
      } else {
          pdjMidi.setMessage("SIMPLE DJ ACTIVE", "info");
      }
  });

  liveMusicHelper.addEventListener('conductor-knobs-update', ((e: Event) => {
      const prompts = (e as CustomEvent<Map<string, Prompt>>).detail;
      pdjMidi.setPrompts(new Map(prompts));
  }));

  liveMusicHelper.addEventListener('conductor-instruments-update', ((e: Event) => {
      const instruments = (e as CustomEvent<InstrumentSet>).detail;
      rightSidebar.settings = { ...instruments };
  }));

  (pdjMidi as any).addEventListener('prompts-changed', ((e: Event) => {
      cancelAutoLoop();
      liveMusicHelper.setWeightedPrompts((e as CustomEvent<Map<string, Prompt>>).detail);
  }));

  (pdjMidi as any).addEventListener('prompt-interacted', ((e: Event) => {
      cancelAutoLoop();
      liveMusicHelper.notifyUserInteraction((e as CustomEvent<string>).detail);
  }));
  
  (leftSidebar as any).addEventListener('record', async () => {
      cancelAutoLoop();
      const genre = topToolbar.genre;
      const style = topToolbar.musicStyle;
      const mood = topToolbar.currentMood;
      const key = topToolbar.key;
      const bpm = topToolbar.bpm;
      const meter = topToolbar.meter;
      const genreData = MUSIC_DATA[genre];
      const validStyles = genreData ? Object.keys(genreData.styles) : [];
      const isStyleValid = style && validStyles.includes(style);
      const settings = rightSidebar.settings;
      const hasActiveChannel = (Object.values(settings) as ChannelState[]).some(ch => ch.active && ch.visible !== false);

      if (!genre || !isStyleValid || !mood || !key || !bpm || bpm <= 0 || !meter) {
          pdjMidi.setMessage("ERROR: STYLE SELECTION REQUIRED", "error");
          return;
      }
      if (!hasActiveChannel) {
          pdjMidi.setMessage("ERROR: NO ACTIVE CHANNELS", "error");
          return;
      }
      liveMusicHelper.record();
  });

  (leftSidebar as any).addEventListener('stop', () => {
    cancelAutoLoop();
    liveMusicHelper.stop(true, false);
    deactivateDj();
    if (warmupInterval) { clearInterval(warmupInterval); warmupInterval = null; }
  });
  (leftSidebar as any).addEventListener('pause', () => { cancelAutoLoop(); liveMusicHelper.pause(); });
  (leftSidebar as any).addEventListener('resume', () => { cancelAutoLoop(); liveMusicHelper.resume(); });
  (leftSidebar as any).addEventListener('loop-changed', (e: any) => { cancelAutoLoop(); liveMusicHelper.setLoop(e.detail); });
  (leftSidebar as any).addEventListener('play-recording', () => { cancelAutoLoop(); liveMusicHelper.playRecording(); });
  (leftSidebar as any).addEventListener('back-to-start', () => { cancelAutoLoop(); liveMusicHelper.startRewind(); });
  (leftSidebar as any).addEventListener('download', (e: any) => { cancelAutoLoop(); liveMusicHelper.download(e.detail); });
  
  (leftSidebar as any).addEventListener('dj-changed', ((e: Event) => {
      cancelAutoLoop();
      const active = (e as CustomEvent<boolean>).detail;
      const isLive = liveMusicHelper.playbackState === 'recording' || liveMusicHelper.playbackState === 'warmup' || liveMusicHelper.playbackState === 'preparing' || liveMusicHelper.playbackState === 'loading';
      
      if (active) {
          if (isLive) {
              djEngagingCountdown = true;
              let count = 5;
              pdjMidi.setMessage(`DJ ENGAGING IN ${count}S...`, "info");
              const timer = setInterval(() => {
                if (!liveMusicHelper.conductorMode) {
                   clearInterval(timer);
                   djEngagingCountdown = false;
                   return;
                }
                count--;
                if (count > 0) {
                    pdjMidi.setMessage(`DJ ENGAGING IN ${count}S...`, "info");
                } else {
                    clearInterval(timer);
                    djEngagingCountdown = false;
                    pdjMidi.setMessage(lastHandshakeIsAi ? "AI CONDUCTOR ACTIVE" : "SIMPLE DJ ACTIVE", "info");
                }
              }, 1000);
          } else {
              pdjMidi.setMessage("CONNECTING DJ...", "info");
          }
      } else {
          pdjMidi.setMessage("DJ DEACTIVATED", "info");
          djEngagingCountdown = false;
      }
      
      liveMusicHelper.setConductorMode(active); 
      rightSidebar.conductorActive = active;
  }));

  (leftSidebar as any).addEventListener('mode-changed', ((e: Event) => {
      cancelAutoLoop();
      const mode = (e as CustomEvent<MusicGenerationMode>).detail;
      liveMusicHelper.setGenerationMode(mode);
      pdjMidi.setMessage(`MODE: ${mode}`, "info");
      
      // Update knobs immediately if stopped to avoid contradictions when starting next
      if (liveMusicHelper.playbackState === 'stopped') {
        liveMusicHelper.applyAuthenticPresets(topToolbar.genre, topToolbar.musicStyle, topToolbar.currentMood, mode);
      }
  }));

  (leftSidebar as any).addEventListener('theme-changed', ((e: Event) => {
      cancelAutoLoop();
      const isDark = (e as CustomEvent<boolean>).detail;
      document.body.classList.toggle('light-theme', !isDark);
  }));

  liveMusicHelper.addEventListener('loop-changed-internal', (e: any) => {
    leftSidebar.isLooping = e.detail;
  });

  liveMusicHelper.addEventListener('mode-changed-internal', (e: any) => {
      leftSidebar.primaryMode = e.detail;
      pdjMidi.setMessage(`AI STORYTELLING: ${e.detail} MODE`, 'info');
  });

  liveMusicHelper.addEventListener('conductor-stage-changed', (e: any) => {
      const { name, isAi } = e.detail;
      const sanitizedName = name.replace(/_/g, ' ');
      const prefix = isAi ? 'Conductor' : 'DJ';
      pdjMidi.setMessage(`${prefix}: ${sanitizedName}`, 'info');
  });

  liveMusicHelper.addEventListener('warmup-started', (e: any) => {
      if (warmupInterval) clearInterval(warmupInterval);
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
          if (remainingMs > 0 && (liveMusicHelper.playbackState === 'warmup' || liveMusicHelper.playbackState === 'preparing')) {
              updateMsg();
          } else {
              clearInterval(warmupInterval!);
              warmupInterval = null;
          }
      }, 1000);
  });
  
  (leftSidebar as any).addEventListener('randomize', async () => {
      cancelAutoLoop();
      if (liveMusicHelper.playbackState !== 'stopped') return;
      await liveMusicHelper.clearRecording(); 
      timeline.hasRecording = false; 
      leftSidebar.hasRecording = false;
      timeline.resetHistory(true);
      leftSidebar.isShuffling = true;
      
      // 1. Get existing primary mode from switch
      const currentPrimaryMode = leftSidebar.primaryMode;
      
      // 2. New Seed
      activeMusicSeed = Math.floor(Math.random() * 2147483647);
      liveMusicHelper.setSeed(activeMusicSeed);

      // 3. Ordered Dice Roll for Parameters (GENRE -> STYLE -> MOOD -> KEY -> TEMPO -> METER)
      const selectedGenre = topToolbar.randomize();

      // 4. Randomize Evolution Value
      const randomEvo = Math.floor(Math.random() * 11) - 5;
      liveMusicHelper.setEvolution(randomEvo);
      rightSidebar.setEvolution(randomEvo);
      
      // 5. Update Instruments and Manifest based on Style Matrix and CURRENT MODE
      const rsLocks = (rightSidebar as any).locks;
      await topToolbar.randomizeInstruments({ manifest: rsLocks.manifest, channels: rsLocks.channels }, rightSidebar.settings, currentPrimaryMode);
      
      // 6. Final Mode Integrity Check
      const settings = rightSidebar.settings;
      const vocalChannels = (Object.values(settings) as ChannelState[]).filter(ch => {
          if (ch.visible === false) return false;
          const inst = (ch.instrument || "").toLowerCase();
          return VOCAL_STRINGS.some(v => inst.includes(v.toLowerCase())) ||
                 inst.includes('voice') || 
                 inst.includes('choir') || 
                 inst.includes('vocals') || 
                 inst.includes('soprano');
      });
      const hasVocalsInOutput = vocalChannels.length > 0;

      // Ensure primary mode state matches the instruments if we switched away from VOC
      leftSidebar.hasVocalInstrument = hasVocalsInOutput;
      liveMusicHelper.setGenerationMode(currentPrimaryMode);

      // 7. Apply Special Reference Instruction
      const genreRefs = SONG_REFERENCES[selectedGenre] || SONG_REFERENCES['Pop'];
      const ref = genreRefs[Math.floor(Math.random() * genreRefs.length)];
      liveMusicHelper.setSpecialInstruction(ref);

      // 8. Apply Knobs for Authentic Style Presets CONSIDER MODE
      liveMusicHelper.applyAuthenticPresets(topToolbar.genre, topToolbar.musicStyle, topToolbar.currentMood, currentPrimaryMode);
      
      pdjMidi.setMessage(`DICE ROLL: ${topToolbar.genre}, ${topToolbar.musicStyle} (${currentPrimaryMode})`, 'info');
      
      setTimeout(() => { leftSidebar.isShuffling = false; }, 800);
  });
  
  (leftSidebar as any).addEventListener('reset', async () => {
      cancelAutoLoop();
      leftSidebar.isResetting = true;
      if (warmupInterval) { clearInterval(warmupInterval); warmupInterval = null; }
      await liveMusicHelper.stop(false, true); 
      leftSidebar.isConductorActive = false;
      rightSidebar.conductorActive = false;
      djEngagingCountdown = false;
      rightSidebar.playbackState = 'stopped';
      topToolbar.playbackState = 'stopped';
      pdjMidi.playbackState = 'stopped';
      leftSidebar.playbackState = 'stopped';
      timeline.playbackState = 'stopped';
      await liveMusicHelper.clearRecording();
      timeline.hasRecording = false;
      leftSidebar.hasRecording = false;
      timeline.resetHistory(true);
      topToolbar.reset();
      rightSidebar.reset(); 
      pdjMidi.reset(); 
      liveMusicHelper.setEvolution(0);
      rightSidebar.setEvolution(0);
      liveMusicHelper.setSpecialInstruction(null);
      
      activeMusicSeed = 0;
      liveMusicHelper.setSeed(activeMusicSeed);

      await topToolbar.randomizeInstruments();
      pdjMidi.setMessage('ENGINE RESET (SEED: 0)', 'info');
      setTimeout(() => { leftSidebar.isResetting = false; }, 800);
  });

  (rightSidebar as any).addEventListener('channels-changed', ((e: Event) => {
      cancelAutoLoop();
      const detail = (e as CustomEvent<InstrumentSet>).detail;
      liveMusicHelper.setInstruments(detail);
      
      const vocalInManifest = (Object.values(detail) as ChannelState[]).some(ch => {
          if (ch.visible === false) return false;
          const inst = (ch.instrument || "").toLowerCase();
          return VOCAL_STRINGS.some(v => inst.includes(v.toLowerCase())) ||
                 inst.includes('voice') || 
                 inst.includes('choir') || 
                 inst.includes('vocals') || 
                 inst.includes('soprano');
      });
      leftSidebar.hasVocalInstrument = vocalInManifest;

      if (liveMusicHelper.generationMode === 'VOCALIZATION' && !vocalInManifest) {
          liveMusicHelper.setGenerationMode('QUALITY');
          leftSidebar.primaryMode = 'QUALITY';
          pdjMidi.setMessage(`MODE REVERT: NO VOCAL INSTRUMENT`, "info");
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

  (rightSidebar as any).addEventListener('locks-changed', ((e: Event) => {
      const locks = (e as CustomEvent<any>).detail;
      liveMusicHelper.setChannelsLocked(locks.channels);
  }));

  (rightSidebar as any).addEventListener('instrument-interacted', ((e: Event) => {
      cancelAutoLoop();
      const ch = (e as CustomEvent<string>).detail;
      liveMusicHelper.notifyUserInteraction(ch);
      pdjMidi.setMessage(`MIXER OVERRIDE: ${ch.toUpperCase()}`, "info");
  }));

  liveMusicHelper.addEventListener('playback-state-changed', ((e: Event) => {
    const playbackState = (e as CustomEvent<PlaybackState>).detail;
    pdjMidi.playbackState = playbackState; topToolbar.playbackState = playbackState; leftSidebar.playbackState = playbackState;
    rightSidebar.playbackState = playbackState; timeline.playbackState = playbackState;
    
    pdjMidi.interactionEnabled = playbackState !== 'playing';

    if (playbackState === 'warmup' || playbackState === 'preparing') {
        audioAnalyser.start();
    } else if (playbackState === 'recording') {
        audioAnalyser.start();
        const keyDisplay = topToolbar.key.replace('Major', 'major').replace('Minor', 'minor');
        const msg = `RECORDING: (${topToolbar.genre}, ${topToolbar.musicStyle} ${topToolbar.currentMood}, KEY ${keyDisplay}, ${topToolbar.bpm} BPM ${topToolbar.meter})`;
        pdjMidi.setMessage(msg, "info");
    } else if (playbackState === 'playing') {
        audioAnalyser.start();
        pdjMidi.setMessage("PLAYING RECORDING (AUTOMATION ACTIVE)", "info");
    } else {
        audioAnalyser.stop(); 
        pdjMidi.audioLevel = 0; 
        rightSidebar.audioLevelL = 0; 
        rightSidebar.audioLevelR = 0;
        if (playbackState === 'stopped') {
            djEngagingCountdown = false;
        }
    }
  }));

  audioAnalyser.addEventListener('audio-levels-changed', ((e: Event) => {
    const { left, right } = (e as CustomEvent<{left: number, right: number}>).detail;
    pdjMidi.audioLevel = (left + right) / 2; rightSidebar.audioLevelL = left; rightSidebar.audioLevelR = right;
  }));

  function syncUI() {
    timeline.elapsedSeconds = liveMusicHelper.elapsedSeconds;
    timeline.recordedDuration = liveMusicHelper.recordedDuration;
    timeline.isRewinding = liveMusicHelper.isRewinding;
    leftSidebar.elapsedSeconds = liveMusicHelper.elapsedSeconds;
    leftSidebar.isRewinding = liveMusicHelper.isRewinding;
    timeline.isLooping = liveMusicHelper.isLooping;
    
    if (liveMusicHelper.playbackState === 'playing' || liveMusicHelper.playbackState === 'recording') {
        timeline.activeChannels = {
            lead: liveMusicHelper.instruments.lead.active && liveMusicHelper.instruments.lead.weight > 0,
            alto: liveMusicHelper.instruments.alto.active && liveMusicHelper.instruments.alto.weight > 0,
            harmonic: liveMusicHelper.instruments.harmonic.active && liveMusicHelper.instruments.harmonic.weight > 0,
            bass: liveMusicHelper.instruments.bass.active && liveMusicHelper.instruments.bass.weight > 0,
            rhythm: liveMusicHelper.instruments.rhythm.active && liveMusicHelper.instruments.rhythm.weight > 0,
        };
    }

    requestAnimationFrame(syncUI);
  }
  requestAnimationFrame(syncUI);
}

function buildInitialPrompts() {
  const prompts = new Map<string, Prompt>();
  [
    { color: '#ffffff', text: 'Guidance' }, { color: '#ff6600', text: 'Density' }, { color: '#ff8800', text: 'Dynamics' }, 
    { color: '#ffaa00', text: 'Groove' }, { color: '#ffcc00', text: 'Attack' }, { color: '#ffea00', text: 'Staccato' }, 
    { color: '#00ccff', text: 'Brightness' }, { color: '#00aaff', text: 'Complexity' }, { color: '#0088ff', text: 'Ornamentation' }, 
    { color: '#0066ff', text: 'Variation' }, { color: '#0044ff', text: 'Glide' }, { color: '#0022ff', text: 'Presence' },
    { color: '#3dffab', text: 'Space' }, { color: '#d8ff3e', text: 'Organic' }, { color: '#ffdd28', text: 'Texture' }, 
    { color: '#3dffab', text: 'Width' }, { color: '#d8ff3e', text: 'Atmosphere' }, { color: '#00ff88', text: 'Authenticity' }
  ].forEach((p, i) => {
    const promptId = `prompt-${i}`;
    prompts.set(promptId, { promptId, text: p.text, weight: 0, volume: 0, cc: i, color: p.color });
  });
  return prompts;
}

main();
