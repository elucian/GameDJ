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
            id = (crypto as any).randomUUID ? crypto.randomUUID() : `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
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
function rememberDenied(kind: QuotaKind) {
    try {
        const all = JSON.parse(localStorage.getItem(DENIED_KEY) || '{}');
        all[kind] = periodEnd(kind);
        localStorage.setItem(DENIED_KEY, JSON.stringify(all));
    } catch { /* storage unavailable: the server is asked again next time */ }
}

export function quotaStatus(kind: QuotaKind): { ok: boolean; used: number; limit: number; message: string } {
    const rule = RULES[kind];
    if (isLocalHost()) return { ok: true, used: 0, limit: rule.limit, message: rule.message };
    if (deniedUntil(kind) > Date.now()) return { ok: false, used: rule.limit, limit: rule.limit, message: rule.message };
    const used = timesFor(kind).length;
    return { ok: used < rule.limit, used, limit: rule.limit, message: rule.message };
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
async function callServer(kind: QuotaKind, action: 'consume' | 'refund'): Promise<{ ok: boolean; message: string } | null> {
    if (isLocalHost()) return null;
    try {
        const res = await fetch('/api/quota', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind, action })
        });
        if (!res.ok) return null;
        const data = await res.json();
        return { ok: data.ok !== false, message: data.message || RULES[kind].message };
    } catch { return null; }
}

/** Takes one song from the quota before a take starts. Server decision first, the local quota when there is no server. */
export async function reserveQuota(kind: QuotaKind): Promise<{ ok: boolean; message: string }> {
    // The browser's memory first: already refused or used up here -> no server request at all
    const local = quotaStatus(kind);
    if (!local.ok) return { ok: false, message: local.message };
    const remote = await callServer(kind, 'consume');
    if (remote) {
        if (!remote.ok) rememberDenied(kind);
        return remote;
    }
    return { ok: local.ok, message: local.message };
}

/** Gives the song back (the take failed before anything was delivered). */
export async function refundQuota(kind: QuotaKind) { await callServer(kind, 'refund'); }
