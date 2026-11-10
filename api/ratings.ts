/**
 * Shared DJ ratings (Vercel Function): every listener's "Like this?" vote is counted here, so all users see the same
 * stars for each DJ (the app turns the share of likes into stars, see utils/DjRatings.ts starsFor).
 *
 * Counters live in Redis (the same store as api/quota.ts), two hashes that only grow with HINCRBY (atomic, so two
 * votes at the same moment are both counted):
 *   ratings:djs     "<djId>:up" / "<djId>:down"
 *   ratings:styles  "<genre>|<style>:up" / ":down"   (what the Robot DJ studies)
 *
 * Abuse limits: a vote needs the signed session cookie (api/quota.ts), and each visitor may vote VOTES_PER_DAY times
 * a day, each network (salted hash of the /24 or /48) VOTES_PER_NET_DAY times. Only known DJ ids are counted.
 *
 * GET                                    -> {djs: {id: {up, down}}, styles: {"Genre|Style": {up, down}}}
 * POST {djId, genre, style, like}        -> {ok, djs, styles}  (ok false + limited when over the daily limit)
 *
 * Env: QUOTA_SECRET + the Redis variables (as api/quota.ts).
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.QUOTA_SECRET || '';
const env = process.env;
const REDIS_URL = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || env.REDIS_KV_REST_API_URL || '';
const REDIS_TOKEN = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || env.REDIS_KV_REST_API_TOKEN || '';
const COOKIE = 'gdj_sid';

/** The DJs of components/DjPresetDialog.ts (a test keeps the two lists equal) */
export const DJ_IDS = ['robot', 'diego', 'jiwoo', 'aria', 'ioana', 'marcus', 'luc', 'siobhan', 'viktor', 'imani', 'desmond', 'hao'];
export const VOTES_PER_DAY = 12;
export const VOTES_PER_NET_DAY = 40;
const DJ_KEY = 'ratings:djs';
const STYLE_KEY = 'ratings:styles';

interface Votes { up: number; down: number }

const hmac = (data: string) => createHmac('sha256', SECRET).update(data).digest('hex');

function verifySession(cookieHeader: string | undefined): string | null {
  const raw = (cookieHeader || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  const token = raw?.slice(COOKIE.length + 1);
  if (!token) return null;
  const [id, sig] = token.split('.');
  if (!id || !sig) return null;
  const good = Buffer.from(hmac(id)), got = Buffer.from(sig);
  return good.length === got.length && timingSafeEqual(good, got) ? id : null;
}

/** IPv4 -> /24, IPv6 -> /48, then salted + hashed (as api/quota.ts) */
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

async function redis(commands: (string | number)[][]): Promise<unknown[]> {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!res.ok) throw new Error('redis ' + res.status);
  return ((await res.json()) as { result: unknown }[]).map(r => r.result);
}

/** HGETALL's flat [field, value, ...] reply -> {name: {up, down}} ("name:up" / "name:down" fields) */
export function toVotes(flat: unknown): Record<string, Votes> {
  const out: Record<string, Votes> = {};
  if (!Array.isArray(flat)) return out;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const field = String(flat[i]), n = Math.max(0, Math.floor(Number(flat[i + 1])) || 0);
    const cut = field.lastIndexOf(':');
    const name = field.slice(0, cut), side = field.slice(cut + 1);
    if (cut <= 0 || (side !== 'up' && side !== 'down')) continue;
    (out[name] ??= { up: 0, down: 0 })[side] = n;
  }
  return out;
}

/** A genre or style name as the app sends it: printable, short, without the separators the keys use */
const cleanName = (v: unknown) => typeof v === 'string' && /^[^|:\u0000-\u001f]{1,40}$/.test(v.trim()) ? v.trim() : '';

/** Minimal shapes of the Vercel Node request and response this function uses */
interface Req { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown; socket?: { remoteAddress?: string } }
interface Res { setHeader(name: string, value: string): void; status(code: number): Res; json(body: unknown): void; end(): void }

export default async function handler(req: Req, res: Res) {
  if (!SECRET || !REDIS_URL || !REDIS_TOKEN) { res.setHeader('Cache-Control', 'no-store'); res.status(503).json({ error: 'ratings backend not configured' }); return; }
  const totals = async () => {
    const [d, s] = await redis([['HGETALL', DJ_KEY], ['HGETALL', STYLE_KEY]]);
    return { djs: toVotes(d), styles: toVotes(s) };
  };

  try {
    if (req.method === 'GET') {
      // The same answer for everyone: the CDN keeps it 10 s, so many open dialogs cost few Redis commands
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=30');
      res.status(200).json(await totals());
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.status(405).end(); return; }

    let sid = verifySession(req.headers.cookie as string | undefined);
    if (!sid) {
      sid = randomUUID();
      res.setHeader('Set-Cookie', `${COOKIE}=${sid}.${hmac(sid)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
    }
    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})) as Record<string, unknown>;
    const djId = typeof body.djId === 'string' ? body.djId : '';
    if (!DJ_IDS.includes(djId) || typeof body.like !== 'boolean') { res.status(400).json({ error: 'bad vote' }); return; }
    const side = body.like ? 'up' : 'down';

    // Daily limits per visitor and per network (INCR is atomic; a refused vote is taken back)
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const day = new Date().toISOString().slice(0, 10);
    const limitKeys = [`votes:${sid}:${day}`, `votes:n:${networkHash(ip)}:${day}`];
    const counts = (await redis(limitKeys.map(k => ['INCR', k]))).map(Number);
    const first = limitKeys.flatMap((k, i) => (counts[i] === 1 ? [['EXPIRE', k, 2 * 86400]] : []));
    if (first.length) await redis(first);
    if (counts[0] > VOTES_PER_DAY || counts[1] > VOTES_PER_NET_DAY) {
      await redis(limitKeys.map(k => ['DECR', k]));
      res.status(200).json({ ok: false, limited: true, ...(await totals()) });
      return;
    }

    const genre = cleanName(body.genre), style = cleanName(body.style);
    const bump: (string | number)[][] = [['HINCRBY', DJ_KEY, `${djId}:${side}`, 1]];
    if (genre && style) bump.push(['HINCRBY', STYLE_KEY, `${genre}|${style}:${side}`, 1]);
    await redis(bump);
    res.status(200).json({ ok: true, ...(await totals()) });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ error: 'ratings backend unavailable' });
  }
}
