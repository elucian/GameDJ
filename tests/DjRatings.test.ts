import { beforeEach, describe, expect, it, vi } from 'vitest';
import { djVotes, recordVote, refreshRatings, resetRatingsCache, starsFor, styleVotes } from '../utils/DjRatings';

/** A browser-like localStorage and window, fresh for every test */
function stubBrowser() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  });
  const win = new EventTarget();
  vi.stubGlobal('window', win);
  // No server by default (as in local development)
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
  resetRatingsCache();
  return { store, win };
}

describe('starsFor', () => {
  it('has no stars before the first vote', () => {
    expect(starsFor({ up: 0, down: 0 })).toBeNull();
  });

  it('counts the first votes gently, so one vote is never 5 or 0 stars', () => {
    expect(starsFor({ up: 1, down: 0 })).toBe(3.5);
    expect(starsFor({ up: 0, down: 1 })).toBe(1.5);
  });

  it('gives more stars for more likes', () => {
    expect(starsFor({ up: 3, down: 0 })!).toBeGreaterThan(starsFor({ up: 1, down: 0 })!);
    expect(starsFor({ up: 30, down: 0 })).toBe(5);
    expect(starsFor({ up: 0, down: 30 })).toBe(0);
  });

  it('is 2.5 stars for as many likes as dislikes', () => {
    expect(starsFor({ up: 4, down: 4 })).toBe(2.5);
  });

  it('rounds to half stars between 0 and 5', () => {
    for (let up = 0; up <= 20; up++) {
      for (let down = 0; down <= 20; down++) {
        if (up + down === 0) continue;
        const s = starsFor({ up, down })!;
        expect(s * 2).toBe(Math.round(s * 2));
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(5);
      }
    }
  });
});

describe('recordVote', () => {
  let win: EventTarget;
  beforeEach(() => { ({ win } = stubBrowser()); });

  it('counts likes and dislikes for the DJ', () => {
    recordVote('robot', 'Irish', 'Reel', true);
    recordVote('robot', 'Irish', 'Reel', true);
    recordVote('robot', 'Gaming', 'Stealth', false);
    expect(djVotes('robot')).toEqual({ up: 2, down: 1 });
    expect(djVotes('aria')).toEqual({ up: 0, down: 0 });
  });

  it('counts the votes for the genre and style too', () => {
    recordVote('robot', 'Irish', 'Reel', true);
    recordVote('aria', 'Irish', 'Reel', false);
    expect(styleVotes()).toEqual({ 'Irish|Reel': { up: 1, down: 1 } });
  });

  it('tells the app that the ratings changed', () => {
    const heard = vi.fn();
    win.addEventListener('dj-ratings-changed', heard);
    recordVote('robot', 'Irish', 'Reel', true);
    expect(heard).toHaveBeenCalledOnce();
  });

  it('starts over from corrupt saved data', () => {
    localStorage.setItem('gamedj.ratings.v1', '{not json');
    expect(djVotes('robot')).toEqual({ up: 0, down: 0 });
    recordVote('robot', 'Irish', 'Reel', true);
    expect(djVotes('robot')).toEqual({ up: 1, down: 0 });
  });
});

/** A server that answers with these totals */
const serverSays = (body: unknown, ok = true) => vi.fn(async () => ({
  ok, headers: { get: () => 'application/json' }, json: async () => body,
}));

describe('shared ratings', () => {
  beforeEach(() => { stubBrowser(); });

  it('shows everyone\'s totals from the server, not only this browser\'s', async () => {
    vi.stubGlobal('fetch', serverSays({ djs: { robot: { up: 40, down: 2 } }, styles: { 'Irish|Reel': { up: 5, down: 0 } } }));
    await refreshRatings(true);
    expect(djVotes('robot')).toEqual({ up: 40, down: 2 });
    expect(styleVotes()).toEqual({ 'Irish|Reel': { up: 5, down: 0 } });
  });

  it('sends a vote to the server and takes its new totals', async () => {
    const f = serverSays({ ok: true, djs: { aria: { up: 8, down: 1 } }, styles: {} });
    vi.stubGlobal('fetch', f);
    await recordVote('aria', 'Rock', 'Indie', true);
    expect(f).toHaveBeenCalledOnce();
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ratings');
    expect(JSON.parse(String(init.body))).toEqual({ djId: 'aria', genre: 'Rock', style: 'Indie', like: true });
    expect(djVotes('aria')).toEqual({ up: 8, down: 1 });
  });

  it('keeps the last server totals for the next visit and when the server is gone', async () => {
    vi.stubGlobal('fetch', serverSays({ djs: { luc: { up: 3, down: 3 } }, styles: {} }));
    await refreshRatings(true);
    resetRatingsCache(); // a new page load
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await refreshRatings(true);
    expect(djVotes('luc')).toEqual({ up: 3, down: 3 });
  });

  it('ignores an answer that is not JSON (a page instead of the API) and bad counts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, headers: { get: () => 'text/html' }, json: async () => ({}) })));
    await refreshRatings(true);
    expect(djVotes('robot')).toEqual({ up: 0, down: 0 });
    vi.stubGlobal('fetch', serverSays({ djs: { robot: { up: 'x', down: 1 }, aria: { up: -4, down: 2.7 } }, styles: null }));
    await refreshRatings(true);
    expect(djVotes('robot')).toEqual({ up: 0, down: 0 });
    expect(djVotes('aria')).toEqual({ up: 0, down: 2 });
  });

  it('asks the server at most every 10 s unless forced', async () => {
    const f = serverSays({ djs: {}, styles: {} });
    vi.stubGlobal('fetch', f);
    await refreshRatings();
    await refreshRatings();
    expect(f).toHaveBeenCalledOnce();
    await refreshRatings(true);
    expect(f).toHaveBeenCalledTimes(2);
  });
});
