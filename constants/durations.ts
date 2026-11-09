/** 13 stops: 12 equal intervals of 10 seconds from 1:00 to 3:00 (values in minutes) */
export const SONG_STEP_SECS = 10;
export const DURATION_STEPS = Array.from({ length: 13 }, (_, i) => {
    const secs = 60 + i * SONG_STEP_SECS;
    return { label: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, value: secs / 60 };
});
export const MIN_SONG_SECS = DURATION_STEPS[0].value * 60;
export const MAX_SONG_SECS = DURATION_STEPS[DURATION_STEPS.length - 1].value * 60;

/** The step a length (minutes) lands on: the first step at least that long, the longest step beyond the range. */
export function durationStepIndex(mins: number): number {
    const idx = DURATION_STEPS.findIndex(s => s.value >= mins - 1e-6);
    return idx === -1 ? DURATION_STEPS.length - 1 : idx;
}

/**
 * Timeline ruler drag: the song length (seconds) after dragging `dxPx` from where the length was `startSecs`.
 * The lane's width (`widthPx`) spans the whole range; the result snaps to the steps and stays in the range.
 */
export function dragSongSeconds(startSecs: number, dxPx: number, widthPx: number): number {
    const raw = startSecs + (dxPx / Math.max(1, widthPx)) * (MAX_SONG_SECS - MIN_SONG_SECS);
    return Math.max(MIN_SONG_SECS, Math.min(MAX_SONG_SECS, Math.round(raw / SONG_STEP_SECS) * SONG_STEP_SECS));
}
