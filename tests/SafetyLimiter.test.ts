import { describe, expect, it } from 'vitest';
import { CLIP_RANGE, SOFT_CLIP_KNEE, compressorMakeupGain, softClip, softClipCurve } from '../utils/SafetyLimiter';

describe('softClip', () => {
  it('leaves normal levels untouched', () => {
    for (const x of [0, 0.1, -0.5, 0.8, -SOFT_CLIP_KNEE]) expect(softClip(x)).toBe(x);
  });

  it('stays under full scale for real peaks and never exceeds it, however loud', () => {
    for (const x of [0.9, 1, 1.5, 2, -1.2]) expect(Math.abs(softClip(x))).toBeLessThan(1);
    for (const x of [10, -50, 1e6]) expect(Math.abs(softClip(x))).toBeLessThanOrEqual(1);
    for (const x of [0.9, 2, -50]) expect(Math.abs(softClip(x))).toBeGreaterThan(SOFT_CLIP_KNEE);
  });

  it('bends smoothly: continuous, rising, and with slope 1 at the knee', () => {
    const k = SOFT_CLIP_KNEE, e = 1e-6;
    expect(softClip(k + e)).toBeCloseTo(k, 5);
    expect((softClip(k + e) - softClip(k)) / e).toBeCloseTo(1, 3);
    let prev = softClip(0);
    for (let x = 0.01; x <= 3; x += 0.01) { const y = softClip(x); expect(y).toBeGreaterThan(prev); prev = y; }
  });

  it('is symmetric', () => {
    for (const x of [0.3, 0.95, 1.7]) expect(softClip(-x)).toBe(-softClip(x));
  });
});

describe('softClipCurve (the WaveShaper curve)', () => {
  const curve = softClipCurve();
  /** The curve's output for an input `x` (the node gets x / CLIP_RANGE) */
  const at = (x: number) => curve[Math.round(((x / CLIP_RANGE + 1) / 2) * (curve.length - 1))];

  it('has an odd number of points, so 0 maps exactly to 0', () => {
    expect(curve.length % 2).toBe(1);
    expect(curve[(curve.length - 1) / 2]).toBe(0);
  });

  it('gives back normal levels unchanged after the input scaling', () => {
    for (const x of [0.25, -0.5, 0.8]) expect(at(x)).toBeCloseTo(x, 3);
  });

  it('rounds off peaks up to the range instead of hard-clipping them', () => {
    expect(at(1.5)).toBeLessThan(1);
    expect(at(1.5)).toBeGreaterThan(at(1.0));
    expect(at(2)).toBeLessThan(1);
  });
});

describe('compressorMakeupGain', () => {
  const db = (g: number) => 20 * Math.log10(g);
  it('is +0.57 dB for the limiter settings (measured in Chrome)', () => {
    expect(db(compressorMakeupGain())).toBeCloseTo(0.57, 2);
  });
  it('is none without compression', () => {
    expect(compressorMakeupGain(0, 20)).toBe(1);
    expect(compressorMakeupGain(-12, 1)).toBe(1);
  });
  it('grows with a lower threshold', () => {
    expect(compressorMakeupGain(-6)).toBeGreaterThan(compressorMakeupGain(-1));
  });
});
