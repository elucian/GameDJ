/**
 * Safety limiter on the master output: Lyria's loud passages (more so with a wide stereo setting) can go past full
 * scale and distort. Two stages, both transparent at normal levels:
 *  1. a compressor set as a limiter (from -1 dB, fast attack) that holds loud passages down smoothly;
 *  2. a soft clipper that rounds off any instant peak the compressor lets through (Web Audio has no true limiter).
 */

/** Samples under this level (about -1.4 dB) pass the soft clipper unchanged */
export const SOFT_CLIP_KNEE = 0.85;
/** Peaks up to this many times full scale are rounded off (beyond, they are held at the curve's end, just under 1) */
export const CLIP_RANGE = 2;

/**
 * The soft clipper's curve: identity up to the knee, then a smooth bend (tanh) that approaches but never exceeds
 * full scale. Continuous with slope 1 at the knee, so quiet and normal audio is untouched.
 */
export function softClip(x: number, knee = SOFT_CLIP_KNEE): number {
  const a = Math.abs(x);
  if (a <= knee) return x;
  const room = 1 - knee;
  return Math.sign(x) * (knee + room * Math.tanh((a - knee) / room));
}

/** The limiter's compressor settings */
export const LIMIT_THRESHOLD_DB = -1;
export const LIMIT_RATIO = 20;

/**
 * The gain a Web Audio compressor adds on its own ("makeup gain", Web Audio spec): (1 / gain at 0 dBFS) ^ 0.6. With a
 * hard knee, 0 dBFS comes out at threshold * (1 - 1/ratio) dB. The limiter undoes it, so normal audio keeps its level.
 */
export function compressorMakeupGain(thresholdDb = LIMIT_THRESHOLD_DB, ratio = LIMIT_RATIO): number {
  const fullRangeGainDb = thresholdDb * (1 - 1 / ratio);
  return Math.pow(1 / Math.pow(10, fullRangeGainDb / 20), 0.6);
}

/** input -> compressor (limiter) -> its makeup gain undone -> soft clipper -> output */
export class SafetyLimiter {
  readonly input: DynamicsCompressorNode;
  readonly output: WaveShaperNode;

  constructor(ctx: BaseAudioContext) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = LIMIT_THRESHOLD_DB; // only the loudest peaks
    comp.knee.value = 0;
    comp.ratio.value = LIMIT_RATIO; // as good as a limiter
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    this.input = comp;
    // The compressor's own makeup gain is undone here. And WaveShaper clamps its input to -1..1, so a peak past full
    // scale would be hard-clipped before the curve: the signal goes in scaled down by CLIP_RANGE, the curve undoes it
    const pre = ctx.createGain();
    pre.gain.value = 1 / (compressorMakeupGain() * CLIP_RANGE);
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve();
    shaper.oversample = '2x'; // fewer artefacts when a peak is rounded off
    comp.connect(pre); pre.connect(shaper);
    this.output = shaper;
  }
}

/**
 * The soft clipper as a WaveShaper curve for an input pre-scaled by 1/range: maps y in -1..1 to softClip(y * range),
 * so signals up to `range` times full scale are rounded off instead of hard-clipped.
 */
export function softClipCurve(range = CLIP_RANGE, points = 4097): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) curve[i] = softClip(((i / (points - 1)) * 2 - 1) * range);
  return curve;
}
