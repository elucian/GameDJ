/**
 * Ko-fi webhook (Vercel Function): a paid shop item "Unlock N songs" adds N extra songs to a visitor.
 *
 * Ko-fi POSTs form-encoded `data=<json>` for every donation / shop order. We:
 *  1. check `verification_token` against KOFI_VERIFICATION_TOKEN (set it on Ko-fi: More > API > Webhooks),
 *  2. ignore a transaction we already processed (kofi_transaction_id),
 *  3. read N from the item or variant name ("Unlock 25 songs" -> 25; quantity multiplies),
 *  4. credit the visitor who pressed Support in the last 30 minutes (the "intent" api/support.ts stores),
 *     or keep the credits under the buyer's e-mail hash until they claim them on the /thanks page.
 *
 * Only salted hashes of e-mails are stored. Env: KOFI_VERIFICATION_TOKEN, QUOTA_SECRET + the Redis variables.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.QUOTA_SECRET || '';
const TOKEN = process.env.KOFI_VERIFICATION_TOKEN || '';
const env = process.env;
const REDIS_URL = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || env.REDIS_KV_REST_API_URL || '';
const REDIS_TOKEN = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || env.REDIS_KV_REST_API_TOKEN || '';
const INTENT_WINDOW_MS = 30 * 60 * 1000;

const hmac = (data: string) => createHmac('sha256', SECRET).update(data).digest('hex');

async function redis(commands: (string | number)[][]): Promise<any[]> {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!res.ok) throw new Error('redis ' + res.status);
  return (await res.json()).map((r: any) => r.result);
}

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Songs bought by a payload: every item whose name says "Unlock N songs" counts N x quantity. */
function creditsOf(payload: any): number {
  const items: any[] = Array.isArray(payload.shop_items) ? payload.shop_items : [];
  const texts = items.length ? items : [payload];
  let total = 0;
  for (const it of texts) {
    const text = Object.values(it).filter(v => typeof v === 'string').join(' ');
    const m = /unlock\s+(\d+)\s+songs?/i.exec(text);
    if (m) total += Number(m[1]) * Math.max(1, Math.floor(Number(it.quantity)) || 1);
  }
  return Math.min(total, 1000);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  if (!SECRET || !TOKEN || !REDIS_URL || !REDIS_TOKEN) { res.status(503).json({ error: 'not configured' }); return; }

  let payload: any;
  try {
    let raw: any = req.body;
    if (typeof raw === 'string') raw = Object.fromEntries(new URLSearchParams(raw));
    payload = typeof raw?.data === 'string' ? JSON.parse(raw.data) : raw?.data ?? raw;
  } catch { res.status(400).end(); return; }

  if (!payload || typeof payload.verification_token !== 'string' || !sameSecret(payload.verification_token, TOKEN)) {
    res.status(401).end();
    return;
  }

  try {
    const credits = creditsOf(payload);
    const tx = String(payload.kofi_transaction_id || payload.message_id || '');
    // Nothing to unlock (a plain donation, another item) or no id to deduplicate by: acknowledge and ignore
    if (!credits || !tx) { res.status(200).json({ ok: true, ignored: true }); return; }

    // Each transaction is processed once (Ko-fi may retry)
    const first = await redis([['SET', `kofi:tx:${tx}`, '1', 'NX', 'EX', 31536000]]);
    if (first[0] !== 'OK') { res.status(200).json({ ok: true, duplicate: true }); return; }

    const now = Date.now();
    // The newest visitor who pressed Support in the last 30 minutes gets the songs
    const recent = await redis([['ZREVRANGEBYSCORE', 'kofi:intents', now, now - INTENT_WINDOW_MS, 'LIMIT', 0, 1]]);
    const sid: string | undefined = recent[0]?.[0];
    if (sid) {
      await redis([['ZREM', 'kofi:intents', sid], ['INCRBY', `credits:${sid}`, credits]]);
    } else {
      // Nobody to credit yet: kept for the buyer, who claims it with the Ko-fi e-mail on the /thanks page
      const mail = String(payload.email || '').trim().toLowerCase();
      if (mail) {
        const key = `kofi:un:${hmac('mail:' + mail).slice(0, 32)}`;
        await redis([['LPUSH', key, String(credits)], ['EXPIRE', key, 90 * 86400]]);
      }
    }
    res.status(200).json({ ok: true });
  } catch {
    res.status(503).json({ error: 'unavailable' }); // Ko-fi retries
  }
}
