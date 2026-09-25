
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import type { PlaybackState, Prompt, InstrumentSet, MusicGenerationMode, PlaybackSnapshot } from '../types';
import { AudioChunk, GoogleGenAI, LiveMusicSession } from '@google/genai';
import { decode, decodeAudioData } from './audio';
import { throttle } from './throttle';
import { uiSounds } from './UISounds';

interface PerformancePlanStage {
    stageName: string;
    stageStartTimeSec: number;
    activeChannels: { lead: boolean; alto: boolean; harmonic: boolean; bass: boolean; rhythm: boolean };
    targets: { parameterName: string; targetValue: number }[];
    channelWeights: { lead: number; alto: number; harmonic: number; bass: number; rhythm: number };
}

interface RecordingSegment {
    startTime: number;
    duration: number;
    buffer: AudioBuffer;
}

export const VOCAL_STRINGS = [
  'Solo Female', 'Solo Male', 'Solo Boy', 'Solo Girl', 'Solo Soprano', 'Solo Tenor', 'Operatic Soloist', 'Soloist',
  'Mixed Choir', 'Male Choir', 'Female Choir', 'Childrens Choir', 'Epic Choir', 'Gregorian Chant', 'Gospel Choir', 'A Cappella Group', 'Chamber Choir', 'Vocal Ensemble',
  'Soprano Voice', 'Coral Voices', 'Coral Bass', 'Solo Voice', 'Vocal Chops', 
  'Male Monastic Choir', 'Powerhouse Soloist', 'Bright Female Vocals', 
  'Processed Vocals', 'Children\'s Choir', 'Gospel Vocals', 'Distant Female Voice', 
  'Backing Choir', 'Soprano Choir', 'Tenor/Alto Choir', 'Bass Choir', 'Deep Vocal Drone',
  'Alto Choir', 'Choir'
];

export function isVocalInstrument(instrumentName: string | undefined | null): boolean {
    if (!instrumentName) return false;
    const inst = instrumentName.toLowerCase().trim();
    if (!inst || inst === 'none' || inst === 'n/a') return false;
    
    // Core voice channels: Match specific vocal instrument patterns
    if (inst.includes('choir')) return true;
    if (inst.includes('voice')) return true;
    if (inst.includes('vocal')) return true;
    if (inst.includes('solo female') || inst.includes('solo male') || inst.includes('solo girl') || inst.includes('solo boy')) return true;
    
    // Fallback to explicit list for others
    return VOCAL_STRINGS.some(v => inst.includes(v.toLowerCase()));
}

const VOWELS = ['A', 'E', 'I', 'O', 'U'];

// A curated list of possible instruments the AI might mention to aid parsing
const KNOWN_INSTRUMENTS = [
  'Synthesizer', 'Electric Guitar', 'Acoustic Guitar', 'Saxophone', 'Trumpet', 'Clarinet', 'Flute', 'Violin', 'Cello', 'Harmonica', 
  'Piano', 'Electric Piano', 'Organ', 'Strings', 'Pads', 'Brass Section', 'Choir', 'Bass Guitar', 'Double Bass', 'Synth Bass', 'Tuba',
  'Drum Kit', 'Electronic Drums', 'Percussion', 'Tabla', 'Djembe', 'Taiko Drums', 'Recorder', 'Mandocello', 'Banjo', 'Sitar', 'Koto', 
  'Accordion', 'Oboe', 'Bassoon', 'Timpani', 'Kalimba', 'Didgeridoo', 'Whistle', 'Bell Synth', 'Electric Violin', 'Pan Flute', 'Pipe Flute', 'Ocarina'
];

export const SONG_REFERENCES: Record<string, string[]> = {
  'Pop': ['Blinding Lights', 'Flowers', 'As It Was', 'Levitating', 'Anti-Hero', 'Shape of You', 'Bad Guy', 'Cruel Summer', 'Vampire', 'Taylor Swift style', 'The Weeknd vibe', 'Max Martin production style', 'Jack Antonoff aesthetic'],
  'R&B': ['Kill Bill', 'Snooze', 'Adorn', 'Cuff It', 'No Guidance', 'Blame It', 'Ordinary People', 'Creepin', 'Earned It', 'SZA influence', 'Frank Ocean aesthetic', 'Prince-style arrangement', 'Stevie Wonder harmony'],
  'Jazz': ['Take Five', 'So What', 'Autumn Leaves', 'My Funny Valentine', 'Fly Me To The Moon', 'Blue In Green', 'Cantaloupe Island', 'Miles Davis style', 'Coltrane changes', 'Duke Ellington orchestration', 'Bill Evans voicings'],
  'Electronic': ['Around the World', 'Strobe', 'Levels', 'Titanium', 'One More Time', 'Sandstorm', 'Scary Monsters and Nice Sprites', 'Clarity', 'Daft Punk style', 'Deadmau5 vibe', 'Aphex Twin complexity', 'Skrillex sound design'],
  'Rock': ['Bohemian Rhapsody', 'Hotel California', 'Smells Like Teen Spirit', 'Comfortably Numb', 'Seven Nation Army', 'Do I Wanna Know?', 'Pink Floyd aesthetic', 'Nirvana vibe', 'Led Zeppelin riff-style', 'Beatles melodic structure'],
  'Blues': ['The Thrill Is Gone', 'Crossroads', 'Hoochie Coochie Man', 'Sweet Home Chicago', 'Texas Flood', 'Pride and Joy', 'B.B. King style', 'SRV influence', 'Muddy Waters aesthetic', 'John Lee Hooker groove'],
  'Ambient': ['Weightless', 'Music for Airports', 'Selected Ambient Works', 'Riceboy Sleeps', '76:14', 'Deep Blue Day', 'Brian Eno style', 'Hans Zimmer texture', 'Vangelis synth layers'],
  'Gaming': ['Sweden (Minecraft)', 'Megalovania', 'Dragonborn', 'One-Winged Angel', 'The Legend of Zelda Theme', 'Halo Theme', 'Koji Kondo style', 'Nobuo Uematsu composition', 'Mick Gordon intensity'],
  'Classic': ['Symphony No. 5', 'Clair de Lune', 'The Four Seasons', 'Moonlight Sonata', 'Ride of the Valkyries', 'Bolero', 'Beethoven style', 'Debussy vibe', 'Mozart structure', 'Bach counterpoint'],
  'Traditional': ['Greensleeves', 'Danny Boy', 'The Foggy Dew', 'Scarborough Fair', 'Wild Mountain Thyme', 'Auld Lang Syne', 'Traditional arrangement'],
  'Spanish': ['Despacito', 'The Girl from Ipanema', 'Oye Como Va', 'Bailando', 'Chan Chan', 'La Camisa Negra', 'Santana style', 'Tito Puente rhythm', 'Antonio Carlos Jobim harmony', 'Andrés Segovia style', 'Paco de Lucía influence'],
  'African': ['Pata Pata', 'Zangalewa', 'African Queen', 'Jerusalema', 'Water No Get Enemy', 'Essence', 'Fela Kuti vibe', 'Burna Boy style', 'Miriam Makeba aesthetic'],
  'Indian': ['Jai Ho', 'Tum Hi Ho', 'Chaiyya Chiaayya', 'Kesariya', 'Kal Ho Naa Ho', 'Pasoori', 'A.R. Rahman style', 'R.D. Burman groove', 'Shankar-Ehsaan-Loy production'],
  'Romanian': ['Dragostea Din Tei', 'Ciuleandra', 'Trandafir de la Moldova', 'Constantine, Constantine', 'Luna Alba', 'Gheorghe Zamfir style', 'Maria Tanase aesthetic']
};
export const LYRIA_GENRES = ['Ambient', 'Classic', 'Renascentist', 'Victorian', 'Spiritual', 'African', 'Indian', 'Irish', 'Spanish', 'Oriental', 'Romanian', 'Western', 'Hawaiian', 'Marching'];
export const TRADITIONAL_GENRES = ['Classic', 'Renascentist', 'Victorian', 'Spiritual', 'African', 'Indian', 'Irish', 'Spanish', 'Oriental', 'Romanian', 'Western', 'Hawaiian', 'Marching', 'Blues', 'Traditional'];

export function isTraditionalGenre(genre: string): boolean {
    return TRADITIONAL_GENRES.includes(genre);
}

export class LiveMusicHelper extends EventTarget {
  private ai: GoogleGenAI; private model: string;
  private session: LiveMusicSession | null = null;
  private sessionPromise: Promise<LiveMusicSession> | null = null;
  private sessionCounter = 0; 
  private nextStartTime = 0;
  public bufferTime = 3.0; // Large buffer: red cursor runs ahead, green starts after buffer fills
  public readonly audioContext: AudioContext;
  private rawGain: GainNode;
  private masterGain: GainNode;
  private recordingDestination: MediaStreamAudioDestinationNode;
  public playbackState: PlaybackState = 'stopped';
  private prompts: Map<string, Prompt>;
  private bpm = 120; private key = 'C Major'; private mode: 'Natural' | 'Minor' = 'Natural';
  public genre = 'Jazz'; public style = 'Acid Jazz'; private meter = '4/4';
  private mood = 'None';
  public generationMode: MusicGenerationMode = 'QUALITY';
  public instruments: InstrumentSet = {
    lead: { instrument: 'Piano', active: true, weight: 1.0, visible: true },
    alto: { instrument: 'Alto Saxophone', active: true, weight: 1.0, visible: true },
    harmonic: { instrument: 'Strings', active: true, weight: 1.0, visible: true },
    bass: { instrument: 'Bass Guitar', active: true, weight: 1.0, visible: true },
    rhythm: { instrument: 'Drum Kit', active: true, weight: 1.0, visible: true }
  };
  private guidance = 3; public conductorMode = false; private isStereo = true; 
  private soloMuted = false; private choirMuted = false;
  private evolutionValue = 0; 
  private conductorTimer: number | null = null;
  private currentPlan: PerformancePlanStage[] = [];
  private currentPlanIdx = 0;
  private userInteractionCooldowns = new Map<string, number>();
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  
  private segments: RecordingSegment[] = [];
  public recordedAudioBlob: Blob | null = null; 
  public automationLog: PlaybackSnapshot[] = [];
  
  private autoStopTimer: number | null = null;
  public maxDurationMinutes: number = 3; 
  
  public elapsedSeconds = 0;
  private playbackStartTime = 0;
  private currentRecordingStartTime = 0;
  private timeTrackingFrame: number | null = null;
  private loopWaitTimer: number | null = null;

  private lastStateBeforePause: PlaybackState = 'stopped';
  private activeSources = new Set<AudioBufferSourceNode>();
  public isLooping = false; public isRewinding = false; private rewindFrame: number | null = null;

  public fadeIn = 5.0;
  public fadeOut = 10.0;
  private userVolume = 0.8;

  private activeHands: string[] = []; 
  private currentVocalSignal: string | null = null;
  private vocalSignalTimer: number | null = null;
  private lastDjVocalMessageTime = 0;
  private conductorActivationTime = 0;

  private specialInstruction: string | null = null;
  private channelsLocked = false;
  public isLiraMode = false;
  public toolbarLocks = {
      genre: false,
      style: false,
      tempo: false,
      key: false,
      mood: false,
      channels: false,
      manifest: false
  };

  // Track the current phase message for recording
  private currentStatusMessage: string = '';
  private lastAppliedStatusMessage: string = '';

  constructor(ai: GoogleGenAI, model: string) {
    super(); this.ai = ai; this.model = model.startsWith('models/') ? model : `models/${model}`; this.prompts = new Map();
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    });
    this.rawGain = this.audioContext.createGain(); this.masterGain = this.audioContext.createGain(); 
    this.masterGain.gain.value = this.userVolume;
    this.recordingDestination = this.audioContext.createMediaStreamDestination();
    this.rawGain.connect(this.recordingDestination); this.rawGain.connect(this.masterGain);
    this.masterGain.connect(this.audioContext.destination);
  }

  public get masterDestination() { return this._masterDestination; }
  private _masterDestination: AudioNode | null = null;
  public set masterDestination(node: AudioNode | null) {
    // Disconnect everything from masterGain first
    try { this.masterGain.disconnect(); } catch(e) {}
    
    this._masterDestination = node; 
    if (node) { 
        this.masterGain.connect(node); 
    } else {
        this.masterGain.connect(this.audioContext.destination);
    }
  }

  public setVolume(value: number) { 
    this.userVolume = value; 
    if (this.playbackState !== 'playing' && this.playbackState !== 'recording' && this.playbackState !== 'warmup' && this.playbackState !== 'preparing' && this.playbackState !== 'rewinding') {
      this.masterGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.05); 
    }
  }

  private updateGainWithFades() {
      if (this.playbackState !== 'playing' && this.playbackState !== 'recording' && this.playbackState !== 'warmup' && this.playbackState !== 'preparing' && this.playbackState !== 'rewinding') {
          return;
      }
      
      if (this.playbackState === 'warmup' || this.playbackState === 'preparing') {
          this.masterGain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.05);
          return;
      }

      const totalDuration = this.maxDurationMinutes * 60;
      let fadeFactor = 1.0;

      if (this.elapsedSeconds >= totalDuration) {
          fadeFactor = 0;
      } else if (this.elapsedSeconds < this.fadeIn && this.fadeIn > 0) {
          fadeFactor = this.elapsedSeconds / this.fadeIn;
      } else if (this.elapsedSeconds > (totalDuration - this.fadeOut) && this.fadeOut > 0) {
          fadeFactor = (totalDuration - this.elapsedSeconds) / this.fadeOut;
      }

      fadeFactor = Math.max(0, Math.min(1, fadeFactor));
      this.masterGain.gain.setTargetAtTime(this.userVolume * fadeFactor, this.audioContext.currentTime, 0.02);
  }

  public setStereo(stereo: boolean) { this.isStereo = stereo; this.scheduleRefresh(); }
  public setMaxDuration(minutes: number) { 
      this.maxDurationMinutes = minutes; 
      if (this.playbackState === 'recording' || this.playbackState === 'playing') {
          this.generatePerformancePlan(this.elapsedSeconds);
          this.updateRecordingSchedule();
      }
  }
  public setSeed(_seed?: number) { /* Seed removed to ensure prompt authenticity */ }
  public setChannelsLocked(locked: boolean) { this.channelsLocked = locked; }
  
  public setLoop(loop: boolean) { 
    this.isLooping = loop; 
    this.dispatchEvent(new CustomEvent('loop-changed-internal', { detail: loop }));
    if (loop && this.segments.length > 0) {
        this.playRecording(0);
    }
  }

  public setFades(fadeIn: number, fadeOut: number) { this.fadeIn = fadeIn; this.fadeOut = fadeOut; }
  public setGuidance(value: number) { this.guidance = value; this.scheduleRefresh(); }
  public setMood(mood: string) { this.mood = mood; this.scheduleRefresh(); }
  public setEvolution(val: number) { this.evolutionValue = val; this.scheduleRefresh(); }
  public setGenerationMode(mode: MusicGenerationMode) { 
      let effectiveMode = mode;
      // Removed restriction: Allowing VOCALIZATION mode regardless of current instrument state
      this.generationMode = effectiveMode; 
      this.dispatchEvent(new CustomEvent('mode-changed-internal', { detail: effectiveMode }));
      this.scheduleRefresh(); 
  }
  
  public setSpecialInstruction(instruction: string | null) {
      this.specialInstruction = instruction;
      this.scheduleRefresh();
  }

  public setToolbarLocks(locks: any) {
      this.toolbarLocks = { ...this.toolbarLocks, ...locks };
      this.scheduleRefresh();
  }

  public setConductorMode(active: boolean) {
      this.conductorMode = active;
      if (active) {
          this.conductorActivationTime = Date.now();
          const isLive = this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading';
          const isPlaying = this.playbackState === 'playing';
          
          // Generate plan based on current state (Start offset is 0 if fresh, else current time)
          const offset = (isLive || isPlaying) ? this.elapsedSeconds : 0;
          this.generatePerformancePlan(offset);

          if (isLive || isPlaying) {
              this.startConductor();
              // Force immediate update to apply "Takeover" stage
              this.updateConductor();
          }
          this.dispatchEvent(new CustomEvent('handshake-result', { detail: true }));
      } else {
          this.stopConductor();
      }
      this.scheduleRefresh();
  }

  public setGlobalSettings(settings: any) {
    if (settings.bpm !== undefined) this.bpm = settings.bpm;
    if (settings.key !== undefined) this.key = settings.key;
    if (settings.mode !== undefined) this.mode = settings.mode;
    if (settings.genre !== undefined) this.genre = settings.genre;
    if (settings.style !== undefined) this.style = settings.style;
    if (settings.meter !== undefined) this.meter = settings.meter;
    this.scheduleRefresh();
  }

  public setInstruments(channels: InstrumentSet) { 
      this.instruments = channels; 
      this.scheduleRefresh(); 
      
      // Update model instructions with the new active instrument set
      const activeInstruments = Object.entries(channels)
          .filter(([_, ch]) => ch.active && ch.visible !== false)
          .map(([_, ch]) => ch.instrument);
      
      const hasVocals = activeInstruments.some(inst => isVocalInstrument(inst));
      
      let instruction: string;
      if (hasVocals) {
          // Vocal-specific instructions when vocal instruments are active
          const genreVocalHint = (() => {
              const g = this.genre.toLowerCase();
              if (g.includes('indian')) return 'Use Hindustani or Carnatic vocal styles. Strictly avoid Japanese or East Asian vocal aesthetics.';
              if (g.includes('irish') || g.includes('celtic')) return 'Use traditional Irish or Celtic folk vocal styles. Strictly avoid Japanese or East Asian vocal aesthetics.';
              if (g.includes('spanish') || g.includes('flamenco')) return 'Use traditional Spanish or Flamenco vocal styles. Strictly avoid Japanese or East Asian vocal aesthetics.';
              if (g.includes('romanian')) return 'Use traditional Romanian or Balkan vocal styles. Strictly avoid Japanese or East Asian vocal aesthetics.';
              return 'Use vocal styles appropriate for the genre.';
          })();
          instruction = `IMPORTANT: Only use these instruments: ${activeInstruments.join(', ')}. ${genreVocalHint} Maintain strict harmonic cohesion between instruments and vocals. Do not add any ghost instruments, unselected backing tracks, or non-native vocal styles.`;
      } else {
          // Instrumental-only instructions when no vocal instruments are active
          instruction = `IMPORTANT: Only use these instruments: ${activeInstruments.join(', ')}. STRICTLY INSTRUMENTAL — no vocals, no singing, no choir, no vocal chops. Maintain strict harmonic cohesion between instruments. Do not add any ghost instruments or unselected backing tracks.`;
      }
      
      this.setSpecialInstruction(instruction);
  }
  
  public notifyUserInteraction(id: string) { 
      this.userInteractionCooldowns.set(id, Date.now()); 
  }

  private scheduleRefresh = throttle(() => { this.refreshSessionPrompts(); }, 1000);

  public sendVocalSignal(signal: string, durationMs: number = 5000) {
    // Vocal signal can now be sent freely regardless of mode or instrument state

    // Ensure VOCALIZATION mode is active if a voice channel is active
    if (this.generationMode !== 'VOCALIZATION' && this.isVocalInstrumentActive()) {
        this.generationMode = 'VOCALIZATION';
        this.dispatchEvent(new CustomEvent('mode-changed-internal', { detail: 'VOCALIZATION' }));
    }

    this.currentVocalSignal = signal;
    this.dispatchEvent(new CustomEvent('vocal-signal-received', { detail: this.currentVocalSignal }));
    this.scheduleRefresh();
    
    if (this.vocalSignalTimer) clearTimeout(this.vocalSignalTimer);
    this.vocalSignalTimer = window.setTimeout(() => {
        this.currentVocalSignal = null;
        this.dispatchEvent(new CustomEvent('vocal-signal-received', { detail: null }));
        this.scheduleRefresh();
    }, durationMs);
  }

  private lastConfig: any = null;
  private lastPrompts: any = null;

  private async refreshSessionPrompts() {
    if (!this.session) return;
    
    // 1. Set Native API Config
    const config: any = {
        musicGenerationMode: this.generationMode,
        bpm: this.bpm,
        guidance: 9.5, // Stronger adherence
        temperature: 0.9,
    };
    
    const scaleMap: any = {
        "C Major": "C_MAJOR_A_MINOR", "A Minor": "C_MAJOR_A_MINOR",
        "D Major": "D_MAJOR_B_MINOR", "B Minor": "D_MAJOR_B_MINOR",
        "F Major": "F_MAJOR_D_MINOR", "D Minor": "F_MAJOR_D_MINOR",
        "G Major": "G_MAJOR_E_MINOR", "E Minor": "G_MAJOR_E_MINOR"
    };
    if (scaleMap[this.key]) {
        config.scale = scaleMap[this.key];
    }

    if (JSON.stringify(config) !== JSON.stringify(this.lastConfig)) {
        try { await this.session.setMusicGenerationConfig({ musicGenerationConfig: config }); this.lastConfig = config; } catch (e) { console.error("setMusicGenerationConfig failed:", e); }
    }

    // 2. Build Simplified, Authentic Prompt
    let narrative = `[GENRE:${this.genre}] [STYLE:${this.style}] [KEY:${this.key}] [TEMPO:${this.bpm}] `;
    narrative += `[AUTHENTICITY:MAX] [CULTURAL_DIALECT:${this.getRegionalLanguage()}] `;
    
    // Inject Evolution Modifiers
    if (this.evolutionValue > 0) {
        narrative += `[COMPLEXITY:HIGH] [EVOLUTION:PROGRESSIVE] [DYNAMICS:DYNAMIC] `;
    } else if (this.evolutionValue < 0) {
        narrative += `[STABLE:TRUE] [EVOLUTION:MINIMAL] [DYNAMICS:STEADY] `;
    } else {
        narrative += `[EVOLUTION:NEUTRAL] `;
    }
    
    if (this.currentVocalSignal) {
        narrative += `[DJ_DIRECTIVE:${this.currentVocalSignal.substring(0, 50).replace(/\s+/g, '_')}] `;
    }
    
    const activeInstruments: string[] = [];
    const keys = ["lead", "alto", "harmonic", "bass", "rhythm"] as const;
    keys.forEach((k) => {
        const ch = this.instruments[k];
        if (ch.active && ch.visible !== false && ch.weight > 0.05) {
            const inst = ch.instrument.toLowerCase();
            const isChoir = inst.includes('choir');
            if (isChoir && this.choirMuted) return;
            if (!isChoir && this.soloMuted && isVocalInstrument(inst)) return;
            
            activeInstruments.push(`${k.toUpperCase()}:${ch.instrument}`);
        }
    });

    if (activeInstruments.length > 0) {
        narrative += `[INSTRUMENTS:${activeInstruments.join(', ')}] `;
    }

    if (this.specialInstruction) {
        narrative += `[CONTEXT:${this.specialInstruction.substring(0, 100).replace(/\s+/g, '_')}] `;
    }

    const finalPayload = [ { text: narrative, weight: 1.0 } ];

    if (this.currentVocalSignal && activeInstruments.length > 0) {
        finalPayload.push({ text: `[FORCE_FOCUS:${activeInstruments.join(', ')}]`, weight: 2.0 });
    }

    const weightedPrompts = Array.from(this.prompts.values()).map((p) => {
        return { text: `[${p.text}]`, weight: p.weight };
    }).filter(p => p.weight > 0.05); 
    
    finalPayload.push(...weightedPrompts);

    if (JSON.stringify(finalPayload) !== JSON.stringify(this.lastPrompts)) {
        try { await this.session.setWeightedPrompts({ weightedPrompts: finalPayload }); this.lastPrompts = finalPayload; } catch (e) { console.error("setWeightedPrompts failed:", e); }
    }
  }
  private getRegionalLanguage(): string {
      const g = this.genre.toLowerCase();
      if (g === 'romanian') return 'Romanian';
      if (g === 'indian') return 'Hindi/Sanskrit';
      if (g === 'spiritual') return 'Liturgical Latin/Greek';
      if (g === 'african') return 'Swahili/Yoruba';
      if (g === 'irish') return 'Irish-Gaelic';
      if (g === 'spanish') return 'Spanish';
      if (g === 'celtic') return 'Celtic';
      if (g === 'oriental') {
          const s = this.style.toLowerCase();
          if (s.includes('japanese')) return 'Japanese';
          if (s.includes('chinese')) return 'Mandarin';
          if (s.includes('arabic')) return 'Arabic';
          return 'Oriental-Phonemes';
      }
      return 'English';
  }

  private getActiveLimit() {
      // Allow all 18 knobs to be used if required by the preset/style
      return 18;
  }

  public getActiveVocalDetails() {
      const activeVocals: string[] = [];
      let hasFemale = false;
      let hasMale = false;
      let hasChoir = false;
      let hasGirl = false;
      let hasBoy = false;

      Object.values(this.instruments).forEach(ch => {
          if (!ch.active || ch.visible === false || !ch.instrument) return;
          if (isVocalInstrument(ch.instrument)) {
              activeVocals.push(ch.instrument);
              const lower = ch.instrument.toLowerCase();
              if (lower.includes('female')) hasFemale = true;
              if (lower.includes('male')) hasMale = true;
              if (lower.includes('choir') || lower.includes('chant') || lower.includes('a cappella')) hasChoir = true;
              if (lower.includes('girl')) hasGirl = true;
              if (lower.includes('boy') || lower.includes('bou')) hasBoy = true;
          }
      });

      return {
          activeVocals,
          hasAny: activeVocals.length > 0,
          hasFemale,
          hasMale,
          hasChoir,
          hasGirl,
          hasBoy
      };
  }

  private getVocalStyleHint(genre: string): string {
      const g = genre.toLowerCase();
      if (g.includes('indian')) return 'in a traditional Indian Hindustani or Carnatic style';
      if (g.includes('irish') || g.includes('celtic')) return 'in a traditional Irish or Celtic folk style';
      if (g.includes('spanish') || g.includes('flamenco')) return 'in a traditional Spanish or Flamenco style';
      if (g.includes('romanian')) return 'in a traditional Romanian or Balkan style';
      return 'in a natural authentic style';
  }

  public generateDjVocalSimulationMessage(stageName?: string): string {
      const details = this.getActiveVocalDetails();
      if (!details.hasAny) return '';

      const stage = (stageName || this.currentStatusMessage || '').toLowerCase();
      const isClimax = stage.includes('chorus') || stage.includes('climax') || stage.includes('drop') || stage.includes('peak');
      const isIntro = stage.includes('intro') || stage.includes('warmup');
      const isOutro = stage.includes('outro') || stage.includes('fade');
      const styleHint = this.getVocalStyleHint(this.genre);

      const cues: string[] = [];
      const addCue = (msg: string) => cues.push(`${msg} ${styleHint}`);

      if (details.hasFemale) {
          if (isClimax) {
              addCue("FEMALE VOCAL: Soaring emotional chorus hook with powerful belt, expressive vibrato, and melodic runs");
              addCue("FEMALE VOCAL: High expressive vocal climax with passionate dynamics and lyrical storytelling");
          } else if (isIntro) {
              addCue("FEMALE VOCAL: Atmospheric melodic humming, soft breathing dynamics, and intimate vocal entrance");
              addCue("FEMALE VOCAL: Gentle vocalise introduction with delicate melodic ornaments");
          } else if (isOutro) {
              addCue("FEMALE VOCAL: Graceful sustained emotional tones, fading melodic vibrato, and gentle vocal resolution");
              addCue("FEMALE VOCAL: Soft acoustic vocal ad-libs gently resolving the melody");
          } else {
              addCue("FEMALE VOCAL: Emotive lead verses with natural human vocal resonance, clear tone, and soulful phrasing");
              addCue("FEMALE VOCAL: Lyrical vocal storytelling singing expressive syllables and melodic hooks");
              addCue("FEMALE VOCAL: Warm chest-to-head voice transitions with authentic human expression");
          }
      }

      if (details.hasMale) {
          if (isClimax) {
              addCue("MALE VOCAL: Soaring tenor climax with impassioned chest resonance and powerful melodic delivery");
              addCue("MALE VOCAL: Dramatic vocal hook with dynamic energy, natural vibrato, and full acoustic presence");
          } else if (isIntro) {
              addCue("MALE VOCAL: Low resonant vocal hums, deep chest tone, and subtle melodic entrance");
              addCue("MALE VOCAL: Atmospheric acoustic vocal murmurs establishing the song motif");
          } else if (isOutro) {
              addCue("MALE VOCAL: Warm baritone sustained notes resolving the harmonic progression gracefully");
              addCue("MALE VOCAL: Quiet vocal hums and gentle acoustic fade");
          } else {
              addCue("MALE VOCAL: Charismatic baritone/tenor verses with rich acoustic chest warmth and clear diction");
              addCue("MALE VOCAL: Soulful melodic phrasing with natural vocal inflection and emotive resonance");
              addCue("MALE VOCAL: Storytelling vocal delivery singing expressive lyrical lines");
          }
      }

      if (details.hasGirl) {
          if (isClimax) {
              addCue("GIRL VOCAL: Clear crystalline soprano soaring on the chorus with pure, bright resonance");
              addCue("GIRL VOCAL: High sweet melodic refrain carrying radiant emotional energy");
          } else {
              addCue("GIRL VOCAL: Delicate young girl soloist singing clear, innocent melodies with pure acoustic timbre");
              addCue("GIRL VOCAL: Sweet crystalline vocal refrains with bright pitch accuracy and gentle expression");
              addCue("GIRL VOCAL: Gentle girl solo voice carrying the primary theme with acoustic purity");
          }
      }

      if (details.hasBoy) {
          if (isClimax) {
              addCue("BOY VOCAL: Soaring treble soloist reaching bell-like acoustic peaks with sacred clarity");
              addCue("BOY VOCAL: Angelic boy soprano singing impassioned melodic lines with pure resonance");
          } else {
              addCue("BOY VOCAL: Angelic boy treble soloist with sacred acoustic clarity, singing pure thematic motifs");
              addCue("BOY VOCAL: Pure treble soloist vocalizing melodic lines with pristine acoustic warmth");
              addCue("BOY VOCAL: Clear bell-like boy soprano melody with delicate breath phrasing");
          }
      }

      if (details.hasChoir) {
          if (isClimax) {
              addCue("CHOIR: Majestic fortissimo choral swell with rich 4-part harmonies and triumphant cathedral polyphony");
              addCue("CHOIR: Powerful full choir harmonic explosion supporting the melodic climax");
          } else if (isIntro) {
              addCue("CHOIR: Ethereal pianissimo vocal pads and gentle cathedral choir hums");
              addCue("CHOIR: Subtle atmospheric chanting and mystical choral hums entering softly");
          } else {
              addCue("CHOIR: Lush multi-part choir harmonies with expansive acoustic polyphony and vocal backing beds");
              addCue("CHOIR: Cathedral choral ensemble singing rich harmonic counterpoint and sacred chants");
              addCue("CHOIR: Expressive backing choir vocal harmonies enriching the acoustic texture");
          }
      }

      if (details.hasFemale && details.hasChoir) {
          addCue("FEMALE + CHOIR: Emotive female lead vocal soaring passionately over lush cathedral backing choir harmonies");
          addCue("FEMALE + CHOIR: Dynamic call-and-response between female soloist and rich polyphonic choir");
      }
      if (details.hasMale && details.hasChoir) {
          addCue("MALE + CHOIR: Resonant male lead vocal supported by expansive 4-part choir harmonies and choral swells");
          addCue("MALE + CHOIR: Dramatic male soloist singing primary melody with majestic choral counterpoint");
      }
      if (details.hasMale && details.hasFemale) {
          addCue("MALE + FEMALE DUET: Soulful vocal duet with interlocking harmonies, expressive call-and-response, and dynamic passion");
      }

      if (cues.length === 0) {
          addCue(`VOICE SIMULATION: Authentic human singing voices for ${details.activeVocals.join(' and ')} with natural vocal cords and expressive dynamics`);
      }

      return cues[Math.floor(Math.random() * cues.length)];
  }

  public toggleSolo(active: boolean) { this.soloMuted = !active; this.scheduleRefresh(); }
  public toggleChoir(active: boolean) { this.choirMuted = !active; this.scheduleRefresh(); }

  public isVocalInstrumentActive(): boolean {
      return Object.values(this.instruments).some(ch => {
          if (!ch.active || ch.visible === false || !ch.instrument) return false;
          
          const inst = ch.instrument.toLowerCase();
          const isChoir = inst.includes('choir');
          
          if (isChoir && this.choirMuted) return false;
          if (!isChoir && this.soloMuted && isVocalInstrument(inst)) return false; // Simple heuristic for solo
          
          return isVocalInstrument(ch.instrument);
      });
  }

  public isSoloActive(): boolean {
      return Object.values(this.instruments).some(ch => {
          if (!ch.active || ch.visible === false || !ch.instrument) return false;
          const inst = ch.instrument.toLowerCase();
          return inst.includes('solo') || inst.includes('violin') || inst.includes('saxophone') || 
                 inst.includes('trumpet') || inst.includes('flute') || inst.includes('harmonica') || 
                 inst.includes('guitar') || inst.includes('cello') || inst.includes('soprano') || 
                 inst.includes('tenor') || inst.includes('soloist') || inst.includes('whistle') || 
                 inst.includes('recorder') || inst.includes('string orchestra') || inst.includes('orchestra');
      });
  }

  public resetKnobsToZero() {
      this.prompts.forEach(p => {
          p.weight = 0;
          p.volume = 0;
      });
      this.dispatchEvent(new CustomEvent('conductor-knobs-update', { detail: this.prompts }));
      this.scheduleRefresh();
  }

  private getNarrativeStructure(genre: string, style: string, totalSec: number): { name: string, type: string, durationPct: number }[] {
      const templates: { name: string, type: string, durationPct: number }[][] = [];
      
      const isClassical = ['Classic', 'Cinematic', 'Spiritual', 'Victorian', 'Renascentist', 'Ambient', 'Oriental', 'Marching'].includes(genre);
      const isJazz = ['Jazz', 'Blues'].includes(genre);
      const isWestern = ['Western', 'Hawaiian'].includes(genre);
      const isElectronic = ['Electronic', 'Gaming'].includes(genre);
      
      // --- Classical / Traditional / Cinematic / Marching ---
      if (isClassical) {
          if (genre === 'Marching') {
               // 1. Parade Approach (Drum Intro)
               templates.push([
                   { name: "Percussion Roll-off", type: 'percussion', durationPct: 0.15 },
                   { name: "Woodwinds/High Brass", type: 'duet', durationPct: 0.2 },
                   { name: "Full Band Inspection", type: 'climax', durationPct: 0.3 },
                   { name: "Drum Break", type: 'percussion', durationPct: 0.15 },
                   { name: "Final Pass", type: 'climax', durationPct: 0.2 }
               ]);
               // 2. Fanfare Approach (Brass Call)
               templates.push([
                   { name: "Trumpet Call", type: 'solo', durationPct: 0.15 },
                   { name: "Brass Response", type: 'build', durationPct: 0.15 },
                   { name: "Regimental March", type: 'main', durationPct: 0.4 },
                   { name: "Victory Flourish", type: 'climax', durationPct: 0.3 }
               ]);
               // 3. Full Attack
               templates.push([
                   { name: "Attention!", type: 'climax', durationPct: 0.1 },
                   { name: "The March", type: 'main', durationPct: 0.4 },
                   { name: "Sectional Feature", type: 'duet', durationPct: 0.2 },
                   { name: "Grand Review", type: 'climax', durationPct: 0.3 }
               ]);
          } else {
              // 1. The Arc (Standard)
              templates.push([
                  { name: "Overture", type: 'intro', durationPct: 0.15 },
                  { name: "Main Theme (Intimate)", type: 'duet', durationPct: 0.20 },
                  { name: "Development", type: 'main', durationPct: 0.25 },
                  { name: "Dramatic Tension", type: 'build', durationPct: 0.15 },
                  { name: "Finale", type: 'climax', durationPct: 0.25 }
              ]);
              // 2. The Concerto (Solo Focus)
              templates.push([
                  { name: "Solo Introduction", type: 'solo', durationPct: 0.2 },
                  { name: "Orchestral Response", type: 'main', durationPct: 0.2 },
                  { name: "Dialogue", type: 'duet', durationPct: 0.2 },
                  { name: "Virtuoso Cadenza", type: 'solo', durationPct: 0.15 },
                  { name: "Tutti Finale", type: 'climax', durationPct: 0.25 }
              ]);
              // 3. In Media Res (Full Start)
              templates.push([
                  { name: "Impact Start", type: 'climax', durationPct: 0.15 },
                  { name: "Receding Tide", type: 'breakdown', durationPct: 0.2 },
                  { name: "Rebuilding", type: 'build', durationPct: 0.25 },
                  { name: "Theme Return", type: 'main', durationPct: 0.4 }
              ]);
              // 4. Slow Burn (Ambient/Spiritual)
              templates.push([
                  { name: "Drone/Atmosphere", type: 'intro', durationPct: 0.25 },
                  { name: "Whispers", type: 'duet', durationPct: 0.25 },
                  { name: "Awakening", type: 'main', durationPct: 0.25 },
                  { name: "Ascension", type: 'climax', durationPct: 0.25 }
              ]);
          }
      } 
      // --- Western / Hawaiian ---
      else if (isWestern) {
          // 1. Cowboy Ballad (Slow, storytelling)
          templates.push([
              { name: "Lonesome Intro", type: 'intro', durationPct: 0.15 },
              { name: "Campfire Verse", type: 'main', durationPct: 0.25 },
              { name: "Trail Ride", type: 'groove', durationPct: 0.2 },
              { name: "Sunset Chorus", type: 'climax', durationPct: 0.25 },
              { name: "Fade to Prairie", type: 'outro', durationPct: 0.15 }
          ]);
          // 2. Bluegrass Hoedown (Fast, energetic)
          templates.push([
              { name: "Banjo Pickin'", type: 'intro', durationPct: 0.1 },
              { name: "Fiddle Tune", type: 'main', durationPct: 0.25 },
              { name: "Barn Dance", type: 'groove', durationPct: 0.25 },
              { name: "Hoedown Finale", type: 'climax', durationPct: 0.25 },
              { name: "Goodnight Y'all", type: 'outro', durationPct: 0.15 }
          ]);
          // 3. Spaghetti Western (Cinematic, dramatic)
          templates.push([
              { name: "Desert Wind", type: 'intro', durationPct: 0.2 },
              { name: "Gunfighter's Theme", type: 'main', durationPct: 0.25 },
              { name: "Showdown at Noon", type: 'build', durationPct: 0.2 },
              { name: "Final Duel", type: 'climax', durationPct: 0.25 },
              { name: "Ride into Sunset", type: 'outro', durationPct: 0.1 }
          ]);
      }
      // --- Jazz / Blues ---
      else if (isJazz) {
          // 1. Standard Jazz Form
          templates.push([
              { name: "Intro", type: 'intro', durationPct: 0.1 },
              { name: "Head", type: 'main', durationPct: 0.2 },
              { name: "Solo 1", type: 'solo', durationPct: 0.2 },
              { name: "Solo 2", type: 'solo', durationPct: 0.2 },
              { name: "Head Out", type: 'climax', durationPct: 0.3 }
          ]);
          // 2. Trading Fours
          templates.push([
              { name: "Rhythm Start", type: 'groove', durationPct: 0.15 },
              { name: "Head", type: 'main', durationPct: 0.25 },
              { name: "Call & Response", type: 'duet', durationPct: 0.25 },
              { name: "Collective Improv", type: 'climax', durationPct: 0.2 },
              { name: "Cool Down", type: 'outro', durationPct: 0.15 }
          ]);
          // 3. Ballad (Feature)
          templates.push([
              { name: "Rubato Intro", type: 'solo', durationPct: 0.15 },
              { name: "Ballad Theme", type: 'duet', durationPct: 0.35 },
              { name: "Double Time Feel", type: 'main', durationPct: 0.3 },
              { name: "Outro", type: 'outro', durationPct: 0.2 }
          ]);
      } 
      // --- Pop / Rock / Electronic / Others ---
      else {
          // 1. Verse-Chorus Standard
          templates.push([
              { name: "Intro", type: 'intro', durationPct: 0.1 },
              { name: "Verse 1", type: 'verse', durationPct: 0.15 },
              { name: "Chorus", type: 'chorus', durationPct: 0.15 },
              { name: "Verse 2", type: 'verse', durationPct: 0.15 },
              { name: "Bridge", type: 'breakdown', durationPct: 0.15 },
              { name: "Chorus Out", type: 'climax', durationPct: 0.3 }
          ]);
          // 2. The Build-Up (Electronic style)
          templates.push([
              { name: "Atmosphere", type: 'intro', durationPct: 0.15 },
              { name: "The Pulse", type: 'groove', durationPct: 0.2 },
              { name: "The Rise", type: 'build', durationPct: 0.2 },
              { name: "THE DROP", type: 'climax', durationPct: 0.3 },
              { name: "Outro", type: 'outro', durationPct: 0.15 }
          ]);
          // 3. Instrumental Breakdown
          templates.push([
              { name: "Riff Intro", type: 'main', durationPct: 0.15 },
              { name: "Jam Section", type: 'main', durationPct: 0.25 },
              { name: "Solo Feature", type: 'solo', durationPct: 0.2 },
              { name: "Drum/Bass Break", type: 'percussion', durationPct: 0.15 },
              { name: "Final Push", type: 'climax', durationPct: 0.25 }
          ]);
      }

      // Random selection
      return templates[Math.floor(Math.random() * templates.length)];
  }

  public generatePerformancePlan(startOffset: number = 0) {
      this.currentPlan = [];
      const totalSec = this.maxDurationMinutes * 60;
      
      // Get all available keys based on visibility (user preferences in RightSidebar)
      const availableKeys = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'].filter(k => 
          this.instruments[k as keyof InstrumentSet].visible !== false
      ) as Array<keyof InstrumentSet>;
      
      if (availableKeys.length === 0) return;

      // If starting mid-stream (takeover), use the improvisation logic
      if (startOffset >= 5) {
          this.generateImprovPlan(startOffset, totalSec, availableKeys);
          return;
      }

      // --- STORY GENERATION MODE ---
      
      // 1. Get Narrative Structure (Randomized based on Genre)
      const story = this.getNarrativeStructure(this.genre, this.style, totalSec);

      // 2. Build Stages
      let currentTime = 0;
      story.forEach(seg => {
          // Normalize duration to avoid rounding gaps, though addStage handles timing
          const dur = seg.durationPct * totalSec;
          this.addStage(currentTime, seg.name, availableKeys, seg.type);
          currentTime += dur;
      });
      
      this.currentPlanIdx = 0;
  }

  private generateImprovPlan(startTime: number, totalSec: number, enabledKeys: Array<keyof InstrumentSet>) {
      // Improvisation / Takeover Plan (Mid-Stream)
      let currentTime = startTime;
      
      // Immediate Takeover Stage: Respect current activity mostly but transition
      this.addStage(currentTime, "DJ Takeover", enabledKeys, 'groove'); 
      
      currentTime += 8; // Quick takeover transition time

      // Generate variety blocks until near end
      const remainingTime = totalSec - currentTime;
      const blockDuration = Math.max(15, Math.min(30, remainingTime / 4)); 
      
      while (currentTime < totalSec - 10) {
          const typeRoll = Math.random();
          let name = "Improv Mix";
          let type = 'main';
          
          if (typeRoll < 0.25 && enabledKeys.length >= 1) { name = "Solo Feature"; type = 'solo'; }
          else if (typeRoll < 0.5 && enabledKeys.length >= 2) { name = "Duet Session"; type = 'duet'; }
          else if (typeRoll < 0.75) { name = "Groove Breakdown"; type = 'breakdown'; }
          
          this.addStage(currentTime, name, enabledKeys, type);
          currentTime += blockDuration;
      }

      // Ensure Outro if we have time
      if (currentTime < totalSec) {
          this.addStage(currentTime, "Fade Out", enabledKeys, 'outro');
      }
  }

  // === GENRE KNOB DATABANK ===
  // Musical instruction profiles for each genre — defines appropriate knob ranges
  // Format: { knob: [min, max, default] } — DJ interpolates within these bounds
  private static readonly GENRE_KNOB_PROFILES: Record<string, Record<string, [number, number, number]>> = {
      'Jazz': {
          'Guidance': [0.8, 1.5, 1.2], 'Authenticity': [0.8, 1.5, 1.0], 'Organic': [0.8, 1.5, 1.2],
          'Dynamics': [0.6, 1.4, 1.0], 'Presence': [0.6, 1.2, 0.9], 'Space': [0.4, 1.0, 0.7],
          'Width': [0.3, 0.8, 0.5], 'Brightness': [0.3, 0.8, 0.5], 'Texture': [0.3, 0.8, 0.5],
          'Atmosphere': [0.4, 1.0, 0.6], 'Groove': [0.8, 1.5, 1.2], 'Complexity': [0.5, 1.2, 0.8],
          'Ornamentation': [0.3, 0.9, 0.6], 'Variation': [0.2, 0.8, 0.4], 'Density': [0.2, 0.7, 0.4],
          'Attack': [0.1, 0.5, 0.3], 'Staccato': [0.0, 0.4, 0.2], 'Glide': [0.2, 0.8, 0.5]
      },
      'Blues': {
          'Guidance': [0.8, 1.5, 1.2], 'Authenticity': [1.0, 1.8, 1.4], 'Organic': [1.0, 1.6, 1.3],
          'Dynamics': [0.7, 1.4, 1.0], 'Presence': [0.7, 1.3, 1.0], 'Space': [0.5, 1.1, 0.8],
          'Width': [0.3, 0.7, 0.5], 'Brightness': [0.2, 0.6, 0.4], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.5, 1.0, 0.7], 'Groove': [0.9, 1.5, 1.2], 'Complexity': [0.3, 0.8, 0.5],
          'Ornamentation': [0.4, 1.0, 0.7], 'Variation': [0.2, 0.6, 0.4], 'Density': [0.2, 0.6, 0.4],
          'Attack': [0.2, 0.6, 0.4], 'Staccato': [0.0, 0.3, 0.1], 'Glide': [0.3, 0.9, 0.6]
      },
      'Western': {
          'Guidance': [0.9, 1.6, 1.3], 'Authenticity': [1.2, 1.8, 1.5], 'Organic': [1.0, 1.6, 1.4],
          'Dynamics': [0.5, 1.2, 0.8], 'Presence': [0.6, 1.2, 0.9], 'Space': [0.8, 1.5, 1.2],
          'Width': [0.4, 0.9, 0.6], 'Brightness': [0.3, 0.7, 0.5], 'Texture': [0.2, 0.6, 0.4],
          'Atmosphere': [0.6, 1.2, 0.9], 'Groove': [0.5, 1.0, 0.7], 'Complexity': [0.2, 0.6, 0.4],
          'Ornamentation': [0.3, 0.8, 0.5], 'Variation': [0.2, 0.6, 0.4], 'Density': [0.1, 0.5, 0.3],
          'Attack': [0.1, 0.4, 0.2], 'Staccato': [0.0, 0.3, 0.1], 'Glide': [0.4, 1.0, 0.7]
      },
      'Hawaiian': {
          'Guidance': [0.9, 1.6, 1.3], 'Authenticity': [1.2, 1.8, 1.5], 'Organic': [1.0, 1.6, 1.4],
          'Dynamics': [0.4, 1.0, 0.7], 'Presence': [0.5, 1.1, 0.8], 'Space': [0.9, 1.5, 1.2],
          'Width': [0.4, 0.9, 0.6], 'Brightness': [0.4, 0.8, 0.6], 'Texture': [0.2, 0.5, 0.3],
          'Atmosphere': [0.7, 1.3, 1.0], 'Groove': [0.4, 0.9, 0.6], 'Complexity': [0.1, 0.5, 0.3],
          'Ornamentation': [0.2, 0.6, 0.4], 'Variation': [0.1, 0.5, 0.3], 'Density': [0.1, 0.4, 0.2],
          'Attack': [0.0, 0.3, 0.1], 'Staccato': [0.0, 0.2, 0.1], 'Glide': [0.5, 1.1, 0.8]
      },
      'Electronic': {
          'Guidance': [0.8, 1.4, 1.1], 'Authenticity': [0.3, 0.8, 0.5], 'Organic': [0.2, 0.6, 0.4],
          'Dynamics': [0.8, 1.5, 1.2], 'Presence': [0.7, 1.4, 1.0], 'Space': [0.3, 0.8, 0.5],
          'Width': [0.5, 1.2, 0.8], 'Brightness': [0.5, 1.2, 0.8], 'Texture': [0.6, 1.3, 0.9],
          'Atmosphere': [0.4, 1.0, 0.7], 'Groove': [0.8, 1.5, 1.2], 'Complexity': [0.4, 1.0, 0.7],
          'Ornamentation': [0.2, 0.7, 0.4], 'Variation': [0.4, 1.0, 0.7], 'Density': [0.6, 1.3, 1.0],
          'Attack': [0.5, 1.2, 0.8], 'Staccato': [0.3, 0.9, 0.6], 'Glide': [0.2, 0.7, 0.4]
      },
      'Gaming': {
          'Guidance': [0.8, 1.4, 1.1], 'Authenticity': [0.4, 0.9, 0.6], 'Organic': [0.3, 0.7, 0.5],
          'Dynamics': [0.9, 1.6, 1.3], 'Presence': [0.8, 1.5, 1.1], 'Space': [0.4, 0.9, 0.6],
          'Width': [0.6, 1.3, 0.9], 'Brightness': [0.5, 1.1, 0.8], 'Texture': [0.5, 1.2, 0.8],
          'Atmosphere': [0.5, 1.1, 0.8], 'Groove': [0.7, 1.4, 1.0], 'Complexity': [0.5, 1.1, 0.8],
          'Ornamentation': [0.3, 0.8, 0.5], 'Variation': [0.5, 1.1, 0.8], 'Density': [0.5, 1.2, 0.9],
          'Attack': [0.6, 1.3, 0.9], 'Staccato': [0.4, 1.0, 0.7], 'Glide': [0.3, 0.8, 0.5]
      },
      'Rock': {
          'Guidance': [0.9, 1.5, 1.2], 'Authenticity': [0.6, 1.2, 0.9], 'Organic': [0.5, 1.1, 0.8],
          'Dynamics': [1.0, 1.6, 1.3], 'Presence': [0.9, 1.5, 1.2], 'Space': [0.3, 0.7, 0.5],
          'Width': [0.6, 1.2, 0.9], 'Brightness': [0.6, 1.2, 0.9], 'Texture': [0.5, 1.0, 0.7],
          'Atmosphere': [0.3, 0.8, 0.5], 'Groove': [0.7, 1.3, 1.0], 'Complexity': [0.4, 0.9, 0.6],
          'Ornamentation': [0.3, 0.7, 0.5], 'Variation': [0.3, 0.8, 0.5], 'Density': [0.6, 1.2, 0.9],
          'Attack': [0.7, 1.4, 1.0], 'Staccato': [0.4, 0.9, 0.6], 'Glide': [0.1, 0.5, 0.3]
      },
      'Pop': {
          'Guidance': [0.9, 1.5, 1.2], 'Authenticity': [0.5, 1.0, 0.7], 'Organic': [0.4, 0.9, 0.6],
          'Dynamics': [0.8, 1.4, 1.1], 'Presence': [0.8, 1.4, 1.1], 'Space': [0.4, 0.8, 0.6],
          'Width': [0.5, 1.1, 0.8], 'Brightness': [0.6, 1.2, 0.9], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.4, 0.9, 0.6], 'Groove': [0.8, 1.4, 1.1], 'Complexity': [0.3, 0.8, 0.5],
          'Ornamentation': [0.3, 0.7, 0.5], 'Variation': [0.4, 0.9, 0.6], 'Density': [0.5, 1.0, 0.7],
          'Attack': [0.5, 1.0, 0.7], 'Staccato': [0.3, 0.7, 0.5], 'Glide': [0.3, 0.7, 0.5]
      },
      'Classic': {
          'Guidance': [1.0, 1.8, 1.4], 'Authenticity': [1.4, 2.0, 1.7], 'Organic': [1.2, 1.8, 1.5],
          'Dynamics': [0.6, 1.4, 1.0], 'Presence': [0.7, 1.3, 1.0], 'Space': [0.8, 1.5, 1.2],
          'Width': [0.7, 1.4, 1.0], 'Brightness': [0.4, 0.9, 0.6], 'Texture': [0.5, 1.0, 0.7],
          'Atmosphere': [0.7, 1.4, 1.0], 'Groove': [0.3, 0.8, 0.5], 'Complexity': [0.6, 1.3, 0.9],
          'Ornamentation': [0.5, 1.1, 0.8], 'Variation': [0.3, 0.8, 0.5], 'Density': [0.3, 0.8, 0.5],
          'Attack': [0.2, 0.6, 0.4], 'Staccato': [0.2, 0.6, 0.4], 'Glide': [0.5, 1.1, 0.8]
      },
      'Opera': {
          'Guidance': [1.1, 1.8, 1.5], 'Authenticity': [1.5, 2.0, 1.8], 'Organic': [1.3, 1.8, 1.6],
          'Dynamics': [0.8, 1.6, 1.2], 'Presence': [0.9, 1.5, 1.2], 'Space': [0.9, 1.6, 1.3],
          'Width': [0.8, 1.5, 1.1], 'Brightness': [0.5, 1.0, 0.7], 'Texture': [0.6, 1.1, 0.8],
          'Atmosphere': [0.8, 1.5, 1.1], 'Groove': [0.2, 0.6, 0.4], 'Complexity': [0.7, 1.4, 1.0],
          'Ornamentation': [0.6, 1.2, 0.9], 'Variation': [0.4, 0.9, 0.6], 'Density': [0.4, 0.9, 0.6],
          'Attack': [0.3, 0.7, 0.5], 'Staccato': [0.2, 0.6, 0.4], 'Glide': [0.6, 1.2, 0.9]
      },
      'Marching': {
          'Guidance': [1.0, 1.7, 1.4], 'Authenticity': [1.3, 1.9, 1.6], 'Organic': [0.8, 1.4, 1.1],
          'Dynamics': [0.9, 1.6, 1.3], 'Presence': [1.0, 1.6, 1.3], 'Space': [0.5, 1.0, 0.7],
          'Width': [0.8, 1.4, 1.1], 'Brightness': [0.6, 1.1, 0.8], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.4, 0.9, 0.6], 'Groove': [0.8, 1.4, 1.1], 'Complexity': [0.4, 0.9, 0.6],
          'Ornamentation': [0.3, 0.8, 0.5], 'Variation': [0.2, 0.6, 0.4], 'Density': [0.6, 1.2, 0.9],
          'Attack': [0.7, 1.3, 1.0], 'Staccato': [0.6, 1.2, 0.9], 'Glide': [0.1, 0.4, 0.2]
      },
      'Ambient': {
          'Guidance': [0.8, 1.4, 1.1], 'Authenticity': [0.9, 1.6, 1.3], 'Organic': [1.0, 1.7, 1.4],
          'Dynamics': [0.3, 0.9, 0.6], 'Presence': [0.4, 1.0, 0.7], 'Space': [1.0, 1.8, 1.5],
          'Width': [0.7, 1.4, 1.0], 'Brightness': [0.2, 0.6, 0.4], 'Texture': [0.6, 1.2, 0.9],
          'Atmosphere': [0.9, 1.6, 1.3], 'Groove': [0.1, 0.5, 0.3], 'Complexity': [0.3, 0.8, 0.5],
          'Ornamentation': [0.2, 0.6, 0.4], 'Variation': [0.3, 0.8, 0.5], 'Density': [0.1, 0.5, 0.3],
          'Attack': [0.0, 0.3, 0.1], 'Staccato': [0.0, 0.2, 0.1], 'Glide': [0.7, 1.4, 1.0]
      },
      'Spiritual': {
          'Guidance': [1.0, 1.7, 1.4], 'Authenticity': [1.4, 2.0, 1.7], 'Organic': [1.2, 1.8, 1.5],
          'Dynamics': [0.4, 1.0, 0.7], 'Presence': [0.6, 1.2, 0.9], 'Space': [1.0, 1.7, 1.4],
          'Width': [0.6, 1.2, 0.9], 'Brightness': [0.3, 0.7, 0.5], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.9, 1.6, 1.3], 'Groove': [0.2, 0.6, 0.4], 'Complexity': [0.4, 0.9, 0.6],
          'Ornamentation': [0.4, 0.9, 0.6], 'Variation': [0.2, 0.6, 0.4], 'Density': [0.2, 0.6, 0.4],
          'Attack': [0.1, 0.4, 0.2], 'Staccato': [0.0, 0.3, 0.1], 'Glide': [0.6, 1.2, 0.9]
      },
      'African': {
          'Guidance': [0.9, 1.6, 1.3], 'Authenticity': [1.2, 1.8, 1.5], 'Organic': [1.1, 1.7, 1.4],
          'Dynamics': [0.7, 1.4, 1.0], 'Presence': [0.7, 1.3, 1.0], 'Space': [0.6, 1.2, 0.9],
          'Width': [0.4, 0.9, 0.6], 'Brightness': [0.5, 1.0, 0.7], 'Texture': [0.5, 1.0, 0.7],
          'Atmosphere': [0.6, 1.2, 0.9], 'Groove': [1.0, 1.6, 1.3], 'Complexity': [0.5, 1.0, 0.7],
          'Ornamentation': [0.4, 0.9, 0.6], 'Variation': [0.4, 0.9, 0.6], 'Density': [0.4, 0.9, 0.6],
          'Attack': [0.4, 0.9, 0.6], 'Staccato': [0.3, 0.8, 0.5], 'Glide': [0.3, 0.8, 0.5]
      },
      'Indian': {
          'Guidance': [1.0, 1.7, 1.4], 'Authenticity': [1.3, 1.9, 1.6], 'Organic': [1.1, 1.7, 1.4],
          'Dynamics': [0.5, 1.1, 0.8], 'Presence': [0.7, 1.3, 1.0], 'Space': [0.7, 1.4, 1.0],
          'Width': [0.5, 1.0, 0.7], 'Brightness': [0.4, 0.9, 0.6], 'Texture': [0.5, 1.0, 0.7],
          'Atmosphere': [0.7, 1.3, 1.0], 'Groove': [0.6, 1.2, 0.9], 'Complexity': [0.6, 1.2, 0.9],
          'Ornamentation': [0.6, 1.2, 0.9], 'Variation': [0.4, 0.9, 0.6], 'Density': [0.3, 0.7, 0.5],
          'Attack': [0.2, 0.6, 0.4], 'Staccato': [0.1, 0.5, 0.3], 'Glide': [0.5, 1.1, 0.8]
      },
      'Irish': {
          'Guidance': [0.9, 1.6, 1.3], 'Authenticity': [1.2, 1.8, 1.5], 'Organic': [1.1, 1.7, 1.4],
          'Dynamics': [0.6, 1.3, 0.9], 'Presence': [0.7, 1.3, 1.0], 'Space': [0.7, 1.3, 1.0],
          'Width': [0.4, 0.9, 0.6], 'Brightness': [0.5, 1.0, 0.7], 'Texture': [0.3, 0.8, 0.5],
          'Atmosphere': [0.6, 1.2, 0.9], 'Groove': [0.7, 1.3, 1.0], 'Complexity': [0.4, 0.9, 0.6],
          'Ornamentation': [0.5, 1.0, 0.7], 'Variation': [0.3, 0.8, 0.5], 'Density': [0.3, 0.7, 0.5],
          'Attack': [0.3, 0.7, 0.5], 'Staccato': [0.2, 0.6, 0.4], 'Glide': [0.4, 0.9, 0.6]
      },
      'Spanish': {
          'Guidance': [0.9, 1.6, 1.3], 'Authenticity': [1.2, 1.8, 1.5], 'Organic': [1.0, 1.6, 1.3],
          'Dynamics': [0.7, 1.4, 1.0], 'Presence': [0.8, 1.4, 1.1], 'Space': [0.6, 1.2, 0.9],
          'Width': [0.5, 1.0, 0.7], 'Brightness': [0.5, 1.0, 0.7], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.6, 1.2, 0.9], 'Groove': [0.8, 1.4, 1.1], 'Complexity': [0.5, 1.0, 0.7],
          'Ornamentation': [0.5, 1.0, 0.7], 'Variation': [0.4, 0.9, 0.6], 'Density': [0.4, 0.8, 0.6],
          'Attack': [0.4, 0.9, 0.6], 'Staccato': [0.3, 0.8, 0.5], 'Glide': [0.4, 0.9, 0.6]
      },
      'Oriental': {
          'Guidance': [1.0, 1.7, 1.4], 'Authenticity': [1.3, 1.9, 1.6], 'Organic': [1.1, 1.7, 1.4],
          'Dynamics': [0.4, 1.0, 0.7], 'Presence': [0.6, 1.2, 0.9], 'Space': [0.8, 1.5, 1.2],
          'Width': [0.5, 1.0, 0.7], 'Brightness': [0.3, 0.8, 0.5], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.8, 1.4, 1.1], 'Groove': [0.4, 0.9, 0.6], 'Complexity': [0.5, 1.0, 0.7],
          'Ornamentation': [0.5, 1.0, 0.7], 'Variation': [0.3, 0.7, 0.5], 'Density': [0.2, 0.6, 0.4],
          'Attack': [0.1, 0.5, 0.3], 'Staccato': [0.1, 0.4, 0.2], 'Glide': [0.6, 1.2, 0.9]
      },
      'Romanian': {
          'Guidance': [0.9, 1.6, 1.3], 'Authenticity': [1.2, 1.8, 1.5], 'Organic': [1.1, 1.7, 1.4],
          'Dynamics': [0.6, 1.3, 0.9], 'Presence': [0.7, 1.3, 1.0], 'Space': [0.7, 1.3, 1.0],
          'Width': [0.4, 0.9, 0.6], 'Brightness': [0.4, 0.9, 0.6], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.6, 1.2, 0.9], 'Groove': [0.7, 1.3, 1.0], 'Complexity': [0.5, 1.0, 0.7],
          'Ornamentation': [0.5, 1.0, 0.7], 'Variation': [0.4, 0.9, 0.6], 'Density': [0.3, 0.7, 0.5],
          'Attack': [0.3, 0.7, 0.5], 'Staccato': [0.2, 0.6, 0.4], 'Glide': [0.4, 0.9, 0.6]
      },
      'Victorian': {
          'Guidance': [1.0, 1.7, 1.4], 'Authenticity': [1.3, 1.9, 1.6], 'Organic': [1.0, 1.6, 1.3],
          'Dynamics': [0.6, 1.3, 0.9], 'Presence': [0.7, 1.3, 1.0], 'Space': [0.8, 1.4, 1.1],
          'Width': [0.6, 1.2, 0.9], 'Brightness': [0.4, 0.9, 0.6], 'Texture': [0.5, 1.0, 0.7],
          'Atmosphere': [0.7, 1.3, 1.0], 'Groove': [0.4, 0.9, 0.6], 'Complexity': [0.5, 1.0, 0.7],
          'Ornamentation': [0.5, 1.0, 0.7], 'Variation': [0.3, 0.7, 0.5], 'Density': [0.3, 0.7, 0.5],
          'Attack': [0.2, 0.6, 0.4], 'Staccato': [0.2, 0.6, 0.4], 'Glide': [0.5, 1.0, 0.7]
      },
      'Renascentist': {
          'Guidance': [1.0, 1.7, 1.4], 'Authenticity': [1.4, 2.0, 1.7], 'Organic': [1.1, 1.7, 1.4],
          'Dynamics': [0.5, 1.1, 0.8], 'Presence': [0.6, 1.2, 0.9], 'Space': [0.9, 1.5, 1.2],
          'Width': [0.5, 1.0, 0.7], 'Brightness': [0.4, 0.8, 0.6], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.8, 1.4, 1.1], 'Groove': [0.3, 0.7, 0.5], 'Complexity': [0.5, 1.0, 0.7],
          'Ornamentation': [0.5, 1.0, 0.7], 'Variation': [0.2, 0.6, 0.4], 'Density': [0.2, 0.6, 0.4],
          'Attack': [0.1, 0.5, 0.3], 'Staccato': [0.1, 0.4, 0.2], 'Glide': [0.5, 1.1, 0.8]
      }
  };

  // Stage modifiers — how much to adjust from the genre default for each stage type
  private static readonly STAGE_MODIFIERS: Record<string, Record<string, number>> = {
      'intro':      { 'Density': -0.3, 'Dynamics': -0.3, 'Space': +0.3, 'Atmosphere': +0.3, 'Brightness': -0.2, 'Attack': -0.2 },
      'percussion': { 'Groove': +0.5, 'Attack': +0.4, 'Density': +0.3, 'Dynamics': +0.3, 'Staccato': +0.3 },
      'verse':      { 'Groove': +0.2, 'Dynamics': +0.1, 'Presence': +0.1, 'Density': +0.1, 'Variation': +0.1 },
      'main':       { 'Groove': +0.2, 'Dynamics': +0.1, 'Presence': +0.1, 'Density': +0.1, 'Variation': +0.1 },
      'chorus':     { 'Dynamics': +0.5, 'Width': +0.4, 'Brightness': +0.3, 'Density': +0.3, 'Presence': +0.4, 'Attack': +0.3, 'Atmosphere': +0.2 },
      'climax':     { 'Dynamics': +0.5, 'Width': +0.4, 'Brightness': +0.3, 'Density': +0.3, 'Presence': +0.4, 'Attack': +0.3, 'Atmosphere': +0.2 },
      'build':      { 'Dynamics': +0.3, 'Density': +0.2, 'Atmosphere': +0.3, 'Variation': +0.2, 'Presence': +0.2 },
      'solo':       { 'Presence': +0.5, 'Ornamentation': +0.4, 'Dynamics': +0.3, 'Space': -0.1, 'Authenticity': +0.3, 'Organic': +0.3 },
      'duet':       { 'Presence': +0.3, 'Space': +0.2, 'Dynamics': +0.2, 'Organic': +0.2, 'Authenticity': +0.2 },
      'breakdown':  { 'Density': -0.4, 'Space': +0.4, 'Atmosphere': +0.4, 'Dynamics': -0.3, 'Brightness': -0.3, 'Attack': -0.3 },
      'groove':     { 'Groove': +0.5, 'Density': +0.3, 'Attack': +0.2, 'Dynamics': +0.2, 'Staccato': +0.2 },
      'outro':      { 'Space': +0.5, 'Atmosphere': +0.5, 'Dynamics': -0.4, 'Density': -0.4, 'Brightness': -0.3, 'Glide': +0.3 }
  };

  private getKnobTargetsForStage(type: string): { parameterName: string; targetValue: number }[] {
      const g = this.genre;
      const profile = LiveMusicHelper.GENRE_KNOB_PROFILES[g] || LiveMusicHelper.GENRE_KNOB_PROFILES['Pop'];
      const stageMod = LiveMusicHelper.STAGE_MODIFIERS[type] || {};

      const merged: Record<string, number> = {};

      // Apply genre profile defaults + stage modifiers
      Object.entries(profile).forEach(([knob, [min, max, defaultVal]]) => {
          const modifier = stageMod[knob] || 0;
          let value = defaultVal + modifier;
          // Clamp to genre-appropriate range
          value = Math.max(min, Math.min(max, value));
          merged[knob] = value;
      });

      // === CACOPHONY PREVENTION ===
      // Mutual exclusion: Density vs Space
      if (merged['Density'] > 0.7 && merged['Space'] > 0.7) {
          if (merged['Density'] > merged['Space']) merged['Space'] = 0.4;
          else merged['Density'] = 0.4;
      }
      // Brightness vs Atmosphere
      if (merged['Brightness'] > 0.8 && merged['Atmosphere'] > 0.8) {
          merged['Brightness'] = 0.6;
      }
      // Attack vs Glide
      if (merged['Attack'] > 0.7 && merged['Glide'] > 0.5) {
          merged['Glide'] = 0.3;
      }
      // Staccato vs Glide
      if (merged['Staccato'] > 0.5 && merged['Glide'] > 0.3) {
          merged['Glide'] = 0.2;
      }

      // Limit active knobs
      const MAX_ACTIVE_KNOBS = 8;
      const activeKnobs = Object.entries(merged).filter(([_, v]) => v > 0.3);
      if (activeKnobs.length > MAX_ACTIVE_KNOBS) {
          const sorted = activeKnobs.sort((a, b) => b[1] - a[1]);
          sorted.slice(MAX_ACTIVE_KNOBS).forEach(([k]) => { merged[k] = 0; });
      }

      // Ensure harmonic foundation
      merged['Guidance'] = Math.max(merged['Guidance'] || 0, 0.8);

      return Object.entries(merged)
          .filter(([_, v]) => v > 0.05)
          .map(([parameterName, targetValue]) => ({ parameterName, targetValue }));
  }

  private addStage(time: number, name: string, availableKeys: Array<keyof InstrumentSet>, type: string) {
      const stage: PerformancePlanStage = {
          stageName: name,
          stageStartTimeSec: time,
          activeChannels: { lead: false, alto: false, harmonic: false, bass: false, rhythm: false },
          channelWeights: { lead: 0, alto: 0, harmonic: 0, bass: 0, rhythm: 0 },
          targets: this.getKnobTargetsForStage(type)
      };

      const setStrict = (keys: Array<keyof InstrumentSet>, weight: number = 1.0) => {
          // Reset all first
          (['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const).forEach(k => {
              stage.activeChannels[k] = false;
              stage.channelWeights[k] = 0;
          });
          
          // Apply dynamic gain scaling to prevent clipping (distortion)
          // If 3+ channels are active, reduce weight to share headroom
          const activeCount = keys.length;
          const effectiveWeight = activeCount > 2 ? weight * (2 / activeCount) : weight;

          // Enable specific
          keys.forEach(k => {
              if (availableKeys.includes(k)) {
                  stage.activeChannels[k] = true;
                  stage.channelWeights[k] = effectiveWeight;
              }
          });
      };

      // Helper to get random from available
      const pick = (arr: Array<keyof InstrumentSet>) => {
          const valid = arr.filter(k => availableKeys.includes(k));
          return valid[Math.floor(Math.random() * valid.length)];
      };

      switch (type) {
          case 'intro':
              // Sparse: Harmonic or Rhythm or Lead solo
              if (availableKeys.includes('harmonic')) setStrict(['harmonic'], 0.8);
              else if (availableKeys.includes('lead')) setStrict(['lead'], 0.8);
              else setStrict([availableKeys[0]], 0.8);
              break;

          case 'percussion':
              // Drum/Percussion Only
              {
                  const drums = availableKeys.filter(k => k === 'rhythm');
                  if (drums.length > 0) setStrict(drums, 1.2);
                  else {
                      // Fallback to bass groove or generic intro if no rhythm channel
                      const groove = availableKeys.filter(k => k === 'bass');
                      setStrict(groove.length > 0 ? groove : [availableKeys[0]], 1.0);
                  }
              }
              break;

          case 'verse':
          case 'main':
              // Standard: Rhythm section + Lead OR Alto (avoid muddy melody)
              {
                  const section = ['bass', 'rhythm', 'harmonic'] as Array<keyof InstrumentSet>;
                  const melody = availableKeys.includes('lead') ? 'lead' : (availableKeys.includes('alto') ? 'alto' : null);
                  if (melody) section.push(melody);
                  setStrict(section, 1.0);
              }
              break;

          case 'chorus':
          case 'climax':
          case 'build':
              // Full: All available
              setStrict(availableKeys, 1.0);
              break;

          case 'solo':
              // STRICTLY ONE instrument + quiet backing
              {
                  const soloist = pick(['lead', 'alto', 'harmonic', 'bass']);
                  if (soloist) {
                      stage.stageName = `${this.instruments[soloist].instrument} Solo`;
                      // Backing
                      const backing = availableKeys.filter(k => k !== soloist && (k === 'bass' || k === 'rhythm' || k === 'harmonic'));
                      setStrict([soloist, ...backing], 1.0);
                      // Soloist gets 1.2, backing gets 0.5
                      stage.channelWeights[soloist] = 1.2;
                      backing.forEach(k => stage.channelWeights[k] = 0.5); // Quiet backing
                  }
              }
              break;

          case 'duet':
              // STRICTLY TWO instruments
              {
                  const options = availableKeys.filter(k => k !== 'rhythm'); // Prefer melodic instruments for duet
                  if (options.length >= 2) {
                      const k1 = options[0];
                      const k2 = options[1];
                      setStrict([k1, k2], 1.1);
                  } else if (availableKeys.length >= 2) {
                      setStrict([availableKeys[0], availableKeys[1]], 1.1);
                  } else {
                      setStrict(availableKeys, 1.0); // Fallback
                  }
              }
              break;

          case 'breakdown':
              // Remove Rhythm or Bass, focus on Harmonic/Alto
              {
                  const bridgeKeys = availableKeys.filter(k => k !== 'rhythm' && k !== 'lead');
                  if (bridgeKeys.length > 0) setStrict(bridgeKeys, 0.9);
                  else setStrict(availableKeys, 0.7); // Quiet full
              }
              break;
              
          case 'groove':
              // Bass + Rhythm focus
              {
                  const groove = availableKeys.filter(k => k === 'bass' || k === 'rhythm');
                  setStrict(groove.length > 0 ? groove : availableKeys, 1.1);
              }
              break;

          case 'outro':
              // Fade out texture, usually Harmonic or Lead
              if (availableKeys.includes('harmonic')) setStrict(['harmonic'], 0.7);
              else setStrict([availableKeys[0]], 0.7);
              break;
              
          default:
              setStrict(availableKeys, 1.0);
              break;
      }

      this.currentPlan.push(stage);
  }

  private startConductor() { if (this.conductorTimer) clearInterval(this.conductorTimer); if (!this.conductorMode) return; this.conductorTimer = window.setInterval(() => this.updateConductor(), 200); }
  public stopConductor() { 
      if (this.conductorTimer) { 
          clearInterval(this.conductorTimer); 
          this.conductorTimer = null; 
      } 
      this.activeHands = []; 
  }
  
  private updateConductor() {
      if (!this.conductorMode || (this.playbackState !== 'playing' && this.playbackState !== 'recording' && this.playbackState !== 'warmup' && this.playbackState !== 'preparing')) return;
      if (Date.now() - this.conductorActivationTime < 5000) return;
      
      const elapsed = this.elapsedSeconds;
      const nextStage = this.currentPlan?.[this.currentPlanIdx + 1];
      
      // Anticipation Messaging
      if (nextStage) {
          const timeToNext = nextStage.stageStartTimeSec - elapsed;
          if (timeToNext > 0 && timeToNext < 10) {
              let msg = "";
              if (timeToNext < 3) {
                  msg = `PREPARING ${nextStage.stageName.toUpperCase()}...`;
              } else {
                  msg = `NEXT: ${nextStage.stageName.toUpperCase()} IN ${Math.ceil(timeToNext)}S...`;
              }
              this.dispatchEvent(new CustomEvent('conductor-anticipation', { detail: { msg } }));
          }
      }

      if (nextStage && elapsed >= nextStage.stageStartTimeSec) {
          this.currentPlanIdx++;
          const currentStage = this.currentPlan[this.currentPlanIdx];
          this.currentStatusMessage = currentStage.stageName;

          this.synchronizeInstrumentsWithStage(currentStage.stageName);

          this.dispatchEvent(new CustomEvent('conductor-stage-changed', { detail: { name: currentStage.stageName, isAi: false } }));
          this.interpolateParameters();
          this.scheduleRefresh();

          // When voice channels are active, DJ immediately cues Lyria with a vocal direction for this stage!
          if (this.isVocalInstrumentActive()) {
              this.lastDjVocalMessageTime = Date.now();
              const stageVocalMsg = this.generateDjVocalSimulationMessage(currentStage.stageName);
              if (stageVocalMsg) {
                  this.sendVocalSignal(stageVocalMsg, 6000);
                  this.dispatchEvent(new CustomEvent('dj-vocal-message', { detail: { message: stageVocalMsg, stage: currentStage.stageName } }));
              }
          }
      }

      // Continuous vocal guidance: DJ periodically sends human voice simulation messages to Lyria
      if (this.isVocalInstrumentActive() && (Date.now() - this.lastDjVocalMessageTime > 9000) && !this.currentVocalSignal) {
          this.lastDjVocalMessageTime = Date.now();
          const vocalMsg = this.generateDjVocalSimulationMessage();
          if (vocalMsg) {
              this.sendVocalSignal(vocalMsg, 5000);
              this.dispatchEvent(new CustomEvent('dj-vocal-message', { detail: { message: vocalMsg } }));
          }
      }
      this.interpolateParameters();
  }

  private synchronizeInstrumentsWithStage(stageName: string) {
      // Conductor STRICTLY controls weights and active state based on the Plan.
      // It does NOT change instrument strings.
      
      const currentStage = this.currentPlan[this.currentPlanIdx];
      if (!currentStage) return;

      let instrumentsModified = false;
      const currentSetup = { ...this.instruments };
      const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;

      channels.forEach(ch => {
          // If channel is not visible in manifest, ignore it
          if (currentSetup[ch].visible === false) return;

          const targetActive = currentStage.activeChannels[ch];
          
          if (currentSetup[ch].active !== targetActive) {
              currentSetup[ch].active = targetActive;
              instrumentsModified = true;
          }
      });

      if (instrumentsModified) {
          this.instruments = currentSetup;
          this.dispatchEvent(new CustomEvent('conductor-instruments-update', { detail: this.instruments }));
          this.scheduleRefresh();
      }
  }

  private interpolateParameters() {
      if (isTraditionalGenre(this.genre)) return; // DJ HANDS OFF knobs for traditional genres

      const currentTimeMs = Date.now();
      const currentStage = this.currentPlan?.[this.currentPlanIdx]; 
      if (!currentStage) return;
      
      const interactionCooldownMs = 10000 - (this.evolutionValue * 500); 
      // Dynamic base step based on evolution. Higher evolution = faster cuts.
      const baseStep = 0.05 + (this.evolutionValue > 5 ? 0.05 : 0);
      const step = baseStep * (1.0 + (this.evolutionValue / 10.0));
      
      if (currentStage.targets) {
          const targets: Record<string, number> = {}; 
          currentStage.targets.forEach((t:any) => { if (t && t.parameterName) targets[t.parameterName] = t.targetValue; });
          const promptsNeedingMove: string[] = [];
          this.prompts.forEach(p => {
              const lastInteracted = this.userInteractionCooldowns.get(p.promptId) || 0;
              if (currentTimeMs - lastInteracted < interactionCooldownMs) return; 
              const target = targets[p.text] ?? p.weight;
              if (Math.abs(target - p.weight) > 0.01) promptsNeedingMove.push(p.promptId);
          });
          this.activeHands = this.activeHands.filter(id => promptsNeedingMove.includes(id));
          while (this.activeHands.length < 2 && promptsNeedingMove.length > 0) {
              const next = promptsNeedingMove.find(id => !this.activeHands.includes(id));
              if (next) this.activeHands.push(next); else break;
          }
          let changed = false;
          this.activeHands.forEach(id => {
              const p = this.prompts.get(id);
              if (!p) return;
              const target = targets[p.text] ?? p.weight;
              const diff = target - p.weight;
              const move = Math.sign(diff) * Math.min(Math.abs(diff), step);
              p.weight = Math.max(0, Math.min(2.0, p.weight + move));
              p.volume = p.weight / 2;
              changed = true;
          });
          if (changed) { this.dispatchEvent(new CustomEvent('conductor-knobs-update', { detail: this.prompts })); this.scheduleRefresh(); }
      }

      if (currentStage.channelWeights || currentStage.activeChannels) {
          let channelChanged = false;
          const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
          channels.forEach(ch => {
              const lastInteracted = this.userInteractionCooldowns.get(ch) || 0;
              if (currentTimeMs - lastInteracted < interactionCooldownMs) return;

              if (this.instruments[ch].visible === false) {
                  if (this.instruments[ch].active || this.instruments[ch].weight > 0) {
                      this.instruments[ch].active = false;
                      this.instruments[ch].weight = 0;
                      channelChanged = true;
                  }
                  return;
              }

              const targetWeight = currentStage.channelWeights?.[ch] ?? 1.0;
              const currentWeight = this.instruments[ch].weight;
              const weightDiff = targetWeight - currentWeight;
              
              if (Math.abs(weightDiff) > 0.005) {
                  // For DJ, if target is 0, cut faster
                  const cutBonus = (targetWeight === 0) ? 0.08 : 0;
                  const move = Math.sign(weightDiff) * Math.min(Math.abs(weightDiff), 0.05 + cutBonus); 
                  this.instruments[ch].weight = Math.max(0, Math.min(2.0, currentWeight + move));
                  channelChanged = true;
              }

              const targetActiveFromPlan = currentStage.activeChannels?.[ch];
              if (targetActiveFromPlan !== undefined && this.instruments[ch].active !== targetActiveFromPlan) {
                  this.instruments[ch].active = targetActiveFromPlan;
                  channelChanged = true;
              }
          });
          if (channelChanged) { 
              this.dispatchEvent(new CustomEvent('conductor-instruments-update', { detail: this.instruments })); 
              this.scheduleRefresh(); 
          }
      }
  }

  private startTimeTracking() {
    this.stopTimeTracking();
    if (this.loopWaitTimer) { clearTimeout(this.loopWaitTimer); this.loopWaitTimer = null; }
    this.playbackStartTime = performance.now();
    const startOffset = this.elapsedSeconds;
    let smoothedElapsed = startOffset;
    const tick = () => {
      if (this.playbackState === 'playing' || this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing') {
        const now = performance.now();
        const duration = (now - this.playbackStartTime) / 1000;
        const rawElapsed = startOffset + duration;

        // Exponential moving average to smooth out rAF timing jitter
        const alpha = 0.3;
        smoothedElapsed = smoothedElapsed + alpha * (rawElapsed - smoothedElapsed);
        // Snap to 1ms precision to eliminate sub-millisecond oscillation
        const nextElapsed = Math.round(smoothedElapsed * 1000) / 1000;

        if (this.playbackState === 'recording') {
            this.recordSnapshot(nextElapsed);
        } else if (this.playbackState === 'playing') {
            this.applySnapshot(nextElapsed);
        }

        if (this.playbackState === 'playing' && this.recordedDuration > 0) {
           if (nextElapsed >= this.recordedDuration) {
               this.pauseInternal();
               this.elapsedSeconds = this.recordedDuration; 
               if (this.isLooping) {
                   this.setPlaybackState('loop-waiting');
                   this.loopWaitTimer = window.setTimeout(() => { this.elapsedSeconds = 0; this.playRecording(0); }, 5000);
               } else this.stop(true, false);
               return; 
           }
        }
        this.elapsedSeconds = nextElapsed;
        this.updateGainWithFades();
        this.timeTrackingFrame = requestAnimationFrame(tick);
      }
    };
    this.timeTrackingFrame = requestAnimationFrame(tick);
  }

  private recordSnapshot(timestamp: number) {
      const snapshot: PlaybackSnapshot = {
          timestamp,
          promptWeights: new Map(),
          channelWeights: {
              lead: this.instruments.lead.weight,
              alto: this.instruments.alto.weight,
              harmonic: this.instruments.harmonic.weight,
              bass: this.instruments.bass.weight,
              rhythm: this.instruments.rhythm.weight,
          },
          channelActive: {
              lead: this.instruments.lead.active,
              alto: this.instruments.alto.active,
              harmonic: this.instruments.harmonic.active,
              bass: this.instruments.bass.active,
              rhythm: this.instruments.rhythm.active,
          },
          statusMessage: this.currentStatusMessage,
          isAiPhase: false
      };
      this.prompts.forEach((p, id) => snapshot.promptWeights.set(id, p.weight));
      this.automationLog.push(snapshot);
  }

  private applySnapshot(timestamp: number) {
      if (this.automationLog.length === 0) return;
      let low = 0; let high = this.automationLog.length - 1; let idx = 0;
      while (low <= high) {
          let mid = (low + high) >>> 1;
          if (this.automationLog[mid].timestamp < timestamp) { idx = mid; low = mid + 1; } 
          else { high = mid - 1; }
      }
      const snapshot = this.automationLog[idx];
      if (!snapshot) return;

      if (snapshot.statusMessage && snapshot.statusMessage !== this.lastAppliedStatusMessage) {
          this.lastAppliedStatusMessage = snapshot.statusMessage;
          this.dispatchEvent(new CustomEvent('conductor-stage-changed', { 
              detail: { name: snapshot.statusMessage, isAi: false } 
          }));
      }

      let promptsChanged = false;
      snapshot.promptWeights.forEach((weight, id) => {
          const p = this.prompts.get(id);
          if (p && Math.abs(p.weight - weight) > 0.001) {
              p.weight = weight; p.volume = weight / 2; promptsChanged = true;
          }
      });
      if (promptsChanged) this.dispatchEvent(new CustomEvent('conductor-knobs-update', { detail: this.prompts }));
      let instrumentsChanged = false;
      const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
      channels.forEach(ch => {
          const targetWeight = snapshot.channelWeights[ch];
          const targetActive = snapshot.channelActive[ch];
          if (Math.abs(this.instruments[ch].weight - targetWeight) > 0.001 || this.instruments[ch].active !== targetActive) {
              this.instruments[ch].weight = targetWeight;
              this.instruments[ch].active = targetActive;
              instrumentsChanged = true;
          }
      });
      if (instrumentsChanged) this.dispatchEvent(new CustomEvent('conductor-instruments-update', { detail: this.instruments }));
  }

  private stopTimeTracking() { if (this.timeTrackingFrame) cancelAnimationFrame(this.timeTrackingFrame); this.timeTrackingFrame = null; }

  public async record() {
    await this.stop(false, true); 
    this.segments = []; this.recordedAudioBlob = null; this.elapsedSeconds = 0;
    this.automationLog = [];
    this.currentRecordingStartTime = 0; this.dispatchEvent(new CustomEvent('recording-cleared'));
    this.audioContext.resume();
    this.currentStatusMessage = '';

    // Always use fallback/procedural routine for standalone conductor
    this.generatePerformancePlan(0);

    this.setPlaybackState('loading');
    
    await this.connect();

    if (this.conductorMode) {
      const d = this.maxDurationMinutes;
      const warmupTimeMs = Math.round(10000 + (d - 1) * (20000 / 54));
      const PREP_TRANSITION_MS = 5000;
      const totalPrepMs = warmupTimeMs + PREP_TRANSITION_MS;
      
      this.dispatchEvent(new CustomEvent('warmup-started', { detail: { durationMs: totalPrepMs, warmupMs: warmupTimeMs } }));
      this.setPlaybackState('warmup');
      
      // During warmup, ensure the first stage setup is applied immediately
      this.currentPlanIdx = 0;
      this.synchronizeInstrumentsWithStage(this.currentPlan[0]?.stageName || 'Intro');
      
      this.startConductor();
      this.startTimeTracking();

      await new Promise(resolve => setTimeout(resolve, warmupTimeMs));

      this.setPlaybackState('preparing');
      await new Promise(resolve => setTimeout(resolve, PREP_TRANSITION_MS));

      this.stopTimeTracking();
      this.elapsedSeconds = 0; 
      this.startMediaRecorder(); 
      this.updateRecordingSchedule(); 
      this.setPlaybackState('recording');
      this.startTimeTracking();
    } else {
      this.startMediaRecorder(); 
      this.updateRecordingSchedule(); 
      this.setPlaybackState('recording');
      this.startTimeTracking();
    }
  }

  private async connect(): Promise<LiveMusicSession> {
    // Ensure any stale session is closed before reconnecting
    if (this.session) {
        try { (this.session as any).close(); } catch(e) {}
        this.session = null;
    }
    
    this.sessionCounter++; const currentSessionId = this.sessionCounter;

    // Create a timeout promise to prevent hanging indefinitely
    const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Connection to Lyria API timed out")), 10000)
    );

    const connectPromise = this.ai.live.music.connect({ 
      model: this.model, 
      callbacks: { 
        onmessage: async (e) => { 
          if (currentSessionId === this.sessionCounter && e.serverContent?.audioChunks) await this.processAudioChunks(e.serverContent.audioChunks); 
        }, 
        onerror: (err: any) => { 
          this.stop(); 
          const errStr = err?.message || err?.toString() || 'API connection error';
          this.dispatchEvent(new CustomEvent('dj-vocal-message', { detail: { text: `API Error: ${errStr}.`, type: 'error' } })); 
        }, 
        onclose: () => this.stop(), 
      } 
    });

    try {
        this.sessionPromise = Promise.race([connectPromise, timeout]) as Promise<LiveMusicSession>;
        this.session = await this.sessionPromise;
    } catch (err) {
        this.session = null;
        this.sessionPromise = null;
        this.setPlaybackState('stopped');
        this.dispatchEvent(new CustomEvent('dj-vocal-message', { detail: { text: `Failed to connect to music engine: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' } }));
        throw err;
    }

    // Set prompts and config before starting the stream
    await this.refreshSessionPrompts();
    // Start the music stream - required by Lyria API
    this.session.play();
    return this.session;
  }

  private setPlaybackState(state: PlaybackState) { 
    this.playbackState = state; 
    this.dispatchEvent(new CustomEvent('playback-state-changed', { detail: state })); 
    const totalSec = this.maxDurationMinutes * 60;
    const isAtEnd = this.elapsedSeconds >= (totalSec - 0.5);
    if ((state === 'stopped' || state === 'paused') && !isAtEnd) {
        this.masterGain.gain.setTargetAtTime(this.userVolume, this.audioContext.currentTime, 0.05);
    }
  }
  
  private async processAudioChunks(audioChunks: AudioChunk[]) {
    if (!this.session || this.playbackState === 'paused') return;
    const audioBuffer = await decodeAudioData(decode(audioChunks[0].data!), this.audioContext, 48000, 2);
    const source = this.audioContext.createBufferSource(); 
    source.buffer = audioBuffer; 

    const chunkGain = this.audioContext.createGain();
    // Increased safety buffer for startup timing to prevent clicking/stuttering
    const startTime = this.nextStartTime > this.audioContext.currentTime ? this.nextStartTime : this.audioContext.currentTime + 0.1;
    chunkGain.gain.setValueAtTime(0.01, startTime);
    chunkGain.gain.exponentialRampToValueAtTime(1.0, startTime + 0.05);

    source.connect(chunkGain);
    chunkGain.connect(this.rawGain);

    if (this.nextStartTime === 0 || this.nextStartTime < this.audioContext.currentTime) {
      this.nextStartTime = this.audioContext.currentTime + this.bufferTime;
    }
    
    source.start(this.nextStartTime); 
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
    };

    // Schedule next segment
    this.nextStartTime += audioBuffer.duration;
  }

  public get activePrompts() { return Array.from(this.prompts.values()).filter((p) => p.weight > 0.01); }
  public readonly setWeightedPrompts = (prompts: Map<string, Prompt>) => { this.prompts = prompts; this.scheduleRefresh(); };
  
  private pauseInternal() {
    this.stopConductor(); this.stopTimeTracking();
    this.activeSources.forEach(s => { try { s.stop(); } catch(e) {} });
    this.activeSources.clear();
  }

  public async pause(manual = true) { 
    this.pauseInternal();
    if (this.loopWaitTimer) { clearTimeout(this.loopWaitTimer); this.loopWaitTimer = null; }
    if (manual) { this.isLooping = false; this.dispatchEvent(new CustomEvent('loop-changed-internal', { detail: false })); }
    this.lastStateBeforePause = this.playbackState; 
    this.setPlaybackState('paused'); 
  }

  public async resume() { 
    if (this.lastStateBeforePause === 'playing') await this.playRecording(this.elapsedSeconds);
    else if (this.lastStateBeforePause === 'recording') { this.setPlaybackState('recording'); this.startConductor(); this.startTimeTracking(); }
    else this.setPlaybackState('stopped');
  }

  private startMediaRecorder() {
    this.recordedChunks = []; this.mediaRecorder = new MediaRecorder(this.recordingDestination.stream);
    this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.recordedChunks.push(e.data); };
    this.mediaRecorder.onstop = async () => { 
        if (this.recordedChunks.length > 0) { 
            const blob = new Blob(this.recordedChunks, { type: 'audio/webm' }); 
            const arrayBuffer = await blob.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.segments = [{ startTime: 0, duration: audioBuffer.duration, buffer: audioBuffer }];
            this.recordedAudioBlob = blob; this.dispatchEvent(new CustomEvent('recording-available')); 
        } 
    };
    this.mediaRecorder.start();
  }

  private updateRecordingSchedule() {
    if (this.autoStopTimer) clearTimeout(this.autoStopTimer);
    const remainingTimeMs = Math.max(0, (this.maxDurationMinutes * 60) - this.elapsedSeconds) * 1000;
    this.autoStopTimer = window.setTimeout(() => { 
        this.stop(true, false); 
        this.dispatchEvent(new CustomEvent('recording-finished-auto')); 
        if (this.isLooping) { this.elapsedSeconds = 0; this.playRecording(0); }
    }, remainingTimeMs + 5000);
  }

  public async generateLyrics(genre: string, lang: string, verseCount: number, lineCount: number, songTitle?: string): Promise<string> {
      if (!this.ai) {
          console.error("AI not initialized");
          return "Error: AI not initialized.";
      }
      try {
          const prompt = songTitle
              ? `Translate or adapt 2 verses of the song "${songTitle}" into ${lang}. The style should fit a ${genre} genre.`
              : `Create ${verseCount} verses of lyrics, with ${lineCount} lines per verse, for a ${genre} song in ${lang}. 
                 Return ONLY the lyrics in standard block format (e.g. [Verse 1], [Chorus]). Do not include any intro, outro, explanations, or commentary.`;
          
          console.log("Generating lyrics with prompt:", prompt);
          
          // Try gemini-3.1-flash-lite
          const result = await (this.ai as any).models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: prompt
          });
          
          return (result.text || "Could not generate lyrics.").trim();
      } catch (e) {
          console.error("Lyrics generation failed:", e);
          return `Error: ${e}`;
      }
  }

  public async stop(saveRecording = true, resetToZero = false) {
    this.stopTimeTracking(); uiSounds.stopRewindSound();
    this.isLooping = false; this.dispatchEvent(new CustomEvent('loop-changed-internal', { detail: false }));
    if (this.loopWaitTimer) { clearTimeout(this.loopWaitTimer); this.loopWaitTimer = null; }
    if (this.rewindFrame) cancelAnimationFrame(this.rewindFrame); this.isRewinding = false;
    if (this.autoStopTimer) clearTimeout(this.autoStopTimer); if (this.session) { try { (this.session as any).close(); } catch(e) {} }
    if (this.mediaRecorder?.state !== 'inactive') this.mediaRecorder?.stop();
    this.activeSources.forEach(s => { try { s.stop(); } catch(e) {} });
    this.activeSources.clear();
    const totalSec = this.maxDurationMinutes * 60;
    const isAtEnd = this.elapsedSeconds >= (totalSec - 0.5);
    if (resetToZero) this.elapsedSeconds = 0;
    this.nextStartTime = 0; 
    if (!isAtEnd) {
        this.masterGain.gain.setTargetAtTime(this.userVolume, this.audioContext.currentTime, 0.05);
    } else {
        this.masterGain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.05);
    }
    this.setPlaybackState('stopped'); 
    this.session = null; this.sessionPromise = null;
    this.lastAppliedStatusMessage = '';
  }

  public async startRewind() {
      if (this.playbackState !== 'stopped') return;
      if (this.elapsedSeconds <= 0.05 && !this.isRewinding) return;
      this.stopTimeTracking();
      if (this.loopWaitTimer) { clearTimeout(this.loopWaitTimer); this.loopWaitTimer = null; }
      this.isRewinding = true; this.setPlaybackState('rewinding');
      uiSounds.startRewindSound();
      const rewindStartTime = performance.now();
      let lastFrameTime = rewindStartTime;
      const animateRewind = () => {
          const now = performance.now(); 
          const frameDelta = (now - lastFrameTime) / 1000; 
          lastFrameTime = now;
          const timeSinceStart = (now - rewindStartTime) / 1000;
          const currentSpeedMultiplier = 1.0 * Math.pow(50, Math.min(1, timeSinceStart / 4.0));
          this.elapsedSeconds = Math.max(0, this.elapsedSeconds - (frameDelta * currentSpeedMultiplier)); 
          if (this.elapsedSeconds > 0) { this.rewindFrame = requestAnimationFrame(animateRewind); }
          else { this.isRewinding = false; uiSounds.stopRewindSound(); this.setPlaybackState('stopped'); }
      };
      this.rewindFrame = requestAnimationFrame(animateRewind);
  }

  public async clearRecording() { 
      this.isLooping = false; this.dispatchEvent(new CustomEvent('loop-changed-internal', { detail: false }));
      await this.stop(false, true); this.segments = []; this.recordedAudioBlob = null; this.automationLog = [];
  }
  public get recordedDuration() { return this.segments.reduce((max, s) => Math.max(max, s.startTime + s.duration), 0); }

  public async playRecording(startTimeOffset?: number) {
    if (this.segments.length === 0) return;
    this.lastAppliedStatusMessage = '';
    this.activeSources.forEach(s => { try { s.stop(); } catch(e) {} });
    this.activeSources.clear();
    let offset = startTimeOffset !== undefined ? startTimeOffset : this.elapsedSeconds;
    if (this.recordedDuration > 0 && offset >= this.recordedDuration - 0.1) offset = 0;
    this.elapsedSeconds = offset;
    this.setPlaybackState('playing');
    const now = this.audioContext.currentTime;
    this.segments.forEach(segment => {
        const segmentEndTime = segment.startTime + segment.duration;
        if (segmentEndTime <= offset) return;
        const source = this.audioContext.createBufferSource();
        source.buffer = segment.buffer;
        const gain = this.audioContext.createGain();
        source.connect(gain); gain.connect(this.rawGain); 
        let segmentOffset = offset - segment.startTime;
        source.start(now, segmentOffset, segment.duration - segmentOffset);
        this.activeSources.add(source);
        source.onended = () => this.activeSources.delete(source);
    });
    if (this.conductorMode) this.startConductor();
    this.startTimeTracking();
  }

  public async download(format: 'webm' | 'mp3' | 'wav' = 'mp3') {
    if (this.segments.length === 0) return;
    const url = URL.createObjectURL(this.recordedAudioBlob!);
    const a = document.createElement('a');
    a.href = url;
    const filename = `${this.maxDurationMinutes}m-${this.genre}-${this.style.replace(/\s+/g, '')}-${this.bpm}bpm-${this.key.replace(/\s+/g, '')}.${format}`;
    a.download = filename; a.click();
    window.URL.revokeObjectURL(url);
  }
}
