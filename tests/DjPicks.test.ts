import { describe, expect, it } from 'vitest';
import { pickAnyStyle, pickHomeStyle, type StyleCatalog } from '../utils/DjPicks';

/** Genres with very different numbers of styles: the Robot must still pick each genre equally often */
const catalog: StyleCatalog = {
  Big: { styles: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`Big ${i}`, {}])) },
  Mid: { styles: { 'Mid A': {}, 'Mid B': {}, 'Mid C': {} } },
  Tiny: { styles: { 'Tiny A': {} } },
  Empty: { styles: {} },
};

/** A seeded random number generator (mulberry32), so the counts are the same on every run */
function seeded(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('pickAnyStyle', () => {
  it('picks every genre equally often, whatever its number of styles', () => {
    const random = seeded(42);
    const counts: Record<string, number> = { Big: 0, Mid: 0, Tiny: 0 };
    const N = 30000;
    for (let i = 0; i < N; i++) counts[pickAnyStyle(catalog, random)![0]]++;
    for (const g of Object.keys(counts)) expect(counts[g] / N).toBeCloseTo(1 / 3, 1);
  });

  it('never picks a genre without styles, and the style belongs to the genre', () => {
    const random = seeded(7);
    for (let i = 0; i < 2000; i++) {
      const [genre, style] = pickAnyStyle(catalog, random)!;
      expect(genre).not.toBe('Empty');
      expect(catalog[genre].styles).toHaveProperty(style);
    }
  });

  it('reaches every style of a genre', () => {
    const random = seeded(3);
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(pickAnyStyle(catalog, random)![1]);
    expect(seen.size).toBe(30 + 3 + 1);
  });

  it('stays in range when random() returns its extremes', () => {
    expect(pickAnyStyle(catalog, () => 0)).toEqual(['Big', 'Big 0']);
    expect(pickAnyStyle(catalog, () => 0.9999999999)).toEqual(['Tiny', 'Tiny A']);
  });

  it('has nothing to pick from an empty catalog', () => {
    expect(pickAnyStyle({})).toBeNull();
    expect(pickAnyStyle({ Empty: { styles: {} } })).toBeNull();
  });
});

describe('pickHomeStyle', () => {
  it('picks only home styles that exist in the app', () => {
    const homes: [string, string][] = [['Mid', 'Mid B'], ['Mid', 'Gone'], ['Nowhere', 'X']];
    for (let i = 0; i < 50; i++) expect(pickHomeStyle(catalog, homes)).toEqual(['Mid', 'Mid B']);
  });

  it('has nothing to pick without a valid home style', () => {
    expect(pickHomeStyle(catalog, [])).toBeNull();
    expect(pickHomeStyle(catalog, [['Nowhere', 'X']])).toBeNull();
  });
});
