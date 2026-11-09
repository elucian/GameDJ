import { describe, expect, it } from 'vitest';
import { DURATION_STEPS, MAX_SONG_SECS, MIN_SONG_SECS, dragSongSeconds, durationStepIndex } from '../constants/durations';

describe('DURATION_STEPS', () => {
  it('runs from 1:00 to 3:00 in 10 second steps', () => {
    expect(DURATION_STEPS).toHaveLength(13);
    expect(DURATION_STEPS[0]).toEqual({ label: '1:00', value: 1 });
    expect(DURATION_STEPS[6].label).toBe('2:00');
    expect(DURATION_STEPS[12]).toEqual({ label: '3:00', value: 3 });
    expect([MIN_SONG_SECS, MAX_SONG_SECS]).toEqual([60, 180]);
  });
});

describe('durationStepIndex', () => {
  it('finds the step of an exact length', () => {
    expect(durationStepIndex(1)).toBe(0);
    expect(durationStepIndex(2)).toBe(6);
    expect(durationStepIndex(3)).toBe(12);
  });

  it('rounds a length between steps up to the next step', () => {
    expect(durationStepIndex(1.05)).toBe(1); // 1:03 -> 1:10
    expect(durationStepIndex(0.2)).toBe(0);
  });

  it('keeps a length beyond the range on the longest step', () => {
    expect(durationStepIndex(34)).toBe(12);
  });

  it('is not thrown off by floating point (e.g. 1:10 computed as 70 / 60)', () => {
    expect(durationStepIndex(70 / 60)).toBe(1);
    expect(durationStepIndex(DURATION_STEPS[7].value)).toBe(7);
  });
});

describe('dragSongSeconds (timeline ruler)', () => {
  const W = 1200; // lane width in px: the whole 1:00 to 3:00 range

  it('keeps the length without a drag', () => {
    expect(dragSongSeconds(120, 0, W)).toBe(120);
  });

  it('makes the song longer to the right and shorter to the left', () => {
    expect(dragSongSeconds(120, W / 4, W)).toBe(150);
    expect(dragSongSeconds(120, -W / 4, W)).toBe(90);
  });

  it('snaps to 10 second steps', () => {
    expect(dragSongSeconds(120, 40, W)).toBe(120); // +4 s
    expect(dragSongSeconds(120, 60, W)).toBe(130); // +6 s
    for (let dx = -W; dx <= W; dx += 37) expect(dragSongSeconds(120, dx, W) % 10).toBe(0);
  });

  it('stays between 1:00 and 3:00', () => {
    expect(dragSongSeconds(120, -5 * W, W)).toBe(60);
    expect(dragSongSeconds(120, 5 * W, W)).toBe(180);
  });

  it('survives a lane with no width yet', () => {
    const s = dragSongSeconds(120, 10, 0);
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(60);
    expect(s).toBeLessThanOrEqual(180);
  });
});
