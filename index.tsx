
/**
 * @fileoverview Control real time music with a MIDI controller
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Prompt, InstrumentSet, MusicGenerationMode, ChannelState } from './types';
import { GoogleGenAI } from '@google/genai';
import { PromptDjMidi } from './components/PromptDjMidi';
import { ToastMessage } from './components/ToastMessage';
import { TopToolbar, MUSIC_DATA } from './components/TopToolbar';
import { LeftSidebar } from './components/LeftSidebar';
import { RightSidebar } from './components/RightSidebar';
import { VocalDialog } from './components/VocalDialog';
import { DjPresetDialog, ROBOT_DJ_ID } from './components/DjPresetDialog';
import { Timeline } from './components/Timeline';
import { getUserId, quotaStatus, recordUsage, reserveQuota, refundQuota, giveBackEarly, unrecordUsage } from './utils/UserQuota';
import { DURATION_STEPS } from './constants/durations';
import { LiveMusicHelper } from './utils/LiveMusicHelper';
import { STYLE_DESCRIPTORS, isVocalInstrument, chooseLyricsLanguage } from './music/vocabulary';
import { chooseDjManifest, djEvolutionFor, type DjPersonality } from './music/djRules';
import { LYRIA_VOICE_CHANNELS } from './constants/instruments';
import { AudioAnalyser } from './utils/AudioAnalyser';
import { uiSounds } from './utils/UISounds';
import { on } from './utils/events';
import type { App } from './app/context';
import { loadStereoSettings, saveStereoSettings } from './utils/StereoStage';
import { inject } from '@vercel/analytics';
import { setupSupportDialogs } from './app/supportDialogs';
import { setupExport } from './app/export';
import { setupVoices } from './app/voices';
import { setupStage } from './app/stage';
import { setupChannels } from './app/channels';
import { setupRating } from './app/rating';

// Vercel Web Analytics: page views only (it does nothing on localhost)
inject();

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });

function main() {
  const initialPrompts = buildInitialPrompts();
  const topToolbar = new TopToolbar();
  const leftSidebar = new LeftSidebar();
  const rightSidebar = new RightSidebar();
  const vocalDialog = new VocalDialog();
  const djPresetDialog = new DjPresetDialog();
  const timeline = new Timeline();
  const pdjMidi = new PromptDjMidi();
  // What the app's parts (app/*.ts) share. liveMusicHelper, toastMessage and the actions are made further down:
  // the getters read them when a part uses them (in its event handlers), never at setup.
  const app: App = {
      topToolbar, leftSidebar, rightSidebar, vocalDialog, djPresetDialog, timeline, pdjMidi,
      get liveMusicHelper() { return liveMusicHelper; },
      get toastMessage() { return toastMessage; },
      actions: {
          get cancelAutoLoop() { return cancelAutoLoop; },
          get syncVoiceBlocked() { return syncVoiceBlocked; },
          get refreshPromptPanel() { return refreshPromptPanel; },
          get replaceVocalInstruments() { return replaceVocalInstruments; },
          get ensureVoiceChannels() { return ensureVoiceChannels; },
          get songsAvailable() { return songsAvailable; },
          get fallBackToLive() { return fallBackToLive; },
          get djStepsDownForVoices() { return djStepsDownForVoices; },
          get syncVoiceDialog() { return syncVoiceDialog; },
      },
  };
  
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
  document.body.appendChild(topToolbar);
  window.topToolbar = topToolbar; // Expose for dialog access
  document.body.appendChild(leftSidebar);
  document.body.appendChild(djPresetDialog);
  document.body.appendChild(vocalDialog);

  setupSupportDialogs(app);
  
  on(leftSidebar, 'toggle-vocal-dialog', () => {
    vocalDialog.show = !vocalDialog.show;
    vocalDialog.genre = topToolbar.genre;
    vocalDialog.musicStyle = topToolbar.musicStyle;
    // Show the lyrics you typed or generated
    if (liveMusicHelper.lyricsText) vocalDialog.vocalText = liveMusicHelper.lyricsText;
  });

  window.addEventListener('toggle-dj-preset-dialog', () => {
    djPresetDialog.show = !djPresetDialog.show;
  });

  on(djPresetDialog, 'send-dj-config', (e) => {
      // The preset's summary text is for the log only: it is not music, so it never goes to Lyria as a prompt
      const { name, config } = e.detail;
      if (config) {
          liveMusicHelper.setDjPersonality({
              name, eagerness: config.eagerness, channels: config.channels, maxKnobs: config.maxKnobs ?? 6,
              diversity: config.diversity, complexity: config.complexity, energy: config.energy, atmosphere: config.atmosphere, warmup: config.warmup,
              country: config.country, homeStyles: config.homeStyles, homeBias: config.homeBias, curious: !!config.curious, arranging: config.arranging, habits: config.habits
          });
          liveMusicHelper.setTemperature(config.temperature ?? 1.1);
      }
      pdjMidi.setMessage(`DJ ${String(name).toUpperCase()} SELECTED`, "info");
  });

  // Apply puts the chosen DJ on deck and switches it on; Cancel keeps the DJ that is on (there is always a DJ)
  on(djPresetDialog, 'dj-dialog-applied', () => {
      leftSidebar.isConductorActive = true;
      djChanged(true);
  });

  on(djPresetDialog, 'dj-dialog-cancelled', () => {
      pdjMidi.setMessage(`DJ CONFIG CANCELLED: DJ ${(liveMusicHelper.djPersonalityInfo?.name || '').toUpperCase()} STAYS`, "info");
  });

  // The lyrics are written in the background (also with the dialog closed). Meanwhile the song settings and the recording
  // are frozen, the status says WORKING, and the dice and the instruments stay usable.
  let lyricsBusy = false;
  let lyricsRun = 0; // Cancel in the voice dialog discards the lyrics still being written
  on(vocalDialog, 'vocal-dialog-cancelled', () => { lyricsRun++; });
  const setLyricsBusy = (busy: boolean) => {
      lyricsBusy = busy;
      pdjMidi.lyricsBusy = busy; timeline.lyricsBusy = busy;
      topToolbar.lyricsBusy = busy; rightSidebar.lyricsBusy = busy; leftSidebar.lyricsBusy = busy;
      if (busy) pdjMidi.setMessage('WORKING: WRITING LYRICS...', 'info'); else updatePlayerStatus();
  };

  // Lyrics and title for a new song (the dialog's Generate button, or the DJ setting up a song with voices)
  const generateDialogLyrics = async (genre: string, dialogLang: string) => {
    // Auto: the style's own language first (Japanese Folk sings Japanese), then the genre's
    const lang: string = dialogLang === 'Auto' ? chooseLyricsLanguage(genre, topToolbar.musicStyle) : dialogLang;
    pdjMidi.setMessage(`GENERATING LYRICS FOR ${genre} (${lang.toUpperCase()})...`, "info");
    vocalDialog.generating = true;
    setLyricsBusy(true);
    const run = ++lyricsRun;
    // One call writes the lyrics and the title; a new title replaces the old one
    let title = '', lyrics = '';
    try {
      ({ title, lyrics } = await liveMusicHelper.generateSong(genre, lang, topToolbar.musicStyle, topToolbar.currentMood));
    } catch (err) {
      lyrics = `Error: ${err}`;
    } finally {
      vocalDialog.generating = false;
      setLyricsBusy(false);
    }
    if (run !== lyricsRun) return; // cancelled meanwhile: the lyrics are thrown away
    if (lyrics.startsWith('Error') || lyrics.startsWith('Could not')) {
      pdjMidi.setMessage('LYRICS FAILED: TRY AGAIN', 'error');
      return;
    }
    vocalDialog.vocalText = lyrics;
    if (title) vocalDialog.songName = title;
    liveMusicHelper.setLyrics(lyrics, lang, false);
    updateSongDuration();
    refreshPromptPanel();
    pdjMidi.setMessage(title ? `LYRICS READY: ${title.toUpperCase()} (${lang.toUpperCase()})` : `LYRICS READY: ${lang.toUpperCase()}`, 'info');
  };
  on(vocalDialog, 'request-lyrics-generation', (e) => {
    generateDialogLyrics(e.detail.genre, e.detail.lang);
  });

  on(vocalDialog, 'send-vocal-command', () => {
    // Lyria gets the voices as singer descriptions (one random artistic voice per selected voice); the dialog's
    // "VOCAL CONFIG" text itself goes nowhere. The message says which voices Lyria will sing with.
    const { solos, choir } = vocalDialog.getVoices();
    liveMusicHelper.setVoiceCast(solos);
    const cast = [...solos, ...(choir !== 'None' ? [`${choir} choir`] : [])].join(', ').toUpperCase();
    // The voice master mode (VOC) is the user's switch: with it off the voices are kept but not sent to Lyria
    if (!cast) pdjMidi.setMessage('NO VOICES: LYRIA PLAYS INSTRUMENTAL', 'info');
    else if (liveMusicHelper.generationMode !== 'VOCALIZATION') pdjMidi.setMessage(`VOICES KEPT, NOT SENT TO LYRIA (VOICE MODE OFF): ${cast}`, 'info');
    else pdjMidi.setMessage(`VOICES SENT TO LYRIA: ${cast}`, 'info');
    
    // If we were waiting for the conductor or preparing, try to start
    if (liveMusicHelper.playbackState === 'warmup' || liveMusicHelper.playbackState === 'preparing') {
        liveMusicHelper.playRecording();
    }
  });

  on(vocalDialog, 'lyrics-set', (e) => {
    // Lyrics typed or edited by the user: sung as real words in the dialog's language (Auto keeps the one picked for the style)
    const lang = vocalDialog.language;
    if (e.detail && e.detail.trim()) liveMusicHelper.setLyrics(e.detail, lang !== 'Auto' ? lang : undefined, false);
    updateSongDuration();
    refreshPromptPanel();
  });

  on(vocalDialog, 'lyrics-cleared', () => {
    lyricsRun++; // lyrics still being written are thrown away
    liveMusicHelper.setLyrics('', undefined, false);
    updateSongDuration();
    refreshPromptPanel();
    pdjMidi.setMessage('LYRICS, TITLE AND VOICES CLEARED', 'info');
  });

  on(vocalDialog, 'voice-lock-changed', (e) => {
      pdjMidi.setMessage(e.detail ? 'VOICE SETTINGS LOCKED' : 'VOICE SETTINGS UNLOCKED: DICE MAY CHANGE THEM', 'info');
  });

  on(vocalDialog, 'vocal-dialog-cancelled', () => {
      liveMusicHelper.setGenerationMode('DIVERSITY');
      leftSidebar.primaryMode = 'DIVERSITY'; // Sync UI
      pdjMidi.setMessage(`MODE: DIVERSITY`, "info");
      // Without the voice mode there are no voice instruments (as when the mode is changed on the left sidebar)
      replaceVocalInstruments();
  });
  document.body.appendChild(pdjMidi);
  document.body.appendChild(rightSidebar);
  document.body.appendChild(timeline);
  const toastMessage = new ToastMessage();
  document.body.appendChild(toastMessage);
  // Short notices from the Voice dialog (e.g. lyrics copied)
  on(vocalDialog, 'toast', (e) => toastMessage.show(e.detail));
  // Every visitor gets a unique ID (kept in this browser); free quotas are counted under it
  getUserId();
  // Over the quota: the message dialog says so (the display panel keeps the line too)
  const quotaBlocked = (message: string) => {
      toastMessage.show(message);
      pdjMidi.setMessage(message.toUpperCase(), 'error');
  };
  const liveMusicHelper = new LiveMusicHelper(ai);
  // Song quota used up: the voice dialog button is forbidden until the month ends
  // local count or a remembered server refusal; a key that may not use Lyria 3.5 blocks the voice mode too
  const syncVoiceBlocked = () => { const ok = quotaStatus('song').ok; leftSidebar.voiceBlocked = !ok || !!liveMusicHelper.songModelBlocked; liveMusicHelper.songQuotaOk = ok; };
  syncVoiceBlocked();
  // Voices need a Lyria 3.5 song (the song quota and a key that may use it)
  const songsAvailable = () => liveMusicHelper.songQuotaOk && !liveMusicHelper.songModelBlocked;
  // Fall back to the live model: Band tab selected, voice mode off (as when the voice dialog is cancelled)
  const fallBackToLive = () => {
      if (rightSidebar.currentTab !== 'Band') rightSidebar.switchTab('Band');
      liveMusicHelper.setGenerationMode('DIVERSITY');
      leftSidebar.primaryMode = 'DIVERSITY';
      rightSidebar.voiceEnabled = false;
      vocalDialog.show = false;
      replaceVocalInstruments();
      refreshPromptPanel();
      syncVoiceBlocked();
  };
  // The engine must know the knobs from the start: otherwise its map is empty until the user touches a knob, and
  // anything it broadcasts to the grid (the dice roll) wipes all knobs out.
  liveMusicHelper.setWeightedPrompts(initialPrompts);
  
  // Resume AudioContext on first interaction
  document.addEventListener('click', () => {
      if (liveMusicHelper.audioContext.state === 'suspended') {
          liveMusicHelper.audioContext.resume();
      }
  }, { once: true });
  // Attach liveMusicHelper to window for global access
  window.liveMusicHelper = liveMusicHelper;
  
  liveMusicHelper.setMaxDuration(3); 
  timeline.maxDuration = 180; 
  
  const audioAnalyser = new AudioAnalyser(liveMusicHelper.audioContext);
  liveMusicHelper.masterDestination = audioAnalyser.node;
  audioAnalyser.start();

  let djEngagingCountdown = false;
  // Counts DJ activations so a stale async DJ setup can detect that a newer request superseded it
  let djRequest = 0;

  // There is always a DJ: it rests (hands off the controls) while a take is played back, stopped or rendered, and
  // takes the controls again on the next Record. The DJ button and the "Active:" name stay on.
  const deactivateDj = () => {
    rightSidebar.conductorActive = false;
    liveMusicHelper.setConductorMode(false);
  };
  const wakeDj = () => {
    if (!leftSidebar.isConductorActive || liveMusicHelper.conductorMode) return;
    liveMusicHelper.setConductorMode(true);
    rightSidebar.conductorActive = true;
  };

  setTimeout(async () => {
      topToolbar.reset();
      liveMusicHelper.setEvolution(0);
      rightSidebar.setEvolution(0);
      await topToolbar.randomizeInstruments();
      // The app starts with a DJ on: the one on deck when it was closed, the Robot DJ the first time
      if (!leftSidebar.isConductorActive && liveMusicHelper.playbackState === 'stopped') {
          leftSidebar.isConductorActive = true;
          djChanged(true);
      }
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

  on(liveMusicHelper, 'vocal-signal-received', (e) => {
    const sig = e.detail;
    if (sig) {
      pdjMidi.setMessage(`VOCAL DIRECTION SENT TO LYRIA: ${String(sig).toUpperCase()}`, 'info');
    } else {
      if (liveMusicHelper.generationMode === 'VOCALIZATION') {
          pdjMidi.setMessage(`VOCALIZATION READY`, 'info');
      }
    }
  });

  // The dice's special instruction (genre reference + instrument list) always describes the genre and style that the
  // main bar shows right now, so it is rebuilt whenever they change instead of keeping the text of an earlier genre.
  // The main bar is the guidance for every prompt: the engine always gets exactly what the bar shows
  const syncMainBar = () => {
      liveMusicHelper.setGlobalSettings({
          genre: topToolbar.genre, style: topToolbar.musicStyle,
          key: topToolbar.key, mode: topToolbar.mode, bpm: topToolbar.bpm, meter: topToolbar.meter,
      });
      liveMusicHelper.setMood(topToolbar.currentMood);
  };
  syncMainBar();

  let diceReferenceActive = false;
  let referenceGenre = '';
  let referenceText = '';
  const applyGenreReference = (fresh = false) => {
      const genre = topToolbar.genre;
      if (fresh || genre !== referenceGenre) {
          const genreRefs = STYLE_DESCRIPTORS[genre] || STYLE_DESCRIPTORS['Pop'];
          referenceText = genreRefs[Math.floor(Math.random() * genreRefs.length)];
          referenceGenre = genre;
      }
      // The engine builds the instruction: genre colour + the exact instruments of the UI
      liveMusicHelper.setGenreReference(referenceText);
  };

  on(topToolbar, 'genre-changed', ((e) => {
      cancelAutoLoop();
      const genre = e.detail;
      rightSidebar.genre = genre;
      vocalDialog.genre = genre;
      if (!leftSidebar.isShuffling && !leftSidebar.isResetting) {
          pdjMidi.setMessage(`GENRE: ${genre.toUpperCase()}`, 'info');
      }
      liveMusicHelper.setGlobalSettings({ genre });
      if (diceReferenceActive) applyGenreReference();
  }));

  on(topToolbar, 'style-changed', ((e) => {
      cancelAutoLoop();
      const style = e.detail;
      rightSidebar.musicStyle = style;
      vocalDialog.musicStyle = style;
      if (!leftSidebar.isShuffling && !leftSidebar.isResetting) {
          pdjMidi.setMessage(`STYLE: ${style.toUpperCase()}`, 'info');
      }
      liveMusicHelper.setGlobalSettings({ style });
      if (diceReferenceActive) applyGenreReference();
  }));

  on(topToolbar, 'mood-changed', ((e) => {
      cancelAutoLoop();
      const mood = e.detail;
      if (!leftSidebar.isShuffling && !leftSidebar.isResetting) {
          pdjMidi.setMessage(`MOOD: ${mood.toUpperCase()}`, 'info');
      }
      liveMusicHelper.setMood(mood);
  }));
  on(topToolbar, 'key-changed', ((e) => {
      cancelAutoLoop();
      const detail = e.detail;
      liveMusicHelper.setGlobalSettings({ key: detail.key, mode: detail.mode });
  }));
  // Mixer channel lock: the engine then allows only the selected instruments in the prompts
  on(rightSidebar, 'locks-changed', ((e) => {
      liveMusicHelper.setInstrumentsLocked(!!e.detail.channels);
  }));
  liveMusicHelper.setInstrumentsLocked(rightSidebar.locks.channels);

  on(topToolbar, 'locks-changed', ((e) => {
      const locks = e.detail;
      liveMusicHelper.setToolbarLocks(locks);
      rightSidebar.genreLocked = locks.genre;
  }));
  on(topToolbar, 'meter-changed', ((e) => {
      cancelAutoLoop();
      liveMusicHelper.setGlobalSettings({ meter: e.detail });
      updateSongDuration();
  }));
  on(topToolbar, 'style-matrix-update', ((e) => {
      cancelAutoLoop();
      const detail = e.detail;
      rightSidebar.applyMatrixUpdate(detail);
      pdjMidi.setMessage(`${detail.style.toUpperCase()} READY`, 'info');
  }));
  
  on(rightSidebar, 'duration-changed', ((e) => {
      cancelAutoLoop();
      const mins = e.detail;
      liveMusicHelper.setMaxDuration(mins); timeline.maxDuration = mins * 60;
  }));

  on(rightSidebar, 'evolution-changed', ((e) => {
      cancelAutoLoop();
      const val = e.detail;
      liveMusicHelper.setEvolution(val);
  }));

  on(rightSidebar, 'volume-changed', ((e) => {
      const vol = e.detail;
      liveMusicHelper.setVolume(vol);
  }));
  // Mono / stereo and stereo width: done in the browser on Lyria's stereo mix (speakers, meters and recording),
  // kept in this browser
  const stereo = loadStereoSettings();
  liveMusicHelper.stereo.setMono(stereo.mono); liveMusicHelper.stereo.setWidth(stereo.width);
  rightSidebar.isStereo = !stereo.mono; rightSidebar.stereoWidth = stereo.width;
  on(rightSidebar, 'stereo-changed', (e) => {
      liveMusicHelper.stereo.setMono(!e.detail);
      saveStereoSettings(liveMusicHelper.stereo.settings);
      pdjMidi.setMessage(e.detail ? `STEREO (WIDTH ${Math.round(liveMusicHelper.stereo.settings.width * 100)}%)` : 'MONO', 'info');
  });
  on(rightSidebar, 'width-changed', (e) => {
      liveMusicHelper.stereo.setWidth(e.detail);
      saveStereoSettings(liveMusicHelper.stereo.settings);
  });

  // A song with voices (Lyria 3.5) is as long as its lyrics, tempo and meter make it: the duration slider follows
  // that estimate until the rendered song tells the exact length.
  const updateSongDuration = () => {
      if (!liveMusicHelper.usesSongModel || !liveMusicHelper.songHasVoices) return; // an instrumental keeps the chosen length
      const est = liveMusicHelper.estimateSongSeconds();
      if (est === null) return;
      const mins = rightSidebar.setDuration(est / 60);
      liveMusicHelper.setMaxDuration(mins); timeline.maxDuration = mins * 60;
  };

  // Dragging the timeline ruler sets the song length (minutes, in the Duration slider's steps); with the length
  // locked on the mixer panel the length stays
  on(timeline, 'duration-changed-manually', ((e) => {
      cancelAutoLoop();
      const mins = rightSidebar.setDuration(e.detail);
      liveMusicHelper.setMaxDuration(mins); timeline.maxDuration = mins * 60;
      syncBars();
      uiSounds.playTick();
  }));

  on(timeline, 'seek', ((e) => {
      cancelAutoLoop();
      const time = e.detail;
      liveMusicHelper.elapsedSeconds = time;
      if (liveMusicHelper.playbackState === 'playing') {
          liveMusicHelper.playRecording(time);
      }
  }));

  on(timeline, 'fade-changed', ((e) => {
      cancelAutoLoop();
      const { fadeIn, fadeOut } = e.detail;
      liveMusicHelper.setFades(fadeIn, fadeOut);
  }));

  // The auto-loop countdown only follows a recording that ran to its end by itself. After a manual stop (or reset)
  // the music stays stopped.
  let autoLoopAllowed = false;
  on(liveMusicHelper, 'recording-finished-auto', () => {
      autoLoopAllowed = true;
      deactivateDj();
      const isLooping = liveMusicHelper.isLooping;
      if (isLooping) pdjMidi.setMessage("LOOP REPLAY IN 5S...", "info");
      else pdjMidi.setMessage("RECORDING FINISHED", "info");
  });

  on(liveMusicHelper, 'recording-available', () => {
      deactivateDj();
      timeline.hasRecording = true; 
      leftSidebar.hasRecording = true;
      if (autoLoopAllowed) startAutoLoopGracePeriod();
      else pdjMidi.setMessage("RECORDING READY", "info");
      autoLoopAllowed = false;
  });

  on(liveMusicHelper, 'recording-cleared', () => {
      timeline.hasRecording = false;
      leftSidebar.hasRecording = false;
      timeline.resetHistory(true);
      cancelAutoLoop();
  });

  on(liveMusicHelper, 'handshake-result', (e) => {
      if (djEngagingCountdown) return;
      if (e.detail) {
          pdjMidi.setMessage("DJ CONDUCTOR ACTIVE", "info");
      }
  });

  on(liveMusicHelper, 'conductor-knobs-update', ((e) => {
      const prompts = e.detail;
      pdjMidi.setPrompts(new Map(prompts));
  }));

  on(liveMusicHelper, 'conductor-instruments-update', ((e) => {
      const instruments = e.detail;
      rightSidebar.settings = { ...instruments };
  }));

  on(pdjMidi, 'prompts-changed', ((e) => {
      cancelAutoLoop();
      liveMusicHelper.setWeightedPrompts(e.detail);
  }));

  on(pdjMidi, 'prompt-interacted', ((e) => {
      cancelAutoLoop();
      liveMusicHelper.notifyUserInteraction(e.detail);
  }));
  
  // A take stopped (Stop or Reset) within 15 seconds of its sound starting was not liked: the song goes back to the
  // quota (up to 5 times a day). After 15 seconds it stays counted. The sound starts when a live take leaves its warm-up (recording) or
  // when a rendered song begins to play.
  const TAKE_GRACE_MS = 15000;
  type Take = { kind: 'song' | 'live'; soundAt: number | null; localRecorded: boolean };
  let take = null as Take | null;
  /** The live take could not start (Lyria RealTime busy, over its limit, or gone): nothing was delivered, so it is not charged. */
  const failTake = (message: string) => {
      const t = take; take = null;
      if (t) {
          refundQuota(t.kind);
          if (t.localRecorded) unrecordUsage(t.kind);
          syncVoiceBlocked();
      }
      pdjMidi.setMessage(message, 'error');
      toastMessage.show(message);
  };
  const giveBackTake = async () => {
      const t = take; take = null;
      if (!t) return;
      if (t.soundAt !== null && Date.now() - t.soundAt > TAKE_GRACE_MS) return;
      if (!(await giveBackEarly(t.kind))) {
          pdjMidi.setMessage('GIVE-BACK LIMIT REACHED. THIS TAKE STAYS COUNTED', 'error');
          return;
      }
      if (t.localRecorded) unrecordUsage(t.kind);
      syncVoiceBlocked();
      pdjMidi.setMessage(t.kind === 'song' ? 'STOPPED WITHIN 15S: SONG GIVEN BACK' : 'STOPPED WITHIN 15S: TAKE GIVEN BACK', 'info');
  };

  // A Quality song failed: the next take is recorded live once (the song model may work again for the take after)
  let forceLiveTake = false;
  on(leftSidebar, 'record', async () => {
      if (lyricsBusy) { pdjMidi.setMessage('WORKING: LYRICS ARE BEING WRITTEN', 'info'); return; }
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
      // The resting DJ takes the controls again (it plans the take: live, a song, or the vocal performance)
      wakeDj();
      // Voice mode with a voice or choir on stage: Lyria RealTime cannot sing words, so the take is rendered
      // as a whole song (instruments, singers and lyrics) by Lyria 3.5
      let kind: 'song' | 'live' = liveMusicHelper.usesSongModel && !forceLiveTake ? 'song' : 'live';
      forceLiveTake = false;
      if (kind === 'song') {
          const q = await reserveQuota('song');
          if (!q.ok) {
              // Monthly song quota used up: fall back to the live model, with the Band and without the voice mode
              toastMessage.show(`${q.message} Falling back to live model.`);
              pdjMidi.setMessage('MONTHLY QUOTA USED UP: FALLBACK TO LIVE MODEL', 'error');
              fallBackToLive();
              kind = 'live';
          }
      }
      if (kind === 'live') {
          const q = await reserveQuota('live');
          if (!q.ok) { quotaBlocked(q.message); return; }
      }
      take = { kind, soundAt: null, localRecorded: false };
      if (kind === 'song') {
          // A song with voices cannot be arranged by the DJ: it steps down (button unselected). An instrumental
          // Quality song is arranged by the DJ up front (renderSong asks it for a plan) and the DJ stays on.
          // With the DJ on, renderSong asks it for the plan: the arrangement of an instrumental, or the vocal
          // performance of a song with voices. The DJ stays on.
          if (liveMusicHelper.conductorMode && liveMusicHelper.songHasVoices) {
              pdjMidi.setMessage(`DJ ${(liveMusicHelper.djPersonalityInfo?.name || '').toUpperCase()} ARRANGES THE VOCAL PERFORMANCE`, 'info');
          }
          // The dialog's lyrics and language are what gets sung, also when they were not applied yet
          if (liveMusicHelper.songHasVoices) {
              const lang = vocalDialog.language;
              if (vocalDialog.vocalText.trim() && vocalDialog.vocalText !== liveMusicHelper.lyricsText) {
                  liveMusicHelper.setLyrics(vocalDialog.vocalText, lang !== 'Auto' ? lang : undefined, false);
              } else if (lang !== 'Auto') liveMusicHelper.lyricsLanguage = lang;
          }
          updateSongDuration();
          liveMusicHelper.renderSong();
          return;
      }
      // A live take cannot sing words: voice instruments left on the channels would only babble
      replaceVocalInstruments();
      recordUsage('live');
      if (take) take.localRecorded = true;
      try {
          await liveMusicHelper.record();
      } catch (err) {
          // The -exp model may answer 429 (quota exceeded / busy) or 404 (deprecated): say so, and do not charge the take
          const msg = err instanceof Error ? err.message : String(err);
          failTake(/429|quota|rate|exhaust|busy/i.test(msg) ? 'LYRIA REALTIME IS BUSY OR OVER ITS FREE LIMIT. TRY AGAIN LATER (NOT COUNTED)'
              : /404|not found|deprecat|no longer/i.test(msg) ? 'LYRIA REALTIME MODEL IS NOT AVAILABLE NOW (NOT COUNTED)'
              : `LIVE TAKE COULD NOT START: ${msg.slice(0, 60).toUpperCase()} (NOT COUNTED)`);
      }
  });

  on(liveMusicHelper, 'song-render-started', ((e) => {
      const { prompt } = e.detail;
      if (import.meta.env.DEV) console.info('[Lyria 3.5] song prompt:\n' + prompt);
      panelsCleared = false;
      lastPromptText = `[LYRIA 3.5 SONG] ${prompt.replace(/\s*\n\s*/g, ' / ')}`;
      refreshPromptPanel();
      pdjMidi.setMessage(liveMusicHelper.songHasVoices ? 'LYRIA 3.5: RENDERING SONG WITH VOICES...' : 'LYRIA 3.5: RENDERING INSTRUMENTAL SONG...', 'info');
      
      // Force UI into recording state so channels show and progress
      leftSidebar.playbackState = 'recording';
      timeline.playbackState = 'recording';
      timeline.resetHistory(); // Start capturing history
  }));
  on(liveMusicHelper, 'song-render-progress', ((e) => {
      const detail = e.detail;
      // Lyria 3.5 gives no progress, only the seconds waited so far: the timeline stays put until the song is ready
      pdjMidi.setMessage(`LYRIA 3.5: RENDERING SONG... ${detail.seconds}S`, 'info');
  }));
  on(liveMusicHelper, 'song-rendered', ((e) => {
      const { duration } = e.detail;
      recordUsage('song'); // a Lyria 3.5 song counts once it was really delivered
      if (take?.kind === 'song') { take.localRecorded = true; take.soundAt = Date.now(); }
      syncVoiceBlocked();
      // A rendered song cannot be conducted: the DJ hands over and the song plays from the start
      deactivateDj();
      // The exact length is known now: the slider takes the nearest step that holds it, the timeline the exact length
      rightSidebar.setDuration(duration / 60, true);
      liveMusicHelper.setMaxDuration(duration / 60); timeline.maxDuration = duration;
      timeline.hasRecording = true;
      leftSidebar.hasRecording = true;

      // Ensure all visible channels are marked active in timeline
      timeline.activeChannels = {
        lead: !!rightSidebar.settings.lead.visible,
        alto: !!rightSidebar.settings.alto.visible,
        harmonic: !!rightSidebar.settings.harmonic.visible,
        bass: !!rightSidebar.settings.bass.visible,
        rhythm: !!rightSidebar.settings.rhythm.visible
      };

      if (liveMusicHelper.lyricsText) vocalDialog.vocalText = liveMusicHelper.lyricsText;
      pdjMidi.setMessage(`SONG READY: ${Math.floor(duration / 60)}:${String(Math.round(duration % 60)).padStart(2, '0')}`, 'info');
      liveMusicHelper.playRecording(0);
  }));
  on(liveMusicHelper, 'song-render-failed', ((e) => {
      const { reason, blocked } = e.detail;
      console.error('[Lyria 3.5] song render failed:', reason);
      refundQuota('song'); // nothing was delivered: the song goes back to the quota
      take = null;
      if (blocked) {
          // The API key may not use Lyria 3.5 (free tier): no songs, so no voice mode either. The take is recorded
          // live with the band (as when the song quota is used up)
          syncVoiceBlocked();
          if (liveMusicHelper.generationMode === 'VOCALIZATION') fallBackToLive();
          pdjMidi.setMessage('LYRIA 3.5 NOT AVAILABLE ON THIS API KEY (PAID TIER NEEDED): RECORDING LIVE', 'error');
          leftSidebar.dispatchEvent(new CustomEvent('record'));
          return;
      }
      // An instrumental Quality song failed: the real-time generator records the take instead (a live take cannot sing,
      // so a song with voices only reports the error)
      if (liveMusicHelper.generationMode === 'QUALITY' && !liveMusicHelper.songHasVoices) {
          pdjMidi.setMessage(`SONG FAILED: RECORDING LIVE INSTEAD (${reason.slice(0, 50).toUpperCase()})`, 'error');
          forceLiveTake = true;
          leftSidebar.dispatchEvent(new CustomEvent('record'));
          return;
      }
      pdjMidi.setMessage(`SONG FAILED: ${reason.slice(0, 80).toUpperCase()}`, 'error');
  }));

  on(leftSidebar, 'stop', () => {
    giveBackTake();
    cancelAutoLoop();
    liveMusicHelper.cancelSongRender();
    liveMusicHelper.stop();
    deactivateDj();
    stopWarmupCountdown();
  });
  on(leftSidebar, 'pause', () => { cancelAutoLoop(); liveMusicHelper.pause(); });
  on(leftSidebar, 'resume', () => { cancelAutoLoop(); liveMusicHelper.resume(); });
  on(leftSidebar, 'loop-changed', (e) => { cancelAutoLoop(); liveMusicHelper.setLoop(e.detail); });
  on(leftSidebar, 'play-recording', () => { cancelAutoLoop(); liveMusicHelper.playRecording(); });
  on(leftSidebar, 'back-to-start', () => { cancelAutoLoop(); liveMusicHelper.startRewind(); });
  setupExport(app);
  
  // Voice mode off: any voice instrument on a channel is swapped for a random non-voice instrument recommended for the genre
  // `keep` + `force`: also in voice mode, swap the voices on every channel except `keep` (locked voice settings)
  // `ignoreLock`: also on locked channels (power button)
  const replaceVocalInstruments = (keep: (keyof InstrumentSet)[] = [], force = false, ignoreLock = false) => {
      if ((!force && liveMusicHelper.generationMode === 'VOCALIZATION') || (rightSidebar.locks.channels && !ignoreLock)) return;
      const settings = { ...rightSidebar.settings };
      let changed = false;
      Object.keys(settings).forEach((ch) => {
          const channel = ch as keyof InstrumentSet;
          if (keep.includes(channel) || !isVocalInstrument(settings[channel].instrument)) return;
          // A LEAD VOICE / CHOIR track becomes an instrument track again before it gets its instrument
          rightSidebar.releaseVoiceTrack(channel);
          const used = Object.values(settings).map(s => s.instrument);
          const allNonVocal = rightSidebar.getRecommendedInstruments(channel).filter((i: string) => !isVocalInstrument(i));
          const unused = allNonVocal.filter((i: string) => !used.includes(i));
          const nonVocalPool = unused.length > 0 ? unused : allNonVocal;
          if (nonVocalPool.length > 0) {
              settings[channel] = { ...settings[channel], instrument: nonVocalPool[Math.floor(Math.random() * nonVocalPool.length)] };
              changed = true;
          }
      });
      if (changed) rightSidebar.auditAndCommit(settings);
  };

  // Voice master mode on: the dice put a voice on the lead channel when no channel has one
  // (it becomes a LEAD VOICE track, also when the other tracks are Band tracks).
  const ensureVoiceChannels = () => {
      if (liveMusicHelper.generationMode !== 'VOCALIZATION' || rightSidebar.locks.channels) return;
      const hasVoice = (Object.values(rightSidebar.settings) as ChannelState[]).some(ch => ch.visible !== false && ch.active && isVocalInstrument(ch.instrument));
      if (hasVoice) return;
      const kinds = ['Solo Male', 'Solo Female', 'Duet Mix', 'Quartet Mix'];
      rightSidebar.setVoiceInstruments({ [LYRIA_VOICE_CHANNELS.solo]: [kinds[Math.floor(Math.random() * kinds.length)]] });
  };

  // Right-hand panel: the prompt last sent to Lyria first, then the instruments it names (voices and lyrics in voice mode)
  let lastPromptText = '';
  let appliedGuidance: number | null = null;
  const refreshPromptPanel = () => {
      // Voice settings only exist while the voice master mode is on
      const voiceOn = liveMusicHelper.generationMode === 'VOCALIZATION';
      let voices = '';
      let lyrics = '';
      if (voiceOn) {
          const { solos, choir } = vocalDialog.getVoices();
          const singers = liveMusicHelper.voiceDescriptions;
          voices = (singers.length ? singers.join(' + ') : [...solos, choir !== 'None' ? `${choir} Choir` : ''].filter(Boolean).join(', '))
              + ` · INTENSITY ${Math.round(liveMusicHelper.voiceIntensity * 100)}%`;
          lyrics = liveMusicHelper.vocalPrompt || liveMusicHelper.lyricsText.replace(/\s*\n\s*/g, ' / ').slice(0, 200);
      }
      // Instruments of the band that the prompt actually names
      const promptLower = lastPromptText.toLowerCase();
      const instruments = [...new Set((Object.values(rightSidebar.settings) as ChannelState[])
          .filter(ch => ch.active && ch.visible !== false && ch.instrument && promptLower.includes(ch.instrument.toLowerCase()))
          .map(ch => ch.instrument))].join(', ');
      // Guidance: what Lyria really has, and where the DJ is heading while it eases there
      const intended = liveMusicHelper.intendedGuidance;
      const guidance = appliedGuidance === null ? '[GUIDANCE waiting] ' : `[GUIDANCE ${appliedGuidance.toFixed(1)}${Math.abs(intended - appliedGuidance) >= 0.1 ? ` → ${intended.toFixed(1)}` : ''}] `;
      if (panelsCleared) { pdjMidi.setPromptInfo({ voices: '', lyrics: '', prompt: '', instruments: '' }); return; }
      pdjMidi.setPromptInfo({ voices, lyrics, instruments, prompt: guidance + lastPromptText });
  };
  // Dice and reset empty both top text panels; the right one fills again with the next prompt sent to Lyria
  let panelsCleared = false;
  const clearTopPanels = () => {
      panelsCleared = true; lastPromptText = ''; appliedGuidance = null;
      pdjMidi.clearPanels();
      refreshPromptPanel();
      updatePlayerStatus();
  };
  // Left panel: what the player is doing right now, refreshed every 5 seconds. Stopped = READY.
  const updatePlayerStatus = () => {
      const state = liveMusicHelper.playbackState;
      const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      if (state === 'playing' || state === 'paused') {
          const label = state === 'paused' ? 'PAUSED' : liveMusicHelper.isLooping ? 'LOOPING' : 'PLAYING';
          pdjMidi.setMessage(`${label} ${mmss(liveMusicHelper.elapsedSeconds)} / ${mmss(liveMusicHelper.recordedDuration)}`, 'info');
      } else if (state === 'stopped') {
          pdjMidi.setMessage(lyricsBusy ? 'WORKING: WRITING LYRICS...' : 'READY', 'info');
      }
  };
  setInterval(() => { refreshPromptPanel(); updatePlayerStatus(); }, 5000);
  // Repeatable takes: show the seed, lock it from the mixer panel
  on(liveMusicHelper, 'seed-changed', ((e) => {
      const { seed, locked } = e.detail;
      rightSidebar.seed = seed ?? 0;
      rightSidebar.seedLocked = locked;
      if (locked) pdjMidi.setMessage(`SEED LOCKED: ${seed}`, 'info');
  }));
  on(rightSidebar, 'seed-lock-changed', ((e) => liveMusicHelper.setSeedLock(e.detail)));
  // A rejected prompt was rewritten (or dropped) on the fly
  on(liveMusicHelper, 'prompt-improved', ((e) => {
      const { from, to, how } = e.detail;
      const short = (t: string) => (t.length > 40 ? t.slice(0, 37) + '...' : t);
      pdjMidi.setMessage(to ? `PROMPT REWRITTEN (${how}): ${short(from)} → ${short(to)}` : `PROMPT DROPPED: ${short(from)}`, 'info');
      if (import.meta.env.DEV) console.info('[Lyria] prompt improved:', { from, to, how });
  }));
  on(liveMusicHelper, 'prompt-filtered', ((e) => {
      const { text, filteredReason, payload, config } = e.detail;
      // Dev mode: keep a log of every rejected prompt with the full payload it was part of (window.__lyriaFiltered).
      // Lyria's reason is always the same boilerplate ("...check the documentation..."), so that advice is cut and only
      // the rejected prompt and any specific reason remain.
      if (import.meta.env.DEV) {
          const reason = (filteredReason || '').split(/(?<=[.!?])\s+/).filter(s => !/documentation|guidelines|learn more|try again/i.test(s)).join(' ').trim();
          (window.__lyriaFiltered ||= []).push({ at: new Date().toISOString(), text, reason, payload, config });
          console.warn(`[Lyria] prompt failed: "${text}"${reason ? ' | ' + reason : ''}`, '| payload:', payload, '| config:', config);
      }
      pdjMidi.setMessage('PROMPT FAILED, CORRECTING...', 'error');
  }));
  on(liveMusicHelper, 'config-applied', ((e) => {
      appliedGuidance = e.detail.guidance;
      refreshPromptPanel();
  }));
  on(liveMusicHelper, 'config-failed', ((e) => {
      pdjMidi.setMessage(`LYRIA CONFIG REJECTED: ${e.detail}`, 'error');
  }));
  on(liveMusicHelper, 'prompts-sent', ((e) => {
      const { prompts } = e.detail;
      panelsCleared = false;
      lastPromptText = [...prompts].sort((a, b) => b.weight - a.weight).map(p => `${p.text} (${p.weight.toFixed(1)})`).join(' • ');
      refreshPromptPanel();
  }));

  const { applyDialogVoices, placeVoices, syncVoiceDialog, voiceOffToDiversity } = setupVoices(app);

  on(rightSidebar, 'tab-changed', (e) => {
      // The tab only changes the prompts (orchestra / voices or band). Live takes always stream from the realtime
      // model; Lyria 3.5 is a song model that renderSong() calls on its own, it cannot stream (the take is silent).
      pdjMidi.setMessage(e.detail === 'Lyria' ? 'LYRIA TAB: ORCHESTRA CHANNELS' : 'BAND TAB: BAND CHANNELS', 'info');
  });
  // The DJ plays music without voices: it never touches the Voice dialog. Activating it turns the voice off and sets
  // the primary mode to DIVERSITY (the DJ conducts live), except QUALITY with songs left in the quota: the DJ then
  // arranges each take as a Lyria 3.5 song. Voice channels leave the stage either way.
  const stripVoicesForDj = (quiet = false) => {
      const was = liveMusicHelper.generationMode;
      const keepQuality = was === 'QUALITY' && liveMusicHelper.songQuotaOk && !liveMusicHelper.songModelBlocked;
      voiceOffToDiversity(false, keepQuality);
      if (quiet) return;
      if (keepQuality) pdjMidi.setMessage('DJ: QUALITY MODE, THE DJ ARRANGES A LYRIA 3.5 SONG', 'info');
      else if (was !== 'DIVERSITY') pdjMidi.setMessage('DJ: VOICE OFF, MODE DIVERSITY', 'info');
  };
  // Voices chosen while the DJ is on (voice mode, Voice dialog, a voice instrument): the DJ stays and arranges the
  // vocal performance of the Lyria 3.5 song (it never changes the voices or the lyrics). Without songs left it steps down.
  const djStepsDownForVoices = (why: string) => {
      if (!leftSidebar.isConductorActive && !liveMusicHelper.conductorMode) return;
      if (songsAvailable()) {
          pdjMidi.setMessage(`DJ ${(liveMusicHelper.djPersonalityInfo?.name || '').toUpperCase()} ARRANGES THE VOCAL PERFORMANCE`, 'info');
          return;
      }
      // No songs left: the voices cannot stay (they are taken off the stage), the DJ stays
      pdjMidi.setMessage(`DJ ${(liveMusicHelper.djPersonalityInfo?.name || '').toUpperCase()} STAYS: ${why} (NO SONGS LEFT, NO VOICES)`, 'info');
  };

  // With its Homeland chance a DJ plays a folk style of its own country; the curious Robot DJ, with its Curiosity
  // chance, studies humanity with any genre (all equally likely). Locked genre or style keep the user's choice.
  const djPicksOwnStyle = (dj: DjPersonality | null | undefined) => {
      if (!dj || Math.random() * 100 >= (dj.homeBias ?? 0)) return;
      const pick = dj.curious ? topToolbar.djPickAnyStyle() : dj.homeStyles?.length ? topToolbar.djPickHomeStyle(dj.homeStyles) : null;
      if (!pick) return;
      syncMainBar();
      rightSidebar.genre = topToolbar.genre; rightSidebar.musicStyle = topToolbar.musicStyle;
      vocalDialog.genre = topToolbar.genre; vocalDialog.musicStyle = topToolbar.musicStyle;
      syncBars();
      pdjMidi.setMessage(dj.curious
          ? `DJ ${dj.name.toUpperCase()} STUDIES HUMANITY: ${pick[0].toUpperCase()} · ${pick[1].toUpperCase()}`
          : `DJ ${dj.name.toUpperCase()} PLAYS FROM HOME (${(dj.country || '').toUpperCase()}): ${pick[1].toUpperCase()}`, 'info');
  };

  // DJ activated in the voice mode (songs left): a Voice dialog without voices is rolled with its dice (voices, choir,
  // language) and gets new lyrics and a title; voices you chose and your lyrics are kept. The DJ then sets the
  // instruments around the voices (unless the channels are locked): its home style only for a song it sets up itself.
  const djSetsUpVoiceSong = async (superseded: () => boolean) => {
      const dj = liveMusicHelper.djPersonalityInfo;
      const rsLocks = rightSidebar.locks;
      // Locked voice settings: the DJ leaves the dialog (voices, lyrics, title) alone
      const newSong = !vocalDialog.hasVoiceSetup && !vocalDialog.locked;
      if (newSong && !rsLocks.channels) djPicksOwnStyle(dj);
      if (newSong) {
          vocalDialog.randomizeForDj();
          pdjMidi.setMessage(`DJ ${(dj?.name || '').toUpperCase()} SETS UP THE VOICES`, 'info');
      }
      // Taken now: the new instruments mirror back into the dialog while they land on the channels
      const { solos, choir } = vocalDialog.getVoices();
      if (!rsLocks.channels) {
          await topToolbar.randomizeInstruments({ manifest: rsLocks.manifest, channels: false }, rightSidebar.settings, rightSidebar.currentTab === 'Lyria');
          if (superseded()) return;
          if (!rsLocks.manifest) {
              // The DJ's preferred channels, but the voice channels always stay on stage
              const keep = chooseDjManifest(topToolbar.genre, liveMusicHelper.djPersonalityChannels, dj?.complexity);
              if (solos.length && !keep.includes(LYRIA_VOICE_CHANNELS.solo)) keep.push(LYRIA_VOICE_CHANNELS.solo);
              if (choir !== 'None' && !keep.includes(LYRIA_VOICE_CHANNELS.choir)) keep.push(LYRIA_VOICE_CHANNELS.choir);
              rightSidebar.applyDjManifest(keep);
          }
          vocalDialog.setVoices(solos, choir);
          const voiced = applyDialogVoices(solos, choir);
          replaceVocalInstruments(voiced, true);
          liveMusicHelper.setVoiceCast(solos);
          rightSidebar.finalizeDiceChannels();
          vocalDialog.setVoices(solos, choir);
      } else placeVoices();
      rightSidebar.voiceEnabled = true;
      refreshPromptPanel();
      // A new song gets its words (in the background: Record waits while lyrics are being written)
      if (newSong && !vocalDialog.vocalText.trim()) generateDialogLyrics(topToolbar.genre, vocalDialog.language);
  };

  // The DJ was switched on (Apply in the DJ dialog, the app starting) or off: it plans the take or steps down
  const djChanged = async (active: boolean) => {
      cancelAutoLoop();
      
      const myRequest = ++djRequest;
      const superseded = () => myRequest !== djRequest;
      const isLive = liveMusicHelper.playbackState === 'recording' || liveMusicHelper.playbackState === 'warmup' || liveMusicHelper.playbackState === 'preparing' || liveMusicHelper.playbackState === 'loading';
      
      if (active) {
          // Voices the DJ cannot take off the stage (locked channels): it does not start, and changes nothing.
          // Otherwise activation always turns the voice off and sets the primary mode to DIVERSITY.
          const voiceOnStage = () => (Object.values(rightSidebar.settings) as ChannelState[]).some(ch => ch.visible !== false && ch.active && isVocalInstrument(ch.instrument));
          // Voice mode with songs left: the DJ keeps the user's voices, lyrics, style and instruments and arranges
          // the vocal performance of the Lyria 3.5 song (no instrument planning, no home style: they would change the song)
          if (liveMusicHelper.generationMode === 'VOCALIZATION' && songsAvailable()) {
              const djName = (liveMusicHelper.djPersonalityInfo?.name || '').toUpperCase();
              if (liveMusicHelper.playbackState === 'stopped') {
                  await djSetsUpVoiceSong(superseded);
                  if (superseded()) return;
              }
              liveMusicHelper.setConductorMode(true);
              rightSidebar.conductorActive = true;
              pdjMidi.setMessage(`DJ ${djName} ARRANGES THE VOCAL PERFORMANCE`, 'info');
              return;
          }
          if (!(voiceOnStage() && rightSidebar.locks.channels)) stripVoicesForDj();
          if (voiceOnStage()) {
              // Locked channels with voices and no songs: the DJ stays on deck but leaves your locked setup alone
              deactivateDj();
              pdjMidi.setMessage('DJ RESTS: LOCKED VOICES ON STAGE AND NO SONGS LEFT', 'info');
              return;
          }
          const rsLocks = rightSidebar.locks;
          // DJ always uses BAND tab (Band channels)
          rightSidebar.currentTab = 'Band';
          
          const canPlan = liveMusicHelper.playbackState === 'stopped';
          if (canPlan) {
              // The DJ may play a folk style of its own country (its Homeland chance), only with the channels free
              // to follow the new genre; locked genre or style keep the user's choice
              if (!rsLocks.channels) djPicksOwnStyle(liveMusicHelper.djPersonalityInfo);
              if (!rsLocks.channels) {
                  await topToolbar.randomizeInstruments({ manifest: rsLocks.manifest, channels: false }, rightSidebar.settings, false);
                  if (superseded()) return;
              }

              if (!rsLocks.manifest && !rsLocks.channels) {
                  const keep = chooseDjManifest(topToolbar.genre, liveMusicHelper.djPersonalityChannels, liveMusicHelper.djPersonalityInfo?.complexity);
                  rightSidebar.applyDjManifest(keep);
              }

              // The DJ plays real-time music without voices: voice instruments leave the channels and the voice mode ends
              stripVoicesForDj(true);
              rightSidebar.finalizeDiceChannels();

              topToolbar.djPickMood();
              // The DJ's character sets the evolution slider
              const evo = djEvolutionFor(liveMusicHelper.djPersonalityInfo);
              rightSidebar.setEvolution(evo);
              liveMusicHelper.setEvolution(evo);

              liveMusicHelper.generatePerformancePlan();
              pdjMidi.setMessage(`DJ ${(liveMusicHelper.djPersonalityInfo?.name || '').toUpperCase()} SELECTED`, "info");
          } else if (isLive) {
              djEngagingCountdown = true;
              let count = 5;
              pdjMidi.setMessage(`DJ ENGAGING IN ${count}S...`, 'info');
              const timer = setInterval(() => {
                if (!liveMusicHelper.conductorMode) {
                   clearInterval(timer);
                   djEngagingCountdown = false;
                   return;
                }
                count--;
                if (count > 0) {
                    pdjMidi.setMessage(`DJ ENGAGING IN ${count}S...`, 'info');
                } else {
                    clearInterval(timer);
                    djEngagingCountdown = false;
                }
              }, 1000);
          }
      } else {
          pdjMidi.setMessage("DJ DEACTIVATED", 'info');
          djEngagingCountdown = false;
      }
      
      liveMusicHelper.setConductorMode(active); 
      rightSidebar.conductorActive = active;
  };

  on(leftSidebar, 'mode-changed', ((e) => {
      cancelAutoLoop();
      let mode = e.detail;
      // No songs left: neither you nor the DJ can switch to the voice mode (a live take cannot sing)
      if (mode === 'VOCALIZATION' && !songsAvailable()) {
          mode = 'DIVERSITY';
          leftSidebar.primaryMode = mode;
          pdjMidi.setMessage('NO SONGS LEFT: VOICE MODE NOT AVAILABLE', 'error');
      }
      if (mode === 'VOCALIZATION') djStepsDownForVoices('THE DJ DOES NOT CONDUCT VOICES');
      liveMusicHelper.setGenerationMode(mode);
      
      pdjMidi.setMessage(`MODE: ${mode}`, 'info');

      // Without the voice mode there are no voice instruments: the channels get the genre's recommended ones
      rightSidebar.voiceEnabled = mode === 'VOCALIZATION';
      replaceVocalInstruments();
      refreshPromptPanel();
  }));

  on(leftSidebar, 'theme-changed', ((e) => {
      cancelAutoLoop();
      const isDark = e.detail;
      document.body.classList.toggle('light-theme', !isDark);
  }));

  on(liveMusicHelper, 'loop-changed-internal', (e) => {
    leftSidebar.isLooping = e.detail;
  });

  on(liveMusicHelper, 'mode-changed-internal', (e) => {
      leftSidebar.primaryMode = e.detail;
      rightSidebar.voiceEnabled = e.detail === 'VOCALIZATION';
      refreshPromptPanel();
      pdjMidi.setMessage(`AI STORYTELLING: ${e.detail} MODE`, 'info');
  });

  // Tempo never reached the engine before: forward toolbar tempo changes (user or DJ)
  on(topToolbar, 'bpm-changed', ((e) => {
      liveMusicHelper.setGlobalSettings({ bpm: e.detail });
      updateSongDuration();
      syncBars();
  }));

  // === Tempo slider and the Bars read-out (both in the song manifest panel) ===
  // Quarter-note beats in one bar: 4/4 -> 4, 3/4 -> 3, 6/8 -> 3, free time -> 4
  const beatsPerBar = (meter: string) => {
      const m = /^(\d+)\/(\d+)$/.exec(meter);
      return m ? (Number(m[1]) * 4) / Number(m[2]) : 4;
  };
  const barSeconds = () => beatsPerBar(topToolbar.meter) * 60 / Math.max(20, topToolbar.bpm);
  /** The Bars read-out shows the song length (DUR slider) in bars at the current tempo and meter. */
  const syncBars = () => { rightSidebar.bars = Math.max(1, Math.round(rightSidebar.durationMinutes * 60 / barSeconds())); };
  on(topToolbar, 'tempo-state', ((e) => {
      const d = e.detail;
      rightSidebar.bpm = d.bpm; rightSidebar.bpmMin = d.min; rightSidebar.bpmMax = d.max;
  }));
  on(rightSidebar, 'bpm-input', ((e) => { cancelAutoLoop(); topToolbar.setBpm(e.detail); }));
  on(topToolbar, 'meter-changed', () => syncBars());
  on(rightSidebar, 'duration-changed', () => syncBars());
  setTimeout(() => { topToolbar.emitTempoState(); syncBars(); }, 0);

  const { stopWarmupCountdown } = setupStage(app);
  
  on(leftSidebar, 'randomize', async () => {
      cancelAutoLoop();
      if (liveMusicHelper.playbackState !== 'stopped') return;
      // The dice make a random setup and hand it to the Robot DJ: it conducts what the dice rolled,
      // without planning its own instruments, from the next Record
      djRequest++; // a DJ plan still being prepared is dropped
      deactivateDj();
      djPresetDialog.putOnDeck(ROBOT_DJ_ID);
      leftSidebar.isConductorActive = true;
      pdjMidi.setMessage('DICE: DJ ROBOT TAKES OVER', 'info');
      await liveMusicHelper.clearRecording(); 
      timeline.hasRecording = false; 
      leftSidebar.hasRecording = false;
      timeline.resetHistory(true);
      leftSidebar.isShuffling = true;
      clearTopPanels();

      // 1. Ordered Dice Roll for Parameters (GENRE -> STYLE -> MOOD -> KEY -> TEMPO -> METER)
      // Suppress events to prevent premature UI updates
      const currentMood = topToolbar.currentMood;

      topToolbar.currentMood = currentMood;
      rightSidebar.resetWeightsToZero();

      topToolbar.randomize(true);
      // randomize(true) stays silent about genre, style, mood and key: hand the new main bar to the music engine
      syncMainBar();

      // Sync RightSidebar with the new genre/style before randomizing instruments
      rightSidebar.genre = topToolbar.genre;
      rightSidebar.musicStyle = topToolbar.musicStyle;
      vocalDialog.genre = topToolbar.genre;
      vocalDialog.musicStyle = topToolbar.musicStyle;

      // 3. Duration and evolution are rolled too, unless the manifest is locked (then the current ones are kept)
      if (!rightSidebar.locks.manifest) {
          const steps = DURATION_STEPS;
          const mins = rightSidebar.setDuration(steps[Math.floor(Math.random() * steps.length)].value);
          liveMusicHelper.setMaxDuration(mins); timeline.maxDuration = mins * 60;
          rightSidebar.setEvolution(Math.floor(Math.random() * 13) - 6); // -6..+6
          syncBars();
      }
      const currentEvo = rightSidebar.evolution;
      liveMusicHelper.setEvolution(currentEvo);
      
      // 4. Update Instruments and Manifest based on Style Matrix for current tab
      const rsLocks = rightSidebar.locks;
      // Dice roll will not change the TAB
      const isLyria = rightSidebar.currentTab === 'Lyria';
      
      // Pass genre/style explicitly (via topToolbar property) to randomizeInstruments
      await topToolbar.randomizeInstruments({ manifest: rsLocks.manifest, channels: rsLocks.channels }, rightSidebar.settings, isLyria);
      
      // Dice roll switches on a number of tracks that suits the genre (the DJ may thin them out later with its manifesto)
      rightSidebar.enableAllChannels();

      // Knobs stay visible and take the values that suit the new genre and style (authentic sound)
      // ONLY if we are not actively conducting or using the voice mode that needs them
      if (!liveMusicHelper.conductorMode && liveMusicHelper.generationMode !== 'VOCALIZATION') {
          liveMusicHelper.applyGenreKnobs();
      }
      
      // Voice master mode off: the dice never leave voice instruments behind
      replaceVocalInstruments();

      // 5. The primary mode is the user's: the dice never change it. Voice channels are assigned only in voice mode.
      const newMode: MusicGenerationMode = leftSidebar.primaryMode;
      placeVoices();
      // Every channel ends with an instrument (rolled again if needed) or disappears from the manifest
      rightSidebar.finalizeDiceChannels();
      const hasVocalsInOutput = (Object.values(rightSidebar.settings) as ChannelState[]).some(ch => ch.visible !== false && isVocalInstrument(ch.instrument));
      leftSidebar.hasVocalInstrument = hasVocalsInOutput;

      // Update sidebar
      rightSidebar.requestUpdate();
      leftSidebar.requestUpdate();

      // Stop shuffling
      leftSidebar.isShuffling = false;

      // 6. Apply Special Reference Instruction (follows the genre and style of the main bar)
      diceReferenceActive = true;
      applyGenreReference(true);

      pdjMidi.setMessage(`DICE ROLL: ${topToolbar.genre}, ${topToolbar.musicStyle} (${newMode})`, 'info');
      
      setTimeout(() => { leftSidebar.isShuffling = false; }, 800);
  });
  
  on(leftSidebar, 'reset', async () => {
      giveBackTake();
      cancelAutoLoop();
      leftSidebar.isResetting = true;
      stopWarmupCountdown();
      takeRating.cancel(); // Reset stops the music without asking
      ratingDialog.show = false;
      await liveMusicHelper.stop(true); 
      // The DJ stays on deck (it rests until the next Record)
      deactivateDj();
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
      rightSidebar.reset(); 
      pdjMidi.reset(); 
      // Power: voice off and primary mode DIVERSITY, also on locked channels
      voiceOffToDiversity(true);
      liveMusicHelper.setEvolution(0);
      rightSidebar.setEvolution(0);
      
      clearTopPanels();
      setTimeout(() => { leftSidebar.isResetting = false; }, 800);
  });

  setupChannels(app);

  const { ratingDialog, takeRating, trackListening } = setupRating(app);

  on(liveMusicHelper, 'playback-state-changed', ((e) => {
    const playbackState = e.detail;
    trackListening(playbackState);
    pdjMidi.playbackState = playbackState; topToolbar.playbackState = playbackState; leftSidebar.playbackState = playbackState;
    rightSidebar.playbackState = playbackState; timeline.playbackState = playbackState;
    
    pdjMidi.interactionEnabled = playbackState !== 'playing';

    if (playbackState === 'warmup' || playbackState === 'preparing') {
        audioAnalyser.start();
    } else if (playbackState === 'recording') {
        audioAnalyser.start();
        if (take && take.kind === 'live' && take.soundAt === null) take.soundAt = Date.now(); // the take is audible now
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
            updatePlayerStatus();
        }
    }
  }));

  // An API error before the take became audible (the session broke while starting): not counted
  on(liveMusicHelper, 'dj-vocal-message', ((e) => {
      if (take && take.kind === 'live' && take.soundAt === null && e.detail?.type === 'error' && /^API Error/.test(String(e.detail?.text))) {
          failTake('LYRIA REALTIME STOPPED BEFORE THE TAKE STARTED (NOT COUNTED)');
      }
  }));

  on(audioAnalyser, 'audio-levels-changed', ((e) => {
    const { left, right } = e.detail;
    pdjMidi.audioLevel = (left + right) / 2; rightSidebar.audioLevelL = left; rightSidebar.audioLevelR = right;
  }));

  function syncUI() {
    timeline.elapsedSeconds = liveMusicHelper.elapsedSeconds;
    timeline.recordedDuration = liveMusicHelper.recordedDuration;
    timeline.isRewinding = liveMusicHelper.isRewinding;
    timeline.bufferTime = liveMusicHelper.bufferTime;
    leftSidebar.elapsedSeconds = liveMusicHelper.elapsedSeconds;
    leftSidebar.isRewinding = liveMusicHelper.isRewinding;
    timeline.isLooping = liveMusicHelper.isLooping;
    
    if (liveMusicHelper.playbackState === 'playing' || liveMusicHelper.playbackState === 'recording') {
        // Rely only on ACTIVE state for recording bars, ignore weight to avoid cuts during low volume sections
        const nextActive = {
            lead: liveMusicHelper.instruments.lead.active,
            alto: liveMusicHelper.instruments.alto.active,
            harmonic: liveMusicHelper.instruments.harmonic.active,
            bass: liveMusicHelper.instruments.bass.active,
            rhythm: liveMusicHelper.instruments.rhythm.active,
        };

        // Shallow comparison to avoid redundant updates to timeline which causes bar interruption
        const curr = timeline.activeChannels;
        const changed = nextActive.lead !== curr.lead ||
                        nextActive.alto !== curr.alto ||
                        nextActive.harmonic !== curr.harmonic ||
                        nextActive.bass !== curr.bass ||
                        nextActive.rhythm !== curr.rhythm;
        
        if (changed) {
            timeline.activeChannels = nextActive;
        }
    }

    requestAnimationFrame(syncUI);
  }
  requestAnimationFrame(syncUI);
}

function buildInitialPrompts() {
  const prompts = new Map<string, Prompt>();
  [
    { color: '#ff8800', text: 'Guidance' }, { color: '#ff8800', text: 'Density' }, { color: '#ff8800', text: 'Dynamics' }, 
    { color: '#ff8800', text: 'Groove' }, { color: '#ff8800', text: 'Attack' }, { color: '#ff8800', text: 'Staccato' }, 
    { color: '#00ccff', text: 'Brightness' }, { color: '#00ccff', text: 'Complexity' }, { color: '#00ccff', text: 'Ornamentation' }, 
    { color: '#00ccff', text: 'Variation' }, { color: '#00ccff', text: 'Glide' }, { color: '#00ccff', text: 'Presence' },
    { color: '#00ff88', text: 'Space' }, { color: '#00ff88', text: 'Organic' }, { color: '#00ff88', text: 'Texture' }, 
    { color: '#00ff88', text: 'Width' }, { color: '#00ff88', text: 'Atmosphere' }, { color: '#00ff88', text: 'Authenticity' }
  ].forEach((p, i) => {
    const promptId = `prompt-${i}`;
    prompts.set(promptId, { promptId, text: p.text, weight: 0, volume: 0, cc: i, color: p.color });
  });
  return prompts;
}

main();
