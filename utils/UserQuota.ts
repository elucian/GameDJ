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
        message: 'Free Quota limit reach 3 songs.',
        inWindow: (now, t) => { const d = new Date(t); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }
    },
    // Normal songs (Lyria RealTime): 5 per rolling week
    live: {
        limit: 5, label: 'Lyria RealTime songs per week',
        message: 'Free Quota limit reach 5 songs/week.',
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

export function quotaStatus(kind: QuotaKind): { ok: boolean; used: number; limit: number; message: string } {
    const used = timesFor(kind).length;
    const rule = RULES[kind];
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
