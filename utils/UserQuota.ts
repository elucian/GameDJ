/**
 * Anonymous browser identity and free-tier quotas.
 *
 * The ID and the usage log live in this browser's localStorage: they limit the app for an honest visitor but cannot
 * stop someone who clears the storage. Real enforcement needs a server that keeps the usage under the same ID.
 */
const USER_ID_KEY = 'gamedj.userId';
const USAGE_KEY = 'gamedj.usage.v1';

const DAY_MS = 24 * 60 * 60 * 1000;

export type QuotaKind = 'song' | 'live';

/** The limits the server answered with (SONG_LIMIT / LIVE_LIMIT there); the built-in 3 and 5 apply until it answered. */
const LIMITS_KEY = 'gamedj.quotaLimits.v1';
function rememberLimit(kind: QuotaKind, limit: number) {
    try {
        const all = JSON.parse(localStorage.getItem(LIMITS_KEY) || '{}');
        if (all[kind] !== limit) { all[kind] = limit; localStorage.setItem(LIMITS_KEY, JSON.stringify(all)); }
    } catch { /* storage unavailable */ }
}
function limitFor(kind: QuotaKind): number {
    try {
        const n = Number(JSON.parse(localStorage.getItem(LIMITS_KEY) || '{}')[kind]);
        if (Number.isInteger(n) && n >= 1) return n;
    } catch { /* default */ }
    return RULES[kind].limit;
}
/** Extra songs bought on Ko-fi ("Unlock N songs"): the server's count is remembered here for the UI. */
const CREDITS_KEY = 'gamedj.credits.v1';
export function creditsLeft(): number {
    try { return Math.max(0, Math.floor(Number(localStorage.getItem(CREDITS_KEY))) || 0); } catch { return 0; }
}
function rememberCredits(n: number) {
    try { localStorage.setItem(CREDITS_KEY, String(Math.max(0, Math.floor(n)))); } catch { /* storage unavailable */ }
}
/** Live takes left from bought songs; one bought song is worth LIVE_PER_SONG takes (the server decides, this is for the display). */
const TAKES_KEY = 'gamedj.takes.v1';
/** The server's LIVE_PER_SONG (default 3; 0 = bought songs do not pay for live takes) */
const LIVE_PER_SONG_KEY = 'gamedj.livePerSong.v1';
function livePerSong(): number {
    try {
        const v = localStorage.getItem(LIVE_PER_SONG_KEY);
        const n = v === null ? 3 : Math.floor(Number(v));
        return Number.isFinite(n) && n >= 0 ? n : 3;
    } catch { return 3; }
}
function rememberLivePerSong(n: number) {
    try { localStorage.setItem(LIVE_PER_SONG_KEY, String(Math.max(0, Math.floor(n)))); } catch { /* storage unavailable */ }
}
function takesLeft(): number {
    try { return Math.max(0, Math.floor(Number(localStorage.getItem(TAKES_KEY))) || 0); } catch { return 0; }
}
function rememberTakes(n: number) {
    try { localStorage.setItem(TAKES_KEY, String(Math.max(0, Math.floor(n)))); } catch { /* storage unavailable */ }
}

/** The free songs per month (the server's SONG_LIMIT, 3 until the server answered). */
export const freeSongsPerMonth = (): number => limitFor('song');

const messageFor = (kind: QuotaKind) => kind === 'song'
    ? `Monthly free quota limit reached: ${limitFor('song')} songs.`
    : `Weekly free quota limit reached: ${limitFor('live')} songs.`;

interface QuotaRule { limit: number; label: string; message: string; inWindow: (now: Date, t: number) => boolean }

const RULES: Record<QuotaKind, QuotaRule> = {
    // Lyria 3.5 songs: 3 per calendar month
    song: {
        limit: 3, label: 'Lyria 3.5 songs per month',
        message: 'Monthly free quota limit reached: 3 songs.',
        inWindow: (now, t) => { const d = new Date(t); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }
    },
    // Normal songs (Lyria RealTime): 5 per rolling week
    live: {
        limit: 5, label: 'Lyria RealTime songs per week',
        message: 'Weekly free quota limit reached: 5 songs.',
        inWindow: (now, t) => now.getTime() - t < 7 * DAY_MS && t <= now.getTime()
    }
};

/** The unique ID of this visitor (created on the first visit, then kept). */
export function getUserId(): string {
    try {
        let id = localStorage.getItem(USER_ID_KEY);
        if (!id) {
            id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
            localStorage.setItem(USER_ID_KEY, id);
        }
        return id;
    } catch {
        return 'anonymous';
    }
}

type Usage = Record<string, Partial<Record<QuotaKind, number[]>>>;

function readUsage(): Usage {
    try { return JSON.parse(localStorage.getItem(USAGE_KEY) || '{}') as Usage; } catch { return {}; }
}

function timesFor(kind: QuotaKind, now = new Date()): number[] {
    const list = readUsage()[getUserId()]?.[kind] || [];
    return list.filter(t => RULES[kind].inWindow(now, t));
}

/** Development on this machine is never limited. */
const isLocalHost = (): boolean => {
    try { return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname); } catch { return false; }
};

/**
 * A refusal from the server is remembered in this browser until the period ends (calendar month in UTC for songs,
 * the 7-day window for live takes): no more requests are sent, and the voice button stays forbidden.
 * Clearing the browser storage forgets it, and the next request asks the server again.
 */
const DENIED_KEY = 'gamedj.quotaDenied.v1';
const periodEnd = (kind: QuotaKind, now = Date.now()): number => {
    if (kind === 'song') { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
    return (Math.floor(now / (7 * DAY_MS)) + 1) * 7 * DAY_MS;
};
function deniedUntil(kind: QuotaKind): number {
    try { return Number(JSON.parse(localStorage.getItem(DENIED_KEY) || '{}')[kind]) || 0; } catch { return 0; }
}
function clearDenied(kind: QuotaKind) {
    try {
        const all = JSON.parse(localStorage.getItem(DENIED_KEY) || '{}');
        delete all[kind];
        localStorage.setItem(DENIED_KEY, JSON.stringify(all));
    } catch { /* nothing remembered */ }
}
function rememberDenied(kind: QuotaKind) {
    try {
        const all = JSON.parse(localStorage.getItem(DENIED_KEY) || '{}');
        all[kind] = periodEnd(kind);
        localStorage.setItem(DENIED_KEY, JSON.stringify(all));
    } catch { /* storage unavailable: the server is asked again next time */ }
}

export function quotaStatus(kind: QuotaKind): { ok: boolean; used: number; limit: number; message: string } {
    const base = limitFor(kind), message = messageFor(kind);
    // Bought songs raise the song limit, and also the live take limit (1 song = 3 takes)
    const limit = kind === 'song' ? base + creditsLeft() : base + (livePerSong() > 0 ? takesLeft() + creditsLeft() * livePerSong() : 0);
    if (isLocalHost()) return { ok: true, used: 0, limit, message };
    if (deniedUntil(kind) > Date.now()) return { ok: false, used: limit, limit, message };
    const used = timesFor(kind).length;
    return { ok: used < limit, used, limit, message };
}

/** Takes the latest counted song of this kind back (a take stopped within the grace time). */
export function unrecordUsage(kind: QuotaKind) {
    try {
        const usage = readUsage();
        const id = getUserId();
        const list = usage[id]?.[kind] || [];
        if (!list.length) return;
        usage[id] = { ...usage[id], [kind]: list.slice(0, -1) };
        localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
    } catch { /* storage unavailable */ }
}

/** Counts one song against the quota (call it when the song really started or finished). */
export function recordUsage(kind: QuotaKind) {
    try {
        const usage = readUsage();
        const id = getUserId();
        const kept = timesFor(kind);
        usage[id] = { ...usage[id], [kind]: [...kept, Date.now()] };
        localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
    } catch { /* storage unavailable: no quota tracking */ }
}

/**
 * Server-side quota (api/quota.ts): counts per signed session cookie AND per network, so clearing the browser storage
 * does not reset it. Returns null when the server is not reachable / not configured (the local quota then applies).
 */
/** The one-time ticket the server gave for the song just taken from the quota (api/song.ts needs it). */
let songTicket = '';
export function takeSongTicket(): string { const t = songTicket; songTicket = ''; return t; }

async function callServer(kind: QuotaKind, action: 'consume' | 'refund', early = false): Promise<{ ok: boolean; message: string } | null> {
    if (isLocalHost()) return null;
    try {
        const res = await fetch('/api/quota', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind, action, early })
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (Number.isInteger(data.limit) && data.limit >= 1) rememberLimit(kind, data.limit);
        if (action === 'consume' && kind === 'song' && data.ok !== false && typeof data.ticket === 'string') songTicket = data.ticket;
        if (typeof data.credits === 'number') rememberCredits(data.credits);
        if (typeof data.takes === 'number') rememberTakes(data.takes);
        if (typeof data.livePerSong === 'number') rememberLivePerSong(data.livePerSong);
        return { ok: data.ok !== false, message: data.message || messageFor(kind) };
    } catch { return null; }
}

/** Takes one song from the quota before a take starts. Server decision first, the local quota when there is no server. */
export async function reserveQuota(kind: QuotaKind): Promise<{ ok: boolean; message: string }> {
    const local = quotaStatus(kind);
    // A refusal the browser remembers: no server request at all
    if (deniedUntil(kind) > Date.now() && !isLocalHost()) return { ok: false, message: local.message };
    // The server decides (its limits may differ from the built-in ones); the local count only applies without a server
    const remote = await callServer(kind, 'consume');
    if (remote) {
        if (!remote.ok) rememberDenied(kind);
        return remote;
    }
    return { ok: local.ok, message: local.message };
}

/** Gives the song back (the take failed before anything was delivered). */
export async function refundQuota(kind: QuotaKind) { await callServer(kind, 'refund'); }

/** Early stops that may be given back per day (the server counts them too). */
export const EARLY_GIVEBACKS_PER_DAY = 5;
const GIVEBACK_KEY = 'gamedj.givebacks.v1';
function givebacksToday(): { day: string; n: number } {
    const day = new Date().toISOString().slice(0, 10);
    try {
        const v = JSON.parse(localStorage.getItem(GIVEBACK_KEY) || '{}');
        if (v.day === day) return { day, n: Number(v.n) || 0 };
    } catch { /* none yet */ }
    return { day, n: 0 };
}

/**
 * A take stopped early (within the grace time) is given back, up to EARLY_GIVEBACKS_PER_DAY times a day.
 * The server decides; without a server this browser's own daily count applies. Returns false when the limit is reached.
 */
export async function giveBackEarly(kind: QuotaKind): Promise<boolean> {
    if (isLocalHost()) return true;
    const remote = await callServer(kind, 'refund', true);
    if (remote) return remote.ok;
    const today = givebacksToday();
    if (today.n >= EARLY_GIVEBACKS_PER_DAY) return false;
    try { localStorage.setItem(GIVEBACK_KEY, JSON.stringify({ day: today.day, n: today.n + 1 })); } catch { /* storage unavailable */ }
    return true;
}

/** The visitor pressed Support: the next Ko-fi purchase within 30 minutes is credited to them. Fire and forget. */
const PENDING_KEY = 'gamedj.supportPending.v1';
/** True within 2 hours after the visitor pressed Support: the app then checks for new songs when they come back. */
export function supportPending(): boolean {
    try { return Date.now() - Number(localStorage.getItem(PENDING_KEY)) < 2 * 3600 * 1000; } catch { return false; }
}
export function clearSupportPending() { try { localStorage.removeItem(PENDING_KEY); } catch { /* nothing */ } }

const EMAIL_KEY = 'gamedj.supportEmail.v1';
/** The e-mail the visitor used for Ko-fi (typed in the Support dialog or a claim): the dialogs fill it in. */
export function getSupportEmail(): string {
    try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; }
}
function setSupportEmail(email: string) { try { if (email) localStorage.setItem(EMAIL_KEY, email); } catch { /* storage unavailable */ } }

export function supportIntent(email = '') {
    try { localStorage.setItem(PENDING_KEY, String(Date.now())); } catch { /* storage unavailable */ }
    setSupportEmail(email.trim());
    if (isLocalHost()) return;
    fetch('/api/support', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'intent', email: email.trim() })
    }).catch(() => { /* the e-mail claim still works */ });
}

/** Asks the server how many bought songs this visitor has; unblocks a remembered refusal when there are some. */
export async function refreshCredits(): Promise<number | null> {
    try {
        const res = await fetch('/api/support', { credentials: 'same-origin' });
        if (!res.ok) return null;
        const body = await res.json();
        const credits = Number(body.credits) || 0;
        rememberCredits(credits);
        rememberTakes(Number(body.takes) || 0);
        if (typeof body.livePerSong === 'number') rememberLivePerSong(body.livePerSong);
        if (credits > 0 || Number(body.takes) > 0) { clearDenied('song'); clearDenied('live'); }
        return credits;
    } catch { return null; }
}

/** Claims a purchase by the e-mail used on Ko-fi. Returns the credits now available, or null when the server is unreachable. */
export async function claimSupport(email: string): Promise<{ claimed: number; credits: number; status: 'claimed' | 'already' | 'none' } | null> {
    try {
        const res = await fetch('/api/support', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'claim', email })
        });
        if (!res.ok) return null;
        const data = await res.json();
        rememberCredits(Number(data.credits) || 0);
        if (Number(data.credits) > 0) { clearDenied('song'); clearDenied('live'); }
        if (data.status === 'claimed' || data.status === 'already') setSupportEmail(email.trim());
        return { claimed: Number(data.claimed) || 0, credits: Number(data.credits) || 0, status: data.status === 'claimed' || data.status === 'already' ? data.status : 'none' };
    } catch { return null; }
}
