/**
 * Server-side free quota (Vercel Function).
 *
 * Identity of a visitor = a signed session cookie (HMAC, cannot be forged or edited) AND a salted hash of the
 * network the request comes from (IPv4 /24, IPv6 /48). A take is allowed only while BOTH counters are under their
 * limit, so clearing cookies does not reset the quota. The subnet cap is higher (IP_LIMIT_MULTIPLIER, default 3)
 * because a whole office, school or mobile carrier can share one network.
 *
 * Counters live in Redis (Upstash / Vercel KV REST API), one key per visitor and period, with an expiry.
 * Raw IPs are never stored, only salted hashes.
 *
 * Env: SONG_LIMIT (default 3 per month), LIVE_LIMIT (default 5 per week), QUOTA_SECRET (long random string), UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *      (or KV_REST_API_URL + KV_REST_API_TOKEN from Vercel KV), IP_LIMIT_MULTIPLIER (optional).
 *
 * POST {kind:'song'|'live', action:'consume'|'refund'} -> {ok, used, limit, message}
 * GET  -> {song:{used,limit,ok}, live:{used,limit,ok}}
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

type Kind = 'song' | 'live';
/** A whole number >= 1 from the environment, else the default (so unset variables keep the original limits). */
const limitFrom = (name: string, fallback: number) => {
  const n = Math.floor(Number(process.env[name]));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
};
const SONG_LIMIT = limitFrom('SONG_LIMIT', 3);
const LIVE_LIMIT = limitFrom('LIVE_LIMIT', 5);

const RULES: Record<Kind, { limit: number; message: string; windowKey: (d: Date) => string; ttl: number }> = {
  // Lyria 3.5 songs: SONG_LIMIT per calendar month (default 3)
  song: { limit: SONG_LIMIT, message: `Monthly free quota limit reached: ${SONG_LIMIT} songs.`, windowKey: d => `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`, ttl: 35 * 86400 },
  // Normal songs (Lyria RealTime): LIVE_LIMIT per 7-day period (default 5)
  live: { limit: LIVE_LIMIT, message: `Weekly free quota limit reached: ${LIVE_LIMIT} songs.`, windowKey: d => `w${Math.floor(d.getTime() / (7 * 86400000))}`, ttl: 8 * 86400 }
};

const SECRET = process.env.QUOTA_SECRET || '';
// Upstash / Vercel KV REST names; `REDIS_KV_REST_API_*` is what the Vercel Marketplace adds when the store prefix is REDIS
const env = process.env;
const REDIS_URL = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || env.REDIS_KV_REST_API_URL || '';
// Needs the read-write token, never the READ_ONLY one
const REDIS_TOKEN = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || env.REDIS_KV_REST_API_TOKEN || '';
const IP_MULT = Math.max(1, Number(process.env.IP_LIMIT_MULTIPLIER) || 3);
const COOKIE = 'gdj_sid';

const hmac = (data: string) => createHmac('sha256', SECRET).update(data).digest('hex');

/** Signed session id: `<uuid>.<hmac>`. Returns the id when the signature is valid. */
function verifySession(cookieHeader: string | undefined): string | null {
  const raw = (cookieHeader || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  const token = raw?.slice(COOKIE.length + 1);
  if (!token) return null;
  const [id, sig] = token.split('.');
  if (!id || !sig) return null;
  const good = Buffer.from(hmac(id)), got = Buffer.from(sig);
  return good.length === got.length && timingSafeEqual(good, got) ? id : null;
}

/** IPv4 -> /24, IPv6 -> /48, then salted + hashed. */
function networkHash(ip: string): string {
  let net = ip;
  if (ip.includes('.') && !ip.includes(':')) net = ip.split('.').slice(0, 3).join('.');
  else if (ip.includes(':')) {
    const [head, tail = ''] = ip.split('::');
    const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
    const full = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
    net = full.slice(0, 3).join(':');
  }
  return hmac('net:' + net).slice(0, 24);
}

async function redis(commands: (string | number)[][]): Promise<any[]> {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!res.ok) throw new Error('redis ' + res.status);
  return (await res.json()).map((r: any) => r.result);
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (!SECRET || !REDIS_URL || !REDIS_TOKEN) { res.status(503).json({ error: 'quota backend not configured' }); return; }

  let sid = verifySession(req.headers.cookie);
  if (!sid) {
    sid = randomUUID();
    res.setHeader('Set-Cookie', `${COOKIE}=${sid}.${hmac(sid)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const net = networkHash(ip);
  const now = new Date();
  const keys = (kind: Kind) => {
    const w = RULES[kind].windowKey(now);
    return { user: `q:${kind}:${w}:u:${sid}`, net: `q:${kind}:${w}:n:${net}` };
  };

  try {
    if (req.method === 'GET') {
      const out: Record<string, unknown> = {};
      // Only the asked kind (?kind=song): every Redis command counts against the plan
      const only = req.query?.kind === 'live' ? 'live' : req.query?.kind === 'song' ? 'song' : null;
      for (const kind of (only ? [only] : ['song', 'live']) as Kind[]) {
        const k = keys(kind);
        const [u, n] = await redis([['GET', k.user], ['GET', k.net]]);
        const used = Math.max(Number(u) || 0, Math.ceil((Number(n) || 0) / IP_MULT));
        out[kind] = { used, limit: RULES[kind].limit, ok: used < RULES[kind].limit && (Number(n) || 0) < RULES[kind].limit * IP_MULT };
      }
      res.status(200).json(out);
      return;
    }
    if (req.method !== 'POST') { res.status(405).end(); return; }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const kind: Kind = body.kind === 'song' ? 'song' : 'live';
    const rule = RULES[kind];
    const k = keys(kind);

    const creditsKey = `credits:${sid}`;
    if (body.action === 'refund') {
      const [u, n] = await redis([['DECR', k.user], ['DECR', k.net]]);
      // A counter never goes below zero (a refund without a take must not create free songs)
      const fix: (string | number)[][] = [];
      if (Number(u) < 0) fix.push(['INCR', k.user]);
      if (Number(n) < 0) fix.push(['INCR', k.net]);
      if (fix.length) await redis(fix);
      // A song above the free limit was paid with a bought credit: give that one back
      if (kind === 'song' && Number(u) >= rule.limit && Number(u) >= 0) await redis([['INCR', creditsKey]]);
      res.status(200).json({ ok: true });
      return;
    }

    // consume: take one from both counters (INCR is atomic) and give it back when either is over its limit
    const r = await redis([['INCR', k.user], ['INCR', k.net]]);
    const u = Number(r[0]), n = Number(r[1]);
    // The expiry is set only when the counter was just created (saves commands)
    const ttl: (string | number)[][] = [];
    if (u === 1) ttl.push(['EXPIRE', k.user, rule.ttl]);
    if (n === 1) ttl.push(['EXPIRE', k.net, rule.ttl]);
    if (ttl.length) await redis(ttl);
    if (u > rule.limit || n > rule.limit * IP_MULT) {
      // Songs bought on Ko-fi ("Unlock N songs") are used once the free monthly songs are gone
      if (kind === 'song') {
        const [left] = await redis([['DECR', creditsKey]]);
        if (Number(left) >= 0) {
          res.status(200).json({ ok: true, used: u, limit: rule.limit, credits: Number(left), message: rule.message });
          return;
        }
        await redis([['INCR', creditsKey]]); // there was none: put the counter back to 0
      }
      await redis([['DECR', k.user], ['DECR', k.net]]);
      res.status(200).json({ ok: false, used: Math.min(u, rule.limit), limit: rule.limit, credits: 0, message: rule.message });
      return;
    }
    res.status(200).json({ ok: true, used: u, limit: rule.limit, message: rule.message });
  } catch {
    res.status(503).json({ error: 'quota backend unavailable' });
  }
}
