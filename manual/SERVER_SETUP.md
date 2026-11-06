# GameDJ server setup (free-quota backend)

This file holds **no secrets**. Real values go in `private/.env` (local, git-ignored) and in the Vercel dashboard (production).

## What runs on the server

`api/quota.ts` is a Vercel Function at `/api/quota`. It counts free songs per visitor in Redis:

| Counter | Key per | Limit | Resets |
|---|---|---|---|
| Lyria 3.5 songs (`song`) | signed session cookie, and network (IPv4 /24, IPv6 /48) | 3 per visitor | calendar month (UTC) |
| Live takes (`live`) | same | 5 per visitor | every 7 days |

- The network counter allows `IP_LIMIT_MULTIPLIER` x the limit (default 3), so shared offices, schools and mobile networks are not locked out by one user.
- The session cookie `gdj_sid` is HMAC-signed with `QUOTA_SECRET` (httpOnly, Secure, 1 year). Clearing it does not reset the quota because the network counter still counts.
- Raw IPs are never stored, only salted hashes.
- If the server is missing or down, the browser falls back to its own local quota. `localhost` is always unlimited.

### When a song is counted, and when it is given back

- The quota is taken when **Record** is pressed (server first), never at download.
- If the take is stopped (**Stop** or **Reset**) within **15 seconds of its sound starting**, the song is given back: the visitor did not like it, up to **5 times a day** per visitor (`refunds:<session id>:<day>`; the 6th early stop stays counted). A live take's sound starts when it leaves the warm-up; a Lyria 3.5 song's when the rendered song begins to play. Stopping while the song is still rendering also gives it back. After 15 seconds the song stays counted.
- A failed song render is always given back. A counter never goes below zero on a refund.

## 1. Environment variables

| Name | Where it comes from | Used by |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio | Vite build (compiled into the app) |
| `QUOTA_SECRET` | any long random string (see below) | `api/quota.ts` |
| `UPSTASH_REDIS_REST_URL` | Upstash / Vercel Marketplace | `api/quota.ts` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash / Vercel Marketplace | `api/quota.ts` |
| `IP_LIMIT_MULTIPLIER` | optional, default `3` | `api/quota.ts` |
| `KOFI_VERIFICATION_TOKEN` | Ko-fi: More > API > Webhooks (the token shown there) | `api/kofi.ts` |
| `KOFI_DEBUG_KEY` | optional: any long random string; turns on the capture viewer (see below) | `api/kofi.ts` |
| `KOFI_PACKS` | optional: `code=songs,code=songs` for variants not named "Unlock N songs" | `api/kofi.ts` |
| `SONG_LIMIT` | optional, default `3` (Lyria 3.5 songs per visitor per month) | `api/quota.ts` |
| `LIVE_LIMIT` | optional, default `5` (live takes per visitor per 7 days) | `api/quota.ts` |

`KV_REST_API_URL` / `KV_REST_API_TOKEN` (Vercel KV names) and `REDIS_KV_REST_API_URL` / `REDIS_KV_REST_API_TOKEN` (what the Vercel Marketplace adds when the store prefix is `REDIS`) work in place of the two Upstash names. Use the read-write token, never `..._READ_ONLY_TOKEN`.

Generate a secret:

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`SONG_LIMIT` / `LIVE_LIMIT` are whole numbers; when unset or invalid the defaults apply. The server sends the limit and the message text to the browser with every answer, and the browser remembers it, so changing a variable and redeploying is enough (browsers pick the new value on their next take).

Keep the same `QUOTA_SECRET` in production for good: changing it invalidates every visitor's cookie and network hash (everyone gets a fresh quota).

## 2. Local setup

1. Put the values in `private/.env` (already created; fill in `GEMINI_API_KEY` and, if you want to test the server, the Redis values).
2. Run `npm install` then `npm run dev` (http://localhost:3000). The quota is unlimited on localhost and `api/` is not served by Vite.
3. To test the real endpoint locally:
   ```
   npm i -g vercel
   vercel login
   vercel link
   vercel env pull private/.env.local
   copy private\.env.local .env.local      (Vercel reads the project root; .env.local is git-ignored)
   vercel dev
   ```
   Open the printed URL, but not as `localhost` if you want the quota enforced (localhost is exempt): use a tunnel or test on the deployed site (step 4).

## Browser cache (saves Redis commands)

The page never asks the server on load. The server is asked only when a take starts and the browser's own memory allows it. A refusal is stored in `localStorage` (`gamedj.quotaDenied.v1`) until the period ends (UTC month for songs, 7-day window for live takes); until then no request is sent and the microphone button is disabled. Clearing the browser storage makes the next take ask the server again, which refuses again from the Redis counters.

## 3. Production setup (Vercel)

1. Push the repo to GitHub and import it in Vercel (New Project). `vercel.json` already builds the site (`dist`) and the function (`api/**/*.ts`).
2. **Storage -> Create / Connect -> Upstash Redis** (Marketplace). Pick the same region as the project. This adds the Redis variables to the project.
3. **Settings -> Environment Variables**, for Production (and Preview if you test there), add:
   - `QUOTA_SECRET` (copy from `private/.env`)
   - `GEMINI_API_KEY`
   - `IP_LIMIT_MULTIPLIER` (optional)
4. Redeploy (Deployments -> ... -> Redeploy) so the new variables are picked up.

## 4. Verify the deployment

Use your real domain, not localhost.

1. `https://<domain>/api/quota` should return JSON like `{"song":{"used":0,"limit":3,"ok":true},"live":{...}}`.
   - `503 quota backend not configured`: a variable is missing, redeploy after adding it.
   - `503 quota backend unavailable`: the Redis URL or token is wrong.
   - `404`: `vercel.json` was not deployed with the `api/**/*.ts` build entry.
2. In the app, record 5 live takes: the 6th shows "Weekly free quota limit reached: 5 songs."
3. With the voice mode and a voice on stage, render 3 songs: the 4th shows "Monthly free quota limit reached: 3 songs. Falling back to live model.", the Band tab is selected, the voice mode goes off and the microphone button shows the forbidden cursor.
4. Clear the browser storage and cookies: the limit must still apply (the network counter).

To reset a visitor while testing, delete the keys in the Upstash console (Data Browser): `q:song:*` and `q:live:*`.

## 5. Security notes

- `private/`, `.env` and `.env.*` are git-ignored. Check `git status` before every push.
- **The Gemini key is compiled into the browser bundle** (`VITE_API_KEY`), so anyone can read it from the deployed site and call Lyria without the quota. The server counter is only a real limit once Gemini calls go through the server:
  - Lyria 3.5 songs (`generateContent`): proxy through a function that checks the quota and holds the key.
  - Lyria RealTime (WebSocket, cannot run in a Vercel Function): issue short-lived Gemini ephemeral tokens (`ai.authTokens`) after the quota check. Confirm Lyria RealTime accepts them first.
  - Until then: restrict the key in Google Cloud (HTTP referrer = your domain, API = Generative Language only), set a billing budget alert, and rotate the key if it leaked.
- Rotating `GEMINI_API_KEY`: create the new key, update `private/.env` and the Vercel variable, redeploy, delete the old key.

## 6. Files

- `api/quota.ts` - free quota: consume / refund per take (and use of bought songs)
- `api/support.ts` - Support: purchase intent, claim by e-mail, bought-songs count
- `api/kofi.ts` - Ko-fi webhook and the capture viewer
- `utils/UserQuota.ts` - client: local quota, `reserveQuota`, `refundQuota`, remembered refusal, bought songs, Support helpers
- `components/SupportDialog.ts`, `components/ThanksDialog.ts`, `components/AboutDialog.ts` - the dialogs
- `tools/kofi-webhook-test.mjs` - sends a simulated Ko-fi shop order
- `vercel.json` - build config (Vite site; `api/*.ts` become functions)
- `vite.config.ts` - reads `private/.env`, then the root `.env*`
- `private/.env` - your local secrets (never committed)

## Ko-fi: "Unlock N songs"

Buyers get extra songs by buying a Ko-fi shop item. The extra songs are used after the free monthly songs are gone, and they do not expire. Once the free 5 live takes of a week are used, a bought song also pays for live takes: **1 bought song = 3 live takes** (the first take opens a song and the other 2 are kept as `takes:<session id>`; a refunded paid take goes back to them).

### Setting up Ko-fi

1. In your Ko-fi shop, create one item with variants named exactly like `Unlock 10 songs`, `Unlock 25 songs`, `Unlock 50 songs`. The number N is read from the **variant name** (`variation_name`); the quantity multiplies it. Ko-fi sends no item name, only the variant name and the item's `direct_link_code`.
2. For each variant set the custom URL to `https://<your-domain>/thanks`.
3. Publish the item.
4. More > API > Webhooks: set the webhook URL to `https://<your-domain>/api/kofi` and copy the verification token into `KOFI_VERIFICATION_TOKEN` (private/.env and Vercel). Redeploy after adding variables.

### How a purchase finds its buyer

1. The Ko-fi button in the app opens the **Support** dialog, which asks for the e-mail the buyer will use on Ko-fi (remembered for next time), then opens the shop item. The server stores a hash of that e-mail linked to the visitor for 2 hours, and also registers the visitor as the newest "intent" for 30 minutes.
2. When Ko-fi calls the webhook: (a) the visitor with that e-mail gets the songs; else (b) the newest visitor with an open intent; else (c) the songs are kept under the e-mail hash.
3. The buyer lands on `/thanks`. The dialog shows the songs, waits up to about 30 seconds for Ko-fi, and if they are not in this browser it claims them automatically with the remembered e-mail. A second claim answers "Already claimed" and closes the dialog.
4. The app also checks for new songs when the window gets focus after the Support button was pressed, and whenever the About dialog opens.

Stored in Redis: `credits:<session id>`, `kofi:tx:<id>` (a transaction is processed once), `kofi:un:<e-mail hash>` (waiting for a claim), `kofi:claimed:<e-mail hash>`, `kofi:ie:<e-mail hash>` and `kofi:intents`. E-mails are only stored as salted hashes.

### Testing

- Ko-fi's test button sends placeholder variants (`Blue`, `Large`); they are ignored on purpose.
- Make a **100% discount code** on Ko-fi and buy the cheapest variant yourself. Delete the code afterwards.
- Simulate a purchase from your machine: `node tools/kofi-webhook-test.mjs --variant "Unlock 25 songs" --email you@example.com` (reads the token from `private/.env`; see the header of the script for more options, including `--bad-token` and a repeated `--tx`).
- If a purchase is not credited: look at the Vercel function log for lines starting with `[kofi]` (they show the variant names that arrived, never e-mail or address), or use the capture viewer.

### Seeing what Ko-fi really sends (capture)

`api/kofi.ts` keeps the last 10 verified webhooks for 24 hours, with the token, e-mail, name, message, address, Discord fields and URL blanked (`[redacted]`); the items, amounts and field names stay.

1. Set `KOFI_DEBUG_KEY` (any long random string) in Vercel and redeploy.
2. Make a purchase or press Ko-fi's test button.
3. Open `https://<your-domain>/api/kofi?debug=<KOFI_DEBUG_KEY>`: the payloads appear, newest first. Without the key (or with the variable unset) the address answers 404.
4. Webhooks with a wrong token are not stored; the Vercel log shows `[kofi] rejected` with the field names only.

**Remove `KOFI_DEBUG_KEY` from Vercel when you are done** to switch the viewer off.

## Known limits

- The Gemini key is in the browser bundle, so the quota only limits honest use until Gemini calls go through the server (see section 5).
- Claiming by e-mail has no attempt limit: anyone who knows a buyer's Ko-fi e-mail can claim that purchase first.
- A refund on Ko-fi does not take the songs back.
- Matching by "newest intent" can credit the wrong visitor if two people buy in the same 30 minutes without giving an e-mail.
