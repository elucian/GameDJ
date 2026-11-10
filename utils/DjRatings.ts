/**
 * Listener ratings: after a take the "Like this?" dialog asks for a thumb up or down. Each answer counts for the DJ
 * that conducted the take and for its genre and style (what the Robot DJ studies).
 *
 * The votes of all listeners are counted on the server (api/ratings.ts), so everyone sees the same stars. The last
 * server totals are kept in this browser, so the stars show at once and when the server cannot be reached. Without
 * a server (local development) the votes of this browser are counted instead.
 */
const STORAGE_KEY = 'gamedj.ratings.v1';
const SHARED_KEY = 'gamedj.ratings.shared.v1';
const ENDPOINT = '/api/ratings';
/** A refresh within this time of the last one is skipped (the server caches its answer 10 s anyway) */
const MIN_REFRESH_MS = 10_000;

export interface Votes { up: number; down: number }
interface RatingStore { djs: Record<string, Votes>; styles: Record<string, Votes> }

const empty = (): RatingStore => ({ djs: {}, styles: {} });

/** Only {name: {up, down}} entries with whole, non-negative counts */
function cleanVotes(m: unknown): Record<string, Votes> {
  const out: Record<string, Votes> = {};
  if (!m || typeof m !== 'object') return out;
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
    const up = Number((v as Votes)?.up), down = Number((v as Votes)?.down);
    if (Number.isFinite(up) && Number.isFinite(down)) out[k] = { up: Math.max(0, Math.floor(up)), down: Math.max(0, Math.floor(down)) };
  }
  return out;
}

const parse = (raw: unknown): RatingStore | null => {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<RatingStore>;
  return { djs: cleanVotes(s.djs), styles: cleanVotes(s.styles) };
};

function read(key: string): RatingStore | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? parse(JSON.parse(raw)) : null;
  } catch { return null; }
}

function write(key: string, s: RatingStore) {
  try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* localStorage unavailable: not kept */ }
}

const changed = () => window.dispatchEvent(new CustomEvent('dj-ratings-changed'));

/** The totals of all listeners, once the server answered (also from the last visit) */
let shared: RatingStore | null | undefined;
const sharedTotals = () => (shared === undefined ? (shared = read(SHARED_KEY)) : shared);
let lastRefresh = 0;
let inFlight: Promise<void> | null = null;

/** New totals from the server: kept and shown */
function takeShared(body: unknown) {
  const s = parse(body);
  if (!s) return;
  shared = s;
  write(SHARED_KEY, s);
  changed();
}

const bump = (map: Record<string, Votes>, key: string, like: boolean) => {
  const v = map[key] ?? { up: 0, down: 0 };
  if (like) v.up++; else v.down++;
  map[key] = v;
};

/**
 * A listener's answer for a take: the DJ that conducted it and its genre and style. Counted in this browser and sent
 * to the server, whose answer brings everyone's new totals. Resolves when the server answered (or could not).
 */
export function recordVote(djId: string, genre: string, style: string, like: boolean): Promise<void> {
  const s = read(STORAGE_KEY) ?? empty();
  bump(s.djs, djId, like);
  if (genre && style) bump(s.styles, `${genre}|${style}`, like);
  write(STORAGE_KEY, s);
  // Shown at once (the server's answer replaces it)
  const t = sharedTotals();
  if (t) { bump(t.djs, djId, like); if (genre && style) bump(t.styles, `${genre}|${style}`, like); }
  changed();
  return fetch(ENDPOINT, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ djId, genre, style, like })
  }).then(async r => {
    if (!r.ok) return;
    takeShared(await r.json());
    lastRefresh = Date.now();
  }).catch(() => { /* no server: the vote stays in this browser */ });
}

/** Everyone's latest totals from the server (the app calls it on start and while the DJ dialog is open) */
export function refreshRatings(force = false): Promise<void> {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastRefresh < MIN_REFRESH_MS) return Promise.resolve();
  lastRefresh = Date.now();
  inFlight = fetch(ENDPOINT, { credentials: 'same-origin' })
    .then(async r => { if (r.ok && (r.headers.get('content-type') || '').includes('json')) takeShared(await r.json()); })
    .catch(() => { /* offline or no server: the kept totals stay */ })
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** The totals shown: everyone's from the server, else this browser's own */
const totals = (): RatingStore => sharedTotals() ?? read(STORAGE_KEY) ?? empty();

export function djVotes(djId: string): Votes {
  return totals().djs[djId] ?? { up: 0, down: 0 };
}

/** Votes for each [genre, style] that has any ("Genre|Style" keys) */
export function styleVotes(): Record<string, Votes> {
  return totals().styles;
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

/** For tests: forget the totals held in memory */
export function resetRatingsCache() { shared = undefined; lastRefresh = 0; inFlight = null; }
