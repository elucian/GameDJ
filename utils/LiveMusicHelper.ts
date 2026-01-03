
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import type { PlaybackState, Prompt, InstrumentSet, MusicGenerationMode, PlaybackSnapshot } from '../types';
import { AudioChunk, GoogleGenAI, LiveMusicServerMessage, LiveMusicSession, Type } from '@google/genai';
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
  'Soprano Voice', 'Coral Voices', 'Coral Bass', 'Solo Voice', 'Vocal Chops', 
  'Male Monastic Choir', 'Powerhouse Soloist', 'Bright Female Vocals', 
  'Processed Vocals', 'Children\'s Choir', 'Gospel Vocals', 'Distant Female Voice', 
  'Backing Choir', 'Soprano Choir', 'Tenor/Alto Choir', 'Bass Choir', 'Deep Vocal Drone',
  'Alto Choir', 'Choir'
];

const VOWELS = ['A', 'E', 'I', 'O', 'U'];

// A curated list of possible instruments the AI might mention to aid parsing
const KNOWN_INSTRUMENTS = [
  'Synthesizer', 'Electric Guitar', 'Acoustic Guitar', 'Saxophone', 'Trumpet', 'Clarinet', 'Flute', 'Violin', 'Cello', 'Harmonica', 
  'Piano', 'Electric Piano', 'Organ', 'Strings', 'Pads', 'Brass Section', 'Choir', 'Bass Guitar', 'Double Bass', 'Synth Bass', 'Tuba',
  'Drum Kit', 'Electronic Drums', 'Percussion', 'Tabla', 'Djembe', 'Taiko Drums', 'Recorder', 'Mandocello', 'Banjo', 'Sitar', 'Koto', 
  'Accordion', 'Oboe', 'Bassoon', 'Timpani', 'Kalimba', 'Didgeridoo', 'Whistle', 'Bell Synth', 'Electric Violin', 'Pan Flute', 'Pipe Flute'
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

export class LiveMusicHelper extends EventTarget {
  private ai: GoogleGenAI; private model: string;
  private session: LiveMusicSession | null = null;
  private sessionPromise: Promise<LiveMusicSession> | null = null;
  private sessionCounter = 0; 
  private nextStartTime = 0;
  private bufferTime = 0.2; 
  public readonly audioContext: AudioContext;
  private rawGain: GainNode;
  private masterGain: GainNode;
  private recordingDestination: MediaStreamAudioDestinationNode;
  public playbackState: PlaybackState = 'stopped';
  private prompts: Map<string, Prompt>;
  private bpm = 120; private key = 'C Major'; private mode: 'Natural' | 'Minor' = 'Natural';
  public genre = 'Jazz'; public style = 'Acid Jazz'; private meter = '4/4';
  private mood = 'None';
  private currentSeed = 0;
  public generationMode: MusicGenerationMode = 'QUALITY';
  public instruments: InstrumentSet = {
    lead: { instrument: 'Piano', active: true, weight: 1.0, visible: true },
    alto: { instrument: 'Alto Saxophone', active: true, weight: 1.0, visible: true },
    harmonic: { instrument: 'Strings', active: true, weight: 1.0, visible: true },
    bass: { instrument: 'Bass Guitar', active: true, weight: 1.0, visible: true },
    rhythm: { instrument: 'Drum Kit', active: true, weight: 1.0, visible: true }
  };
  private guidance = 3; public conductorMode = false; private isStereo = true; 
  private evolutionValue = 0; 
  private aiAvailable = true;
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
  private conductorActivationTime = 0;

  private specialInstruction: string | null = null;
  private channelsLocked = false;

  // Track the current phase message for recording
  private currentStatusMessage: string = '';
  private currentIsAiPhase: boolean = false;
  private lastAppliedStatusMessage: string = '';

  constructor(ai: GoogleGenAI, model: string) {
    super(); this.ai = ai; this.model = model; this.prompts = new Map();
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    this.rawGain = this.audioContext.createGain(); this.masterGain = this.audioContext.createGain(); 
    this.masterGain.gain.value = this.userVolume;
    this.recordingDestination = this.audioContext.createMediaStreamDestination();
    this.rawGain.connect(this.recordingDestination); this.rawGain.connect(this.masterGain);
    this.masterGain.connect(this.audioContext.destination);
  }

  public get masterDestination() { return this._masterDestination; }
  private _masterDestination: AudioNode | null = null;
  public set masterDestination(node: AudioNode | null) {
    this._masterDestination = node; if (node) { try { this.masterGain.disconnect(node); } catch(e) {} this.masterGain.connect(node); }
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
  public setMaxDuration(minutes: number) { this.maxDurationMinutes = minutes; }
  public setSeed(seed: number) { this.currentSeed = seed; this.scheduleRefresh(); }
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
  public setEvolution(val: number) { this.evolutionValue = val; }
  public setGenerationMode(mode: MusicGenerationMode) { 
      let effectiveMode = mode;
      // CRITICAL: Obey VOC mode rule. Only allow if vocal instrument is active.
      if (mode === 'VOCALIZATION' && !this.isVocalInstrumentActive()) {
          effectiveMode = 'QUALITY';
      }
      this.generationMode = effectiveMode; 
      this.dispatchEvent(new CustomEvent('mode-changed-internal', { detail: effectiveMode }));
      this.scheduleRefresh(); 
  }
  
  public setSpecialInstruction(instruction: string | null) {
      this.specialInstruction = instruction;
      this.scheduleRefresh();
  }

  public async setConductorMode(active: boolean) {
      this.conductorMode = active;
      if (active) {
          this.conductorActivationTime = Date.now();
          const isLive = this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading';
          if (isLive) {
              this.aiAvailable = false; 
              this.dispatchEvent(new CustomEvent('handshake-result', { detail: false }));
              if (this.currentPlan.length === 0) this.runFallbackRoutine();
              this.startConductor();
          } else {
              await this.checkHandshake();
          }
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

  public setInstruments(channels: InstrumentSet) { this.instruments = channels; this.scheduleRefresh(); }
  
  public notifyUserInteraction(id: string) { 
      this.userInteractionCooldowns.set(id, Date.now()); 
  }

  private scheduleRefresh = throttle(() => { this.refreshSessionPrompts(); }, 200);

  public sendVocalSignal(signal: string) {
    if (this.generationMode !== 'VOCALIZATION') return;
    if (!this.isVocalInstrumentActive()) return;

    this.currentVocalSignal = signal.toUpperCase();
    this.dispatchEvent(new CustomEvent('vocal-signal-received', { detail: this.currentVocalSignal }));
    this.scheduleRefresh();
    
    if (this.vocalSignalTimer) clearTimeout(this.vocalSignalTimer);
    this.vocalSignalTimer = window.setTimeout(() => {
        this.currentVocalSignal = null;
        this.dispatchEvent(new CustomEvent('vocal-signal-received', { detail: null }));
        this.scheduleRefresh();
    }, 2000);
  }

  private async refreshSessionPrompts() {
    if (!this.session) return;
    
    const guidancePrompt = Array.from(this.prompts.values()).find(p => p.text === 'Guidance');
    const guidanceWeight = guidancePrompt?.weight ?? 1.0; 

    const weightedPrompts = Array.from(this.prompts.values()).map((p) => {
        let dynamicScale = 0.5;
        if (this.generationMode === 'QUALITY') {
            const highFidelityPrompts = ['Authenticity', 'Presence', 'Brightness', 'Dynamics', 'Guidance'];
            if (highFidelityPrompts.includes(p.text)) dynamicScale = 1.0;
        } else if (this.generationMode === 'DIVERSITY') {
            const highDiversityPrompts = ['Variation', 'Ornamentation', 'Complexity', 'Groove', 'Atmosphere'];
            // Fix: Use correct local variable highDiversityPrompts instead of highFidelityPrompts
            if (highDiversityPrompts.includes(p.text)) dynamicScale = 1.0;
        } else if (this.generationMode === 'VOCALIZATION') {
            const richnessPrompts = ['Texture', 'Density', 'Dynamics', 'Space', 'Organic'];
            // Fix: Use correct local variable richnessPrompts instead of highFidelityPrompts
            if (richnessPrompts.includes(p.text)) dynamicScale = 1.0;
        }
        return { text: `Nuance: ${p.text}`, weight: p.weight * dynamicScale };
    }).filter(p => p.weight > 0.01); 
    
    let activeMix = [];
    if (this.instruments.lead.active) activeMix.push('Lead');
    if (this.instruments.alto.active) activeMix.push('Alto');
    if (this.instruments.harmonic.active) activeMix.push('Harmonic');
    if (this.instruments.bass.active) activeMix.push('Bass');
    if (this.instruments.rhythm.active) activeMix.push('Rhythm');

    let anchorText = `ANCHOR: ${this.genre}, ${this.style}, ${this.bpm}bpm, ${this.meter}, ${this.key}`;
    if (this.currentSeed !== 0) {
        anchorText += `, SEED: ${this.currentSeed}`;
    }
    
    if (this.mood && this.mood !== 'None') anchorText += `. Mood: ${this.mood}`;
    
    if (guidanceWeight < 0.5) {
        anchorText += `. MODE: ABSOLUTE_ORIGINALITY. DO_NOT_REFERENCE_EXISTING_SONGS. CREATE_FROM_SCRATCH: TRUE`;
    } else {
        const ref = this.specialInstruction || 'Popular genre standard';
        if (guidanceWeight > 1.5) {
            anchorText += `. MODE: DIRECT_RECREATION_PRIORITY. PERFORM_COVER_OR_CLONE_OF: "${ref}"`;
        } else {
            anchorText += `. MODE: INSPIRED_VARIATION. USE_INFLUENCES_FROM: "${ref}"`;
        }
    }

    anchorText += `. ACTIVE_MIX: [${activeMix.join(', ')}]`;

    if (this.generationMode === 'VOCALIZATION') {
        anchorText += `. MODE: VOCAL_EMPHASIS. LIRA_RULES: Vowel=Sustain, Consonant=StartWord. LANGUAGE: ${this.getRegionalLanguage()}`;
        if (this.currentVocalSignal) {
            anchorText += `. VOCAL_SIGNAL: ${this.currentVocalSignal}`;
        }
    } else {
        anchorText += `. GENERATION_ENGINE_MODE: ${this.generationMode}`;
    }

    if (this.isVocalInstrumentActive() || this.generationMode === 'VOCALIZATION') {
        anchorText += `. ENHANCE_VOCAL_TEXTURE: TRUE`;
    }

    const finalPayload = [ { text: anchorText, weight: 5.0 } ];
    
    const keys = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
    const labels = ['Lead', 'Alto', 'Harmonic', 'Bass', 'Rhythm'];
    
    keys.forEach((k, i) => {
        const ch = this.instruments[k];
        const effectiveWeight = ch.active ? (ch.weight * 3.5) : 0.0;
        finalPayload.push({ 
            text: `INSTRUMENT ${labels[i]}: ${ch.instrument || 'None'}`, 
            weight: effectiveWeight 
        });
    });
    
    finalPayload.push(...weightedPrompts);
    try { await this.session.setWeightedPrompts({ weightedPrompts: finalPayload }); } catch (e) {}
  }

  private getRegionalLanguage(): string {
    const g = this.genre.toLowerCase();
    if (g === 'romanian') return 'Romanian';
    if (g === 'indian') return 'Hindi/Sanskrit';
    if (g === 'spiritual') return 'Liturgical Latin/Greek';
    if (g === 'african') return 'Swahili/Yoruba';
    if (g === 'irish') return 'Irish Gaelic';
    if (g === 'spanish') return 'Spanish/Portuguese';
    if (g === 'oriental') {
        const s = this.style.toLowerCase();
        if (s.includes('japanese')) return 'Japanese';
        if (s.includes('chinese')) return 'Mandarin';
        if (s.includes('arabic')) return 'Arabic';
        return 'Oriental Phonemes';
    }
    return 'English';
  }

  private async checkHandshake(): Promise<boolean> {
    try {
        const response = await this.ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: "Respond with ok if you can receive requests at this time.",
            config: { maxOutputTokens: 5, temperature: 0 }
        });
        this.aiAvailable = (response.text || '').toLowerCase().includes('ok');
        this.dispatchEvent(new CustomEvent('handshake-result', { detail: this.aiAvailable }));
        return this.aiAvailable;
    } catch (e: any) {
        this.aiAvailable = false;
        this.dispatchEvent(new CustomEvent('handshake-result', { detail: false }));
        return false;
    }
  }

  private getActiveLimit() {
      return 3 + Math.floor((this.evolutionValue + 10) * (9 / 20));
  }

  public isVocalInstrumentActive(): boolean {
      return Object.values(this.instruments).some(ch => {
          if (!ch.active || ch.visible === false || !ch.instrument) return false;
          const inst = ch.instrument.toLowerCase();
          return VOCAL_STRINGS.some(v => inst.includes(v.toLowerCase())) ||
                 inst.includes('voice') || 
                 inst.includes('choir') || 
                 inst.includes('vocals') || 
                 inst.includes('soprano');
      });
  }

  public applyAuthenticPresets(genre: string, style: string, mood: string, mode: MusicGenerationMode = 'QUALITY') {
      const activeLimit = this.getActiveLimit();
      const weights: Record<string, number> = {
          'Guidance': 1.0, 'Density': 0, 'Dynamics': 0, 'Groove': 0, 'Attack': 0, 'Staccato': 0,
          'Brightness': 0, 'Complexity': 0, 'Ornamentation': 0, 'Variation': 0, 'Glide': 0, 'Presence': 0,
          'Space': 0, 'Organic': 0, 'Texture': 0, 'Width': 0, 'Atmosphere': 0, 'Authenticity': 0
      };

      const g = genre.toLowerCase();
      
      // Base weighting by mode
      if (mode === 'QUALITY') {
          weights['Guidance'] = 1.3; weights['Authenticity'] = 1.6; weights['Dynamics'] = 1.4; weights['Presence'] = 1.2;
      } else if (mode === 'DIVERSITY') {
          weights['Variation'] = 1.8; weights['Ornamentation'] = 1.6; weights['Complexity'] = 1.5; weights['Groove'] = 1.4;
      } else if (mode === 'VOCALIZATION') {
          weights['Texture'] = 1.7; weights['Organic'] = 1.8; weights['Space'] = 1.6; weights['Dynamics'] = 1.4; weights['Authenticity'] = 1.5;
      }

      // Additive weighting by genre
      if (g.includes('jazz')) {
          weights['Groove'] += 0.6; weights['Complexity'] += 0.4; weights['Dynamics'] += 0.2; weights['Ornamentation'] += 0.3; weights['Organic'] += 0.5; weights['Space'] += 0.2;
      } else if (g.includes('electronic') || g.includes('gaming')) {
          weights['Density'] += 0.8; weights['Attack'] += 0.5; weights['Groove'] += 0.7; weights['Brightness'] += 0.4; weights['Texture'] += 0.4; weights['Atmosphere'] += 0.5;
      } else if (g.includes('rock') || g.includes('pop')) {
          weights['Attack'] += 0.6; weights['Dynamics'] += 0.5; weights['Groove'] += 0.4; weights['Presence'] += 0.3; weights['Width'] += 0.3; weights['Authenticity'] += 0.2;
      } else if (g.includes('spiritual') || g.includes('classic')) {
          weights['Space'] += 0.5; weights['Atmosphere'] += 0.4; weights['Dynamics'] += 0.3; weights['Organic'] += 0.6; weights['Authenticity'] += 0.4;
      } else {
          weights['Dynamics'] += 0.3; weights['Space'] += 0.2; weights['Organic'] += 0.4; weights['Atmosphere'] += 0.1; weights['Variation'] += 0.2;
      }

      if (mood !== 'None') {
          if (mood === 'Aggressive') { weights['Attack'] += 0.8; weights['Density'] += 0.6; }
          else if (mood === 'Calm') { weights['Space'] += 0.8; weights['Dynamics'] -= 0.4; weights['Density'] -= 0.5; }
          else if (mood === 'Epic' || mood === 'Cinematic') { weights['Width'] += 0.8; weights['Atmosphere'] += 0.8; weights['Dynamics'] += 0.6; }
          else if (mood === 'Ethereal') { weights['Space'] += 0.9; weights['Atmosphere'] += 0.9; weights['Authenticity'] += 0.5; }
      }

      if (this.isVocalInstrumentActive()) weights['Authenticity'] += 0.8;

      const sorted = Object.entries(weights).filter(([k, v]) => v > 0 || k === 'Guidance').sort((a, b) => b[1] - a[1]);
      const chosen = new Set(sorted.slice(0, activeLimit).map(s => s[0]));
      
      this.prompts.forEach(p => {
          if (chosen.has(p.text)) p.weight = weights[p.text] || (0.5 + Math.random());
          else p.weight = 0;
          p.volume = p.weight / 2;
      });

      const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
      channels.forEach(ch => { this.instruments[ch].weight = 1.0; });
      if (g.includes('ambient') || g.includes('spiritual')) {
          this.instruments.rhythm.weight = 0.4;
          this.instruments.bass.weight = 0.7;
      } else if (g.includes('electronic') || g.includes('gaming')) {
          this.instruments.rhythm.weight = 1.2;
      } else if (g.includes('romanian')) {
          this.instruments.lead.weight = 1.2;
          this.instruments.rhythm.weight = 1.1;
      }
      
      this.dispatchEvent(new CustomEvent('conductor-instruments-update', { detail: this.instruments }));
      this.dispatchEvent(new CustomEvent('conductor-knobs-update', { detail: this.prompts }));
      this.scheduleRefresh();
  }

  private async generateMusicPlan() {
      if (!this.aiAvailable) { return; }
      try {
          const keys = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
          const insts = {
              lead: this.instruments.lead.instrument || "Lead",
              alto: this.instruments.alto.instrument || "Alto",
              harmonic: this.instruments.harmonic.instrument || "Harmonic",
              bass: this.instruments.bass.instrument || "Bass",
              rhythm: this.instruments.rhythm.instrument || "Rhythm"
          };
          
          const enabledChannels = keys.filter(k => this.instruments[k].visible !== false);
          const enabledDescription = enabledChannels.map(k => `${k.toUpperCase()} instrument is currently: "${insts[k]}"`).join('. ');
          const hasVocals = this.isVocalInstrumentActive();

          const response = await this.ai.models.generateContent({
              model: 'gemini-3-flash-preview', 
              contents: `Plan performance for ${this.maxDurationMinutes}m track. 
              Goal: MUSICAL STORYTELLING with clear narrative progression (Introduction -> Development -> Climax/Bridge -> Resolution).
              
              STRICT INSTRUMENT RULE: You MUST only refer to the instruments provided in the ENABLED CHANNELS list. Do NOT invent or hallucinate other instruments. 
              
              ENABLED CHANNELS: ${enabledDescription}.
              VOCAL INSTRUMENT STATUS: ${hasVocals ? 'AVAILABLE' : 'UNAVAILABLE'}.
              
              CRITICAL ARRANGEMENT RULES:
              - Varied Formations: Frequently cycle between Solo, Duet, Trio, and Full Mix formations to improve storytelling.
              - Solo: Exactly ONE enabled channel active. All others muted.
              - Duet: Exactly TWO enabled channels active.
              - Trio: Exactly THREE enabled channels active.
              - Full Mix: All enabled channels active.
              
              In the "stageName" field, always use the specific instrument name provided. For example, if Lead is 'Electric Guitar', call it 'Electric Guitar Solo', NOT 'Lead Solo' and certainly not 'Piano Solo' if Piano is not listed.
              
              Respond with a JSON object containing a 'plan' array of stages.`,
              config: { 
                  responseMimeType: "application/json", 
                  responseSchema: { 
                      type: Type.OBJECT,
                      properties: {
                          plan: {
                              type: Type.ARRAY, 
                              items: { 
                                  type: Type.OBJECT, 
                                  properties: { 
                                      stageName: { type: Type.STRING }, 
                                      stageStartTimeSec: { type: Type.NUMBER }, 
                                      activeChannels: {
                                          type: Type.OBJECT,
                                          properties: {
                                              lead: { type: Type.BOOLEAN },
                                              alto: { type: Type.BOOLEAN },
                                              harmonic: { type: Type.BOOLEAN },
                                              bass: { type: Type.BOOLEAN },
                                              rhythm: { type: Type.BOOLEAN }
                                          }
                                      },
                                      targets: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { parameterName: { type: Type.STRING }, targetValue: { type: Type.NUMBER } } } },
                                      channelWeights: {
                                          type: Type.OBJECT,
                                          properties: {
                                              lead: { type: Type.NUMBER },
                                              alto: { type: Type.NUMBER },
                                              harmonic: { type: Type.NUMBER },
                                              bass: { type: Type.NUMBER },
                                              rhythm: { type: Type.NUMBER }
                                          }
                                      }
                                  } 
                              }
                          }
                      }
                  }
              }
          });
          const result = JSON.parse(response.text); 
          if (result && Array.isArray(result.plan)) { 
              this.currentPlan = result.plan; 
              this.currentPlanIdx = 0; 
          }
      } catch (e) { /* Fallback plan is already running */ }
  }

  private runFallbackRoutine() {
      this.currentPlan = [];
      const totalSec = this.maxDurationMinutes * 60;
      const stageDuration = 15; 
      const numStages = Math.ceil(totalSec / stageDuration); 
      const promptList = Array.from(this.prompts.values());
      
      const allKeys = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
      const instNames = {
          lead: this.instruments.lead.instrument || "Lead",
          alto: this.instruments.alto.instrument || "Alto",
          harmonic: this.instruments.harmonic.instrument || "Harmonic",
          bass: this.instruments.bass.instrument || "Bass",
          rhythm: this.instruments.rhythm.instrument || "Rhythm"
      };

      const enabledKeys = allKeys.filter(k => this.instruments[k].visible !== false);
      if (enabledKeys.length === 0) return; 

      for (let i = 0; i < numStages; i++) {
          const activeLimit = this.getActiveLimit();
          const stageTargets = promptList.map(p => ({ parameterName: p.text, targetValue: 0 }));
          const shuffledIndices = Array.from({length: promptList.length}, (_, k) => k).sort(() => Math.random() - 0.5);
          for(let j = 0; j < Math.min(activeLimit, promptList.length); j++) stageTargets[shuffledIndices[j]].targetValue = 0.4 + Math.random() * 1.6;
          
          const soloProb = 0.15;
          const duetProb = 0.2;
          const trioProb = enabledKeys.length >= 3 ? 0.2 : 0;
          const randAction = Math.random();

          let cw = { lead: 0.0, alto: 0.0, harmonic: 0.0, bass: 0.0, rhythm: 0.0 };
          let ac = { lead: false, alto: false, harmonic: false, bass: false, rhythm: false };
          let stageName = `Full Mix Section`;

          if (randAction < soloProb && i > 0) {
              const soloKey = enabledKeys[Math.floor(Math.random() * enabledKeys.length)];
              allKeys.forEach(k => {
                  ac[k] = (k === soloKey);
                  cw[k] = (k === soloKey) ? 2.0 : 0.0;
              });
              stageName = `${instNames[soloKey]} Solo`;
          } else if (randAction < soloProb + duetProb && i > 0 && enabledKeys.length >= 2) {
              const shuffled = [...enabledKeys].sort(() => Math.random() - 0.5);
              const duetKeys = [shuffled[0], shuffled[1]];
              allKeys.forEach(k => {
                  ac[k] = duetKeys.includes(k);
                  cw[k] = duetKeys.includes(k) ? 1.4 : 0.0;
              });
              stageName = `${instNames[duetKeys[0]]} & ${instNames[duetKeys[1]]} Duet`;
          } else if (randAction < soloProb + duetProb + trioProb && i > 0 && enabledKeys.length >= 3) {
              const shuffled = [...enabledKeys].sort(() => Math.random() - 0.5);
              const trioKeys = [shuffled[0], shuffled[1], shuffled[2]];
              allKeys.forEach(k => {
                  ac[k] = trioKeys.includes(k);
                  cw[k] = trioKeys.includes(k) ? 1.2 : 0.0;
              });
              stageName = `${instNames[trioKeys[0]]}, ${instNames[trioKeys[1]]} & ${instNames[trioKeys[2]]} Trio`;
          } else {
              enabledKeys.forEach(k => {
                  ac[k] = true;
                  cw[k] = 1.0;
              });
              const isDrop = Math.random() < 0.2 && i > 1;
              if (isDrop && ac.rhythm) {
                  ac.rhythm = false; cw.rhythm = 0.0;
                  if (ac.bass) { ac.bass = false; cw.bass = 0.0; }
                  stageName = "The Drop (Minimalist)";
              }
          }

          this.currentPlan.push({ 
            stageName: stageName, 
            stageStartTimeSec: i * stageDuration, 
            activeChannels: ac, 
            targets: stageTargets,
            channelWeights: cw
          });
      }
      this.currentPlanIdx = 0;
  }

  private startConductor() { if (this.conductorTimer) clearInterval(this.conductorTimer); if (!this.conductorMode) return; this.conductorTimer = window.setInterval(() => this.updateConductor(), 200); }
  private stopConductor() { if (this.conductorTimer) { clearInterval(this.conductorTimer); this.conductorTimer = null; } this.activeHands = []; }
  
  private updateConductor() {
      if (!this.conductorMode || (this.playbackState !== 'playing' && this.playbackState !== 'recording' && this.playbackState !== 'warmup' && this.playbackState !== 'preparing')) return;
      if (Date.now() - this.conductorActivationTime < 5000) return;
      const elapsed = this.elapsedSeconds;
      const nextStage = this.currentPlan?.[this.currentPlanIdx + 1];
      if (nextStage && elapsed >= nextStage.stageStartTimeSec) {
          this.currentPlanIdx++;
          const currentStage = this.currentPlan[this.currentPlanIdx];
          this.currentStatusMessage = currentStage.stageName;
          this.currentIsAiPhase = this.aiAvailable;

          this.synchronizeInstrumentsWithStage(currentStage.stageName);

          this.dispatchEvent(new CustomEvent('conductor-stage-changed', { detail: { name: currentStage.stageName, isAi: this.aiAvailable } }));
          this.interpolateParameters();
          this.scheduleRefresh();
      }
      if (this.generationMode === 'VOCALIZATION' && this.isVocalInstrumentActive() && Math.random() < 0.05) {
          const v = VOWELS[Math.floor(Math.random() * VOWELS.length)];
          this.sendVocalSignal(v);
      }
      this.interpolateParameters();
  }

  private synchronizeInstrumentsWithStage(stageName: string) {
      const lowerStage = stageName.toLowerCase();
      const mentionedInstruments = KNOWN_INSTRUMENTS.filter(inst => lowerStage.includes(inst.toLowerCase()));
      if (mentionedInstruments.length === 0) return;

      let instrumentsModified = false;
      const currentSetup = { ...this.instruments };

      mentionedInstruments.forEach((mention, index) => {
          const existingChannel = (Object.keys(currentSetup) as Array<keyof InstrumentSet>).find(k => currentSetup[k].instrument === mention);
          
          if (existingChannel) {
              if (!currentSetup[existingChannel].active || currentSetup[existingChannel].weight < 0.5) {
                  currentSetup[existingChannel].active = true;
                  currentSetup[existingChannel].weight = Math.max(currentSetup[existingChannel].weight, 1.0);
                  instrumentsModified = true;
              }
          } else {
              if (this.channelsLocked) return; 

              let targetChannel: keyof InstrumentSet;
              if (index === 0) targetChannel = 'lead';
              else if (index === 1) targetChannel = 'alto';
              else targetChannel = 'harmonic';

              if (currentSetup[targetChannel].visible !== false) {
                  currentSetup[targetChannel].instrument = mention;
                  currentSetup[targetChannel].active = true;
                  currentSetup[targetChannel].weight = 1.0;
                  instrumentsModified = true;
              }
          }
      });

      if (instrumentsModified) {
          this.instruments = currentSetup;
          this.dispatchEvent(new CustomEvent('conductor-instruments-update', { detail: this.instruments }));
          this.scheduleRefresh();
      }
  }

  private interpolateParameters() {
      const currentTimeMs = Date.now();
      const currentStage = this.currentPlan?.[this.currentPlanIdx]; 
      if (!currentStage) return;
      
      const interactionCooldownMs = 10000 - (this.evolutionValue * 500); 
      const baseStep = 0.05;
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
                  const move = Math.sign(weightDiff) * Math.min(Math.abs(weightDiff), 0.05); 
                  this.instruments[ch].weight = Math.max(0, Math.min(2.0, currentWeight + move));
                  channelChanged = true;
              }

              const targetActiveFromPlan = currentStage.activeChannels?.[ch] ?? true;
              const effectiveTargetActive = (targetWeight > 0.01 && targetActiveFromPlan);
              
              if (this.instruments[ch].active !== effectiveTargetActive) {
                  this.instruments[ch].active = effectiveTargetActive;
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
    const tick = () => {
      if (this.playbackState === 'playing' || this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing') {
        const now = performance.now();
        const duration = (now - this.playbackStartTime) / 1000;
        let nextElapsed = startOffset + duration;

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
          isAiPhase: this.currentIsAiPhase
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
              detail: { name: snapshot.statusMessage, isAi: snapshot.isAiPhase ?? false } 
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
    this.currentIsAiPhase = false;

    if (this.conductorMode) {
        this.applyAuthenticPresets(this.genre, this.style, this.mood, this.generationMode);
    }
    
    this.runFallbackRoutine();
    this.setPlaybackState('loading');
    
    const planPromise = (this.conductorMode && this.aiAvailable) ? this.generateMusicPlan() : Promise.resolve();
    
    await this.startSession();

    if (this.conductorMode) {
      const d = this.maxDurationMinutes;
      const warmupTimeMs = Math.round(10000 + (d - 1) * (20000 / 54));
      const PREP_TRANSITION_MS = 5000;
      const totalPrepMs = warmupTimeMs + PREP_TRANSITION_MS;
      
      this.dispatchEvent(new CustomEvent('warmup-started', { detail: { durationMs: totalPrepMs, warmupMs: warmupTimeMs } }));
      this.setPlaybackState('warmup');
      this.startConductor();
      this.startTimeTracking();

      await Promise.race([
          planPromise,
          new Promise(resolve => setTimeout(resolve, warmupTimeMs))
      ]);

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
    this.sessionCounter++; const currentSessionId = this.sessionCounter;
    this.sessionPromise = this.ai.live.music.connect({ model: this.model, callbacks: { onmessage: async (e) => { if (currentSessionId === this.sessionCounter && e.serverContent?.audioChunks) await this.processAudioChunks(e.serverContent.audioChunks); }, onerror: () => this.stop(), onclose: () => this.stop(), } });
    return this.sessionPromise;
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
    const source = this.audioContext.createBufferSource(); source.buffer = audioBuffer; source.connect(this.rawGain);
    if (this.nextStartTime === 0) this.nextStartTime = this.audioContext.currentTime + this.bufferTime;
    if (this.nextStartTime < this.audioContext.currentTime) this.nextStartTime = this.audioContext.currentTime + 0.05;
    source.start(this.nextStartTime); this.nextStartTime += audioBuffer.duration;
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
    this.autoStopTimer = window.setTimeout(() => { 
        this.stop(true, false); 
        this.dispatchEvent(new CustomEvent('recording-finished-auto')); 
        if (this.isLooping) { this.elapsedSeconds = 0; this.playRecording(0); }
    }, (this.maxDurationMinutes * 60 + 5) * 1000);
  }

  private async startSession() { this.session = await this.connect(); await this.refreshSessionPrompts(); this.session.play(); }

  public async stop(saveRecording = true, resetToZero = false) {
    this.stopConductor();
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
