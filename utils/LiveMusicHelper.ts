
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
    
    // 1. Gather Nuance Prompts (Density, etc.)
    const nuanceScale = 1.3; 
    
    const weightedPrompts = Array.from(this.prompts.values()).map((p) => {
        let dynamicScale = 0.5;
        if (this.generationMode === 'QUALITY') {
            const highFidelityPrompts = ['Authenticity', 'Presence', 'Brightness', 'Dynamics', 'Guidance'];
            if (highFidelityPrompts.includes(p.text)) dynamicScale = 1.0;
        } else if (this.generationMode === 'DIVERSITY') {
            const highDiversityPrompts = ['Variation', 'Ornamentation', 'Complexity', 'Groove', 'Atmosphere'];
            if (highDiversityPrompts.includes(p.text)) dynamicScale = 1.0;
        } else if (this.generationMode === 'VOCALIZATION') {
            const richnessPrompts = ['Texture', 'Density', 'Dynamics', 'Space', 'Organic'];
            if (richnessPrompts.includes(p.text)) dynamicScale = 1.0;
        }
        return { text: `Nuance: ${p.text}`, weight: p.weight * dynamicScale * nuanceScale };
    }).filter(p => p.weight > 0.05); 
    
    // 2. Build Authoritative Master Prompt (Narrative format for Lyria)
    let narrative = `Create a beautifully harmonious and highly structured musical composition. `;
    narrative += `The genre is purely ${this.genre}, in the style of ${this.style}. `;
    
    if (this.mood && this.mood !== 'None') {
        narrative += `The mood and story of the piece should feel deeply ${this.mood.toLowerCase()}. `;
    }

    if (this.bpm || this.meter || this.key) {
        narrative += `To maintain strict musical structure, compose this piece `;
        if (this.bpm) narrative += `at ${this.bpm} BPM, `;
        if (this.meter) narrative += `in ${this.meter} time, `;
        if (this.key) narrative += `in the key of ${this.key} ${this.mode}. `;
    }

    if (this.currentSeed !== 0) narrative += `(Seed influence: ${this.currentSeed}). `;

    // Conductor Stage - High Priority Context for Storytelling
    if (this.conductorMode && this.currentStatusMessage) {
        narrative += `The music must evolve to tell a dynamic story. Right now, the arrangement should reflect this section: "${this.currentStatusMessage}". `;
    }

    // Instrumentation Rules - Explicit White-listing
    const keys = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
    const labels = ['Lead', 'Alto', 'Harmonic', 'Bass', 'Rhythm'];
    
    const activeDefs: string[] = [];
    const activeNames: string[] = [];
    const mutedDefs: string[] = [];

    keys.forEach((k, i) => {
        const ch = this.instruments[k];
        let instName = ch.instrument || 'None';
        
        // ORCHESTRAL STACKING LOGIC
        if (k === 'lead' && ch.active && instName !== 'None') {
            if (!instName.toLowerCase().includes('section') && !instName.toLowerCase().includes('ensemble')) {
                instName = `${instName} (Ensemble Section)`;
            }
        }
        
        // Check active AND weight. If weight is very low, treat as muted
        if (ch.active && ch.visible !== false && ch.weight > 0.05) {
            activeDefs.push(`${labels[i]} (${instName})`);
            activeNames.push(instName);
        } else {
            mutedDefs.push(labels[i]);
        }
    });

    // Determine Strict Formation
    const count = activeNames.length;
    let formation = 'an ensemble';
    if (count === 0) formation = 'complete silence';
    else if (count === 1) formation = 'a solo performance';
    else if (count === 2) formation = 'a duet';
    else if (count === 3) formation = 'a trio';
    else if (count === 4) formation = 'a quartet';
    else if (count === 5) formation = 'a quintet';

    narrative += `The arrangement must be beautifully orchestrated as ${formation}. `;
    
    if (activeDefs.length > 0) {
        narrative += `It is absolutely critical that ONLY the following instruments are playing: ${activeDefs.join(' and ')}. `;
    }

    if (mutedDefs.length > 0) {
        narrative += `The following roles are muted and must be completely silent: ${mutedDefs.join(', ')}. `;
    }

    // Anti-Ghost Instruments Logic
    const common = ['Piano', 'Drums', 'Guitar', 'Bass', 'Synth', 'Strings', 'Percussion', 'Vocals'];
    const activeUpper = activeNames.map(n => n.toUpperCase());
    const strictlyForbidden = common.filter(c => !activeUpper.some(a => a.includes(c.toUpperCase())));
    if (strictlyForbidden.length > 0) {
        narrative += `Do NOT add any backing tracks or default instruments. Specifically, there must be NO ${strictlyForbidden.join(', NO ')} unless explicitly requested above. `;
    }

    narrative += `All instruments must play together harmoniously with perfect consonance, sharing the same chord progression and unified groove. Avoid polytonality and dissonance. Make it sound professional, structured, and emotionally resonant. `;

    if (this.instruments.rhythm.active && this.instruments.rhythm.weight > 0) {
        narrative += `The rhythm track provides the main groove. `;
    } else {
        narrative += `The bass or harmonic foundation provides the main groove since there are no drums. `;
    }

    // Guidance / References
    const guidancePrompt = Array.from(this.prompts.values()).find(p => p.text === 'Guidance');
    const guidanceWeight = guidancePrompt?.weight ?? 1.0; 

    if (guidanceWeight < 0.5) {
        narrative += `This should be a purely original, highly creative interpretation. `;
    } else {
        const ref = this.specialInstruction || 'popular genre standard';
        narrative += `Use "${ref}" as a stylistic reference for the composition. `;
    }

    // Vocal Override
    if (this.generationMode === 'VOCALIZATION') {
         narrative += `This is a vocal performance in ${this.getRegionalLanguage()}. `;
         if (this.currentVocalSignal) narrative += `Vocal cue: ${this.currentVocalSignal}. `;
    } else {
        narrative += `Focus on the highest possible ${this.generationMode.toLowerCase()} for the audio generation. `;
    }

    // Construct Payload
    // 10.0 weight ensures the structural rules are paramount
    const finalPayload = [ { text: narrative, weight: 10.0 } ];
    
    // 3. Add Individual Instrument Prompts (Reinforcement)
    keys.forEach((k, i) => {
        const ch = this.instruments[k];
        if (ch.active && ch.visible !== false && ch.weight > 0.05) {
            let roleContext = "";
            if (k === 'lead') roleContext = "Primary Melody (Ensemble)";
            if (k === 'alto') roleContext = "Melodic Support (Doubling Lead)";
            if (k === 'bass') roleContext = "Rhythmic Foundation (Lock with Drums)";
            
            // We give individual instruments a VERY high weight so the model picks up their timbre over hallucinations
            finalPayload.push({ 
                text: `MANDATORY ACTIVE INSTRUMENT -> ${labels[i]}: ${ch.instrument}. ${roleContext}`, 
                weight: ch.weight * 10.0 // significantly boosted for strict adherence
            });
        } else {
            // Actively instruct to mute
            finalPayload.push({
                text: `MANDATORY SILENCE FOR ${labels[i].toUpperCase()}. DO NOT GENERATE ANY AUDIO FOR THIS ROLE. DO NOT ADD DEFAULT INSTRUMENTS.`,
                weight: 8.0
            });
        }
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

  private getActiveLimit() {
      // Allow all 18 knobs to be used if required by the preset/style
      return 18;
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
      } else if (g.includes('spiritual') || g.includes('classic') || g.includes('marching')) {
          // Increase width and density for orchestral feeling
          weights['Space'] += 0.3; weights['Atmosphere'] += 0.4; weights['Dynamics'] += 0.5; weights['Width'] += 0.7; weights['Density'] += 0.4;
      } else {
          weights['Dynamics'] += 0.3; weights['Space'] += 0.2; weights['Organic'] += 0.4; weights['Atmosphere'] += 0.1; weights['Variation'] += 0.2;
      }

      if (mood !== 'None') {
          switch (mood) {
              case 'Aggressive':
              case 'Intense':
              case 'Tense':
                  weights['Attack'] += 0.9; weights['Density'] += 0.7; weights['Dynamics'] += 0.5;
                  break;
              case 'Calm':
              case 'Peaceful':
              case 'Meditative':
                  weights['Space'] += 0.9; weights['Density'] -= 0.6; weights['Atmosphere'] += 0.4; weights['Dynamics'] -= 0.3;
                  break;
              case 'Epic':
              case 'Heroic':
              case 'Cinematic':
              case 'Dramatic':
                  weights['Width'] += 0.9; weights['Atmosphere'] += 0.7; weights['Dynamics'] += 0.8; weights['Density'] += 0.4;
                  break;
              case 'Ethereal':
              case 'Dreamy':
              case 'Spiritual':
              case 'Mysterious':
                  weights['Space'] += 0.9; weights['Atmosphere'] += 0.9; weights['Glide'] += 0.4; weights['Width'] += 0.5;
                  break;
              case 'Happy':
              case 'Joyful':
              case 'Uplifting':
              case 'Energetic':
              case 'Party':
                  weights['Brightness'] += 0.7; weights['Groove'] += 0.6; weights['Attack'] += 0.4; weights['Presence'] += 0.5;
                  break;
              case 'Sad':
              case 'Melancholic':
              case 'Sentimental':
              case 'Nostalgic':
                  weights['Authenticity'] += 0.8; weights['Organic'] += 0.7; weights['Dynamics'] -= 0.2; weights['Space'] += 0.3;
                  break;
              case 'Dark':
              case 'Ominous':
                  weights['Atmosphere'] += 0.8; weights['Brightness'] -= 0.6; weights['Density'] += 0.3; weights['Space'] += 0.4;
                  break;
              case 'Groovy':
              case 'Sexy':
              case 'Hypnotic':
                  weights['Groove'] += 0.9; weights['Texture'] += 0.5; weights['Presence'] += 0.4;
                  break;
              case 'Romantic':
              case 'Elegant':
                  weights['Organic'] += 0.8; weights['Dynamics'] += 0.4; weights['Authenticity'] += 0.6;
                  break;
              case 'Whimsical':
              case 'Quirky':
                  weights['Ornamentation'] += 0.8; weights['Staccato'] += 0.6; weights['Variation'] += 0.5;
                  break;
              case 'Soulful':
                  weights['Authenticity'] += 0.9; weights['Organic'] += 0.7; weights['Dynamics'] += 0.5;
                  break;
              case 'Triumphal':
                  weights['Brightness'] += 0.8; weights['Dynamics'] += 0.7; weights['Attack'] += 0.6; weights['Width'] += 0.5;
                  break;
          }
      }

      if (this.isVocalInstrumentActive()) weights['Authenticity'] += 0.8;

      // Increase Guidance importance when channels are locked to ensure strict adherence
      if (this.channelsLocked) {
          weights['Guidance'] += 2.0; 
      }

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

  private getNarrativeStructure(genre: string, style: string, totalSec: number): { name: string, type: string, durationPct: number }[] {
      const templates: { name: string, type: string, durationPct: number }[][] = [];
      
      const isClassical = ['Classic', 'Cinematic', 'Spiritual', 'Victorian', 'Renascentist', 'Ambient', 'Oriental', 'Marching'].includes(genre);
      const isJazz = ['Jazz', 'Blues', 'Western'].includes(genre);
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
      // --- Jazz / Blues / Western ---
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

  private generatePerformancePlan(startOffset: number = 0) {
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

  private addStage(time: number, name: string, availableKeys: Array<keyof InstrumentSet>, type: string) {
      const stage: PerformancePlanStage = {
          stageName: name,
          stageStartTimeSec: time,
          activeChannels: { lead: false, alto: false, harmonic: false, bass: false, rhythm: false },
          channelWeights: { lead: 0, alto: 0, harmonic: 0, bass: 0, rhythm: 0 },
          targets: []
      };

      const setStrict = (keys: Array<keyof InstrumentSet>, weight: number = 1.0) => {
          // Reset all first
          (['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const).forEach(k => {
              stage.activeChannels[k] = false;
              stage.channelWeights[k] = 0;
          });
          // Enable specific
          keys.forEach(k => {
              if (availableKeys.includes(k)) {
                  stage.activeChannels[k] = true;
                  stage.channelWeights[k] = weight;
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
  private stopConductor() { if (this.conductorTimer) { clearInterval(this.conductorTimer); this.conductorTimer = null; } this.activeHands = []; }
  
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
      }
      if (this.generationMode === 'VOCALIZATION' && this.isVocalInstrumentActive() && Math.random() < 0.05) {
          const v = VOWELS[Math.floor(Math.random() * VOWELS.length)];
          this.sendVocalSignal(v);
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

    if (this.conductorMode) {
        this.applyAuthenticPresets(this.genre, this.style, this.mood, this.generationMode);
    }
    
    // Always use fallback/procedural routine for standalone conductor
    this.generatePerformancePlan(0);

    this.setPlaybackState('loading');
    
    await this.startSession();

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
