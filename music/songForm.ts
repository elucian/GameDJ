/**
 * The form of a piece: the stages of a performance plan, the story arcs of folk and modern songs, the phrase cues
 * and the DJ's arranging habits that reshape a story before it is played. Data and pure functions only.
 */
import type { ChannelKey } from '../types';

export type Formation = 'solo' | 'duet' | 'trio' | 'quartet' | 'full';

export interface PerformancePlanStage {
    stageName: string;
    stageStartTimeSec: number;
    activeChannels: { lead: boolean; alto: boolean; harmonic: boolean; bass: boolean; rhythm: boolean };
    targets: { parameterName: string; targetValue: number }[];
    channelWeights: { lead: number; alto: number; harmonic: number; bass: number; rhythm: number };
    formation: Formation;
    featured: ChannelKey | null;
    type?: string;
    /** What the DJ asks of this section (its arranging habits); written into the Lyria 3.5 song plan */
    cue?: string;
}
type StorySection = { name: string; type: string; durationPct: number; cue?: string };

/**
 * A DJ's arranging habits reshape the narrative before the stages are built: they add, replace or rename sections and
 * attach cues (the song plan for Lyria 3.5 reads them; the live conductor follows the sections). Each habit shows up
 * with the DJ's Signature chance (default 80%), not always, so two takes by the same DJ differ.
 */
export function applyArrangingHabits(story: StorySection[], habits: string[] | undefined, instrumental: boolean, chance = 80): StorySection[] {
    if (!habits?.length || story.length === 0) return story;
    const out = story.map(s => ({ ...s }));
    const has = (h: string) => habits.includes(h) && Math.random() * 100 < chance;
    const addCue = (s: StorySection | undefined, cue: string) => { if (s) s.cue = s.cue ? `${s.cue}; ${cue}` : cue; };
    const first = () => out[0];
    const last = () => out[out.length - 1];
    const climax = () => [...out].reverse().find(s => s.type === 'climax') ?? out[Math.max(0, out.length - 2)];
    const middleIdx = () => {
        const mids = out.map((s, i) => ({ s, i })).filter(({ s, i }) => i > 0 && i < out.length - 1 && ['main', 'groove', 'verse', 'duet', 'trio'].includes(s.type));
        return mids.length ? mids[Math.floor(mids.length / 2)].i : Math.floor(out.length / 2);
    };
    const insertBefore = (target: StorySection, sec: StorySection) => { out.splice(Math.max(1, out.indexOf(target)), 0, sec); };

    // Openings (one at most)
    if (has('a cappella opening') || has('unaccompanied verse')) {
        Object.assign(first(), { name: instrumental ? 'Unaccompanied Opening' : 'A Cappella Opening', type: 'solo' });
        addCue(first(), instrumental ? 'the lead instrument alone, unaccompanied, free and expressive' : 'voice alone, no instruments');
    } else if (has('free rubato opening')) {
        Object.assign(first(), { name: 'Rubato Opening', type: 'solo' });
        addCue(first(), 'free time (rubato), no steady beat, the tempo sets in only at the next section');
    } else if (has('hook first')) {
        Object.assign(first(), { name: 'Hook Up Front', type: 'chorus' });
        addCue(first(), 'open straight on the main hook, no intro');
    } else if (has('layers enter one by one')) {
        out.splice(1, 0, { name: 'Layers Enter', type: 'build', durationPct: 0.15, cue: 'instruments enter one at a time, every two bars a new layer' });
    } else if (has('long intro')) {
        first().durationPct *= 1.7;
        addCue(first(), 'long, patient intro, nothing hurried');
    }
    if (has('slow build')) addCue(out[Math.min(1, out.length - 1)], 'a slow, gradual build, each phrase a little fuller than the last');

    // Middle: dialogs and solo turns
    if (has('call and response')) {
        Object.assign(out[middleIdx()], { name: 'Call & Response', type: 'duet' });
        addCue(out[middleIdx()], 'two-bar calls answered by a second instrument');
    } else if (has('instrument dialog')) {
        Object.assign(out[middleIdx()], { name: 'Instrument Dialog', type: 'duet' });
        addCue(out[middleIdx()], 'two instruments in conversation, each phrase answered by the other');
    } else if (has('instrument trading')) {
        Object.assign(out[middleIdx()], { name: 'Trading Licks', type: 'duet' });
        addCue(out[middleIdx()], 'two lead instruments trade four-bar solo breaks');
    }
    if (has('solo turns')) {
        const i = middleIdx(); const share = out[i].durationPct / 3;
        out.splice(i, 1, ...[1, 2, 3].map(n => ({ name: `Solo Turn ${n}`, type: 'solo', durationPct: share, cue: 'one instrument takes its turn alone, the others listen' })));
    }
    if (has('surprise solo')) insertBefore(climax(), { name: 'Surprise Solo', type: 'solo', durationPct: 0.1, cue: 'the band drops out suddenly, one unexpected instrument solos' });
    if (has('tune set')) {
        let n = 0;
        out.forEach(s => { if (['main', 'groove', 'verse', 'chorus', 'climax'].includes(s.type)) { n++; s.name = `Tune ${n}`; } });
        addCue(climax(), 'a change of tune, the set lifts');
    }

    // Breaks before the peak
    if (has('percussion break')) insertBefore(climax(), { name: 'Percussion Break', type: 'percussion', durationPct: 0.1, cue: 'percussion only, hand claps and accents' });
    else if (has('stop-time break')) insertBefore(climax(), { name: 'Stop-Time Break', type: 'trio', durationPct: 0.1, cue: 'stop-time: the band hits only beat one while the lead plays the gaps' });
    if (has('build and drop')) {
        insertBefore(climax(), { name: 'The Rise', type: 'build', durationPct: 0.12, cue: 'tension rises, filtered and thinning, then a short silence' });
        Object.assign(climax(), { name: 'The Drop' });
        addCue(climax(), 'the drop: everything hits at once');
    }
    if (has('stabs')) addCue(climax(), 'short accented ensemble stabs on the off-beats');
    if (has('cinematic swell')) addCue(climax(), 'a long cinematic swell to the peak');
    if (has('key lift')) addCue(climax(), 'key change: lift the key up a whole step');
    if (has('grand finale')) { climax().name = 'Grand Finale'; addCue(climax(), 'everyone at full strength, broad and triumphant'); }

    // Endings
    if (has('accelerando ending')) addCue(last(), 'accelerando: the tempo speeds up to a fiery finish');
    else if (has('tag ending')) addCue(last(), 'tag ending: the last phrase repeated three times, then one final hit');
    else if (has('fade out')) addCue(last(), 'a slow fade out');
    if (has('soft dynamics')) addCue(first(), 'soft dynamics throughout, never loud');

    const total = out.reduce((sum, s) => sum + s.durationPct, 0);
    out.forEach(s => { s.durationPct /= total; });
    return out;
}

/**
 * The story of a live performance when the DJ is off. Lyria RealTime has no memory of where it is in a piece: with
 * fixed prompts it settles into a short loop. So the app walks the prompts through an arc, the way a folk tune is
 * played: state the tune, repeat it with ornaments, a contrasting part, the return, a closing statement. Each cue is a
 * plain description of the music (never an instrument), `density` shifts Lyria's density (-1..+1 around its middle).
 */
export interface ArcSection { until: number; name: string; cue: string; density: number }
export const FOLK_ARC: ArcSection[] = [
    { until: 0.08, name: 'Opening', cue: 'opening: a single melodic line states the main tune, sparse and spacious', density: -0.35 },
    { until: 0.28, name: 'Theme', cue: 'the main tune played in full, clear, simple and singable', density: -0.05 },
    { until: 0.48, name: 'Varied repeat', cue: 'the main tune repeats with new ornaments and a fuller accompaniment', density: 0.1 },
    { until: 0.62, name: 'Contrast', cue: 'a contrasting second part with a new melody that answers the first', density: 0.0 },
    { until: 0.85, name: 'Return', cue: 'the main tune returns fuller and more energetic, building to a peak', density: 0.25 },
    { until: 1.01, name: 'Close', cue: 'a final embellished statement of the tune, then a gentle slowing close', density: -0.2 }
];
export const MODERN_ARC: ArcSection[] = [
    { until: 0.08, name: 'Intro', cue: 'intro: sparse, setting the groove and the key', density: -0.35 },
    { until: 0.30, name: 'Verse', cue: 'verse: steady groove with a clear melodic hook', density: -0.05 },
    { until: 0.45, name: 'Lift', cue: 'chorus: bigger, fuller and brighter, the hook returns', density: 0.25 },
    { until: 0.58, name: 'Break', cue: 'breakdown: stripped back, a new melodic idea, tension building', density: -0.25 },
    { until: 0.85, name: 'Final push', cue: 'final chorus: the full groove at its peak with extra variations', density: 0.3 },
    { until: 1.01, name: 'Outro', cue: 'outro: winding down, resolving to the tonic', density: -0.3 }
];
// Two-bar-pair phrasing inside a section: a rising question, then a falling answer (breaks up "ta ti ta ti" loops)
export const PHRASE_CUES = ['melody phrase rises and ends open, like a question', 'answering phrase falls and resolves, like a reply'];
export const AUTO_PHRASE_BARS = 8;

/** The form line for a song with no given lyrics, trimmed to its length: short songs lose repeats, long ones get an extra verse. */
export function formForLength(form: string, minutes: number): string {
    const parts = form.split('->').map(p => p.trim());
    if (parts.length <= 4) return form;
    if (minutes <= 1.25) {
        // intro, first verse, the first hook-like section after it, and the outro
        const verseAt = Math.max(1, parts.findIndex((_, k) => k > 0 && k < parts.length - 1));
        const hookAt = parts.findIndex((p, k) => k > verseAt && /^\[(final )?(chorus|hook|refrain|drop|estribillo)|theme b|main march/i.test(p));
        const keep = [parts[0], parts[verseAt], ...(hookAt > 0 ? [parts[hookAt]] : []), parts[parts.length - 1]];
        return [...new Set(keep)].join(' -> ');
    }
    if (minutes <= 2.25) return parts.filter((p, i) => !/pre-chorus|bridge|interlude|solo|falseta/i.test(p) || i === parts.length - 2).join(' -> ');
    return form;
}
