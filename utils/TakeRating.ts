import type { PlaybackState } from '../types';

/** What the listener rates: the DJ that conducted the take and what it played */
export interface RatedTake { djId: string; djName: string; genre: string; style: string }

/** Heard at least this long (recording and playbacks together) before "Like this?" is asked */
export const RATE_AFTER_MS = 15000;

/**
 * When to ask "Like this?": a take starts when recording starts (not on a resume from pause) and is credited to the
 * DJ on deck if the DJ is on. Time counts while recording or playing; when the music stops after the take was heard
 * long enough, it is asked once (the take and all its playbacks). Reset drops the take without asking.
 */
export class TakeRatingTracker {
    private take: (RatedTake & { heardMs: number; asked: boolean }) | null = null;
    private listenSince: number | null = null;
    private last: PlaybackState = 'stopped';

    constructor(private readonly minHeardMs = RATE_AFTER_MS) {}

    /**
     * A new playback state at time `now` (ms). `creditTo` names the take's DJ (null: the DJ is off), read only when a
     * take starts. Returns the take to rate when the dialog should open, otherwise null.
     */
    onState(state: PlaybackState, now: number, creditTo: () => RatedTake | null): RatedTake | null {
        const prev = this.last;
        this.last = state;
        if (this.listenSince !== null) {
            if (this.take) this.take.heardMs += now - this.listenSince;
            this.listenSince = null;
        }
        if (state === 'recording' && prev !== 'paused') {
            const t = creditTo();
            this.take = t ? { ...t, heardMs: 0, asked: false } : null;
        }
        if (state === 'recording' || state === 'playing') this.listenSince = now;
        if (state === 'stopped' && this.take && !this.take.asked && this.take.heardMs >= this.minHeardMs) {
            this.take.asked = true;
            const { djId, djName, genre, style } = this.take;
            return { djId, djName, genre, style };
        }
        return null;
    }

    /** Reset: the take is dropped, the music stopping next does not ask */
    cancel() { this.take = null; }
}
