/**
 * Lyria 3.5 song rendering (Vercel Function). The paid Gemini key lives only here (GEMINI_SONG_KEY): the browser
 * never sees it, and every song needs a one-time ticket that api/quota.ts issues when it takes a song from the quota.
 *
 * POST {prompt, ticket}   -> the Lyria interaction (JSON), streamed
 *
 * Without a valid ticket nothing is rendered (no quota, no song). For local development a secret header
 * (x-dev-secret = DEV_SONG_SECRET, only present in the dev server, never in the production bundle) skips the ticket.
 *
 * Env: GEMINI_SONG_KEY, QUOTA_SECRET, the Redis variables, DEV_SONG_SECRET (optional).
 * Needs a long function time: vercel.json sets maxDuration for this file.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';

const SECRET = process.env.QUOTA_SECRET || '';
const SONG_KEY = process.env.GEMINI_SONG_KEY || '';
const DEV_SECRET = process.env.DEV_SONG_SECRET || '';
const env = process.env;
const REDIS_URL = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || env.REDIS_KV_REST_API_URL || '';
const REDIS_TOKEN = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || env.REDIS_KV_REST_API_TOKEN || '';
const COOKIE = 'gdj_sid';
// Lyria 3 song models, tried in order: an unknown model id falls back to the next one
const SONG_MODELS = ['lyria-3.5', 'lyria-3-pro-preview'];
const RENDER_TIMEOUT_MS = 290000;

const hmac = (data: string) => createHmac('sha256', SECRET).update(data).digest('hex');
const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function verifySession(cookieHeader: string | undefined): string | null {
  const raw = (cookieHeader || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  const token = raw?.slice(COOKIE.length + 1);
  if (!token) return null;
  const [id, sig] = token.split('.');
  return id && sig && same(sig, hmac(id)) ? id : null;
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
  if (req.method !== 'POST') { res.status(405).end(); return; }
  if (!SONG_KEY || !SECRET || !REDIS_URL || !REDIS_TOKEN) { res.status(503).json({ error: 'song server not configured' }); return; }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const prompt = String(body.prompt || '');
  if (!prompt || prompt.length > 12000) { res.status(400).json({ error: 'bad prompt' }); return; }

  // The ticket: one per song taken from the quota, used once
  const devOk = !!DEV_SECRET && same(String(req.headers['x-dev-secret'] || ''), DEV_SECRET);
  if (!devOk) {
    const sid = verifySession(req.headers.cookie);
    const ticket = String(body.ticket || '');
    if (!sid || !/^[0-9a-f]{32}$/.test(ticket)) { res.status(402).json({ error: 'no song available: quota ticket needed' }); return; }
    try {
      const [owner] = await redis([['GETDEL', `songticket:${ticket}`]]);
      if (owner !== sid) { res.status(402).json({ error: 'no song available: quota ticket needed' }); return; }
    } catch { res.status(503).json({ error: 'quota backend unavailable' }); return; }
  }

  const ai = new GoogleGenAI({ apiKey: SONG_KEY });
  let interaction: any = null;
  let lastError: any = null;
  for (const model of SONG_MODELS) {
    try {
      interaction = await (ai as any).interactions.create({ model, input: prompt }, { timeout: RENDER_TIMEOUT_MS });
      break;
    } catch (e: any) {
      lastError = e;
      // Only an unknown model moves on to the next one; anything else (safety, quota) is final
      if (!/not.?found|404|unsupported|invalid.*model/i.test(String(e?.message || e))) break;
    }
  }
  if (!interaction) {
    const message = String(lastError?.message || lastError || 'No response from Lyria').slice(0, 400);
    res.status(/429|quota|rate limit|exhaust/i.test(message) ? 429 : 502).json({ error: message });
    return;
  }

  // A 3-minute song is a few MB: stream it in pieces (a plain response is capped at 4.5 MB)
  const json = JSON.stringify(interaction);
  res.status(200);
  res.setHeader('Content-Type', 'application/json');
  for (let i = 0; i < json.length; i += 512 * 1024) res.write(json.slice(i, i + 512 * 1024));
  res.end();
}
