/**
 * Mono / stereo and stereo width, applied by the app to Lyria's stereo mix (Lyria has no such setting).
 *
 * Width works on the mid (L+R, the centre) and side (L-R, what differs between the speakers) of the signal:
 *   outL = a*L + b*R,  outR = b*L + a*R,  with a = (1 + w) / 2 and b = (1 - w) / 2
 * w = 0 is mono (both speakers get the centre), w = 1 is Lyria's original image, w > 1 widens it. The centre
 * (voice, bass, kick) is never changed, only the sides.
 */

/** Width range of the WID slider (fractions: 0 = mono, 1 = original, 1.5 = 150%) */
export const MIN_WIDTH = 0;
export const MAX_WIDTH = 1.5;
export const DEFAULT_WIDTH = 1;

export interface StereoMatrix { a: number; b: number }

/** A width inside the slider's range (anything that is not a number is the original width) */
export function clampWidth(width: number): number {
    return Number.isFinite(width) ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width)) : DEFAULT_WIDTH;
}

/** The mix coefficients for a width, or mono (which ignores the width). Width is clamped to the slider's range. */
export function stereoMatrix(width: number, mono = false): StereoMatrix {
    const w = mono ? 0 : clampWidth(width);
    return { a: (1 + w) / 2, b: (1 - w) / 2 };
}

/** The saved listening settings */
export interface StereoSettings { mono: boolean; width: number }
const STORAGE_KEY = 'gamedj.stereo';

export function loadStereoSettings(): StereoSettings {
    try {
        const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        return {
            mono: s?.mono === true,
            width: typeof s?.width === 'number' ? clampWidth(s.width) : DEFAULT_WIDTH,
        };
    } catch { return { mono: false, width: DEFAULT_WIDTH }; }
}

export function saveStereoSettings(s: StereoSettings) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* not kept */ }
}

/**
 * The Web Audio node chain: input -> split L/R -> four gains (the matrix) -> merge -> output.
 * Changes glide over a few milliseconds so switching never clicks.
 */
export class StereoStage {
    readonly input: GainNode;
    readonly output: ChannelMergerNode;
    private readonly ll: GainNode; private readonly rl: GainNode;
    private readonly lr: GainNode; private readonly rr: GainNode;
    private width = DEFAULT_WIDTH;
    private mono = false;

    constructor(private readonly ctx: BaseAudioContext) {
        this.input = ctx.createGain();
        // Always two channels in, even if a source is mono (it is then copied to both)
        this.input.channelCount = 2;
        this.input.channelCountMode = 'explicit';
        this.input.channelInterpretation = 'speakers';
        const split = ctx.createChannelSplitter(2);
        this.output = ctx.createChannelMerger(2);
        this.ll = ctx.createGain(); this.rl = ctx.createGain(); // into the left output
        this.lr = ctx.createGain(); this.rr = ctx.createGain(); // into the right output
        this.input.connect(split);
        split.connect(this.ll, 0); split.connect(this.rl, 1);
        split.connect(this.lr, 0); split.connect(this.rr, 1);
        this.ll.connect(this.output, 0, 0); this.rl.connect(this.output, 0, 0);
        this.lr.connect(this.output, 0, 1); this.rr.connect(this.output, 0, 1);
        this.apply(true);
    }

    get settings(): StereoSettings { return { mono: this.mono, width: this.width }; }

    setMono(mono: boolean) { this.mono = mono; this.apply(); }
    setWidth(width: number) { this.width = clampWidth(width); this.apply(); }

    private apply(now = false) {
        const { a, b } = stereoMatrix(this.width, this.mono);
        const t = this.ctx.currentTime;
        for (const [g, v] of [[this.ll, a], [this.rr, a], [this.rl, b], [this.lr, b]] as const) {
            if (now) g.gain.value = v;
            else g.gain.setTargetAtTime(v, t, 0.015);
        }
    }
}
