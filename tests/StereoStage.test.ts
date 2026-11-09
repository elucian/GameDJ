import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WIDTH, MAX_WIDTH, clampWidth, loadStereoSettings, saveStereoSettings, stereoMatrix } from '../utils/StereoStage';

/** What the stage does to one stereo sample */
function process(l: number, r: number, width: number, mono = false): [number, number] {
  const { a, b } = stereoMatrix(width, mono);
  return [a * l + b * r, b * l + a * r];
}
const mid = (l: number, r: number) => (l + r) / 2;
const side = (l: number, r: number) => (l - r) / 2;

describe('stereoMatrix', () => {
  it('leaves Lyria\'s mix untouched at 100%', () => {
    expect(stereoMatrix(1)).toEqual({ a: 1, b: 0 });
    expect(process(0.8, -0.3, 1)).toEqual([0.8, -0.3]);
  });

  it('sends the same signal to both speakers in mono', () => {
    const [l, r] = process(0.8, -0.3, 1, true);
    expect(l).toBeCloseTo(r);
    expect(l).toBeCloseTo(0.25);
  });

  it('is mono at 0% width too', () => {
    expect(stereoMatrix(0)).toEqual(stereoMatrix(1.2, true));
  });

  it('mono ignores the width', () => {
    expect(stereoMatrix(1.5, true)).toEqual(stereoMatrix(0.3, true));
  });

  it('never changes the centre (voice, bass), at any width', () => {
    for (const w of [0, 0.25, 0.5, 1, 1.25, 1.5]) {
      const [l, r] = process(0.6, 0.2, w);
      expect(mid(l, r)).toBeCloseTo(mid(0.6, 0.2));
    }
  });

  it('scales the sides by the width', () => {
    for (const w of [0, 0.5, 1, 1.5]) {
      const [l, r] = process(0.6, 0.2, w);
      expect(side(l, r)).toBeCloseTo(w * side(0.6, 0.2));
    }
  });

  it('keeps a centred (mono) source as it is, whatever the width', () => {
    expect(process(0.5, 0.5, 1.5)).toEqual([0.5, 0.5]);
    expect(process(0.5, 0.5, 0)).toEqual([0.5, 0.5]);
  });

  it('clamps the width to the slider range', () => {
    expect(stereoMatrix(9)).toEqual(stereoMatrix(MAX_WIDTH));
    expect(stereoMatrix(-2)).toEqual(stereoMatrix(0));
    expect(clampWidth(NaN)).toBe(DEFAULT_WIDTH);
  });
});

describe('stereo settings', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
    });
  });

  it('starts in stereo at the original width', () => {
    expect(loadStereoSettings()).toEqual({ mono: false, width: 1 });
  });

  it('keeps what was saved', () => {
    saveStereoSettings({ mono: true, width: 1.25 });
    expect(loadStereoSettings()).toEqual({ mono: true, width: 1.25 });
  });

  it('repairs bad saved data', () => {
    localStorage.setItem('gamedj.stereo', '{"mono":"yes","width":42}');
    expect(loadStereoSettings()).toEqual({ mono: false, width: MAX_WIDTH });
    localStorage.setItem('gamedj.stereo', 'not json');
    expect(loadStereoSettings()).toEqual({ mono: false, width: 1 });
  });
});
