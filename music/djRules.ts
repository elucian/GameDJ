/**
 * How a DJ personality shapes the music: how many knobs it may hold per genre family, how it leans on each knob,
 * how it sets the evolution slider and which channels it keeps on stage. Pure functions of the DJ's settings.
 */
import { isTraditionalGenre } from './vocabulary';
import type { ChannelKey } from '../types';

// === DJ RULES ===
// The DJ may hold only a limited number of knobs above zero at any moment; every other knob is driven to 0.
// The limit depends on the genre family: modern = 6, traditional = 4, regional = 2.
const DJ_KNOBS_MODERN = 6;
const DJ_KNOBS_TRADITIONAL = 4;
const DJ_KNOBS_REGIONAL = 2;

export const REGIONAL_GENRES = ['African', 'Indian', 'Irish', 'Spanish', 'Oriental', 'Romanian', 'European', 'Western', 'Hawaiian'];
const TRADITIONAL_KNOB_GENRES = ['Classic', 'Opera', 'Marching', 'Renascentist', 'Victorian', 'Spiritual', 'Blues', 'Traditional'];

/**
 * How many knobs the DJ may hold at once. `maxKnobs` is the DJ preset's setting for modern genres (default 6).
 * Up to 6 the other families keep their own limits (4 traditional, 2 regional); at 7 to 10 they get 1 to 3 more.
 * Below 6, modern genres lose knobs first (limit = maxKnobs) and the others follow once it drops under their limit, down to 0.
 */
export function getDjKnobLimit(genre: string, maxKnobs = DJ_KNOBS_MODERN): number {
    const max = Math.max(0, Math.min(10, Math.round(maxKnobs)));
    const extra = Math.min(3, Math.max(0, max - DJ_KNOBS_MODERN));
    if (REGIONAL_GENRES.includes(genre)) return Math.min(DJ_KNOBS_REGIONAL, max) + extra;
    if (TRADITIONAL_KNOB_GENRES.includes(genre)) return Math.min(DJ_KNOBS_TRADITIONAL, max) + extra;
    return max;
}

export interface DjPersonality {
    name: string;
    eagerness: number;
    maxKnobs?: number;
    channels: Record<ChannelKey, boolean>;
    /** 0-100: solos, duets and trios instead of the full band. */
    diversity?: number;
    /** 0-100: bigger ensembles, ornamentation and complexity knobs. */
    complexity?: number;
    /** 0-100: evolution slider and dynamics / brightness / groove knobs. */
    energy?: number;
    /** 0-100: space, texture, organic colour. */
    atmosphere?: number;
    /** Seconds the band is warmed up slowly after the DJ takes over. */
    warmup?: number;
    /** Where the DJ comes from */
    country?: string;
    /** Folk styles of the DJ's own country ([genre, style]) and the chance (0-100) to play one */
    homeStyles?: [string, string][];
    homeBias?: number;
    /** The Robot DJ studies humanity: instead of home styles, homeBias is the chance to pick any genre (all equally) and a style of it */
    curious?: boolean;
    /** How the DJ likes to arrange a piece (solo turns, dialogs, stabs, breaks...) */
    arranging?: string[];
    /** 0-100: how often each arranging habit shows up in a plan */
    habits?: number;
}

/** How a DJ personality leans on each knob (added to the genre value, in knob units; 50 = neutral). */
export function djKnobBias(p: DjPersonality | null | undefined, knob: string): number {
    if (!p) return 0;
    const lean = (v: number | undefined) => ((v ?? 50) - 50) / 50; // -1..+1
    const groups: Record<string, [number, number | undefined]> = {
        Complexity: [0.5, p.complexity], Ornamentation: [0.5, p.complexity], Variation: [0.4, p.diversity], Glide: [0.25, p.diversity],
        Dynamics: [0.4, p.energy], Brightness: [0.35, p.energy], Groove: [0.35, p.energy], Attack: [0.3, p.energy], Density: [0.3, p.energy],
        Organic: [0.35, p.atmosphere], Space: [0.4, p.atmosphere], Atmosphere: [0.45, p.atmosphere], Texture: [0.35, p.atmosphere], Width: [0.3, p.atmosphere]
    };
    const g = groups[knob];
    return g ? g[0] * lean(g[1]) : 0;
}

/** Evolution the DJ aims for: its energy sets the base (-1..+5), diversity adds some randomness. */
export function djEvolutionFor(p: DjPersonality | null | undefined): number {
    if (!p) return Math.floor(Math.random() * 7) - 1;
    const base = -1 + ((p.energy ?? 50) / 100) * 6;
    const jitter = (Math.random() - 0.5) * 2 * ((p.diversity ?? 50) / 100) * 1.5;
    return Math.max(-2, Math.min(7, Math.round(base + jitter)));
}

/**
 * DJ "manifesto": decides which channels stay in the manifest. The DJ may switch channels off completely
 * to work with a smaller ensemble (3-5 channels). Always keeps one melodic voice.
 */
export function chooseDjManifest(genre: string, allowed?: Partial<Record<ChannelKey, boolean>>, complexity = 50): ChannelKey[] {
    const all: ChannelKey[] = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'];
    const pool = all.filter(k => allowed?.[k] !== false);
    if (pool.length <= 3) return pool;
    // Complex DJs lean to bigger ensembles, simple ones to small ones
    const roll = Math.max(0, Math.min(1, Math.random() - ((complexity - 50) / 100) * 0.6));
    const size = Math.min(pool.length, roll < 0.35 ? 5 : roll < 0.7 ? 4 : 3);
    const shuffle = <T>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
    const melodic = shuffle(pool.filter(k => k === 'lead' || k === 'alto'));
    const chosen: ChannelKey[] = melodic.length ? [melodic[0]] : [];
    // Groove genres lean on bass + drums; traditional/regional ones on harmony
    const groove = !isTraditionalGenre(genre) && !TRADITIONAL_KNOB_GENRES.includes(genre);
    const priority: ChannelKey[] = groove ? ['bass', 'rhythm', 'harmonic'] : ['harmonic', 'bass', 'rhythm'];
    [...shuffle(priority.slice(0, 2)), ...priority.slice(2), ...shuffle(pool)].forEach(k => {
        if (pool.includes(k) && !chosen.includes(k) && chosen.length < size) chosen.push(k);
    });
    return chosen;
}

/** A weighted prompt as sent to Lyria */
