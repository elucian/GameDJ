import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANNEL_WEIGHT_MAX, clampChannelWeight, stageChannelWeight } from '../constants/channelWeights';
import { fidelityTags } from '../music/vocabulary';
import type { InstrumentSet } from '../types';

describe('channel weight ceilings', () => {
  it('lets the lead go above the other channels', () => {
    expect(CHANNEL_WEIGHT_MAX.lead).toBeGreaterThan(1);
    for (const k of ['alto', 'harmonic', 'bass', 'rhythm'] as const) expect(CHANNEL_WEIGHT_MAX[k]).toBe(1);
  });

  it('keeps a weight between 0 and the channel\'s ceiling', () => {
    expect(clampChannelWeight('lead', 3)).toBe(CHANNEL_WEIGHT_MAX.lead);
    expect(clampChannelWeight('bass', 3)).toBe(1);
    expect(clampChannelWeight('lead', -1)).toBe(0);
  });

  it('boosts only the lead in a DJ stage, and the lead stays above the others as a supporting player', () => {
    expect(stageChannelWeight('lead', 1)).toBe(CHANNEL_WEIGHT_MAX.lead);
    expect(stageChannelWeight('bass', 1)).toBe(1);
    expect(stageChannelWeight('lead', 0.7)).toBeGreaterThan(stageChannelWeight('bass', 0.7));
    expect(stageChannelWeight('lead', 0)).toBe(0);
  });
});

describe('fidelityTags without instruments', () => {
  it('names no instrument of its own when the channels choose them', () => {
    const plain = fidelityTags('Hawaiian', 'Hula').join(' ');
    expect(plain).toMatch(/ukulele/);
    const lean = fidelityTags('Hawaiian', 'Hula', true).join(' ');
    expect(lean).not.toMatch(/ukulele|guitar/i);
    expect(lean).toMatch(/authentic traditional/);
  });

  it('keeps the rest of the tag and still answers for genres that name no instrument', () => {
    expect(fidelityTags('Irish', 'Reel', true)[0]).toMatch(/modal melodies/);
    expect(fidelityTags('Rock', 'Rock', true)).toEqual(fidelityTags('Rock', 'Rock'));
  });
});

// --- The live prompts, from the real prompt builder with a fake audio engine and a fake Lyria session ---

/** An object that accepts any call or property, like a Web Audio node */
function fakeNode(): any {
  const target = function () {};
  return new Proxy(target, {
    get: (t: any, k) => (k in t ? t[k] : k === 'then' ? undefined : (t[k] = typeof k === 'string' && /^(create|connect|disconnect|resume|start|stop|set)/.test(k) ? () => fakeNode() : fakeNode())),
    set: (t: any, k, v) => { t[k] = v; return true; },
    apply: () => fakeNode(),
  });
}

const ch = (instrument: string, over: Partial<InstrumentSet['lead']> = {}) => ({ instrument, active: true, weight: 1, visible: true, volume: 1, ...over });
const band = (over: Partial<InstrumentSet> = {}): InstrumentSet => ({
  lead: ch('Trumpet'), alto: ch('', { active: false, visible: false }), harmonic: ch('Piano'),
  bass: ch('Upright Bass'), rhythm: ch('Drum Kit'), ...over,
} as InstrumentSet);

type Sent = { text: string; weight: number }[];
async function build(setup: (h: any) => void) {
  const { LiveMusicHelper } = await import('../utils/LiveMusicHelper');
  const h: any = new LiveMusicHelper({} as never);
  const sent: { prompts: Sent; config: Record<string, unknown> }[] = [];
  h.session = {
    setWeightedPrompts: async ({ weightedPrompts }: { weightedPrompts: Sent }) => { sent.push({ prompts: weightedPrompts, config: h.lastConfig ?? {} }); },
    setMusicGenerationConfig: async () => {},
    resetContext: vi.fn(), play: vi.fn(),
  };
  h.setGlobalSettings({ genre: 'Hawaiian', style: 'Hula', key: 'C Major', bpm: 100, meter: '4/4' });
  setup(h);
  await h.refreshSessionPrompts();
  return { h, last: () => sent[sent.length - 1].prompts, count: () => sent.length };
}

describe('live prompts', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', class { constructor() { return fakeNode(); } });
    vi.stubGlobal('document', { addEventListener: () => {} });
    vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout, clearTimeout, setInterval, clearInterval }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  const weightOf = (p: Sent, re: RegExp) => p.filter(x => re.test(x.text)).reduce((s, x) => s + x.weight, 0);

  it('asks for the chosen instruments by name, the lead strongest', async () => {
    const { last } = await build(h => h.setInstruments(band({ lead: ch('Trumpet', { weight: 1.5 }) })));
    const p = last();
    expect(p.some(x => /^trio|quartet of Trumpet, Piano, Upright Bass and Drum Kit only/.test(x.text))).toBe(true);
    const trumpet = weightOf(p, /^Trumpet lead melody/);
    for (const other of [/^Piano/, /^Upright Bass/, /^Drum Kit/]) expect(trumpet).toBeGreaterThan(weightOf(p, other));
  });

  it('weighs the instruments at least as much as the genre text', async () => {
    const { last } = await build(h => h.setInstruments(band()));
    const p = last();
    const instruments = weightOf(p, /only|Trumpet lead|^Piano|^Upright Bass|^Drum Kit/);
    const genre = weightOf(p, /Hula|authentic traditional|classic typical/);
    expect(instruments).toBeGreaterThanOrEqual(genre * 2);
    expect(p.map(x => x.text).join(' ')).not.toMatch(/ukulele|slack key/i);
  });

  it('sends fewer prompts while the DJ performs live', async () => {
    const knobs = (h: any) => {
      h.setInstruments(band());
      h.setWeightedPrompts(new Map(['Dynamics', 'Groove', 'Attack', 'Ornamentation', 'Staccato'].map((t, i) => [`k${i}`, { promptId: `k${i}`, text: t, weight: 1.6 - i * 0.2, volume: 0.5, color: '#fff' }])));
    };
    const normal = await build(knobs);
    const normalCount = normal.last().length;
    vi.resetModules();
    const live = await build(h => { knobs(h); h.conductorMode = true; h.playbackState = 'recording'; });
    const p = live.last();
    expect(p.length).toBeLessThan(normalCount);
    expect(p.some(x => /high fidelity/.test(x.text))).toBe(false);
    expect(p.filter(x => /dynamic range|groove|percussive|ornamented|staccato/.test(x.text)).length).toBeLessThanOrEqual(2);
    for (const x of p) expect(Math.abs(x.weight * 10 - Math.round(x.weight * 10))).toBeLessThan(1e-6); // 0.1 steps
  });

  it('starts every recording from a clean context, with the DJ\'s first section already on the channels', async () => {
    const { h } = await build(h => { h.setInstruments(band()); });
    // connect() closes the old session first, then opens a new one: the fake hands out the same object again
    const session = h.session;
    session.close = vi.fn();
    h.ai = { live: { music: { connect: async () => session } } };
    await h.connect();
    expect(session.resetContext).toHaveBeenCalledOnce();
    expect(session.play).toHaveBeenCalledOnce();
    // The reset comes before the music starts
    expect(session.resetContext.mock.invocationCallOrder[0]).toBeLessThan(session.play.mock.invocationCallOrder[0]);
  });
});
