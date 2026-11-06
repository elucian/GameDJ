/**
 * Support endpoint used by the app (Vercel Function).
 *
 * POST {action:'intent'}          the visitor pressed Support: the next Ko-fi purchase is theirs (30 minutes)
 * POST {action:'claim', email}    claim a purchase that arrived before / without an intent, by the Ko-fi e-mail
 * GET                             -> {credits}  extra songs this visitor has left
 *
 * Credits live under the visitor's signed session cookie (see api/quota.ts). Env: QUOTA_SECRET + the Redis variables.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.QUOTA_SECRET || '';
const env = process.env;
const REDIS_URL = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || env.REDIS_KV_REST_API_URL || '';
const REDIS_TOKEN = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || env.REDIS_KV_REST_API_TOKEN || '';
const COOKIE = 'gdj_sid';
const INTENT_WINDOW_MS = 30 * 60 * 1000;

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
  if (!SECRET || !REDIS_URL || !REDIS_TOKEN) { res.status(503).json({ error: 'not configured' }); return; }

  let sid = verifySession(req.headers.cookie);
  if (!sid) {
    sid = randomUUID();
    res.setHeader('Set-Cookie', `${COOKIE}=${sid}.${hmac(sid)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
  }
  const creditsKey = `credits:${sid}`;

  try {
    if (req.method === 'GET') {
      const [c] = await redis([['GET', creditsKey]]);
      res.status(200).json({ credits: Math.max(0, Number(c) || 0) });
      return;
    }
    if (req.method !== 'POST') { res.status(405).end(); return; }
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    if (body.action === 'intent') {
      const now = Date.now();
      await redis([['ZREMRANGEBYSCORE', 'kofi:intents', 0, now - INTENT_WINDOW_MS], ['ZADD', 'kofi:intents', now, sid]]);
      res.status(200).json({ ok: true });
      return;
    }

    if (body.action === 'claim') {
      const mail = String(body.email || '').trim().toLowerCase();
      if (!mail || mail.length > 200) { res.status(400).json({ error: 'e-mail needed' }); return; }
      const key = `kofi:un:${hmac('mail:' + mail).slice(0, 32)}`;
      let claimed = 0;
      for (let i = 0; i < 20; i++) { // each pop is atomic: a purchase is claimed once
        const [v] = await redis([['LPOP', key]]);
        if (v === null || v === undefined) break;
        claimed += Number(v) || 0;
      }
      if (claimed > 0) await redis([['INCRBY', creditsKey, claimed]]);
      const [c] = await redis([['GET', creditsKey]]);
      res.status(200).json({ ok: true, claimed, credits: Math.max(0, Number(c) || 0) });
      return;
    }
    res.status(400).json({ error: 'unknown action' });
  } catch {
    res.status(503).json({ error: 'unavailable' });
  }
}
