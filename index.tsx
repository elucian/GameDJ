
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
import { VocalDialog } from './components/VocalDialog';
import { AboutDialog } from './components/AboutDialog';
import { DjPresetDialog } from './components/DjPresetDialog';
import { Timeline } from './components/Timeline';
import { getUserId, quotaStatus, recordUsage, reserveQuota, refundQuota, unrecordUsage, refreshCredits, claimSupport, supportPending, clearSupportPending, supportIntent, getSupportEmail } from './utils/UserQuota';
import { ThanksDialog } from './components/ThanksDialog';
import { SupportDialog } from './components/SupportDialog';
import { DURATION_STEPS } from './components/MasterVolumePanel';
import { LiveMusicHelper, STYLE_DESCRIPTORS, isVocalInstrument, chooseDjManifest, chooseDjTab, chooseDjLanguage, djEvolutionFor } from './utils/LiveMusicHelper';
import { LYRIA_VOICE_CHANNELS } from './constants/instruments';
import { AudioAnalyser } from './utils/AudioAnalyser';
import { inject, track } from '@vercel/analytics';

// Vercel Web Analytics: page views only (it does nothing on localhost)
inject();

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
const model = 'models/lyria-realtime-exp';

function main() {
  const initialPrompts = buildInitialPrompts();
  const topToolbar = new TopToolbar();
  const leftSidebar = new LeftSidebar();
  const rightSidebar = new RightSidebar();
  const vocalDialog = new VocalDialog();
  const djPresetDialog = new DjPresetDialog();
  const timeline = new Timeline();
  const pdjMidi = new PromptDjMidi();
  
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
  (window as any).topToolbar = topToolbar; // Expose for dialog access
  document.body.appendChild(leftSidebar as any);
  document.body.appendChild(djPresetDialog as any);
  document.body.appendChild(vocalDialog as any);

  // Ko-fi "Unlock N songs": the item's custom URL is /thanks. The dialog shows the bought songs (the webhook may need
  // a few seconds) and lets the buyer claim them with the Ko-fi e-mail.
  const thanksDialog = new ThanksDialog();
  document.body.appendChild(thanksDialog as any);
  const showThanks = async () => {
      thanksDialog.show = true; thanksDialog.waiting = true; thanksDialog.credits = null;
      for (let i = 0; i < 8; i++) {
          const credits = await refreshCredits();
          if (credits !== null) thanksDialog.credits = credits;
          if (credits) { syncVoiceBlocked(); break; }
          await new Promise(r => setTimeout(r, 4000));
      }
      thanksDialog.waiting = false;
      // Not credited to this browser (another browser paid, or no e-mail was given first): claim with the remembered e-mail
      const email = getSupportEmail();
      if (!thanksDialog.credits && email) {
          const r = await claimSupport(email);
          if (r) { thanksDialog.credits = r.credits; syncVoiceBlocked(); thanksDialog.claimResult(r); }
      }
  };
  if (location.pathname.replace(/\/+$/, '') === '/thanks') showThanks();
  (thanksDialog as any).addEventListener('claim-support', async (e: CustomEvent<string>) => {
      const r = await claimSupport(e.detail);
      thanksDialog.claimResult(r);
      if (r) { thanksDialog.credits = r.credits; syncVoiceBlocked(); }
  });

  // Ko-fi button: ask for the e-mail first, then open the shop item
  const supportDialog = new SupportDialog();
  document.body.appendChild(supportDialog as any);
  window.addEventListener('show-support', () => { supportDialog.show = true; });
  (supportDialog as any).addEventListener('continue-support', (e: CustomEvent<string>) => {
      supportIntent(e.detail);
      window.open('https://ko-fi.com/s/3901d91669', '_blank', 'noopener');
  });

  // About dialog: opens when the GameDJ label is pressed, with this browser's quota counts
  const aboutDialog = new AboutDialog();
  document.body.appendChild(aboutDialog as any);
  const fillAbout = () => {
      const song = quotaStatus('song'), live = quotaStatus('live');
      aboutDialog.songsUsed = song.used; aboutDialog.songsLimit = song.limit;
      aboutDialog.liveUsed = live.used; aboutDialog.liveLimit = live.limit;
  };
  window.addEventListener('show-about', () => {
      fillAbout();
      aboutDialog.show = true;
      // Songs bought on Ko-fi are kept on the server: ask for the current count when the dialog opens
      refreshCredits().then(c => { if (c !== null) { fillAbout(); syncVoiceBlocked(); } });
  });
  // Back from Ko-fi after pressing Support: look for the new songs once
  window.addEventListener('focus', async () => {
      if (!supportPending()) return;
      const c = await refreshCredits();
      if (c) {
          clearSupportPending();
          syncVoiceBlocked(); fillAbout();
          toastMessage.show(`Thank you! ${c} extra songs unlocked.`);
      }
  });
  
  (leftSidebar as any).addEventListener('toggle-vocal-dialog', () => {
    vocalDialog.show = !vocalDialog.show;
    vocalDialog.genre = topToolbar.genre;
    // Show the lyrics the DJ (or you) wrote
    if (liveMusicHelper.lyricsText) vocalDialog.vocalText = liveMusicHelper.lyricsText;
  });

  window.addEventListener('toggle-dj-preset-dialog', () => {
    djPresetDialog.show = !djPresetDialog.show;
  });

  (djPresetDialog as any).addEventListener('send-dj-config', (e: CustomEvent) => {
      // The preset's summary text is for the log only: it is not music, so it never goes to Lyria as a prompt
      const { name, config } = e.detail;
      if (config) {
          liveMusicHelper.setDjPersonality({
              name, eagerness: config.eagerness, channels: config.channels, maxKnobs: config.maxKnobs ?? 6,
              diversity: config.diversity, complexity: config.complexity, energy: config.energy, atmosphere: config.atmosphere, warmup: config.warmup
          });
          liveMusicHelper.setTemperature(config.temperature ?? 1.1);
      }
      pdjMidi.setMessage(`DJ ${String(name).toUpperCase()} SELECTED`, "info");
  });

  // Apply puts the DJ on deck (the button stays selected); Cancel leaves it off (the button is unselected)
  (djPresetDialog as any).addEventListener('dj-dialog-applied', () => {
      leftSidebar.isConductorActive = true;
      (leftSidebar as any).dispatchEvent(new CustomEvent('dj-changed', { detail: true }));
  });

  (djPresetDialog as any).addEventListener('dj-dialog-cancelled', () => {
      leftSidebar.isConductorActive = false;
      pdjMidi.setMessage(`DJ CONFIG CANCELLED`, "info");
  });

  (vocalDialog as any).addEventListener('request-lyrics-generation', async (e: CustomEvent) => {
    const { genre, verseCount, lineCount } = e.detail;
    const lang: string = e.detail.lang === 'Auto' ? chooseDjLanguage(genre).language : e.detail.lang;
    pdjMidi.setMessage(`GENERATING LYRICS FOR ${genre} (${lang.toUpperCase()})...`, "info");
    vocalDialog.generating = true;
    const lyrics = await liveMusicHelper.generateLyrics(genre, lang, verseCount, lineCount, undefined, topToolbar.musicStyle, topToolbar.currentMood);
    vocalDialog.generating = false;
    if (lyrics.startsWith('Error') || lyrics.startsWith('Could not')) {
      pdjMidi.setMessage('LYRICS FAILED: TRY AGAIN', 'error');
      return;
    }
    vocalDialog.vocalText = lyrics;
    liveMusicHelper.setLyrics(lyrics, lang, false);
    updateSongDuration();
    refreshPromptPanel();
    pdjMidi.setMessage(`LYRICS READY: ${lang.toUpperCase()}`, 'info');
  });

  (vocalDialog as any).addEventListener('request-song-translation', async (e: CustomEvent) => {
    const { genre, lang, songTitle } = e.detail;
    pdjMidi.setMessage(`TRANSLATING ${songTitle.toUpperCase()}...`, "info");
    // Pass default verseCount/lineCount for translation (or reasonable defaults)
    const lyrics = await liveMusicHelper.generateLyrics(genre, lang, 2, 4, songTitle);
    vocalDialog.vocalText = lyrics;
  });

  (vocalDialog as any).addEventListener('send-vocal-command', (e: CustomEvent) => {
    // Lyria gets the voices as singer descriptions (one random artistic voice per selected voice), not this text
    liveMusicHelper.setVoiceCast(vocalDialog.getVoices().solos);
    pdjMidi.setMessage(`VOCAL DIRECTIVE SENT`, "info");
    
    // The voice master mode (VOC) is the user's switch: with it off the directive is kept but not sent to Lyria
    if (e.detail !== 'VOCAL CONFIG: None' && liveMusicHelper.generationMode !== 'VOCALIZATION') {
        pdjMidi.setMessage('VOICE MODE OFF: VOICES NOT SENT', 'info');
    }
    
    // If we were waiting for the conductor or preparing, try to start
    if (liveMusicHelper.playbackState === 'warmup' || liveMusicHelper.playbackState === 'preparing') {
        (liveMusicHelper as any).playRecording();
    }
  });

  (vocalDialog as any).addEventListener('lyrics-set', (e: CustomEvent<string>) => {
    // Lyrics typed or edited by the user: sung as real words in the dialog's language (Auto keeps the DJ's / genre's)
    const lang = vocalDialog.language;
    if (e.detail && e.detail.trim()) liveMusicHelper.setLyrics(e.detail, lang !== 'Auto' ? lang : undefined, false);
    updateSongDuration();
    refreshPromptPanel();
  });

  (vocalDialog as any).addEventListener('voice-lock-changed', (e: CustomEvent<boolean>) => {
      pdjMidi.setMessage(e.detail ? 'VOICE SETTINGS LOCKED' : 'VOICE SETTINGS UNLOCKED: DJ MAY CHANGE THEM', 'info');
  });

  (vocalDialog as any).addEventListener('vocal-dialog-cancelled', () => {
      liveMusicHelper.setGenerationMode('DIVERSITY');
      leftSidebar.primaryMode = 'DIVERSITY'; // Sync UI
      pdjMidi.setMessage(`MODE: DIVERSITY`, "info");
      // Without the voice mode there are no voice instruments (as when the mode is changed on the left sidebar)
      replaceVocalInstruments();
  });
  document.body.appendChild(pdjMidi as any);
  document.body.appendChild(rightSidebar as any);
  document.body.appendChild(timeline as any);
  const toastMessage = new ToastMessage();
  document.body.appendChild(toastMessage as any);
  // Every visitor gets a unique ID (kept in this browser); free quotas are counted under it
  (window as any).userId = getUserId();
  // Over the quota: the message dialog says so (the display panel keeps the line too)
  const quotaBlocked = (message: string) => {
      toastMessage.show(message);
      pdjMidi.setMessage(message.toUpperCase(), 'error');
  };
  const liveMusicHelper = new LiveMusicHelper(ai, model);
  // Song quota used up: the voice dialog button is forbidden until the month ends
  const syncVoiceBlocked = () => { leftSidebar.voiceBlocked = !quotaStatus('song').ok; }; // local count or a remembered server refusal
  syncVoiceBlocked();
  // Fall back to the live model: Band tab selected, voice mode off (as when the voice dialog is cancelled)
  const fallBackToLive = () => {
      if (rightSidebar.currentTab !== 'Band') (rightSidebar as any).switchTab('Band');
      liveMusicHelper.setGenerationMode('DIVERSITY');
      leftSidebar.primaryMode = 'DIVERSITY';
      rightSidebar.voiceEnabled = false;
      window.dispatchEvent(new CustomEvent('vocal-state-changed', { detail: { active: false } }));
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
  (window as any).liveMusicHelper = liveMusicHelper;
  
  liveMusicHelper.setMaxDuration(3); 
  timeline.maxDuration = 180; 
  
  const audioAnalyser = new AudioAnalyser(liveMusicHelper.audioContext);
  liveMusicHelper.masterDestination = audioAnalyser.node;
  audioAnalyser.start();

  let djEngagingCountdown = false;
  let warmupInterval: number | null = null;
  // Counts DJ activations so a stale async DJ setup can detect that a newer request superseded it
  let djRequest = 0;

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

  (topToolbar as any).addEventListener('genre-changed', ((e: Event) => {
      cancelAutoLoop();
      const genre = (e as CustomEvent<string>).detail;
      rightSidebar.genre = genre;
      if (!leftSidebar.isShuffling && !leftSidebar.isResetting) {
          pdjMidi.setMessage(`GENRE: ${genre.toUpperCase()}`, 'info');
      }
      liveMusicHelper.setGlobalSettings({ genre });
      if (diceReferenceActive) applyGenreReference();
  }));

  (topToolbar as any).addEventListener('style-changed', ((e: Event) => {
      cancelAutoLoop();
      const style = (e as CustomEvent<string>).detail;
      rightSidebar.musicStyle = style;
      if (!leftSidebar.isShuffling && !leftSidebar.isResetting) {
          pdjMidi.setMessage(`STYLE: ${style.toUpperCase()}`, 'info');
      }
      liveMusicHelper.setGlobalSettings({ style });
      if (diceReferenceActive) applyGenreReference();
  }));

  (topToolbar as any).addEventListener('mood-changed', ((e: Event) => {
      cancelAutoLoop();
      const mood = (e as CustomEvent<string>).detail;
      if (!leftSidebar.isShuffling && !leftSidebar.isResetting) {
          pdjMidi.setMessage(`MOOD: ${mood.toUpperCase()}`, 'info');
      }
      liveMusicHelper.setMood(mood);
  }));
  (topToolbar as any).addEventListener('key-changed', ((e: Event) => {
      cancelAutoLoop();
      const detail = (e as CustomEvent<any>).detail;
      liveMusicHelper.setGlobalSettings({ key: detail.key, mode: detail.mode });
  }));
  // Mixer channel lock: the engine then allows only the selected instruments in the prompts
  (rightSidebar as any).addEventListener('locks-changed', ((e: Event) => {
      liveMusicHelper.setInstrumentsLocked(!!(e as CustomEvent<{ channels: boolean }>).detail.channels);
  }));
  liveMusicHelper.setInstrumentsLocked(rightSidebar.locks.channels);

  (topToolbar as any).addEventListener('locks-changed', ((e: Event) => {
      const locks = (e as CustomEvent<any>).detail;
      liveMusicHelper.setToolbarLocks(locks);
      rightSidebar.genreLocked = locks.genre;
  }));
  (topToolbar as any).addEventListener('meter-changed', ((e: Event) => {
      cancelAutoLoop();
      liveMusicHelper.setGlobalSettings({ meter: (e as CustomEvent<string>).detail });
      updateSongDuration();
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

  (rightSidebar as any).addEventListener('volume-changed', ((e: Event) => {
      const vol = (e as CustomEvent<number>).detail;
      liveMusicHelper.setVolume(vol);
  }));

  // A song with voices (Lyria 3.5) is as long as its lyrics, tempo and meter make it: the duration slider follows
  // that estimate until the rendered song tells the exact length.
  const updateSongDuration = () => {
      if (!liveMusicHelper.usesSongModel) return;
      const est = liveMusicHelper.estimateSongSeconds();
      if (est === null) return;
      const mins = rightSidebar.setDuration(est / 60);
      liveMusicHelper.setMaxDuration(mins); timeline.maxDuration = mins * 60;
  };

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

  // The auto-loop countdown only follows a recording that ran to its end by itself. After a manual stop (or reset)
  // the music stays stopped.
  let autoLoopAllowed = false;
  liveMusicHelper.addEventListener('recording-finished-auto', () => {
      autoLoopAllowed = true;
      deactivateDj();
      const isLooping = liveMusicHelper.isLooping;
      if (isLooping) pdjMidi.setMessage("LOOP REPLAY IN 5S...", "info");
      else pdjMidi.setMessage("RECORDING FINISHED", "info");
  });

  liveMusicHelper.addEventListener('recording-available', () => {
      deactivateDj();
      timeline.hasRecording = true; 
      leftSidebar.hasRecording = true;
      if (autoLoopAllowed) startAutoLoopGracePeriod();
      else pdjMidi.setMessage("RECORDING READY", "info");
      autoLoopAllowed = false;
  });

  liveMusicHelper.addEventListener('recording-cleared', () => {
      timeline.hasRecording = false;
      leftSidebar.hasRecording = false;
      timeline.resetHistory(true);
      cancelAutoLoop();
  });

  liveMusicHelper.addEventListener('handshake-result', (e: any) => {
      if (djEngagingCountdown) return;
      if (e.detail) {
          pdjMidi.setMessage("DJ CONDUCTOR ACTIVE", "info");
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
  
  // A take stopped (Stop or Reset) within 30 seconds of its sound starting was not liked: the song goes back to the
  // quota. After 30 seconds it stays counted. The sound starts when a live take leaves its warm-up (recording) or
  // when a rendered song begins to play.
  const TAKE_GRACE_MS = 30000;
  type Take = { kind: 'song' | 'live'; soundAt: number | null; localRecorded: boolean };
  let take = null as Take | null;
  const giveBackTake = () => {
      const t = take; take = null;
      if (!t) return;
      if (t.soundAt !== null && Date.now() - t.soundAt > TAKE_GRACE_MS) return;
      refundQuota(t.kind);
      if (t.localRecorded) unrecordUsage(t.kind);
      syncVoiceBlocked();
      pdjMidi.setMessage(t.kind === 'song' ? 'STOPPED WITHIN 30S: SONG GIVEN BACK' : 'STOPPED WITHIN 30S: TAKE GIVEN BACK', 'info');
  };

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
      // Voice mode with a voice or choir on stage: Lyria RealTime cannot sing words, so the take is rendered
      // as a whole song (instruments, singers and lyrics) by Lyria 3.5
      let kind: 'song' | 'live' = liveMusicHelper.usesSongModel ? 'song' : 'live';
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
      if (liveMusicHelper.usesSongModel) {
          // A song with voices is rendered whole by Lyria 3.5 and cannot be conducted: the DJ steps down (button unselected)
          if (liveMusicHelper.conductorMode || leftSidebar.isConductorActive) {
              deactivateDj();
              pdjMidi.setMessage('DJ OFF: A SONG WITH VOICES CANNOT BE CONDUCTED', 'info');
          }
          // The dialog's lyrics and language are what gets sung, also when they were not applied yet
          const lang = vocalDialog.language;
          if (vocalDialog.vocalText.trim() && vocalDialog.vocalText !== liveMusicHelper.lyricsText) {
              liveMusicHelper.setLyrics(vocalDialog.vocalText, lang !== 'Auto' ? lang : undefined, false);
          } else if (lang !== 'Auto') liveMusicHelper.lyricsLanguage = lang;
          updateSongDuration();
          liveMusicHelper.renderSong();
          return;
      }
      // A live take cannot sing words: voice instruments left on the channels would only babble
      replaceVocalInstruments();
      recordUsage('live');
      if (take) take.localRecorded = true;
      liveMusicHelper.record();
  });

  liveMusicHelper.addEventListener('song-render-started', ((e: Event) => {
      const { prompt } = (e as CustomEvent<{ prompt: string }>).detail;
      if ((import.meta as any).env?.DEV) console.info('[Lyria 3.5] song prompt:\n' + prompt);
      panelsCleared = false;
      lastPromptText = `[LYRIA 3.5 SONG] ${prompt.replace(/\s*\n\s*/g, ' / ')}`;
      refreshPromptPanel();
      pdjMidi.setMessage('LYRIA 3.5: RENDERING SONG WITH VOICES...', 'info');
      
      // Force UI into recording state so channels show and progress
      leftSidebar.playbackState = 'recording';
      timeline.playbackState = 'recording';
      timeline.resetHistory(); // Start capturing history
  }));
  liveMusicHelper.addEventListener('song-render-progress', ((e: Event) => {
      const detail = (e as CustomEvent<{ seconds: number, percent: number }>).detail;
      pdjMidi.setMessage(`LYRIA 3.5: RENDERING SONG... ${detail.seconds}S`, 'info');
      timeline.recordedDuration = detail.percent;
      // Update elapsed time for the timeline to move
      timeline.elapsedSeconds = (detail.percent / 100) * timeline.maxDuration;
      leftSidebar.elapsedSeconds = timeline.elapsedSeconds;
  }));
  liveMusicHelper.addEventListener('song-rendered', ((e: Event) => {
      const { duration } = (e as CustomEvent<{ duration: number }>).detail;
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
  liveMusicHelper.addEventListener('song-render-failed', ((e: Event) => {
      const { reason, blocked } = (e as CustomEvent<{ reason: string; blocked: boolean }>).detail;
      console.error('[Lyria 3.5] song render failed:', reason);
      refundQuota('song'); // nothing was delivered: the song goes back to the quota
      take = null;
      if (blocked) {
          // The API key may not use Lyria 3.5 (free tier): record live instead, voices without words
          pdjMidi.setMessage('LYRIA 3.5 NOT AVAILABLE ON THIS API KEY (PAID TIER NEEDED): RECORDING LIVE, NO WORDS', 'error');
          liveMusicHelper.record();
          return;
      }
      pdjMidi.setMessage(`SONG FAILED: ${reason.slice(0, 80).toUpperCase()}`, 'error');
  }));

  (leftSidebar as any).addEventListener('stop', () => {
    giveBackTake();
    cancelAutoLoop();
    liveMusicHelper.cancelSongRender();
    liveMusicHelper.stop(true, false);
    deactivateDj();
    if (warmupInterval) { clearInterval(warmupInterval); warmupInterval = null; }
  });
  (leftSidebar as any).addEventListener('pause', () => { cancelAutoLoop(); liveMusicHelper.pause(); });
  (leftSidebar as any).addEventListener('resume', () => { cancelAutoLoop(); liveMusicHelper.resume(); });
  (leftSidebar as any).addEventListener('loop-changed', (e: any) => { cancelAutoLoop(); liveMusicHelper.setLoop(e.detail); });
  (leftSidebar as any).addEventListener('play-recording', () => { cancelAutoLoop(); liveMusicHelper.playRecording(); });
  (leftSidebar as any).addEventListener('back-to-start', () => { cancelAutoLoop(); liveMusicHelper.startRewind(); });
  (leftSidebar as any).addEventListener('download', (e: any) => {
    cancelAutoLoop();
    // Download counter in Vercel Web Analytics (custom event, no personal data), only when there is something to save
    if (leftSidebar.hasRecording) track('download', { format: String(e.detail) });
    liveMusicHelper.download(e.detail, vocalDialog.songName);
  });
  (leftSidebar as any).addEventListener('send-vocal-command', (e: any) => { cancelAutoLoop(); liveMusicHelper.sendVocalSignal(e.detail, 4000); });
  
  // Voice mode off: any voice instrument on a channel is swapped for a random non-voice instrument recommended for the genre
  // `keep` + `force`: also in voice mode, swap the voices on every channel except `keep` (locked voice settings)
  const replaceVocalInstruments = (keep: (keyof InstrumentSet)[] = [], force = false) => {
      if ((!force && liveMusicHelper.generationMode === 'VOCALIZATION') || rightSidebar.locks.channels) return;
      const settings = { ...rightSidebar.settings };
      let changed = false;
      Object.keys(settings).forEach((ch) => {
          const channel = ch as keyof InstrumentSet;
          if (keep.includes(channel) || !isVocalInstrument(settings[channel].instrument)) return;
          const used = Object.values(settings).map(s => s.instrument);
          const allNonVocal = (rightSidebar as any).getRecommendedInstruments(channel).filter((i: string) => !isVocalInstrument(i));
          const unused = allNonVocal.filter((i: string) => !used.includes(i));
          const nonVocalPool = unused.length > 0 ? unused : allNonVocal;
          if (nonVocalPool.length > 0) {
              settings[channel] = { ...settings[channel], instrument: nonVocalPool[Math.floor(Math.random() * nonVocalPool.length)] };
              changed = true;
          }
      });
      if (changed) (rightSidebar as any).auditAndCommit(settings);
  };

  // Voice master mode on: the dice and the DJ put a voice on the solo-voice channel when no channel has one
  // (Band: alto, solo / duet / quartet. Lyria: VOICE/LEAD, solo / duet).
  const ensureVoiceChannels = () => {
      if (liveMusicHelper.generationMode !== 'VOCALIZATION' || rightSidebar.locks.channels) return;
      const hasVoice = (Object.values(rightSidebar.settings) as ChannelState[]).some(ch => ch.visible !== false && ch.active && isVocalInstrument(ch.instrument));
      if (hasVoice) return;
      const kinds = ['Solo Male', 'Solo Female', 'Duet Mix', 'Quartet Mix'];
      const ch: keyof InstrumentSet = rightSidebar.currentTab === 'Lyria' ? LYRIA_VOICE_CHANNELS.solo : 'alto';
      rightSidebar.setVoiceInstruments({ [ch]: [kinds[Math.floor(Math.random() * kinds.length)]] });
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
          pdjMidi.setMessage('READY', 'info');
      }
  };
  setInterval(() => { refreshPromptPanel(); updatePlayerStatus(); }, 5000);
  // Repeatable takes: show the seed, lock it from the mixer panel
  liveMusicHelper.addEventListener('seed-changed', ((e: Event) => {
      const { seed, locked } = (e as CustomEvent<{ seed: number | null; locked: boolean }>).detail;
      rightSidebar.seed = seed ?? 0;
      rightSidebar.seedLocked = locked;
      if (locked) pdjMidi.setMessage(`SEED LOCKED: ${seed}`, 'info');
  }));
  (rightSidebar as any).addEventListener('seed-lock-changed', ((e: Event) => liveMusicHelper.setSeedLock((e as CustomEvent<boolean>).detail)));
  // A rejected prompt was rewritten (or dropped) on the fly
  liveMusicHelper.addEventListener('prompt-improved', ((e: Event) => {
      const { from, to, how } = (e as CustomEvent<{ from: string; to: string | null; how: string }>).detail;
      const short = (t: string) => (t.length > 40 ? t.slice(0, 37) + '...' : t);
      pdjMidi.setMessage(to ? `PROMPT REWRITTEN (${how}): ${short(from)} → ${short(to)}` : `PROMPT DROPPED: ${short(from)}`, 'info');
      if ((import.meta as any).env?.DEV) console.info('[Lyria] prompt improved:', { from, to, how });
  }));
  liveMusicHelper.addEventListener('prompt-filtered', ((e: Event) => {
      const { text, filteredReason, payload, config } = (e as CustomEvent<{ text?: string; filteredReason?: string; payload?: unknown; config?: unknown }>).detail;
      // Dev mode: keep a log of every rejected prompt with the full payload it was part of (window.__lyriaFiltered).
      // Lyria's reason is always the same boilerplate ("...check the documentation..."), so that advice is cut and only
      // the rejected prompt and any specific reason remain.
      if ((import.meta as any).env?.DEV) {
          const reason = (filteredReason || '').split(/(?<=[.!?])\s+/).filter(s => !/documentation|guidelines|learn more|try again/i.test(s)).join(' ').trim();
          const w = window as any;
          (w.__lyriaFiltered ||= []).push({ at: new Date().toISOString(), text, reason, payload, config });
          console.warn(`[Lyria] prompt failed: "${text}"${reason ? ' | ' + reason : ''}`, '| payload:', payload, '| config:', config);
      }
      pdjMidi.setMessage('PROMPT FAILED, CORRECTING...', 'error');
  }));
  liveMusicHelper.addEventListener('config-applied', ((e: Event) => {
      appliedGuidance = (e as CustomEvent<{ guidance: number }>).detail.guidance;
      refreshPromptPanel();
  }));
  liveMusicHelper.addEventListener('config-failed', ((e: Event) => {
      pdjMidi.setMessage(`LYRIA CONFIG REJECTED: ${(e as CustomEvent<string>).detail}`, 'error');
  }));
  liveMusicHelper.addEventListener('voice-intensity-changed', () => refreshPromptPanel());
  liveMusicHelper.addEventListener('prompts-sent', ((e: Event) => {
      const { prompts } = (e as CustomEvent<{ prompts: { text: string; weight: number }[] }>).detail;
      panelsCleared = false;
      lastPromptText = [...prompts].sort((a, b) => b.weight - a.weight).map(p => `${p.text} (${p.weight.toFixed(1)})`).join(' • ');
      refreshPromptPanel();
  }));

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
          liveMusicHelper.setVoiceCast(target.solos);
          refreshPromptPanel();
      }
  };

  // The DJ picked voice channels: set the Voice dialog to match and send the vocal direction
  const djConfigureVoices = () => {
      const target = voicesFromChannels(vocalDialog.getVoices());
      if (!target) return false;
      vocalDialog.djConfigure(target.solos, target.choir);
      refreshPromptPanel();
      return true;
  };

  // The Voice dialog's voices go onto the voice channels as a matching random voice instrument.
  // Returns the channels that got a voice (empty when the dialog has none).
  const applyDialogVoices = (solos: string[], choir: string): (keyof InstrumentSet)[] => {
      // Band: solo voices on alto, choir on harmonic. Lyria: solo voices on VOICE/LEAD, choir on VOICE/HARMONY.
      const lyria = rightSidebar.currentTab === 'Lyria';
      const soloCh: keyof InstrumentSet = lyria ? LYRIA_VOICE_CHANNELS.solo : 'alto';
      const choirCh: keyof InstrumentSet = lyria ? LYRIA_VOICE_CHANNELS.choir : 'harmonic';
      const pick: Partial<Record<keyof InstrumentSet, string[]>> = {};
      if (choir !== 'None') pick[choirCh] = CHOIR_CANDIDATES[choir] || [];
      const isFemale = (v: string) => v === 'Soprano' || v === 'Alto';
      if (solos.length === 1) pick[soloCh] = [isFemale(solos[0]) ? 'Solo Female' : 'Solo Male'];
      else if (solos.length === 2) pick[soloCh] = [solos.every(isFemale) ? 'Duet Female' : solos.some(isFemale) ? 'Duet Mix' : 'Duet Male'];
      else if (solos.length >= 3) pick[soloCh] = ['Quartet Mix'];
      if (!pick[soloCh] && !pick[choirCh]) return [];
      // Picking voices makes the voice the primary mode: without VOCALIZATION no voice reaches Lyria
      // (and the channels would not even offer voice instruments)
      if (liveMusicHelper.generationMode !== 'VOCALIZATION') {
          liveMusicHelper.setGenerationMode('VOCALIZATION');
          pdjMidi.setMessage('VOICES SELECTED: MODE VOCALIZATION', 'info');
      }
      syncingFromDialog = true;
      try { rightSidebar.setVoiceInstruments(pick); } finally { syncingFromDialog = false; }
      refreshPromptPanel();
      return Object.keys(pick) as (keyof InstrumentSet)[];
  };

  // You picked voices or a choir in the dialog: the voice channels switch to a matching random voice instrument
  (vocalDialog as any).addEventListener('voices-applied', (e: CustomEvent<{ solos: string[]; choir: string }>) => {
      liveMusicHelper.setGenerationMode('VOCALIZATION');

      rightSidebar.currentTab = 'Lyria';
      applyDialogVoices(e.detail.solos, e.detail.choir);
      (window as any).applyVoiceKnobSettings();
  });

  // Dice and DJ planning in voice mode: locked voice settings put exactly the dialog's voices on stage (and no
  // other voices); otherwise a voice is added only when no channel has one.
  const placeVoices = () => {
      const { solos, choir } = vocalDialog.getVoices();
      if (vocalDialog.locked && liveMusicHelper.generationMode === 'VOCALIZATION' && !rightSidebar.locks.channels && (solos.length > 0 || choir !== 'None')) {
          const voiced = applyDialogVoices(solos, choir);
          replaceVocalInstruments(voiced, true);
          liveMusicHelper.setVoiceCast(solos);
          return;
      }
      ensureVoiceChannels();
  };

  (rightSidebar as any).addEventListener('tab-changed', (e: CustomEvent<string>) => {
      // The tab only changes the prompts (orchestra / voices or band). Live takes always stream from the realtime
      // model; Lyria 3.5 is a song model that renderSong() calls on its own, it cannot stream (the take is silent).
      pdjMidi.setMessage(e.detail === 'Lyria' ? 'LYRIA TAB: ORCHESTRA CHANNELS' : 'BAND TAB: BAND CHANNELS', 'info');
  });
  (leftSidebar as any).addEventListener('dj-changed', async (e: Event) => {
      cancelAutoLoop();
      const active = (e as CustomEvent<boolean>).detail;
      (window as any).isConductorActive = active;
      
      const myRequest = ++djRequest;
      const superseded = () => myRequest !== djRequest;
      const isLive = liveMusicHelper.playbackState === 'recording' || liveMusicHelper.playbackState === 'warmup' || liveMusicHelper.playbackState === 'preparing' || liveMusicHelper.playbackState === 'loading';
      
      if (active) {
          const rsLocks = (rightSidebar as any).locks;
          // DJ always uses BAND tab (Band channels)
          rightSidebar.currentTab = 'Band';
          
          const canPlan = liveMusicHelper.playbackState === 'stopped';
          if (canPlan) {
              if (!rsLocks.channels) {
                  await topToolbar.randomizeInstruments({ manifest: rsLocks.manifest, channels: false }, rightSidebar.settings, false);
                  if (superseded()) return;
              }

              if (!rsLocks.manifest && !rsLocks.channels) {
                  const keep = chooseDjManifest(topToolbar.genre, liveMusicHelper.djPersonalityChannels, liveMusicHelper.djPersonalityInfo?.complexity);
                  rightSidebar.applyDjManifest(keep);
              }

              // The voice mode stays on when the user chose it: the DJ conducts with the voices (as the dice do)
              replaceVocalInstruments();
              placeVoices();
              rightSidebar.finalizeDiceChannels();

              const mood = topToolbar.djPickMood();
              // The DJ's character sets the evolution slider
              const evo = djEvolutionFor(liveMusicHelper.djPersonalityInfo);
              rightSidebar.setEvolution(evo);
              liveMusicHelper.setEvolution(evo);

              liveMusicHelper.generatePerformancePlan(0);
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
  });

  (leftSidebar as any).addEventListener('mode-changed', ((e: Event) => {
      cancelAutoLoop();
      const mode = (e as CustomEvent<MusicGenerationMode>).detail;
      (window as any).primaryMode = mode; // Keep global in sync
      liveMusicHelper.setGenerationMode(mode);
      
      pdjMidi.setMessage(`MODE: ${mode}`, 'info');

      // Without the voice mode there are no voice instruments: the channels get the genre's recommended ones
      rightSidebar.voiceEnabled = mode === 'VOCALIZATION';
      replaceVocalInstruments();
      refreshPromptPanel();
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
      rightSidebar.voiceEnabled = e.detail === 'VOCALIZATION';
      refreshPromptPanel();
      pdjMidi.setMessage(`AI STORYTELLING: ${e.detail} MODE`, 'info');
  });

  // Tempo never reached the engine before: forward toolbar tempo changes (user or DJ)
  (topToolbar as any).addEventListener('bpm-changed', ((e: Event) => {
      liveMusicHelper.setGlobalSettings({ bpm: (e as CustomEvent<number>).detail });
      updateSongDuration();
      syncBars();
  }));

  // === Tempo slider (manifest panel) and the Bars box (top bar) ===
  // Quarter-note beats in one bar: 4/4 -> 4, 3/4 -> 3, 6/8 -> 3, free time -> 4
  const beatsPerBar = (meter: string) => {
      const m = /^(\d+)\/(\d+)$/.exec(meter);
      return m ? (Number(m[1]) * 4) / Number(m[2]) : 4;
  };
  const barSeconds = () => beatsPerBar(topToolbar.meter) * 60 / Math.max(20, topToolbar.bpm);
  /** The Bars box shows the song length (DUR slider) in bars at the current tempo and meter. */
  const syncBars = () => { topToolbar.bars = Math.max(1, Math.round(rightSidebar.durationMinutes * 60 / barSeconds())); };
  topToolbar.addEventListener('tempo-state', ((e: Event) => {
      const d = (e as CustomEvent<{ bpm: number; min: number; max: number; locked: boolean }>).detail;
      rightSidebar.bpm = d.bpm; rightSidebar.bpmMin = d.min; rightSidebar.bpmMax = d.max;
  }) as EventListener);
  (rightSidebar as any).addEventListener('bpm-input', ((e: Event) => { cancelAutoLoop(); topToolbar.setBpm((e as CustomEvent<number>).detail); }));
  (topToolbar as any).addEventListener('meter-changed', () => syncBars());
  (rightSidebar as any).addEventListener('duration-changed', () => syncBars());
  setTimeout(() => { topToolbar.emitTempoState(); syncBars(); }, 0);

  // While the DJ conducts a live recording it also works the master controls (volume, evolution) and the volume of
  // each track — even though they are disabled for the user — and varies tempo, key and rhythm. It never touches
  // manifest or instruments.
  type Mix = [number, number, number, number, number]; // lead, alto, harmonic, bass, rhythm
  const STAGE_MIX: Record<string, Mix> = {
      acapella: [1, 0.5, 0.4, 0.2, 0],     intro: [0.6, 0.6, 0.9, 0.5, 0.4],  verse: [0.9, 0.7, 0.8, 0.8, 0.7],
      main: [0.9, 0.9, 0.9, 0.9, 0.9],     build: [0.8, 0.8, 0.8, 0.9, 0.9],  chorus: [1, 0.9, 0.9, 1, 1],
      climax: [1, 1, 1, 1, 1],             breakdown: [0.8, 0.6, 0.8, 0.5, 0.3], solo: [1, 0.5, 0.7, 0.8, 0.8],
      outro: [0.6, 0.5, 0.8, 0.4, 0.3]
  };
  const STAGE_VOLUME: Record<string, number> = { acapella: 0.7, intro: 0.5, outro: 0.5, breakdown: 0.6, build: 0.7, chorus: 0.9, climax: 0.9 };
  const STAGE_EVOLUTION: Record<string, number> = { acapella: 1, intro: -3, outro: -4, breakdown: 0, build: 2, verse: 1, main: 2, chorus: 5, climax: 6, solo: 3 };
  const djStageControls = (type: string | undefined, index: number) => {
      const t = type || 'main';
      const volume = STAGE_VOLUME[t] ?? 0.7;
      rightSidebar.volume = volume;
      liveMusicHelper.setVolume(volume);

      const evo = Math.max(-10, Math.min(10, (STAGE_EVOLUTION[t] ?? 1) + Math.round(Math.random() * 2 - 1)));
      rightSidebar.setEvolution(evo);
      liveMusicHelper.setEvolution(evo);

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

  liveMusicHelper.addEventListener('conductor-stage-changed', (e: any) => {
      const { name, type, index } = e.detail;
      pdjMidi.setMessage(`DJ: ${name}`, 'info');
      if (type !== undefined && liveMusicHelper.conductorMode && liveMusicHelper.playbackState === 'recording') {
          djStageControls(type, index ?? 0);
      }
  });
  
  liveMusicHelper.addEventListener('conductor-anticipation', (e: any) => {
      const { msg } = e.detail;
      pdjMidi.setMessage(msg, 'info');
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

      // 3. Duration and evolution are rolled too, unless the manifest is locked (then the current ones are kept)
      if (!(rightSidebar as any).locks.manifest) {
          const steps = DURATION_STEPS;
          const mins = rightSidebar.setDuration(steps[Math.floor(Math.random() * steps.length)].value);
          liveMusicHelper.setMaxDuration(mins); timeline.maxDuration = mins * 60;
          rightSidebar.setEvolution(Math.floor(Math.random() * 13) - 6); // -6..+6
          syncBars();
      }
      const currentEvo = rightSidebar.evolution;
      liveMusicHelper.setEvolution(currentEvo);
      
      // 4. Update Instruments and Manifest based on Style Matrix for current tab
      const rsLocks = (rightSidebar as any).locks;
      // Dice roll will not change the TAB
      // if (!rsLocks.channels) {
      //     rightSidebar.currentTab = chooseDjTab(topToolbar.genre);
      // }
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
  
  (leftSidebar as any).addEventListener('reset', async () => {
      giveBackTake();
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
      rightSidebar.reset(); 
      pdjMidi.reset(); 
      liveMusicHelper.setEvolution(0);
      rightSidebar.setEvolution(0);
      
      clearTopPanels();
      setTimeout(() => { leftSidebar.isResetting = false; }, 800);
  });

  let hadVoiceOnStage = false;
  (rightSidebar as any).addEventListener('channels-changed', ((e: Event) => {
      cancelAutoLoop();
      const detail = (e as CustomEvent<InstrumentSet>).detail;
      
      // The prompts name each channel by its role, which differs between the Band and Lyria tabs
      liveMusicHelper.isLiraMode = rightSidebar.currentTab === 'Lyria';
      // Each track's volume scales the weight the engine gets (Lyria mixes one stream: no separate gain per instrument)
      const scaled = {} as InstrumentSet;
      (Object.keys(detail) as Array<keyof InstrumentSet>).forEach(k => {
          const ch = detail[k];
          scaled[k] = { ...ch, weight: ch.weight * (ch.volume ?? 1) };
      });
      liveMusicHelper.setInstruments(scaled);
      syncVoiceDialog();
      
      // ... rest of logic
      
      const vocalInManifest = (Object.values(detail) as ChannelState[]).some(ch => {
          if (ch.visible === false) return false;
          return isVocalInstrument(ch.instrument);
      });
      leftSidebar.hasVocalInstrument = vocalInManifest;

      // A voice just came on stage (preset, locked channels, Voice dialog): the voice becomes the primary mode.
      // Only on the change, so switching the mode off yourself afterwards is respected.
      const voiceOnStage = (Object.values(detail) as ChannelState[]).some(ch => ch.visible !== false && ch.active && isVocalInstrument(ch.instrument));
      if (voiceOnStage && !hadVoiceOnStage && liveMusicHelper.generationMode !== 'VOCALIZATION') {
          liveMusicHelper.setGenerationMode('VOCALIZATION');
          pdjMidi.setMessage('VOICE ON STAGE: MODE VOCALIZATION', 'info');
      }
      hadVoiceOnStage = voiceOnStage;

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

  (liveMusicHelper as any).addEventListener('dj-vocal-message', ((e: CustomEvent) => {
    const { message, stage } = e.detail || {};
    if (message) {
      pdjMidi.setMessage(`DJ->LYRA [${stage ? stage.toUpperCase() : 'VOICE'}]: ${message}`, "info");
    }
  }) as EventListener);

  (liveMusicHelper as any).addEventListener('vocal-signal-received', ((e: CustomEvent) => {
    if (e.detail) {
      pdjMidi.setMessage(`VOCAL DIRECTIVE: ${e.detail}`, "info");
    }
  }) as EventListener);

  audioAnalyser.addEventListener('audio-levels-changed', ((e: Event) => {
    const { left, right } = (e as CustomEvent<{left: number, right: number}>).detail;
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
