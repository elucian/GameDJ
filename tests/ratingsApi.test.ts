import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A tiny in-memory Redis behind the Upstash REST /pipeline API: enough for INCR, DECR, EXPIRE, HINCRBY, HGETALL */
function fakeRedis() {
  const kv = new Map<string, number>();
  const hashes = new Map<string, Map<string, number>>();
  const run = (c: (string | number)[]) => {
    const [cmd, key, a, b] = c.map(String);
    switch (cmd) {
      case 'INCR': kv.set(key, (kv.get(key) ?? 0) + 1); return kv.get(key);
      case 'DECR': kv.set(key, (kv.get(key) ?? 0) - 1); return kv.get(key);
      case 'EXPIRE': return 1;
      case 'HINCRBY': {
        const h = hashes.get(key) ?? new Map(); hashes.set(key, h);
        h.set(a, (h.get(a) ?? 0) + Number(b)); return h.get(a);
      }
      case 'HGETALL': return [...(hashes.get(key) ?? new Map())].flatMap(([f, v]) => [f, String(v)]);
      default: throw new Error('unexpected ' + cmd);
    }
  };
  const fetch = vi.fn(async (_url: string, init: RequestInit) => ({
    ok: true, json: async () => (JSON.parse(String(init.body)) as (string | number)[][]).map(c => ({ result: run(c) })),
  }));
  return { fetch, hashes };
}

/** A Vercel-like response that records what the function answered */
function response() {
  const out: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    setHeader: (n: string, v: string) => { out.headers[n] = v; },
    status: (c: number) => { out.status = c; return res; },
    json: (b: unknown) => { out.body = b; },
    end: () => {},
  };
  return { res, out };
}

let redis: ReturnType<typeof fakeRedis>;
async function load() {
  vi.resetModules();
  return (await import('../api/ratings'));
}

beforeEach(() => {
  vi.stubEnv('QUOTA_SECRET', 'test-secret');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
  redis = fakeRedis();
  vi.stubGlobal('fetch', redis.fetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const vote = (body: unknown, ip = '10.0.0.1', cookie?: string) =>
  ({ method: 'POST', headers: { 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) }, body });

describe('api/ratings', () => {
  it('counts every listener\'s votes for the DJ and the style, and shows the totals to everyone', async () => {
    const { default: handler } = await load();
    for (const [ip, like] of [['1.1.1.1', true], ['2.2.2.2', true], ['3.3.3.3', false]] as const) {
      const { res } = response();
      await handler(vote({ djId: 'aria', genre: 'Irish', style: 'Reel', like }, ip), res);
    }
    const { res, out } = response();
    await handler({ method: 'GET', headers: {} }, res);
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ djs: { aria: { up: 2, down: 1 } }, styles: { 'Irish|Reel': { up: 2, down: 1 } } });
    expect(out.headers['Cache-Control']).toContain('s-maxage=10');
  });

  it('answers a vote with the new totals', async () => {
    const { default: handler } = await load();
    const { res, out } = response();
    await handler(vote({ djId: 'robot', genre: 'Rock', style: 'Indie', like: true }), res);
    expect(out.body).toMatchObject({ ok: true, djs: { robot: { up: 1, down: 0 } } });
  });

  it('refuses unknown DJs and votes that are not a yes or no', async () => {
    const { default: handler } = await load();
    for (const body of [{ djId: 'mallory', like: true }, { djId: 'aria', like: 'yes' }, {}]) {
      const { res, out } = response();
      await handler(vote(body), res);
      expect(out.status).toBe(400);
    }
    expect(redis.hashes.size).toBe(0);
  });

  it('does not count a genre or style with separators or that is too long (the DJ vote still counts)', async () => {
    const { default: handler } = await load();
    const { res } = response();
    await handler(vote({ djId: 'luc', genre: 'Rock:up', style: 'x'.repeat(80), like: true }), res);
    expect(redis.hashes.get('ratings:styles')).toBeUndefined();
    expect(redis.hashes.get('ratings:djs')?.get('luc:up')).toBe(1);
  });

  it('limits the votes per visitor a day', async () => {
    const { default: handler, VOTES_PER_DAY } = await load();
    // The first answer sets the visitor's signed cookie; the next votes send it back
    const first = response();
    await handler(vote({ djId: 'hao', like: true }), first.res);
    const cookie = first.out.headers['Set-Cookie'].split(';')[0];
    let last = first.out;
    for (let i = 1; i <= VOTES_PER_DAY; i++) {
      const r = response();
      await handler(vote({ djId: 'hao', like: true }, '10.0.0.1', cookie), r.res);
      last = r.out;
    }
    expect(last.body).toMatchObject({ ok: false, limited: true });
    expect(redis.hashes.get('ratings:djs')?.get('hao:up')).toBe(VOTES_PER_DAY);
  });

  it('limits the votes per network a day, so new cookies do not help', async () => {
    const { default: handler, VOTES_PER_NET_DAY } = await load();
    for (let i = 0; i < VOTES_PER_NET_DAY + 5; i++) {
      const { res } = response();
      await handler(vote({ djId: 'imani', like: false }, `9.9.9.${i % 250}`), res); // one /24, no cookie
    }
    expect(redis.hashes.get('ratings:djs')?.get('imani:down')).toBe(VOTES_PER_NET_DAY);
  });

  it('says so when it has no backend', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    const { default: handler } = await load();
    const { res, out } = response();
    await handler({ method: 'GET', headers: {} }, res);
    expect(out.status).toBe(503);
  });

  it('knows exactly the DJs of the DJ dialog', async () => {
    const { DJ_IDS } = await load();
    const src = readFileSync(new URL('../components/DjPresetDialog.ts', import.meta.url), 'utf8');
    const robot = src.match(/ROBOT_DJ_ID = '([^']+)'/)![1];
    const others = [...src.matchAll(/^\s+id: '([^']+)', name:/gm)].map(m => m[1]);
    expect([...DJ_IDS].sort()).toEqual([robot, ...others].sort());
  });
});

describe('toVotes', () => {
  it('reads HGETALL\'s flat reply and skips odd fields', async () => {
    const { toVotes } = await load();
    expect(toVotes(['aria:up', '3', 'aria:down', '1', 'Irish|Reel:up', '2', 'junk', '9', ':up', '1'])).toEqual({
      aria: { up: 3, down: 1 }, 'Irish|Reel': { up: 2, down: 0 },
    });
    expect(toVotes(null)).toEqual({});
  });
});
