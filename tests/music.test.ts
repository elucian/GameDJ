import { describe, expect, it, vi, afterEach } from 'vitest';
import { Scale } from '@google/genai';
import { REGIONAL_GENRES, chooseDjManifest, djEvolutionFor, djKnobBias, getDjKnobLimit, type DjPersonality } from '../music/djRules';
import { chooseLyricsLanguage, isVocalInstrument, scaleForKey } from '../music/vocabulary';

const dj = (over: Partial<DjPersonality> = {}): DjPersonality => ({
  name: 'Test', eagerness: 50, channels: { lead: true, alto: true, harmonic: true, bass: true, rhythm: true }, ...over,
});

afterEach(() => vi.restoreAllMocks());

describe('getDjKnobLimit', () => {
  it('gives each genre family its own limit at the default 6 knobs', () => {
    expect(getDjKnobLimit('Rock')).toBe(6);
    expect(getDjKnobLimit('Classic')).toBe(4);
    expect(getDjKnobLimit('Irish')).toBe(2);
  });

  it('gives the other families 1 to 3 more knobs from 7 to 10', () => {
    expect(getDjKnobLimit('Irish', 7)).toBe(3);
    expect(getDjKnobLimit('Classic', 9)).toBe(7);
    expect(getDjKnobLimit('Classic', 10)).toBe(7); // at most 3 more
    expect(getDjKnobLimit('Rock', 10)).toBe(10);
  });

  it('takes knobs from modern genres first below 6, then from the others', () => {
    expect(getDjKnobLimit('Rock', 4)).toBe(4);
    expect(getDjKnobLimit('Classic', 4)).toBe(4);
    expect(getDjKnobLimit('Classic', 3)).toBe(3);
    expect(getDjKnobLimit('Irish', 1)).toBe(1);
    expect(getDjKnobLimit('Irish', 0)).toBe(0);
  });

  it('keeps the setting between 0 and 10', () => {
    expect(getDjKnobLimit('Rock', 99)).toBe(10);
    expect(getDjKnobLimit('Rock', -3)).toBe(0);
  });

  it('covers every regional genre', () => {
    for (const g of REGIONAL_GENRES) expect(getDjKnobLimit(g)).toBe(2);
  });
});

describe('djKnobBias', () => {
  it('is neutral for an average DJ, an unknown knob or no DJ', () => {
    expect(djKnobBias(dj(), 'Complexity')).toBe(0);
    expect(djKnobBias(dj({ complexity: 100 }), 'Nonsense')).toBe(0);
    expect(djKnobBias(null, 'Complexity')).toBe(0);
  });

  it('leans the knobs of the DJ\'s strong sides up and of its weak sides down', () => {
    expect(djKnobBias(dj({ complexity: 100 }), 'Complexity')).toBeCloseTo(0.5);
    expect(djKnobBias(dj({ complexity: 0 }), 'Ornamentation')).toBeCloseTo(-0.5);
    expect(djKnobBias(dj({ energy: 100 }), 'Dynamics')).toBeCloseTo(0.4);
    expect(djKnobBias(dj({ atmosphere: 75 }), 'Atmosphere')).toBeCloseTo(0.225);
  });
});

describe('djEvolutionFor', () => {
  it('follows the DJ\'s energy (with no randomness at diversity 0)', () => {
    expect(djEvolutionFor(dj({ energy: 0, diversity: 0 }))).toBe(-1);
    expect(djEvolutionFor(dj({ energy: 50, diversity: 0 }))).toBe(2);
    expect(djEvolutionFor(dj({ energy: 100, diversity: 0 }))).toBe(5);
  });

  it('stays between -2 and 7, however random', () => {
    for (let i = 0; i < 500; i++) {
      const e = djEvolutionFor(dj({ energy: i % 2 ? 100 : 0, diversity: 100 }));
      expect(e).toBeGreaterThanOrEqual(-2);
      expect(e).toBeLessThanOrEqual(7);
    }
  });
});

describe('chooseDjManifest', () => {
  it('keeps 3 to 5 channels, always one melodic voice, never a switched-off channel', () => {
    for (let i = 0; i < 300; i++) {
      const keep = chooseDjManifest('Rock', { alto: false });
      expect(keep.length).toBeGreaterThanOrEqual(3);
      expect(keep.length).toBeLessThanOrEqual(4);
      expect(keep).not.toContain('alto');
      expect(keep).toContain('lead');
      expect(new Set(keep).size).toBe(keep.length);
    }
  });

  it('keeps everything that is allowed when 3 or fewer channels are', () => {
    expect(chooseDjManifest('Rock', { lead: false, alto: false })).toEqual(['harmonic', 'bass', 'rhythm']);
  });

  it('keeps bass and drums in groove genres, harmony and bass in traditional ones', () => {
    const count = (genre: string, ch: string) => {
      let n = 0;
      for (let i = 0; i < 400; i++) if (chooseDjManifest(genre, undefined, 0).includes(ch as never)) n++;
      return n;
    };
    // Both families always keep the bass; groove genres always keep the drums, traditional ones the harmony
    expect(count('Rock', 'bass')).toBe(400);
    expect(count('Classic', 'bass')).toBe(400);
    expect(count('Rock', 'rhythm')).toBe(400);
    expect(count('Classic', 'rhythm')).toBeLessThan(400);
    expect(count('Classic', 'harmonic')).toBe(400);
    expect(count('Rock', 'harmonic')).toBeLessThan(400);
  });

  it('keeps bigger ensembles for complex DJs', () => {
    const avg = (c: number) => { let s = 0; for (let i = 0; i < 400; i++) s += chooseDjManifest('Rock', undefined, c).length; return s / 400; };
    expect(avg(100)).toBeGreaterThan(avg(0));
  });
});

describe('scaleForKey', () => {
  it('maps a major key and its relative minor to the same Lyria scale', () => {
    expect(scaleForKey('C Major')).toBe('C_MAJOR_A_MINOR');
    expect(scaleForKey('A Minor')).toBe('C_MAJOR_A_MINOR');
    expect(scaleForKey('Bb Major')).toBe('B_FLAT_MAJOR_G_MINOR');
    expect(scaleForKey('F# Minor')).toBe('A_MAJOR_G_FLAT_MINOR');
    expect(scaleForKey('Cb major')).toBe('B_MAJOR_A_FLAT_MINOR');
  });

  it('only ever answers with scales the Lyria SDK knows', () => {
    const known = new Set(Object.values(Scale));
    for (const n of ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']) {
      for (const q of ['Major', 'Minor']) expect(known.has(scaleForKey(`${n} ${q}`) as Scale)).toBe(true);
    }
  });

  it('has no scale for something that is not a key', () => {
    expect(scaleForKey('Random')).toBeNull();
    expect(scaleForKey('')).toBeNull();
  });
});

describe('isVocalInstrument', () => {
  it('knows voices and choirs', () => {
    for (const v of ['Gospel Choir', 'Solo Female', 'Lead Voice', 'Vocal Chops', 'Male Rapper']) expect(isVocalInstrument(v)).toBe(true);
  });
  it('knows instruments are not voices', () => {
    for (const v of ['Piano', 'Electric Guitar', 'Drum Kit', 'None', '', null, undefined]) expect(isVocalInstrument(v)).toBe(false);
  });
});

describe('chooseLyricsLanguage', () => {
  it('sings a folk genre in its own language', () => {
    for (let i = 0; i < 20; i++) expect(chooseLyricsLanguage('Romanian')).toBe('Romanian');
  });
  it('picks a popular language for an open genre, English when the roll says so', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(chooseLyricsLanguage('Rock')).toBe('English');
  });
});
