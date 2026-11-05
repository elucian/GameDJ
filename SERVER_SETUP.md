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

## 1. Environment variables

| Name | Where it comes from | Used by |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio | Vite build (compiled into the app) |
| `QUOTA_SECRET` | any long random string (see below) | `api/quota.ts` |
| `UPSTASH_REDIS_REST_URL` | Upstash / Vercel Marketplace | `api/quota.ts` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash / Vercel Marketplace | `api/quota.ts` |
| `IP_LIMIT_MULTIPLIER` | optional, default `3` | `api/quota.ts` |

`KV_REST_API_URL` / `KV_REST_API_TOKEN` (Vercel KV names) work in place of the two Upstash names.

Generate a secret:

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

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

- `api/quota.ts` - the quota function
- `utils/UserQuota.ts` - client: local quota, `reserveQuota`, `refundQuota`, and the remembered server refusal
- `vercel.json` - build config (static site + function)
- `vite.config.ts` - reads `private/.env`, then the root `.env*`
- `private/.env` - your local secrets (never committed)
