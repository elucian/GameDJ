
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PlaybackState, InstrumentSet, MusicGenerationMode } from '../types';
import { uiSounds } from '../utils/UISounds';

export const MOODS = [
    'None', 'Epic', 'Cinematic', 'Aggressive', 'Calm', 'Sad', 'Happy', 'Joyful', 'Dark', 'Ethereal', 'Mysterious', 'Tense', 'Nostalgic', 'Heroic', 'Whimsical'
];

const FALLBACK_POOLS = {
  lead: ['Synthesizer', 'Electric Guitar', 'Acoustic Guitar', 'Saxophone', 'Trumpet', 'Clarinet', 'Flute', 'Violin', 'Cello', 'Harmonica', 'Vocal Chops', 'Bell Synth', 'Whistle', 'Pan Flute', 'Pipe Flute'],
  alto: ['Strings', 'Brass Section', 'Electric Piano', 'Vibraphone', 'Accordion', 'Saxophone', 'Trumpet', 'Viola', 'French Horn', 'Trombone', 'Brass Section', 'Strings', 'Flute', 'Recorder', 'Alto Recorder', 'Tenor Recorder', 'Accordion', 'Synthesizer', 'Electric Piano', 'Vibraphone', 'Harp', 'Low Whistle', 'Mandocello', 'Pan Flute', 'Electric Violin', 'Pipe Flute'],
  harmonic: ['Piano', 'Organ', 'Acoustic Guitar', 'Pads', 'Harp', 'Electric Piano', 'Strings', 'Choir', 'Harpsichord', 'Accordion', 'Harmonium'],
  bass: ['Electric Bass', 'Synth Bass', 'Double Bass', 'Tuba', 'Cello', 'Bassoon', 'Trombone', 'Didgeridoo', 'Timpani'],
  rhythm: ['Drum Kit', 'Electronic Drums', 'Hand Drum', 'Percussion', 'Tabla', 'Djembe', 'Taiko Drums', 'Tambourine', 'Bells']
};

const VOCAL_MARKERS = ['choir', 'vocal', 'soprano', 'vocals', 'voice'];

interface StyleSignature {
    bpm: number;
    bpmRange: [number, number];
    meters: string[];
    keys: string[]; 
    mode: 'Natural' | 'Minor';
    mood: string;
    manifest: { lead: boolean; alto: boolean; harmonic: boolean; bass: boolean; rhythm: boolean };
    instrumentPools: { 
        lead: string[]; 
        alto: string[];
        harmonic: string[]; 
        bass: string[]; 
        rhythm: string[]; 
    };
}

interface GenreDefinition {
    genre: string;
    styles: Record<string, StyleSignature>;
}

export const MUSIC_DATA: Record<string, GenreDefinition> = {
  'Pop': {
    genre: 'Pop',
    styles: {
      'Synth-Pop': {
        bpm: 120, bpmRange: [100, 130], meters: ['4/4'], keys: ['C Minor', 'Bb Major', 'G Minor'], mode: 'Minor', mood: 'Epic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Synthesizer', 'Bell Synth'], alto: ['Synthesizer', 'Pads'], harmonic: ['Synthesizer', 'Pads'], bass: ['Synth Bass', 'Electric Bass'], rhythm: ['Electronic Drums'] }
      },
      'Disco Pop': {
        bpm: 124, bpmRange: [115, 130], meters: ['4/4'], keys: ['D Major', 'G Major', 'A Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Saxophone', 'Electric Guitar', 'Trumpet'], alto: ['Saxophone', 'Brass Section'], harmonic: ['Piano', 'Strings', 'Electric Piano'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      },
      'K-Pop': {
        bpm: 128, bpmRange: [110, 145], meters: ['4/4'], keys: ['A Minor', 'E Minor', 'F# Minor'], mode: 'Minor', mood: 'Aggressive',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Vocal Chops', 'Synthesizer'], alto: ['Bell Synth', 'Synthesizer'], harmonic: ['Synthesizer', 'Stab Chords'], bass: ['Synth Bass', 'Electric Bass'], rhythm: ['Electronic Drums'] }
      },
      'R&B': {
        bpm: 90, bpmRange: [60, 120], meters: ['4/4', '6/8'], keys: ['Ab Major', 'F Minor', 'Db Major', 'Eb Major', 'C Minor', 'Bb Major'], mode: 'Minor', mood: 'Calm',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { 
          lead: ['Vocal Chops', 'Synthesizer', 'Saxophone', 'Electric Guitar'], 
          alto: ['Electric Piano', 'Pads', 'Brass Section', 'Saxophone'], 
          harmonic: ['Electric Piano', 'Pads', 'Piano', 'Organ'], 
          bass: ['Synth Bass', 'Electric Bass'], 
          rhythm: ['Electronic Drums', 'Drum Kit'] 
        }
      },
      'Indie Pop': {
        bpm: 110, bpmRange: [90, 125], meters: ['4/4'], keys: ['G Major', 'C Major', 'D Major'], mode: 'Natural', mood: 'Nostalgic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Electric Guitar', 'Whistle'], alto: ['Acoustic Guitar', 'Clarinet', 'Low Whistle'], harmonic: ['Acoustic Guitar', 'Piano'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      },
      'Pop Rock': {
        bpm: 122, bpmRange: [110, 140], meters: ['4/4'], keys: ['E Major', 'A Major', 'G Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Electric Guitar'], alto: ['Electric Guitar', 'Piano'], harmonic: ['Piano', 'Electric Guitar'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      }
    }
  },
  'Blues': {
    genre: 'Blues',
    styles: {
      'Delta Blues': {
        bpm: 75, bpmRange: [60, 90], meters: ['4/4', '12/8'], keys: ['E Major', 'A Major', 'G Major'], mode: 'Natural', mood: 'Sad',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Acoustic Guitar', 'Harmonica'], alto: ['Acoustic Guitar', 'Harmonica'], harmonic: ['Acoustic Guitar'], bass: ['Double Bass', 'Harmonica'], rhythm: [] }
      },
      'Chicago Blues': {
        bpm: 110, bpmRange: [90, 130], meters: ['4/4'], keys: ['A Major', 'D Major', 'G Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Electric Guitar', 'Harmonica'], alto: ['Saxophone', 'Trumpet'], harmonic: ['Piano', 'Electric Guitar'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      },
      'Texas Blues': {
        bpm: 130, bpmRange: [110, 160], meters: ['4/4'], keys: ['Eb Major', 'Bb Major', 'E Major'], mode: 'Natural', mood: 'Aggressive',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Electric Guitar', 'Harmonica'], alto: ['Electric Guitar', 'Organ'], harmonic: ['Piano', 'Electric Guitar'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      },
      'Blues Rock': {
        bpm: 120, bpmRange: [100, 145], meters: ['4/4'], keys: ['E Minor', 'A Minor', 'D Minor'], mode: 'Minor', mood: 'Epic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Electric Guitar', 'Synthesizer', 'Harmonica'], alto: ['Organ', 'Electric Guitar'], harmonic: ['Organ', 'Electric Guitar'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      },
      'Soul Blues': {
        bpm: 85, bpmRange: [70, 100], meters: ['4/4', '6/8'], keys: ['C Major', 'F Major', 'Bb Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Trumpet', 'Saxophone', 'Harmonica'], alto: ['Trombone', 'Brass Section'], harmonic: ['Electric Piano', 'Brass Section'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      }
    }
  },
  'Jazz': {
    genre: 'Jazz',
    styles: {
      'Acid Jazz': {
        bpm: 110, bpmRange: [100, 120], meters: ['4/4', '3/4'], keys: ['C Minor', 'A Minor', 'F Minor'], mode: 'Minor', mood: 'Calm',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Saxophone', 'Trumpet', 'Synthesizer'], alto: ['Vibraphone', 'Electric Piano'], harmonic: ['Electric Piano', 'Electric Guitar'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      },
      'Jazz Fusion': {
        bpm: 130, bpmRange: [110, 150], meters: ['4/4', '5/4', '7/8'], keys: ['G Major', 'D Major', 'C Major'], mode: 'Natural', mood: 'Epic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Electric Violin', 'Synthesizer'], alto: ['Electric Piano', 'Vibraphone'], harmonic: ['Electric Piano', 'Electric Guitar'], bass: ['Synth Bass', 'Electric Bass'], rhythm: ['Drum Kit'] }
      },
      'Bebop': {
        bpm: 180, bpmRange: [160, 240], meters: ['4/4'], keys: ['Bb Major', 'Eb Major', 'F Major'], mode: 'Natural', mood: 'Aggressive',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Saxophone', 'Trumpet'], alto: ['Trumpet', 'Clarinet'], harmonic: ['Piano'], bass: ['Double Bass'], rhythm: ['Drum Kit'] }
      },
      'Cool Jazz': {
        bpm: 90, bpmRange: [70, 110], meters: ['4/4', '3/4'], keys: ['C Major', 'G Major', 'A Major'], mode: 'Natural', mood: 'Calm',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Trumpet', 'Clarinet'], alto: ['Saxophone', 'Flute'], harmonic: ['Piano', 'Electric Piano'], bass: ['Double Bass'], rhythm: ['Drum Kit'] }
      },
      'Smooth Jazz': {
        bpm: 95, bpmRange: [80, 110], meters: ['4/4'], keys: ['F Major', 'Bb Major', 'Eb Major'], mode: 'Natural', mood: 'Calm',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Saxophone', 'Flute'], alto: ['Electric Piano', 'Vibraphone'], harmonic: ['Electric Piano', 'Electric Guitar'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      }
    }
  },
  'Electronic': {
    genre: 'Electronic',
    styles: {
      'Techno': {
        bpm: 128, bpmRange: [124, 132], meters: ['4/4'], keys: ['C Minor', 'F Minor', 'G Minor'], mode: 'Minor', mood: 'Dark',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Synthesizer'], alto: ['Synthesizer'], harmonic: ['Pads'], bass: ['Synth Bass'], rhythm: ['Electronic Drums'] }
      },
      'Drum & Bass': {
        bpm: 174, bpmRange: [165, 180], meters: ['4/4'], keys: ['F Minor', 'C Minor', 'G Minor'], mode: 'Minor', mood: 'Aggressive',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Synthesizer'], alto: ['Synthesizer'], harmonic: ['Pads'], bass: ['Synth Bass'], rhythm: ['Electronic Drums'] }
      },
      'Vaporwave': {
        bpm: 85, bpmRange: [70, 100], meters: ['4/4'], keys: ['E Major', 'A Major', 'D Major'], mode: 'Natural', mood: 'Nostalgic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Saxophone', 'Synthesizer'], alto: ['Piano', 'Electric Piano'], harmonic: ['Electric Piano', 'Pads'], bass: ['Electric Bass'], rhythm: ['Electronic Drums'] }
      },
      'Deep House': {
        bpm: 122, bpmRange: [118, 126], meters: ['4/4'], keys: ['A Minor', 'E Minor', 'D Minor'], mode: 'Minor', mood: 'Calm',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Piano', 'Synthesizer'], alto: ['Electric Piano', 'Pads'], harmonic: ['Pads', 'Electric Piano'], bass: ['Synth Bass', 'Electric Bass'], rhythm: ['Electronic Drums'] }
      },
      'Synthwave': {
        bpm: 110, bpmRange: [90, 130], meters: ['4/4'], keys: ['C Minor', 'G Minor', 'Bb Major'], mode: 'Minor', mood: 'Epic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Synthesizer', 'Bell Synth'], alto: ['Pads'], harmonic: ['Pads'], bass: ['Synth Bass'], rhythm: ['Electronic Drums'] }
      }
    }
  },
  'Rock': {
    genre: 'Rock',
    styles: {
      'Classic Rock': {
        bpm: 120, bpmRange: [100, 140], meters: ['4/4', '12/8'], keys: ['E Major', 'A Major', 'G Major'], mode: 'Natural', mood: 'Epic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Electric Guitar'], alto: ['Piano', 'Organ'], harmonic: ['Organ', 'Electric Guitar'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      },
      'Shoegaze': {
        bpm: 110, bpmRange: [90, 120], meters: ['4/4'], keys: ['G Major', 'D Major', 'A Major'], mode: 'Natural', mood: 'Ethereal',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Electric Guitar'], alto: ['Electric Guitar', 'Strings'], harmonic: ['Strings', 'Electric Guitar'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      },
      'Heavy Metal': {
        bpm: 150, bpmRange: [120, 190], meters: ['4/4', '3/4'], keys: ['E Minor', 'A Minor', 'D Minor'], mode: 'Minor', mood: 'Aggressive',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Electric Guitar'], alto: ['Electric Guitar', 'Bassoon'], harmonic: ['Electric Guitar'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      },
      'Indie Rock': {
        bpm: 125, bpmRange: [110, 145], meters: ['4/4'], keys: ['D Major', 'G Major', 'C Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Electric Guitar'], alto: ['Acoustic Guitar', 'Piano', 'Low Whistle'], harmonic: ['Acoustic Guitar', 'Piano'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      }
    }
  },
  'Ambient': {
    genre: 'Ambient',
    styles: {
      'Deep Space': {
        bpm: 60, bpmRange: [40, 80], meters: ['Free'], keys: ['C Minor', 'G Minor', 'D Minor'], mode: 'Minor', mood: 'Dark',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Synthesizer'], alto: ['Pads'], harmonic: ['Pads'], bass: ['Synth Bass', 'Double Bass'], rhythm: [] }
      },
      'Lofi Chill': {
        bpm: 85, bpmRange: [75, 95], meters: ['4/4'], keys: ['Am Minor', 'Dm Minor', 'Em Minor'], mode: 'Minor', mood: 'Calm',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Piano', 'Electric Piano'], alto: ['Electric Piano', 'Acoustic Guitar'], harmonic: ['Acoustic Guitar', 'Pads'], bass: ['Electric Bass'], rhythm: ['Electronic Drums'] }
      },
      'Cinematic': {
        bpm: 70, bpmRange: [50, 100], meters: ['4/4', '3/4'], keys: ['D Minor', 'G Minor', 'A Minor'], mode: 'Minor', mood: 'Cinematic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Cello', 'French Horn'], alto: ['Viola', 'French Horn'], harmonic: ['Strings', 'Piano'], bass: ['Double Bass', 'Timpani'], rhythm: ['Taiko Drums'] }
      },
      'Nature Soundscape': {
        bpm: 50, bpmRange: [30, 70], meters: ['Free'], keys: ['F Major', 'C Major', 'G Major'], mode: 'Natural', mood: 'Ethereal',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Flute', 'Pan Flute'], alto: ['Flute', 'Harp', 'Pan Flute'], harmonic: ['Pads', 'Harp'], bass: ['Double Bass'], rhythm: [] }
      },
      'Dark Ambient': {
        bpm: 45, bpmRange: [30, 60], meters: ['Free'], keys: ['D Minor', 'Bb Minor', 'Ab Minor'], mode: 'Minor', mood: 'Dark',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Synthesizer'], alto: ['Pads'], harmonic: ['Pads'], bass: ['Double Bass'], rhythm: [] }
      },
      'Arctic Tundra': {
        bpm: 40, bpmRange: [30, 55], meters: ['Free'], keys: ['Eb Major', 'C Minor'], mode: 'Natural', mood: 'Ethereal',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Crystal Lead', 'Synthesizer'], alto: ['Pads', 'Crystal Lead'], harmonic: ['Pads'], bass: ['Double Bass'], rhythm: [] }
      },
      'Solar Wind': {
        bpm: 55, bpmRange: [45, 70], meters: ['Free'], keys: ['A Major', 'F# Minor'], mode: 'Natural', mood: 'Mysterious',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Synthesizer'], alto: ['Pads'], harmonic: ['Pads'], bass: ['Synth Bass', 'Double Bass'], rhythm: [] }
      },
      'Industrial Decay': {
        bpm: 65, bpmRange: [50, 80], meters: ['4/4', 'Free'], keys: ['F Minor', 'B Minor'], mode: 'Minor', mood: 'Dark',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Synthesizer', 'Violin'], alto: ['Pads', 'Synthesizer'], harmonic: ['Pads'], bass: ['Synth Bass', 'Electric Bass'], rhythm: ['Industrial Percussion'] }
      },
      'Deep Forest': {
        bpm: 40, bpmRange: [40, 65], meters: ['Free', '4/4'], keys: ['G Major', 'E Minor'], mode: 'Natural', mood: 'Calm',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Flute', 'Pan Flute'], alto: ['Clarinet', 'Flute', 'Low Whistle', 'Pan Flute'], harmonic: ['Harp', 'Acoustic Guitar'], bass: ['Double Bass'], rhythm: [] }
      },
      'Australian Desert': {
        bpm: 45, bpmRange: [35, 60], meters: ['Free'], keys: ['D Minor', 'A Minor'], mode: 'Minor', mood: 'Mysterious',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Didgeridoo', 'Flute'], alto: ['Bassoon', 'Flute'], harmonic: ['Pads'], bass: ['Didgeridoo', 'Double Bass'], rhythm: ['Hand Drum'] }
      },
      'African Jungle': {
        bpm: 90, bpmRange: [75, 110], meters: ['4/4'], keys: ['F Major', 'C Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Kalimba', 'Flute'], alto: ['Saxophone', 'Flute'], harmonic: ['Harp'], bass: ['Electric Bass'], rhythm: ['Djembe'] }
      },
      'Vast Ocean': {
        bpm: 35, bpmRange: [25, 50], meters: ['Free'], keys: ['Bb Major', 'Eb Major'], mode: 'Natural', mood: 'Ethereal',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Cello', 'Choir'], alto: ['Pads', 'French Horn'], harmonic: ['Pads', 'Harp'], bass: ['Double Bass'], rhythm: [] }
      }
    }
  },
  'Gaming': {
    genre: 'Gaming',
    styles: {
      '8-Bit Retro': {
        bpm: 140, bpmRange: [120, 160], meters: ['4/4'], keys: ['C Major', 'G Major', 'F Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Pulse Wave', 'Synthesizer'], alto: ['Synthesizer'], harmonic: ['Synthesizer'], bass: ['Synth Bass', 'Electric Bass'], rhythm: ['Electronic Drums'] }
      },
      'Epic Boss': {
        bpm: 150, bpmRange: [130, 170], meters: ['4/4', '7/8'], keys: ['E Minor', 'D Minor', 'B Minor'], mode: 'Minor', mood: 'Aggressive',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Synthesizer', 'Organ'], alto: ['Brass Section', 'Organ'], harmonic: ['Brass Section'], bass: ['Synth Bass', 'Timpani', 'Electric Bass'], rhythm: ['Taiko Drums'] }
      },
      'RPG Adventure': {
        bpm: 115, bpmRange: [90, 140], meters: ['3/4', '4/4'], keys: ['G Major', 'D Major', 'E Minor'], mode: 'Natural', mood: 'Heroic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Oboe'], alto: ['Flute', 'Viola'], harmonic: ['Harp', 'Acoustic Guitar'], bass: ['Double Bass'], rhythm: ['Hand Drum', 'Timpani'] }
      },
      'Cyberpunk': {
        bpm: 105, bpmRange: [90, 120], meters: ['4/4'], keys: ['C Minor', 'F Minor', 'Gb Major'], mode: 'Minor', mood: 'Dark',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Synthesizer'], alto: ['Synthesizer'], harmonic: ['Synthesizer'], bass: ['Synth Bass', 'Electric Bass'], rhythm: ['Electronic Drums'] }
      },
      'Stealth': {
        bpm: 90, bpmRange: [75, 110], meters: ['4/4', '5/4'], keys: ['A Minor', 'E Minor', 'D Minor'], mode: 'Minor', mood: 'Mysterious',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Synthesizer', 'Trumpet'], alto: ['Synthesizer'], harmonic: ['Pads'], bass: ['Synth Bass', 'Double Bass'], rhythm: ['Electronic Drums'] }
      },
      'Dungeon Crawler': {
        bpm: 70, bpmRange: [50, 90], meters: ['4/4', '3/4'], keys: ['D Minor', 'A Minor'], mode: 'Minor', mood: 'Mysterious',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Cello', 'Oboe'], alto: ['Viola', 'Cello'], harmonic: ['Strings'], bass: ['Double Bass'], rhythm: ['Taiko Drums'] }
      },
      'Racing Arcade': {
        bpm: 160, bpmRange: [140, 180], meters: ['4/4'], keys: ['G Major', 'E Major'], mode: 'Natural', mood: 'Aggressive',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Electric Guitar', 'Synthesizer'], alto: ['Synthesizer'], harmonic: ['Pads', 'Synthesizer'], bass: ['Synth Bass', 'Electric Bass'], rhythm: ['Drum Kit', 'Electronic Drums'] }
      },
      'Cozy Simulation': {
        bpm: 95, bpmRange: [80, 110], meters: ['4/4', '3/4'], keys: ['C Major', 'G Major'], mode: 'Natural', mood: 'Whimsical',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Clarinet', 'Whistle'], alto: ['Flute', 'Ukulele'], harmonic: ['Ukulele', 'Acoustic Guitar', 'Piano'], bass: ['Electric Bass'], rhythm: ['Hand Drum'] }
      },
      'Platformer Bounce': {
        bpm: 132, bpmRange: [110, 150], meters: ['4/4'], keys: ['C Major', 'F Major', 'G Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Synthesizer', 'Marimba'], alto: ['Marimba', 'Woodblock'], harmonic: ['Synthesizer', 'Ukulele'], bass: ['Synth Bass', 'Electric Bass'], rhythm: ['Electronic Drums'] }
      },
      'Survival Horror': {
        bpm: 60, bpmRange: [40, 80], meters: ['Free', '3/4'], keys: ['D Minor', 'Eb Minor'], mode: 'Minor', mood: 'Dark',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Choir'], alto: ['Viola'], harmonic: ['Pads', 'Piano'], bass: ['Double Bass'], rhythm: ['Electronic Drums'] }
      }
    }
  },
  'Classic': {
    genre: 'Classic',
    styles: {
      'Baroque': {
        bpm: 80, bpmRange: [60, 100], meters: ['4/4', '3/4'], keys: ['G Major', 'C Major', 'D Major'], mode: 'Natural', mood: 'Mysterious',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Violin', 'Oboe', 'Trumpet', 'Recorder'], alto: ['Viola', 'Flute', 'Recorder'], harmonic: ['Harpsichord', 'Harp', 'Strings'], bass: ['Cello', 'Double Bass', 'Harmonica', 'Recorder'], rhythm: [] }
      },
      'Romantic': {
        bpm: 70, bpmRange: [50, 90], meters: ['3/4', '4/4'], keys: ['Eb Major', 'Ab Major', 'C Minor'], mode: 'Minor', mood: 'Sad',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Cello', 'Violin'], alto: ['Viola', 'French Horn'], harmonic: ['Piano', 'Strings', 'Harp'], bass: ['Double Bass', 'Timpani'], rhythm: ['Timpani'] }
      },
      'Impressionist': {
        bpm: 65, bpmRange: [40, 85], meters: ['Free', '3/4', '4/4'], keys: ['Gb Major', 'Db Major', 'Cb Major'], mode: 'Natural', mood: 'Ethereal',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Flute', 'Harp', 'Cello', 'Recorder'], alto: ['Clarinet', 'Flute', 'Recorder'], harmonic: ['Piano', 'Harp', 'Strings'], bass: ['Cello', 'Double Bass'], rhythm: [] }
      },
      'Modern Classical': {
        bpm: 110, bpmRange: [80, 150], meters: ['4/4', '5/8', '7/8'], keys: ['C Major', 'F Minor', 'D Major'], mode: 'Natural', mood: 'Epic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Clarinet'], alto: ['Viola', 'Flute'], harmonic: ['Piano', 'Marimba'], bass: ['Double Bass'], rhythm: ['Hand Drum'] }
      },
      'Opera/Dramatic': {
        bpm: 75, bpmRange: [50, 110], meters: ['4/4', '3/4'], keys: ['D Minor', 'G Minor', 'A Major'], mode: 'Minor', mood: 'Cinematic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Cello'], alto: ['Viola', 'Choir'], harmonic: ['Strings', 'Organ'], bass: ['Double Bass'], rhythm: ['Timpani'] }
      },
      'Viennese Waltz': {
        bpm: 170, bpmRange: [140, 200], meters: ['3/4'], keys: ['D Major', 'G Major', 'C Major'], mode: 'Natural', mood: 'Elegant',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Violin', 'Flute'], alto: ['Viola', 'French Horn'], harmonic: ['Piano', 'Strings'], bass: ['Double Bass'], rhythm: [] }
      },
      'Minimalist Classical': {
        bpm: 120, bpmRange: [100, 140], meters: ['4/4', '5/4'], keys: ['C Major', 'A Minor', 'E Minor'], mode: 'Natural', mood: 'Calm',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Piano', 'Marimba', 'Violin'], alto: ['Clarinet', 'Viola'], harmonic: ['Piano', 'Strings'], bass: ['Double Bass', 'Cello'], rhythm: ['Hand Drum'] }
      }
    }
  },
  'Renascentist': {
    genre: 'Renascentist',
    styles: {
      'Royal Court': {
        bpm: 120, bpmRange: [110, 130], meters: ['4/4', '2/2'], keys: ['G Major', 'C Major', 'F Major'], mode: 'Natural', mood: 'Elegant',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Lute', 'Recorder'], alto: ['Recorder', 'Lute'], harmonic: ['Harpsichord'], bass: ['Viola da Gamba', 'Double Bass', 'Recorder'], rhythm: ['Hand Drum'] }
      },
      'Cathedral': {
        bpm: 70, bpmRange: [60, 80], meters: ['Free', '4/4'], keys: ['D Minor', 'A Minor', 'G Minor'], mode: 'Minor', mood: 'Pious',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Choir'], alto: ['Choir', 'Recorder'], harmonic: ['Choir'], bass: ['Choir', 'Double Bass', 'Recorder'], rhythm: [] }
      },
      'Minstrel Ballad': {
        bpm: 85, bpmRange: [70, 100], meters: ['3/4', '4/4'], keys: ['D Minor', 'G Major', 'C Major'], mode: 'Natural', mood: 'Nostalgic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Lute', 'Recorder', 'Pipe Flute'], alto: ['Lute', 'Recorder', 'Pipe Flute'], harmonic: ['Harp'], bass: ['Cello', 'Double Bass', 'Recorder'], rhythm: ['Tambourine'] }
      },
      'Tudor Dance': {
        bpm: 130, bpmRange: [115, 145], meters: ['6/8', '2/2'], keys: ['G Major', 'D Major', 'F Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Recorder'], alto: ['Recorder', 'Lute'], harmonic: ['Lute'], bass: ['Viola da Gamba', 'Double Bass', 'Recorder'], rhythm: ['Hand Drum'] }
      },
      'Village Festival': {
        bpm: 110, bpmRange: [90, 130], meters: ['4/4', '3/4'], keys: ['A Minor', 'E Minor', 'D Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Lute', 'Recorder', 'Pipe Flute'], alto: ['Recorder', 'Lute', 'Pipe Flute'], harmonic: ['Harpsichord'], bass: ['Viola da Gamba', 'Double Bass', 'Recorder'], rhythm: ['Hand Drum'] }
      }
    }
  },
  'Victorian': {
    genre: 'Victorian',
    styles: {
      'Gothic Horror': {
        bpm: 60, bpmRange: [50, 75], meters: ['4/4', '3/4'], keys: ['C Minor', 'D Minor', 'G Minor'], mode: 'Minor', mood: 'Ominous',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Cello', 'Organ'], alto: ['Organ', 'Viola'], harmonic: ['Strings'], bass: ['Brass Section', 'Double Bass', 'Harmonica'], rhythm: ['Timpani'] }
      },
      'Parlour Waltz': {
        bpm: 105, bpmRange: [90, 120], meters: ['3/4'], keys: ['Eb Major', 'Ab Major', 'Bb Major'], mode: 'Natural', mood: 'Nostalgic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Flute', 'Clarinet', 'Recorder'], alto: ['Clarinet', 'Flute', 'Recorder'], harmonic: ['Piano', 'Harp'], bass: ['Cello', 'Double Bass'], rhythm: [] }
      },
      'Steampunk Factory': {
        bpm: 125, bpmRange: [110, 140], meters: ['4/4', '7/8'], keys: ['A Minor', 'G Minor', 'E Minor'], mode: 'Minor', mood: 'Aggressive',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Accordion', 'Violin', 'Harmonica'], alto: ['Harmonica', 'Accordion'], harmonic: ['Piano', 'Harpsichord'], bass: ['Tuba', 'Double Bass'], rhythm: ['Industrial Percussion'] }
      },
      'Industrial Revolution': {
        bpm: 115, bpmRange: [100, 130], meters: ['4/4', '2/4'], keys: ['C Minor', 'D Minor'], mode: 'Minor', mood: 'Dark',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Whistle', 'Trumpet'], alto: ['Trumpet'], harmonic: ['Strings', 'Pads'], bass: ['Tuba', 'Double Bass'], rhythm: ['Industrial Percussion'] }
      },
      'Detective Mystery': {
        bpm: 80, bpmRange: [65, 95], meters: ['4/4', '5/4'], keys: ['D Minor', 'A Minor', 'E Minor'], mode: 'Minor', mood: 'Mysterious',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Cello'], alto: ['Clarinet', 'Flute'], harmonic: ['Piano', 'Harp'], bass: ['Double Bass'], rhythm: ['Drum Kit'] }
      }
    }
  },
  'Spiritual': {
    genre: 'Spiritual',
    styles: {
      'Gregorian Chant': {
        bpm: 50, bpmRange: [40, 60], meters: ['Free'], keys: ['D Dorian', 'A Aeolian'], mode: 'Natural', mood: 'Ethereal',
        manifest: { lead: true, alto: true, harmonic: false, bass: true, rhythm: false },
        instrumentPools: { lead: ['Choir'], alto: ['Choir'], harmonic: [], bass: ['Double Bass', 'Recorder'], rhythm: [] }
      },
      'Byzantine Chant': {
        bpm: 55, bpmRange: [45, 65], meters: ['Free'], keys: ['D Minor', 'E Minor'], mode: 'Minor', mood: 'Mysterious',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Choir'], alto: ['Choir'], harmonic: ['Choir', 'Pads'], bass: ['Double Bass'], rhythm: [] }
      },
      'Gospel': {
        bpm: 90, bpmRange: [70, 120], meters: ['4/4', '12/8'], keys: ['Db Major', 'Ab Major', 'Gb Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Choir'], alto: ['Choir', 'Saxophone'], harmonic: ['Piano', 'Choir'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      },
      'New Age Healing': {
        bpm: 60, bpmRange: [40, 80], meters: ['Free', '4/4'], keys: ['C Major', 'G Major', 'F Major'], mode: 'Natural', mood: 'Calm',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Flute', 'Harp'], alto: ['Harp', 'Pads'], harmonic: ['Pads'], bass: ['Double Bass'], rhythm: ['Bells'] }
      },
      'Shamanic Pulse': {
        bpm: 100, bpmRange: [80, 120], meters: ['4/4', '2/4'], keys: ['A Minor', 'E Minor', 'D Minor'], mode: 'Minor', mood: 'Epic',
        manifest: { lead: true, alto: true, harmonic: false, bass: true, rhythm: true },
        instrumentPools: { lead: ['Flute', 'Pan Flute'], alto: ['Flute', 'Low Whistle', 'Pan Flute'], harmonic: [], bass: ['Didgeridoo', 'Double Bass'], rhythm: ['Hand Drum'] }
      },
      'Zen Meditation': {
        bpm: 40, bpmRange: [30, 50], meters: ['Free'], keys: ['G Major', 'D Major'], mode: 'Natural', mood: 'Calm',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Shakuhachi', 'Pipe Flute'], alto: ['Flute', 'Koto', 'Pipe Flute'], harmonic: ['Koto'], bass: ['Double Bass'], rhythm: ['Hand Drum'] }
      },
      'Christmas Carols': {
        bpm: 85, bpmRange: [65, 115], meters: ['4/4', '3/4', '6/8'], keys: ['G Major', 'C Major', 'D Major', 'F Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { 
          lead: ['Choir', 'Violin', 'Recorder', 'Flute'], 
          alto: ['Flute', 'Viola', 'Recorder'],
          harmonic: ['Piano', 'Organ', 'Harp', 'Acoustic Guitar'], 
          bass: ['Double Bass', 'Electric Bass', 'Recorder'], 
          rhythm: ['Bells', 'Hand Drum', 'Tambourine'] 
        }
      }
    }
  },
  'African': {
    genre: 'African',
    styles: {
      'Afrobeats': {
        bpm: 110, bpmRange: [100, 120], meters: ['4/4'], keys: ['F Major', 'G Minor', 'Bb Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Saxophone', 'Electric Guitar'], alto: ['Trumpet', 'Saxophone'], harmonic: ['Piano', 'Pads'], bass: ['Electric Bass'], rhythm: ['Electronic Drums', 'Hand Drum'] }
      },
      'Malian Blues': {
        bpm: 90, bpmRange: [80, 110], meters: ['4/4'], keys: ['G Major', 'C Major'], mode: 'Natural', mood: 'Nostalgic',
        manifest: { lead: true, alto: true, harmonic: false, bass: true, rhythm: true },
        instrumentPools: { lead: ['Kora', 'Acoustic Guitar'], alto: ['Kora', 'Acoustic Guitar'], harmonic: [], bass: ['Electric Bass'], rhythm: ['Hand Drum'] }
      },
      'Highlife': {
        bpm: 115, bpmRange: [100, 130], meters: ['4/4'], keys: ['C Major', 'G Major', 'D Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Trumpet', 'Electric Guitar'], alto: ['Saxophone', 'Trumpet'], harmonic: ['Piano'], bass: ['Electric Bass'], rhythm: ['Hand Drum', 'Drum Kit'] }
      },
      'Desert Rock': {
        bpm: 100, bpmRange: [85, 115], meters: ['4/4'], keys: ['D Minor', 'G Minor', 'A Minor'], mode: 'Minor', mood: 'Epic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Electric Guitar'], alto: ['Electric Guitar', 'Acoustic Guitar'], harmonic: ['Acoustic Guitar'], bass: ['Electric Bass'], rhythm: ['Hand Drum', 'Drum Kit'] }
      },
      'Marabi/Soweto': {
        bpm: 125, bpmRange: [110, 140], meters: ['4/4'], keys: ['C Major', 'F Major', 'G Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Saxophone', 'Trumpet'], alto: ['Trumpet', 'Saxophone'], harmonic: ['Piano', 'Acoustic Guitar'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      }
    }
  },
  'Indian': {
    genre: 'Indian',
    styles: {
      'Hindustani': {
        bpm: 65, bpmRange: [40, 120], meters: ['16-beat', '7-beat'], keys: ['C Major', 'G Major', 'D Major'], mode: 'Natural', mood: 'Calm',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Sitar', 'Bansuri', 'Sarod'], alto: ['Bansuri', 'Sarod'], harmonic: ['Tanpura'], bass: ['Double Bass'], rhythm: ['Tabla'] }
      },
      'Bhangra': {
        bpm: 135, bpmRange: [120, 150], meters: ['4/4'], keys: ['D Major', 'G Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Tumbi', 'Sitar'], alto: ['Harmonium', 'Sitar'], harmonic: ['Harmonium'], bass: ['Synth Bass', 'Electric Bass'], rhythm: ['Electronic Drums', 'Tabla'] }
      },
      'Carnatic': {
        bpm: 90, bpmRange: [70, 130], meters: ['8-beat', '7-beat'], keys: ['C Major', 'G Major', 'F Major'], mode: 'Natural', mood: 'Complex',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Veena', 'Flute'], alto: ['Veena', 'Viola'], harmonic: ['Tanpura'], bass: ['Double Bass'], rhythm: ['Tabla'] }
      },
      'Bollywood': {
        bpm: 120, bpmRange: [100, 140], meters: ['4/4'], keys: ['D Minor', 'G Minor', 'A Major'], mode: 'Minor', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Trumpet', 'Sitar'], alto: ['Sitar', 'Viola'], harmonic: ['Strings', 'Piano'], bass: ['Electric Bass'], rhythm: ['Tabla', 'Drum Kit'] }
      },
      'Tabla Solo/Raga': {
        bpm: 110, bpmRange: [60, 180], meters: ['16-beat', '10-beat', '12-beat'], keys: ['C Major'], mode: 'Natural', mood: 'Complex',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Sitar', 'Harmonium'], alto: ['Harmonium', 'Tanpura'], harmonic: ['Tanpura'], bass: ['Double Bass'], rhythm: ['Tabla'] }
      }
    }
  },
  'Irish': {
    genre: 'Irish',
    styles: {
      'Folk': {
        bpm: 115, bpmRange: [90, 130], meters: ['4/4', '3/4'], keys: ['D Major', 'G Major', 'A Major'], mode: 'Natural', mood: 'Nostalgic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Whistle', 'Recorder', 'Pan Flute'], alto: ['Violin', 'Whistle', 'Recorder', 'Low Whistle', 'Pan Flute'], harmonic: ['Acoustic Guitar', 'Harp'], bass: ['Double Bass'], rhythm: ['Hand Drum'] }
      },
      'Jig': {
        bpm: 110, bpmRange: [100, 130], meters: ['6/8'], keys: ['D Major', 'G Major'], mode: 'Natural', mood: 'Whimsical',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Bagpipes', 'Harmonica', 'Recorder'], alto: ['Whistle', 'Recorder', 'Low Whistle'], harmonic: ['Harp'], bass: ['Double Bass'], rhythm: ['Hand Drum'] }
      },
      'Reel': {
        bpm: 125, bpmRange: [115, 140], meters: ['4/4', '2/2'], keys: ['G Major', 'D Major', 'A Minor'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Flute', 'Recorder'], alto: ['Violin', 'Flute', 'Recorder', 'Low Whistle'], harmonic: ['Acoustic Guitar'], bass: ['Double Bass'], rhythm: ['Hand Drum'] }
      },
      'Air': {
        bpm: 60, bpmRange: [40, 80], meters: ['Free'], keys: ['D Major', 'G Major', 'A Minor'], mode: 'Natural', mood: 'Sad',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Whistle', 'Cello', 'Harmonica', 'Recorder', 'Pan Flute'], alto: ['Flute', 'Whistle', 'Recorder', 'Low Whistle', 'Pan Flute'], harmonic: ['Harp'], bass: ['Double Bass', 'Recorder'], rhythm: [] }
      },
      'Celtic Punk/Rock': {
        bpm: 140, bpmRange: [125, 160], meters: ['4/4'], keys: ['D Major', 'G Major', 'A Minor'], mode: 'Natural', mood: 'Aggressive',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Electric Guitar', 'Bagpipes', 'Harmonica'], alto: ['Electric Guitar', 'Accordion', 'Harmonica', 'Whistle', 'Low Whistle'], harmonic: ['Electric Guitar'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      }
    }
  },
  'Spanish': {
    genre: 'Spanish',
    styles: {
      'Salsa': {
        bpm: 180, bpmRange: [160, 210], meters: ['4/4'], keys: ['Am Minor', 'Dm Minor', 'Gm Minor'], mode: 'Minor', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Trumpet', 'Trombone'], alto: ['Saxophone', 'Trumpet'], harmonic: ['Piano'], bass: ['Electric Bass'], rhythm: ['Hand Drum'] }
      },
      'Bossa Nova': {
        bpm: 120, bpmRange: [100, 140], meters: ['4/4'], keys: ['F Major', 'C Major', 'G Major'], mode: 'Natural', mood: 'Calm',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Acoustic Guitar', 'Flute'], alto: ['Flute', 'Electric Piano'], harmonic: ['Piano', 'Electric Piano'], bass: ['Electric Bass'], rhythm: ['Hand Drum'] }
      },
      'Guitar': {
        bpm: 115, bpmRange: [90, 140], meters: ['4/4', '3/4'], keys: ['A Minor', 'E Minor', 'D Minor', 'G Major'], mode: 'Minor', mood: 'Nostalgic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Acoustic Guitar'], alto: ['Acoustic Guitar'], harmonic: ['Acoustic Guitar'], bass: ['Double Bass', 'Electric Bass'], rhythm: ['Hand Drum'] }
      },
      'Tango': {
        bpm: 115, bpmRange: [100, 130], meters: ['4/4', '2/4'], keys: ['A Minor', 'D Minor', 'G Minor'], mode: 'Minor', mood: 'Epic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Accordion', 'Violin', 'Harmonica'], alto: ['Viola', 'Accordion', 'Harmonica'], harmonic: ['Piano'], bass: ['Double Bass'], rhythm: [] }
      },
      'Reggaeton': {
        bpm: 95, bpmRange: [85, 105], meters: ['4/4'], keys: ['C Minor', 'Bb Major', 'G Minor'], mode: 'Minor', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Synthesizer'], alto: ['Synthesizer'], harmonic: ['Pads', 'Electric Guitar'], bass: ['Synth Bass', 'Electric Bass'], rhythm: ['Electronic Drums'] }
      },
      'Flamenco': {
        bpm: 140, bpmRange: [110, 170], meters: ['12/8', '3/4', '4/4'], keys: ['A Minor', 'E Phrygian', 'D Minor'], mode: 'Minor', mood: 'Aggressive',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { 
          lead: ['Acoustic Guitar'], 
          alto: ['Acoustic Guitar', 'Clapping'],
          harmonic: ['Acoustic Guitar'], 
          bass: ['Double Bass'], 
          rhythm: ['Clapping', 'Hand Drum'] 
        }
      },
      'Bolero': {
        bpm: 85, bpmRange: [75, 95], meters: ['4/4', '3/4'], keys: ['A Minor', 'D Minor', 'E Major'], mode: 'Minor', mood: 'Nostalgic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Acoustic Guitar', 'Violin'], alto: ['Trumpet', 'Saxophone'], harmonic: ['Acoustic Guitar', 'Piano'], bass: ['Double Bass', 'Electric Bass'], rhythm: ['Percussion', 'Shakers'] }
      },
      'Paso Doble': {
        bpm: 120, bpmRange: [110, 130], meters: ['2/4'], keys: ['G Major', 'C Major', 'F Major'], mode: 'Natural', mood: 'Aggressive',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Trumpet', 'Castanets'], alto: ['Trumpet', 'Accordion'], harmonic: ['Strings'], bass: ['Tuba', 'Double Bass'], rhythm: ['Hand Drum', 'Tambourine'] }
      }
    }
  },
  'Oriental': {
    genre: 'Oriental',
    styles: {
      'Arabic Classical': {
        bpm: 90, bpmRange: [70, 110], meters: ['10/8', '8/4', '4/4'], keys: ['D Minor', 'G Minor', 'A Minor'], mode: 'Minor', mood: 'Mysterious',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Oud', 'Pan Flute'], alto: ['Pan Flute', 'Oud'], harmonic: ['Qanun'], bass: ['Double Bass'], rhythm: ['Hand Drum'] }
      },
      'Japanese Folk': {
        bpm: 75, bpmRange: [60, 100], meters: ['Free', '4/4'], keys: ['G Major', 'D Major'], mode: 'Natural', mood: 'Ethereal',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Koto', 'Shakuhachi'], alto: ['Shakuhachi', 'Flute'], harmonic: ['Guzheng'], bass: ['Double Bass'], rhythm: ['Taiko Drums'] }
      },
      'Chinese Traditional': {
        bpm: 85, bpmRange: [60, 110], meters: ['4/4', '2/4'], keys: ['C Major', 'G Major', 'D Major'], mode: 'Natural', mood: 'Ethereal',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Erhu', 'Flute'], alto: ['Pipa', 'Erhu'], harmonic: ['Guzheng', 'Pipa'], bass: ['Double Bass'], rhythm: ['Hand Drum'] }
      },
      'Turkish Folk': {
        bpm: 110, bpmRange: [90, 130], meters: ['7/8', '9/8', '5/8', '4/4'], keys: ['A Minor', 'E Minor'], mode: 'Minor', mood: 'Epic',
        manifest: { lead: true, alto: true, harmonic: false, bass: true, rhythm: true },
        instrumentPools: { lead: ['Bağlama', 'Zurna'], alto: ['Bağlama', 'Zurna'], harmonic: [], bass: ['Double Bass'], rhythm: ['Hand Drum'] }
      },
      'Balinese Gamelan': {
        bpm: 120, bpmRange: [90, 140], meters: ['Free', '4/4'], keys: ['C Major', 'G Major'], mode: 'Natural', mood: 'Mysterious',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Bell Synth'], alto: ['Marimba', 'Bell Synth'], harmonic: ['Marimba'], bass: ['Double Bass'], rhythm: ['Hand Drum'] }
      }
    }
  },
  'Romanian': {
    genre: 'Romanian',
    styles: {
      'Manele': {
        bpm: 100, bpmRange: [85, 115], meters: ['4/4', '2/4'], keys: ['C Minor', 'D Minor', 'G Minor', 'A Minor', 'E Minor'], mode: 'Minor', mood: 'Aggressive',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Synthesizer', 'Saxophone', 'Accordion', 'Harmonica', 'Pan Flute'], alto: ['Saxophone', 'Accordion', 'Harmonica', 'Low Whistle'], harmonic: ['Piano', 'Electric Guitar'], bass: ['Synth Bass', 'Electric Bass'], rhythm: ['Hand Drum', 'Electronic Drums'] }
      },
      'Doina': {
        bpm: 50, bpmRange: [40, 65], meters: ['Free'], keys: ['E Minor', 'A Minor'], mode: 'Minor', mood: 'Sad',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Caval', 'Violin', 'Pan Flute', 'Pipe Flute'], alto: ['Flute', 'Violin', 'Low Whistle', 'Pan Flute', 'Pipe Flute'], harmonic: ['Cimbalom', 'Pads'], bass: ['Double Bass'], rhythm: [] }
      },
      'Hora': {
        bpm: 120, bpmRange: [100, 140], meters: ['3/4', '2/4', '4/4'], keys: ['A Minor', 'D Minor', 'G Major'], mode: 'Minor', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Accordion', 'Harmonica', 'Pan Flute'], alto: ['Accordion', 'Viola', 'Harmonica', 'Pan Flute'], harmonic: ['Cimbalom'], bass: ['Double Bass'], rhythm: ['Hand Drum'] }
      },
      'Sârbă': {
        bpm: 155, bpmRange: [140, 180], meters: ['2/4', '4/4'], keys: ['A Minor', 'E Minor', 'D Minor', 'G Minor'], mode: 'Minor', mood: 'Aggressive',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Accordion', 'Flute', 'Harmonica', 'Pan Flute'], alto: ['Accordion', 'Saxophone', 'Harmonica', 'Low Whistle', 'Pan Flute'], harmonic: ['Cimbalom', 'Acoustic Guitar'], bass: ['Electric Bass', 'Double Bass'], rhythm: ['Hand Drum'] }
      },
      'Lautareasca': {
        bpm: 130, bpmRange: [110, 160], meters: ['4/4', '2/2'], keys: ['D Minor', 'G Minor', 'A Minor'], mode: 'Minor', mood: 'Epic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Violin', 'Accordion', 'Harmonica', 'Pan Flute'], alto: ['Accordion', 'Cimbalom', 'Harmonica', 'Pan Flute'], harmonic: ['Acoustic Guitar', 'Cimbalom'], bass: ['Double Bass'], rhythm: [] }
      },
      'Bănățeană': {
        bpm: 110, bpmRange: [95, 125], meters: ['4/4', '2/4'], keys: ['C Minor', 'G Minor', 'A Minor'], mode: 'Minor', mood: 'Epic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Accordion', 'Saxophone', 'Harmonica'], alto: ['Saxophone', 'Accordion', 'Harmonica', 'Low Whistle'], harmonic: ['Electric Piano', 'Accordion'], bass: ['Electric Bass'], rhythm: ['Drum Kit', 'Tambourine'] }
      },
      'Geampara': {
        bpm: 140, bpmRange: [120, 165], meters: ['7/8', '7/16', '9/8'], keys: ['A Minor', 'E Phrygian', 'D Minor', 'G Dorian'], mode: 'Minor', mood: 'Mysterious',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Accordion', 'Violin', 'Harmonica'], alto: ['Accordion', 'Viola', 'Harmonica'], harmonic: ['Cimbalom'], bass: ['Double Bass'], rhythm: ['Hand Drum'] }
      },
      'Invârtită': {
        bpm: 105, bpmRange: [90, 120], meters: ['3/4', '3/8', '4/4'], keys: ['G Major', 'D Major', 'A Minor', 'E Minor'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Clarinet'], alto: ['Accordion', 'Viola', 'Harmonica'], harmonic: ['Acoustic Guitar', 'Cimbalom'], bass: ['Double Bass'], rhythm: ['Hand Drum', 'Tambourine'] }
      },
      'Etno-Dance': {
        bpm: 132, bpmRange: [124, 140], meters: ['4/4'], keys: ['C Minor', 'A Minor', 'F# Minor', 'G Minor'], mode: 'Minor', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Synthesizer', 'Accordion', 'Harmonica'], alto: ['Synthesizer', 'Accordion', 'Harmonica'], harmonic: ['Synthesizer', 'Electric Guitar'], bass: ['Synth Bass', 'Electric Bass'], rhythm: ['Electronic Drums', 'Hand Drum'] }
      },
      'Colinde': {
        bpm: 90, bpmRange: [70, 110], meters: ['4/4', '3/4', '2/4'], keys: ['A Minor', 'E Minor', 'G Major', 'C Major'], mode: 'Minor', mood: 'Nostalgic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Accordion', "Choir", 'Violin', 'Harmonica', 'Recorder', 'Pan Flute'], alto: ['Viola', 'Accordion', 'Harmonica', 'Recorder', 'Low Whistle', 'Pan Flute'], harmonic: ['Acoustic Guitar', 'Accordion', 'Piano', 'Harpsichord'], bass: ['Double Bass', 'Electric Bass', 'Recorder'], rhythm: ['Bells', 'Hand Drum'] }
      },
      'Plugușorul': {
        bpm: 120, bpmRange: [100, 140], meters: ['2/4', '4/4'], keys: ['A Minor', 'E Minor', 'D Minor', 'G Major'], mode: 'Minor', mood: 'Joyful',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Flute', 'Accordion', 'Violin', 'Caval', 'Harmonica', 'Pan Flute', 'Pipe Flute'], alto: ['Caval', 'Flute', 'Low Whistle', 'Pan Flute', 'Pipe Flute'], harmonic: ['Cimbalom', 'Acoustic Guitar'], bass: ['Double Bass'], rhythm: ['Hand Drum', 'Tambourine', 'Stomps'] }
      }
    }
  },
  'Western': {
    genre: 'Western',
    styles: {
      'Bluegrass': {
        bpm: 145, bpmRange: [120, 180], meters: ['4/4', '2/4'], keys: ['G Major', 'C Major', 'D Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Banjo', 'Mandolin', 'Violin'], alto: ['Violin', 'Mandocello'], harmonic: ['Acoustic Guitar'], bass: ['Double Bass', 'Harmonica'], rhythm: [] }
      },
      'Country': {
        bpm: 105, bpmRange: [80, 125], meters: ['4/4'], keys: ['G Major', 'C Major', 'D Major', 'E Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Harmonica', 'Acoustic Guitar'], alto: ['Electric Guitar', 'Pedal Steel', 'Piano'], harmonic: ['Acoustic Guitar', 'Piano'], bass: ['Electric Bass', 'Double Bass'], rhythm: ['Drum Kit'] }
      },
      'Americana': {
        bpm: 92, bpmRange: [75, 115], meters: ['4/4', '3/4'], keys: ['A Minor', 'E Minor', 'G Major', 'D Major'], mode: 'Natural', mood: 'Nostalgic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Acoustic Guitar', 'Harmonica', 'Banjo'], alto: ['Violin', 'Cello', 'Accordion'], harmonic: ['Acoustic Guitar', 'Organ', 'Piano'], bass: ['Double Bass'], rhythm: ['Hand Drum', 'Drum Kit'] }
      },
      'Outlaw Country': {
        bpm: 110, bpmRange: [90, 130], meters: ['4/4'], keys: ['E Major', 'A Major', 'G Major'], mode: 'Natural', mood: 'Aggressive',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Electric Guitar', 'Harmonica'], alto: ['Electric Guitar', 'Piano'], harmonic: ['Acoustic Guitar', 'Piano'], bass: ['Electric Bass'], rhythm: ['Electric Guitar', 'Drum Kit'] }
      },
      'Honky Tonk': {
        bpm: 115, bpmRange: [100, 130], meters: ['4/4', '2/4'], keys: ['C Major', 'G Major', 'D Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Pedal Steel', 'Harmonica'], alto: ['Pedal Steel', 'Accordion', 'Harmonica'], harmonic: ['Piano', 'Acoustic Guitar'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      },
      'Rockabilly': {
        bpm: 165, bpmRange: [140, 190], meters: ['4/4', '2/2'], keys: ['E Major', 'A Major', 'G Major'], mode: 'Natural', mood: 'Aggressive',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Electric Guitar'], alto: ['Acoustic Guitar', 'Piano'], harmonic: ['Electric Guitar', 'Piano'], bass: ['Double Bass'], rhythm: ['Drum Kit'] }
      },
      'Alt-Country': {
        bpm: 115, bpmRange: [95, 135], meters: ['4/4'], keys: ['G Major', 'D Major', 'E Minor', 'A Minor'], mode: 'Natural', mood: 'Nostalgic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Electric Guitar', 'Harmonica'], alto: ['Strings', 'Cello'], harmonic: ['Acoustic Guitar', 'Organ'], bass: ['Electric Bass'], rhythm: ['Drum Kit'] }
      },
      'Texas Swing': {
        bpm: 135, bpmRange: [120, 155], meters: ['4/4', '2/4'], keys: ['C Major', 'G Major', 'F Major', 'D Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Trumpet', 'Clarinet'], alto: ['Saxophone', 'Pedal Steel'], harmonic: ['Piano', 'Acoustic Guitar'], bass: ['Double Bass'], rhythm: ['Drum Kit'] }
      },
      'Spaghetti Western': {
        bpm: 85, bpmRange: [70, 105], meters: ['4/4'], keys: ['D Minor', 'A Minor', 'E Minor'], mode: 'Minor', mood: 'Cinematic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Trumpet', 'Harmonica', 'Electric Guitar'], alto: ['Trumpet', 'Electric Guitar'], harmonic: ['Strings', 'Acoustic Guitar'], bass: ['Double Bass', 'Harmonica'], rhythm: ['Timpani', 'Drum Kit'] }
      },
      'Folk Revival': {
        bpm: 95, bpmRange: [80, 110], meters: ['4/4', '3/4'], keys: ['C Major', 'G Major', 'F Major'], mode: 'Natural', mood: 'Nostalgic',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Acoustic Guitar', 'Harmonica', 'Recorder'], alto: ['Harmonica', 'Acoustic Guitar', 'Recorder', 'Whistle', 'Low Whistle'], harmonic: ['Harp', 'Acoustic Guitar'], bass: ['Double Bass', 'Recorder'], rhythm: [] },
      },
      'Western Swing': {
        bpm: 135, bpmRange: [120, 160], meters: ['4/4'], keys: ['G Major', 'C Major', 'D Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Violin', 'Lap Steel', 'Electric Guitar'], alto: ['Saxophone', 'Trumpet', 'Low Whistle'], harmonic: ['Piano', 'Acoustic Guitar'], bass: ['Double Bass', 'Electric Bass'], rhythm: ['Drum Kit'] }
      },
      'Cowboy Ballad': {
        bpm: 68, bpmRange: [50, 85], meters: ['3/4', '4/4'], keys: ['C Major', 'G Major', 'D Major'], mode: 'Natural', mood: 'Sad',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: false },
        instrumentPools: { lead: ['Acoustic Guitar', 'Harmonica', 'Electric Guitar'], alto: ['Violin', 'Oboe', 'Low Whistle'], harmonic: ['Acoustic Guitar', 'Piano'], bass: ['Double Bass'], rhythm: [] }
      }
    }
  },
  'Hawaiian': {
    genre: 'Hawaiian',
    styles: {
      'Slack Key Guitar': {
        bpm: 90, bpmRange: [70, 110], meters: ['4/4'], keys: ['G Major', 'C Major', 'F Major'], mode: 'Natural', mood: 'Calm',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Ukulele', 'Acoustic Guitar'], alto: ['Acoustic Guitar', 'Low Whistle'], harmonic: ['Lap Steel Guitar'], bass: ['Double Bass'], rhythm: ['Hand Drum'] }
      },
      'Traditional Hula': {
        bpm: 75, bpmRange: [60, 95], meters: ['4/4'], keys: ['G Major', 'C Major'], mode: 'Natural', mood: 'Ethereal',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Ukulele', 'Whistle'], alto: ['Acoustic Guitar', 'Low Whistle'], harmonic: ['Lap Steel Guitar'], bass: ['Double Bass'], rhythm: ['Hand Drum'] }
      },
      'Island Reggae': {
        bpm: 100, bpmRange: [90, 115], meters: ['4/4'], keys: ['C Major', 'G Major', 'F Major'], mode: 'Natural', mood: 'Happy',
        manifest: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true },
        instrumentPools: { lead: ['Saxophone', 'Trumpet', 'Ukulele'], alto: ['Electric Guitar', 'Low Whistle'], harmonic: ['Lap Steel Guitar', 'Electric Piano'], bass: ['Electric Bass'], rhythm: ['Electronic Drums'] }
      }
    }
  }
};

const GENRE_MAP_MODERN = ['Jazz', 'Pop', 'Blues', 'Electronic', 'Rock', 'Ambient', 'Gaming'];
const GENRE_MAP_TRADITIONAL = ['Classic', 'Renascentist', 'Victorian', 'Spiritual'];
const GENRE_MAP_REGIONAL = ['African', 'Indian', 'Irish', 'Spanish', 'Oriental', 'Romanian', 'Western', 'Hawaiian'];

// Final Alto Replacement Audit
Object.values(MUSIC_DATA).forEach(genreDef => {
    Object.values(genreDef.styles).forEach(style => {
        if (style.instrumentPools.alto) {
            style.instrumentPools.alto = style.instrumentPools.alto.map(inst => inst === 'Mandolin' ? 'Mandocello' : inst);
        }
    });
});

@customElement('top-toolbar')
export class TopToolbar extends LitElement {
  static styles = css`
    :host { display: flex; align-items: center; justify-content: space-between; height: 100%; background: var(--surface-color); border-bottom: 1px solid var(--border-color); padding: 0; box-sizing: border-box; color: var(--text-color); user-select: none; gap: 0; font-family: 'Google Sans', sans-serif; width: 100%; overflow: hidden; transition: background-color 0.3s ease, border-color 0.3s ease; }
    .logo { font-weight: bold; font-size: 16px; color: var(--accent-color); display: flex; align-items: center; gap: 6px; padding: 0 16px; flex-shrink: 0; transition: padding 0.2s; }
    .brand-text { display: block; }
    @media (max-width: 1024px) {
      .brand-text { display: none; }
      .logo { padding: 0 8px; }
    }
    .logo span.version-badge { background: var(--accent-color); color: #000; padding: 2px 5px; border-radius: 4px; font-size: 10px; }
    .divider { width: 1px; height: 100%; background: var(--border-color); flex-shrink: 0; }
    .control-group { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; justify-content: center; padding: 0 12px; }
    .control-group.fixed { flex: 0 0 auto; }
    .label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px; width: 100%; }
    .label { font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; white-space: nowrap; }
    .row { display: flex; align-items: center; gap: 6px; }
    .slider-container { display: flex; align-items: center; gap: 6px; width: 100%; }
    input[type=range] { -webkit-appearance: none; background: transparent; width: 100%; height: 4px; border-radius: 2px; background: var(--border-color); outline: none; flex: 1; border: none; }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 12px; width: 8px; border-radius: 1px; background: silver; cursor: pointer; margin-top: -4px; box-shadow: 0 1px 3px rgba(0,0,0,0.6); border: 1px solid #999; }
    
    select, select::picker(select) {
      appearance: base-select; /* Unlock picker styling */
    }

    select { 
      background: var(--surface-active); color: var(--text-heading); 
      border: 1px solid var(--border-active); border-radius: 4px; padding: 0 2px; 
      font-size: 10px; outline: none; cursor: pointer; font-family: monospace; 
      width: 100%; height: 18px; 
    }
    
    option, optgroup { 
      font-size: 10px; 
      padding-top: 0.5px;
      padding-bottom: 0.5px;
      line-height: 1; 
    }

    @media (max-width: 1200px) {
      option, optgroup {
        padding-top: 0.25px;
        padding-bottom: 0.25px;
      }
    }

    optgroup { font-weight: 800; text-decoration: underline; background: #111; color: var(--accent-color); margin-top: 1px; }

    .select-10vw { width: 10vw; min-width: 85px; }
    .select-7vw { width: 7vw; min-width: 75px; }
    .select-key { width: 85px; }
    .select-meter { width: 55px; }
    .value-display { font-family: monospace; font-size: 11px; color: var(--accent-color); min-width: 28px; text-align: right; }
    .lock-btn { background: rgba(0,0,0,0.3); border: 1px solid rgba(255, 255, 255, 0.05); padding: 3px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #777; transition: all 0.15s ease-out; width: 20px; height: 20px; box-sizing: border-box; box-shadow: inset 0 1px 1px rgba(255,255,255,0.05); }
    .lock-btn:hover { background: rgba(255,255,255,0.1); color: #bbb; transform: translateY(-0.5px); }
    .lock-btn.locked { color: #ffcc00; background: rgba(255, 204, 0, 0.15); border-color: rgba(255, 204, 0, 0.3); box-shadow: 0 0 10px rgba(255, 204, 0, 0.1); }
    .lock-btn svg { width: 12px; height: 12px; fill: currentColor; }
  `;

  @property({ type: String }) playbackState: PlaybackState = 'stopped';
  @property({ type: Boolean }) hasRecording = false;
  @state() public bpm = 110;
  @state() public key = 'C Minor';
  @state() public mode: 'Natural' | 'Minor' = 'Minor';
  @state() public genre = 'Jazz';
  @state() public musicStyle = 'Acid Jazz';
  @state() public currentMood = 'None';
  @state() public meter = '4/4';
  @state() private locked = { genre: false, style: false, tempo: false, key: false, mood: false };

  private bpmRange: [number, number] = [100, 120];

  public get locks() { return this.locked; }
  private toggleLock(key: keyof typeof this.locked) { uiSounds.playTick(); this.locked = { ...this.locked, [key]: !this.locked[key] }; }

  public randomize(): string {
    // 1. GENRE
    if (!this.locked.genre) {
      const allGenres = Object.keys(MUSIC_DATA);
      this.genre = allGenres[Math.floor(Math.random() * allGenres.length)];
      this.dispatch('genre-changed', this.genre);
    }
    
    const genreData = MUSIC_DATA[this.genre];
    const availableStyles = genreData ? Object.keys(genreData.styles) : [];
    
    // 2. STYLE
    if (!this.locked.style || !availableStyles.includes(this.musicStyle)) {
        this.musicStyle = availableStyles[Math.floor(Math.random() * availableStyles.length)];
        this.dispatch('style-changed', this.musicStyle);
    }

    const sig = genreData.styles[this.musicStyle];
    if (!sig) return this.genre;

    // 3. MOOD
    if (!this.locked.mood) {
        // High probability of picking the style's defined mood, else a random global mood
        this.currentMood = (Math.random() > 0.3) ? sig.mood : MOODS[Math.floor(Math.random() * MOODS.length)];
        this.dispatch('mood-changed', this.currentMood);
    }

    // 4. KEY
    if (!this.locked.key) {
        this.key = sig.keys[Math.floor(Math.random() * sig.keys.length)];
        this.mode = this.key.toLowerCase().includes('minor') ? 'Minor' : 'Natural';
        this.dispatch('key-changed', { key: this.key, mode: this.mode });
    }

    // 5. TEMPO
    if (!this.locked.tempo) {
        const range = sig.bpmRange[1] - sig.bpmRange[0];
        this.bpm = Math.floor(sig.bpmRange[0] + Math.random() * range);
        this.bpmRange = sig.bpmRange;
        this.dispatch('bpm-changed', this.bpm);

        // 6. Time Signature (Meter)
        this.meter = sig.meters[Math.floor(Math.random() * sig.meters.length)];
        this.dispatch('meter-changed', this.meter);
    }
    
    (this as any).requestUpdate();
    return this.genre;
  }

  public reset() {
     if (!this.locked.genre) {
         this.genre = 'Jazz'; 
         this.dispatch('genre-changed', this.genre);
     }
     
     const genreData = MUSIC_DATA[this.genre];
     const availableStyles = genreData ? Object.keys(genreData.styles) : [];
     if (!this.locked.style || !availableStyles.includes(this.musicStyle)) {
         this.musicStyle = availableStyles[0] || 'Acid Jazz';
         this.dispatch('style-changed', this.musicStyle);
     }

     if (!this.locked.mood) {
         this.currentMood = 'None';
         this.dispatch('mood-changed', 'None');
     }
     this.applySignature(this.musicStyle, false);
  }

  public async randomizeInstruments(locks?: { manifest: boolean; channels: boolean }, currentInstruments?: InstrumentSet, mode: MusicGenerationMode = 'QUALITY') {
      const genreDef = MUSIC_DATA[this.genre];
      const sig = genreDef.styles[this.musicStyle];
      if (!sig) return;

      const usedInstruments = new Set<string>();

      const getUniqueInstrument = (channelType: keyof typeof FALLBACK_POOLS, pool: string[]) => {
          let candidates = pool.filter(i => !!i && i.toLowerCase() !== 'none' && i.toLowerCase() !== 'n/a' && i.toLowerCase() !== "");
          
          // Rule: Avoid at all cost vocal instruments unless in VOC mode
          if (mode !== 'VOCALIZATION') {
              candidates = candidates.filter(inst => !VOCAL_MARKERS.some(v => inst.toLowerCase().includes(v)));
          } else {
              // Priority: Find vocal instrument if in VOC mode
              const vocalOnly = candidates.filter(inst => VOCAL_MARKERS.some(v => inst.toLowerCase().includes(v)));
              if (vocalOnly.length > 0) candidates = vocalOnly;
          }

          const shuffledSpecific = [...candidates].sort(() => Math.random() - 0.5);
          for (const candidate of shuffledSpecific) {
              if (!usedInstruments.has(candidate)) {
                  usedInstruments.add(candidate);
                  return candidate;
              }
          }

          let fallbackPool = FALLBACK_POOLS[channelType as keyof typeof FALLBACK_POOLS];
          if (mode !== 'VOCALIZATION') {
              fallbackPool = fallbackPool.filter(inst => !VOCAL_MARKERS.some(v => inst.toLowerCase().includes(v)));
          } else if (channelType === 'lead' || channelType === 'alto') {
              // Forced vocal fallback for VOC mode
              fallbackPool = ['Vocal Chops', 'Solo Voice', 'Soprano Voice', 'Choir'];
          }

          const shuffledFallback = [...fallbackPool].sort(() => Math.random() - 0.5);
          for (const candidate of shuffledFallback) {
              if (!usedInstruments.has(candidate)) {
                  usedInstruments.add(candidate);
                  return candidate;
              }
          }

          if (candidates.length > 0) {
              const fallback = candidates[0];
              usedInstruments.add(fallback);
              return fallback;
          }

          return "";
      };

      const effectiveManifest = { ...sig.manifest };
      const chosenInstruments: any = {};
      
      const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
      channels.forEach(ch => {
          const pool = sig.instrumentPools[ch];
          
          if (locks?.channels && currentInstruments) {
              chosenInstruments[ch] = currentInstruments[ch].instrument;
              usedInstruments.add(currentInstruments[ch].instrument);
          } else {
              if (pool && pool.some(inst => inst.toLowerCase() === 'none')) {
                  effectiveManifest[ch] = false;
              }
              chosenInstruments[ch] = getUniqueInstrument(ch, pool || []);
          }
      });

      this.dispatch('style-matrix-update', { 
          manifest: effectiveManifest, 
          instruments: chosenInstruments, 
          style: this.musicStyle, 
          pools: sig.instrumentPools,
          locks: locks
      });
  }

  public async performWarmup() {
      const genreDef = MUSIC_DATA[this.genre];
      if (!genreDef) return;

      const availableStyles = Object.keys(genreDef.styles);
      let effectiveStyle = this.musicStyle;
      
      if (!availableStyles.includes(effectiveStyle)) {
          effectiveStyle = availableStyles[0];
          this.musicStyle = effectiveStyle;
          this.locked.style = false; 
      }

      this.dispatch('genre-changed', this.genre);
      this.dispatch('style-changed', effectiveStyle);
      this.dispatch('mood-changed', this.currentMood);
      
      await new Promise(r => setTimeout(r, 100));

      const sig = genreDef.styles[effectiveStyle];
      if (!sig) return;

      if (!this.locked.key) {
          this.key = sig.keys[0];
          this.mode = this.key.toLowerCase().includes('minor') ? 'Minor' : 'Natural';
          this.dispatch('key-changed', { key: this.key, mode: this.mode });
      }

      if (!this.locked.tempo) {
          this.meter = sig.meters[0];
          this.dispatch('meter-changed', this.meter);
      }
  }

  public applySignature(style: string, randomInstruments = false, fullyRandomParams = false) {
      const genreDef = MUSIC_DATA[this.genre];
      if (!genreDef) return;
      
      const availableStyles = Object.keys(genreDef.styles);
      let effectiveStyle = style;
      
      if (!availableStyles.includes(style)) {
          effectiveStyle = availableStyles[0];
      }
      this.musicStyle = effectiveStyle;

      const sig = genreDef.styles[effectiveStyle];
      if (!sig) return;

      if (!this.locked.tempo) {
          if (fullyRandomParams) {
              const range = sig.bpmRange[1] - sig.bpmRange[0];
              this.bpm = Math.floor(sig.bpmRange[0] + Math.random() * range);
              this.meter = Math.random() > 0.5 ? sig.meters[Math.floor(Math.random() * sig.meters.length)] : sig.meters[0];
          } else {
              this.bpm = sig.bpm;
              this.meter = sig.meters[0];
          }
          this.bpmRange = sig.bpmRange;
          this.dispatch('bpm-changed', this.bpm);
          this.dispatch('meter-changed', this.meter);
      }
      
      if (!this.locked.key) {
          if (fullyRandomParams) {
              this.key = sig.keys[Math.floor(Math.random() * sig.keys.length)];
          } else {
              this.key = sig.keys[0];
          }
          this.mode = this.key.toLowerCase().includes('minor') ? 'Minor' : 'Natural';
          this.dispatch('key-changed', { key: this.key, mode: this.mode });
      }

      if (!this.locked.mood && !fullyRandomParams) {
          if (sig.mood) {
              this.currentMood = sig.mood;
              this.dispatch('mood-changed', this.currentMood);
          }
      }

      if (randomInstruments) {
          this.randomizeInstruments();
      }
      
      (this as any).requestUpdate();
  }
  
  public applySessionConfig(config: any) {
      if (!this.locked.genre) this.genre = config.genre;
      
      const genreData = MUSIC_DATA[this.genre];
      const availableStyles = genreData ? Object.keys(genreData.styles) : [];
      if (!this.locked.style || !availableStyles.includes(this.musicStyle)) {
          this.musicStyle = availableStyles.includes(config.style) ? config.style : (availableStyles[0] || 'Acid Jazz');
      }

      if (!this.locked.tempo) { this.bpm = config.bpm; this.meter = config.meter; this.dispatch('bpm-changed', this.bpm); this.dispatch('meter-changed', this.meter); }
      if (!this.locked.key) { this.key = config.key; this.mode = config.mode; }
      (this as any).requestUpdate();
  }

  private onBpmChange(e: Event) { const input = e.target as HTMLInputElement; this.bpm = parseInt(input.value, 10); uiSounds.playTick(); this.dispatch('bpm-changed', this.bpm); }
  
  private onGenreChange(e: Event) { 
      uiSounds.playTick(); 
      const input = e.target as HTMLSelectElement; 
      this.genre = input.value; 
      
      const genreData = MUSIC_DATA[this.genre];
      const availableStyles = genreData ? Object.keys(genreData.styles) : [];
      
      if (this.locked.style && !availableStyles.includes(this.musicStyle)) {
          this.locked.style = false;
          this.musicStyle = availableStyles[0] || '';
      } else if (!this.locked.style) {
          this.musicStyle = availableStyles[0] || '';
      }

      this.dispatch('genre-changed', this.genre); 
      if (this.musicStyle) {
          this.applySignature(this.musicStyle);
          this.dispatch('style-changed', this.musicStyle); 
      }
  }

  private onStyleChange(e: Event) { 
      uiSounds.playTick(); 
      const input = e.target as HTMLSelectElement; 
      this.musicStyle = input.value; 
      this.applySignature(this.musicStyle);
      this.dispatch('style-changed', this.musicStyle); 
  }

  private onKeyChange(e: Event) {
      uiSounds.playTick();
      const input = e.target as HTMLSelectElement;
      this.key = input.value;
      this.mode = this.key.toLowerCase().includes('minor') ? 'Minor' : 'Natural';
      this.dispatch('key-changed', { key: this.key, mode: this.mode });
  }

  private onMeterChange(e: Event) {
      uiSounds.playTick();
      const input = e.target as HTMLSelectElement;
      this.meter = input.value;
      this.dispatch('meter-changed', this.meter);
  }

  private onMoodChange(e: Event) {
      uiSounds.playTick();
      const input = e.target as HTMLSelectElement;
      this.currentMood = input.value;
      this.dispatch('mood-changed', this.currentMood);
  }

  private dispatch(name: string, detail?: any) {
    (this as any).dispatchEvent(new CustomEvent(name, { detail }));
  }

  render() {
    const isRecording = this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading';
    const genreData = MUSIC_DATA[this.genre];
    const styles = genreData ? Object.keys(genreData.styles) : [];
    const keys = genreData?.styles[this.musicStyle]?.keys || ['C Major'];
    const meters = genreData?.styles[this.musicStyle]?.meters || ['4/4'];

    return html`
      <div class="logo">
        <span class="brand-text">GameDJ</span>
        <span class="version-badge">BETA</span>
      </div>
      <div class="divider"></div>

      <div class="control-group">
        <div class="label-row">
          <span class="label">Genre</span>
          ${this.renderLock(this.locked.genre, () => this.toggleLock('genre'))}
        </div>
        <div class="row">
          <select class="select-10vw" .value=${this.genre} @change=${this.onGenreChange} ?disabled=${isRecording}>
            <optgroup label="MODERN">${GENRE_MAP_MODERN.map(g => html`<option value=${g}>${g}</option>`)}</optgroup>
            <optgroup label="TRADITIONAL">${GENRE_MAP_TRADITIONAL.map(g => html`<option value=${g}>${g}</option>`)}</optgroup>
            <optgroup label="REGIONAL">${GENRE_MAP_REGIONAL.map(g => html`<option value=${g}>${g}</option>`)}</optgroup>
          </select>
        </div>
      </div>

      <div class="divider"></div>

      <div class="control-group">
        <div class="label-row">
          <span class="label">Style</span>
          ${this.renderLock(this.locked.style, () => this.toggleLock('style'))}
        </div>
        <div class="row">
          <select class="select-10vw" .value=${this.musicStyle} @change=${this.onStyleChange} ?disabled=${isRecording}>
            ${styles.map(s => html`<option value=${s}>${s}</option>`)}
          </select>
        </div>
      </div>

      <div class="divider"></div>

      <div class="control-group">
        <div class="label-row">
          <span class="label">Mood</span>
          ${this.renderLock(this.locked.mood, () => this.toggleLock('mood'))}
        </div>
        <div class="row">
          <select class="select-7vw" .value=${this.currentMood} @change=${this.onMoodChange} ?disabled=${isRecording}>
            ${MOODS.map(m => html`<option value=${m}>${m}</option>`)}
          </select>
        </div>
      </div>

      <div class="divider"></div>

      <div class="control-group">
        <div class="label-row">
          <span class="label">Key / Mode</span>
          ${this.renderLock(this.locked.key, () => this.toggleLock('key'))}
        </div>
        <div class="row">
          <select class="select-key" .value=${this.key} @change=${this.onKeyChange} ?disabled=${isRecording}>
             ${keys.map(k => html`<option value=${k}>${k}</option>`)}
          </select>
        </div>
      </div>

      <div class="divider"></div>

      <div class="control-group">
        <div class="label-row">
          <span class="label">Tempo</span>
          ${this.renderLock(this.locked.tempo, () => this.toggleLock('tempo'))}
        </div>
        <div class="row">
          <div class="slider-container">
            <input type="range" .min=${this.bpmRange[0]} .max=${this.bpmRange[1]} .value=${this.bpm} @input=${this.onBpmChange} ?disabled=${isRecording}>
            <div class="value-display">${this.bpm}</div>
          </div>
          <select class="select-meter" .value=${this.meter} @change=${this.onMeterChange} ?disabled=${isRecording}>
            ${meters.map(m => html`<option value=${m}>${m}</option>`)}
          </select>
        </div>
      </div>
    `;
  }

  private renderLock(isLocked: boolean, clickHandler: () => void) {
    return html`
      <div class="lock-btn ${isLocked ? 'locked' : ''}" @click=${clickHandler}>
        <svg viewBox="0 0 24 24">
          <path d="${isLocked 
            ? 'M12,2A5,5,0,0,0,7,7v3H6a2,2,0,0,0-2,2v8a2,2,0,0,0,2,2H18a2,2,0,0,0,2-2V12a2,2,0,0,0-2-2H17V7A5,5,0,0,0,12,2ZM9,10V7a3,3,0,0,1,6,0v3Z' 
            : 'M12,2A5,5,0,0,0,7,7v3H6c-1.1,0-2,.9-2,2v8c0,1.1,.9,2,2,2H18c1.1,0,2-.9,2-2V12c0-1.1-.9-2-2-2H18c1.1,0,2-.9,2-2V12c0-1.1-.9-2-2-2H9V7c0-1.66,1.34-3,3-3s3,1.34,3,3v2h2V7c0-2.76-2.24-5-5-5S7,4.24,7,7v3H6c-1.1,0-2,.9-2,2v8c0,1.1,.9,2,2,2H18c1.1,0,2-.9,2-2V12c0-1.1-.9-2-2-2H9V7c0-.55,.45-1,1-1s1,.45,1,1v1h2V7c0-.55-.45-1-1-1Z'}"/>
        </svg>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'top-toolbar': TopToolbar;
  }
}
