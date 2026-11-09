import { describe, expect, it, vi } from 'vitest';
import { RATE_AFTER_MS, TakeRatingTracker, type RatedTake } from '../utils/TakeRating';
import type { PlaybackState } from '../types';

const ROBOT: RatedTake = { djId: 'robot', djName: 'Robot', genre: 'Irish', style: 'Reel' };
const S = 1000;

/** Plays a script of [state, at second] and returns what the dialog would be asked to rate at each step */
function run(steps: [PlaybackState, number][], tracker = new TakeRatingTracker(), creditTo: () => RatedTake | null = () => ROBOT) {
  return steps.map(([state, at]) => tracker.onState(state, at * S, creditTo));
}

describe('TakeRatingTracker', () => {
  it('waits for 15 s of listening by default', () => {
    expect(RATE_AFTER_MS).toBe(15000);
  });

  it('asks when the music stops after a take was heard long enough', () => {
    const r = run([['warmup', 0], ['recording', 2], ['stopped', 30]]);
    expect(r.slice(0, 2)).toEqual([null, null]);
    expect(r[2]).toEqual(ROBOT);
  });

  it('does not ask for a take heard too briefly', () => {
    expect(run([['recording', 0], ['stopped', 10]])[1]).toBeNull();
  });

  it('counts the recording and the playbacks together', () => {
    const r = run([['recording', 0], ['stopped', 8], ['playing', 20], ['stopped', 28]]);
    expect(r[1]).toBeNull(); // 8 s heard
    expect(r[3]).toEqual(ROBOT); // 8 + 8 = 16 s heard
  });

  it('does not count the time stopped, paused or waiting to loop', () => {
    const r = run([['recording', 0], ['paused', 5], ['recording', 60], ['stopped', 65]]);
    expect(r[3]).toBeNull(); // 10 s heard, not 65
  });

  it('asks only once per take, however often it is played back', () => {
    const r = run([['recording', 0], ['stopped', 20], ['playing', 30], ['stopped', 60], ['playing', 70], ['stopped', 99]]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(r[1]).toEqual(ROBOT);
  });

  it('a resume from pause is the same take', () => {
    const creditTo = vi.fn(() => ROBOT);
    run([['recording', 0], ['paused', 5], ['recording', 6], ['stopped', 20]], new TakeRatingTracker(), creditTo);
    expect(creditTo).toHaveBeenCalledOnce();
  });

  it('a new recording is a new take that is asked again', () => {
    const r = run([['recording', 0], ['stopped', 20], ['recording', 30], ['stopped', 50]]);
    expect(r[1]).toEqual(ROBOT);
    expect(r[3]).toEqual(ROBOT);
  });

  it('credits the DJ on deck when the take starts', () => {
    let dj: RatedTake = ROBOT;
    const tracker = new TakeRatingTracker();
    tracker.onState('recording', 0, () => dj);
    dj = { djId: 'aria', djName: 'Aria', genre: 'Opera', style: 'Baroque Opera' };
    expect(tracker.onState('stopped', 20 * S, () => dj)).toEqual(ROBOT);
  });

  it('does not ask when no DJ conducted the take', () => {
    expect(run([['recording', 0], ['stopped', 30]], new TakeRatingTracker(), () => null)[1]).toBeNull();
  });

  it('does not ask after Reset', () => {
    const tracker = new TakeRatingTracker();
    tracker.onState('recording', 0, () => ROBOT);
    tracker.cancel();
    expect(tracker.onState('stopped', 30 * S, () => ROBOT)).toBeNull();
  });

  it('a take after Reset is asked again', () => {
    const tracker = new TakeRatingTracker();
    tracker.onState('recording', 0, () => ROBOT);
    tracker.cancel();
    tracker.onState('stopped', 30 * S, () => ROBOT);
    const r = run([['recording', 40], ['stopped', 60]], tracker);
    expect(r[1]).toEqual(ROBOT);
  });

  it('takes the wait from its constructor', () => {
    expect(run([['recording', 0], ['stopped', 3]], new TakeRatingTracker(2000))[1]).toEqual(ROBOT);
  });
});
