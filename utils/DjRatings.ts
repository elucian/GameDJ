/**
 * Listener ratings: after a take the "Like this?" dialog asks for a thumb up or down. Each answer counts for the DJ
 * that conducted the take and for its genre and style (what the Robot DJ studies). Saved in this browser.
 */
const STORAGE_KEY = 'gamedj.ratings.v1';

export interface Votes { up: number; down: number }
interface RatingStore { djs: Record<string, Votes>; styles: Record<string, Votes> }

const empty = (): RatingStore => ({ djs: {}, styles: {} });

function load(): RatingStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const s = JSON.parse(raw);
    return { djs: s?.djs && typeof s.djs === 'object' ? s.djs : {}, styles: s?.styles && typeof s.styles === 'object' ? s.styles : {} };
  } catch { return empty(); }
}

function save(s: RatingStore) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* localStorage unavailable: not kept */ }
}

const bump = (map: Record<string, Votes>, key: string, like: boolean) => {
  const v = map[key] ?? { up: 0, down: 0 };
  if (like) v.up++; else v.down++;
  map[key] = v;
};

/** A listener's answer for a take: the DJ that conducted it and its genre and style. */
export function recordVote(djId: string, genre: string, style: string, like: boolean) {
  const s = load();
  bump(s.djs, djId, like);
  if (genre && style) bump(s.styles, `${genre}|${style}`, like);
  save(s);
  window.dispatchEvent(new CustomEvent('dj-ratings-changed'));
}

export function djVotes(djId: string): Votes {
  return load().djs[djId] ?? { up: 0, down: 0 };
}

/** Votes for each [genre, style] that has any ("Genre|Style" keys) */
export function styleVotes(): Record<string, Votes> {
  return load().styles;
}

/**
 * Stars (0 to 5, in half stars) from the share of likes, or null before the first vote. Smoothed as if every DJ
 * started with one like and one dislike, so a single vote does not give 5 or 0 stars: more likes, more stars.
 */
export function starsFor(v: Votes): number | null {
  const n = v.up + v.down;
  if (n === 0) return null;
  return Math.round(((v.up + 1) / (n + 2)) * 10) / 2;
}
