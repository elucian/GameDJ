
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import type { PlaybackState, Prompt, InstrumentSet, MusicGenerationMode, PlaybackSnapshot } from '../types';
import { AudioChunk, GoogleGenAI, LiveMusicSession, type LiveMusicFilteredPrompt } from '@google/genai';
import { decode, decodeAudioData } from './audio';
import { throttle } from './throttle';
import { PromptGuard, type PromptImprovement } from './PromptGuard';
import type { NoDetail } from './events';
import { uiSounds } from './UISounds';
import { takeSongTicket } from './UserQuota';
import { moodPhrase } from '../constants/moods';

type ChannelKey = keyof InstrumentSet;
type Formation = 'solo' | 'duet' | 'trio' | 'quartet' | 'full';

interface PerformancePlanStage {
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
function applyArrangingHabits(story: StorySection[], habits: string[] | undefined, instrumental: boolean, chance = 80): StorySection[] {
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

// === DJ RULES ===
// The DJ may hold only a limited number of knobs above zero at any moment; every other knob is driven to 0.
// The limit depends on the genre family: modern = 6, traditional = 4, regional = 2.
const DJ_KNOBS_MODERN = 6;
const DJ_KNOBS_TRADITIONAL = 4;
const DJ_KNOBS_REGIONAL = 2;
// Lyria guidance ranges from 0 to 6 (higher = follows the prompts more strictly, but transitions get abrupt).
// The Guidance knob is the single truth: guidance = knob value x 3 (knob 0..2 = guidance 0..6), so an unset knob means 0.
// While the DJ conducts it turns that knob itself (up to 6 for solos and duets), so the knob always shows the real value.
const LYRIA_GUIDANCE_MAX = 6;
// With the mixer channels locked the DJ keeps guidance at least this high (Lyria default is 4.0)
const LOCKED_GUIDANCE_MIN = 5.2;
const isGuidanceKnob = (p: { text: string }) => p.text.trim().toLowerCase() === 'guidance';
// Solo sections are the exception to the genre knob maximums: the DJ may go past them when it calls for it.
const isGenreOverrideStage = (type?: string, formation?: string) => type === 'solo' || formation === 'solo';
// When the user touches a knob the DJ leaves it alone for this long before it may turn it again.
const USER_KNOB_HOLD_MS = 30000;
// Knob pairs that pull the music in opposite directions — the DJ never engages both at once.
const CONFLICTING_KNOBS: [string, string][] = [
    ['Density', 'Space'], ['Attack', 'Glide'], ['Staccato', 'Glide'],
    ['Brightness', 'Atmosphere'], ['Density', 'Atmosphere']
];
const MELODIC_CHANNELS: ChannelKey[] = ['lead', 'alto', 'harmonic'];
// Channel weights (0..1 slider scale) per formation: the featured voice leads, the rest support.
const FORMATION_SUPPORT_WEIGHT: Record<Formation, number> = { solo: 0, duet: 0.9, trio: 0.8, quartet: 0.75, full: 0.7 };
// Prompt weights (Lyria normalises them, so only the proportions count). The genre + style prompt is the single
// strongest one so it always shapes the music; the instrument list comes next, then each channel, then the knobs.
const GENRE_PROMPT_WEIGHT = 3.5;
const ENSEMBLE_PROMPT_WEIGHT = 2.5;
// Per channel (multiplied by the channel slider): together they stay below genre + ensemble.
const CHANNEL_PROMPT_WEIGHT: Record<ChannelKey, number> = { lead: 1.6, alto: 1.4, harmonic: 1.2, bass: 1.3, rhythm: 1.3 };
// Knob prompts are colour only: at full knob (2) they reach 1.0, never above the instruments.
const KNOB_PROMPT_SCALE = 0.5;
// Voice mode with a voice on stage: the singer is the main prompt and the instruments accompany it.
const VOICE_PROMPT_WEIGHT = 3.0;
const ACCOMPANIMENT_SCALE = 0.6;
// Guidance never drops under the Lyria default, otherwise the model ignores genre and instruments (noise).
// The Guidance knob only raises it; voices and locked channels raise the floor further.
const GUIDANCE_FLOOR = 4.0;
const VOICE_GUIDANCE_FLOOR = 4.5;
// The only model that streams live music (record, DJ, play). The Lyria 3 song models (api/song.ts) only render finished files.
const REALTIME_MODEL = 'models/lyria-realtime-exp';
// A full song takes a while to render
const SONG_RENDER_TIMEOUT_MS = 300000;

// What each knob asks Lyria for. A bare word like "Groove" is vague to the model; these describe playing
// qualities only, never instruments, so a knob cannot pull extra instruments into a solo or duet.
// {genre} and {style} are filled in at send time. Knobs renamed by the user are sent as typed.
const KNOB_PHRASES: Record<string, string> = {
    // Guidance, Density, Brightness and Variation are real Lyria config values (guidance, density, brightness, topK), not prompts.
    'guidance':      'closely following the described {genre} style and instrumentation',
    'density':       'busy, note-dense playing',
    'dynamics':      'wide dynamic range, soft to loud',
    'groove':        'tight groove, steady pulse',
    'attack':        'sharp percussive attacks',
    'staccato':      'short staccato articulation',
    'brightness':    'bright, sparkling tone',
    'complexity':    'intricate melodies, rich harmony',
    'ornamentation': 'ornamented melodies, trills',
    'variation':     'evolving variations',
    'glide':         'smooth legato, slides',
    'presence':      'intimate, close-miked sound',
    'space':         'spacious, natural reverb',
    'organic':       'organic, human feel',
    'texture':       'rich textures',
    'width':         'wide stereo image',
    'atmosphere':    'atmospheric, ethereal',
    'authenticity':  'authentic {style}, traditional {genre}'
};
// Lyria topK (1..1000, default 40) is driven by the Variation knob: 0 = Lyria default, full knob (2) = 250.
const LYRIA_TOPK_DEFAULT = 40;
const LYRIA_TOPK_KNOB_MAX = 250;

interface RecordingSegment {
    startTime: number;
    duration: number;
    buffer: AudioBuffer;
}

export const VOCAL_STRINGS = [
  'Solo Female', 'Solo Male', 'Solo Boy', 'Solo Girl', 'Solo Soprano', 'Solo Tenor', 'Operatic Soloist', 'Soloist',
  'Mixed Choir', 'Male Choir', 'Female Choir', 'Childrens Choir', 'Epic Choir', 'Gregorian Chant', 'Gospel Choir', 'A Cappella Group', 'Chamber Choir', 'Vocal Ensemble',
  'Male Rapper', 'Female Rapper', 'MC Vocals', 'Duet Voices', 'Quartet Voices',
  'Duet Male', 'Duet Female', 'Duet Mix', 'Quartet Mix', 'Solo Child', 'Duet Children',
  'Soprano Voice', 'Coral Voices', 'Coral Bass', 'Solo Voice', 'Vocal Chops', 
  'Male Monastic Choir', 'Powerhouse Soloist', 'Bright Female Vocals', 
  'Processed Vocals', 'Children\'s Choir', 'Gospel Vocals', 'Distant Female Voice', 
  'Backing Choir', 'Soprano Choir', 'Tenor/Alto Choir', 'Bass Choir', 'Deep Vocal Drone',
  'Alto Choir', 'Choir'
];

export function isVocalInstrument(instrumentName: string | undefined | null): boolean {
    if (!instrumentName) return false;
    const inst = instrumentName.toLowerCase().trim();
    if (!inst || inst === 'none' || inst === 'n/a') return false;
    
    // Core voice channels: Match specific vocal instrument patterns
    if (inst.includes('choir')) return true;
    if (inst.includes('voice')) return true;
    if (inst.includes('vocal')) return true;
    if (inst.includes('solo female') || inst.includes('solo male') || inst.includes('solo girl') || inst.includes('solo boy')) return true;
    
    // Fallback to explicit list for others
    return VOCAL_STRINGS.some(v => inst.includes(v.toLowerCase()));
}

// Descriptive style tags used by the dice roll. Lyria's safety filter rejects artist and band names ("... style",
// "... vibe") and sometimes song titles, so these describe the sound instead. Never put names in here.
export const STYLE_DESCRIPTORS: Record<string, string[]> = {
  'Hip Hop': ['dusty boom bap drums with jazzy sampled loops', 'hard-hitting 808 bass and crisp hi-hats', 'laid-back synth whine and a deep groove', 'raw cypher energy with punchy drums'],
  'Pop': ['bright polished pop production with a catchy hook', 'shimmering synths and a driving four on the floor beat', 'warm radio-friendly pop with layered harmonies'],
  'R&B': ['smooth neo-soul chords with a slow groove', 'silky late-night r&b with warm bass', 'sensual slow jam with electric piano and soft drums'],
  'Jazz': ['relaxed modal jazz with walking bass and brushed drums', 'swinging bebop energy with lively improvisation', 'smoky late-night jazz lounge feel'],
  'Electronic': ['pulsing analog synth arpeggios and a steady kick', 'hypnotic four on the floor groove with evolving pads', 'intricate glitchy electronica textures'],
  'Rock': ['driving guitar riffs with a big live drum sound', 'anthemic rock with soaring guitar leads', 'gritty garage rock energy'],
  'Blues': ['slow twelve bar blues with expressive bending guitar', 'smoky shuffle groove with soulful call and response', 'gritty delta blues feel'],
  'Ambient': ['slowly evolving atmospheric pads with deep space', 'weightless drifting textures and soft reverb', 'meditative calm soundscape'],
  'Gaming': ['epic heroic adventure score with sweeping melodies', 'playful chiptune flavoured game soundtrack', 'tense cinematic boss battle energy'],
  'Classic': ['elegant romantic era orchestral writing', 'expressive piano and strings with graceful phrasing', 'dramatic symphonic build with rich harmony'],
  'Opera': ['grand dramatic operatic orchestration', 'sweeping romantic orchestra supporting expressive voices', 'theatrical tension and release'],
  'Marching': ['crisp parade snare rhythm with bold brass', 'disciplined martial pulse with fanfare', 'stirring military band energy'],
  'Renascentist': ['gentle renaissance consort with lute and recorder', 'polyphonic early music with delicate ornaments', 'courtly dance rhythm'],
  'Victorian': ['refined parlour music with graceful piano', 'ornate romantic salon melody', 'stately nineteenth century orchestral colour'],
  'Spiritual': ['reverent sacred atmosphere with slow harmony', 'uplifting gospel warmth and call and response', 'peaceful contemplative chant-like phrases'],
  'Traditional': ['timeless folk feel with organic acoustic instruments', 'warm rustic traditional melody', 'heartfelt traditional dance rhythm'],
  'Spanish': ['passionate flamenco guitar with rhythmic handclaps', 'warm nylon string guitar and lively Latin rhythm', 'fiery Spanish dance energy'],
  'African': ['vibrant polyrhythmic percussion with a joyful groove', 'interlocking highlife style guitar lines', 'lively afrobeat groove with call and response'],
  'Indian': ['raga inspired melody with drone and tabla rhythm', 'rich Indian classical ornamentation with sitar', 'lively Bollywood style orchestral colour'],
  'Irish': ['spirited Irish folk with fiddle and tin whistle', 'lilting jig and reel rhythm', 'wistful Celtic melody'],
  'Oriental': ['delicate pentatonic melody with plucked strings', 'flowing East Asian instrumental colour', 'serene traditional oriental atmosphere'],
  'European': ['heartfelt European folk with accordion and strings', 'lively village dance with mandolin and tambourine', 'nostalgic old-world street melody'],
  'Romanian': ['lively Balkan folk with fast violin and accordion', 'nostalgic folk melody with cimbalom shimmer', 'energetic hora dance rhythm'],
  'Western': ['dusty frontier ballad with acoustic guitar and harmonica', 'lonesome prairie atmosphere with twangy guitar', 'steady trail riding rhythm'],
  'Hawaiian': ['gentle island slack key guitar and ukulele', 'sunny tropical lilt with warm steel guitar', 'relaxed ocean breeze feel']
};
/**
 * What makes a song of each genre a song of that genre, for the full-song prompt (Lyria 3.5): how it is built
 * (`form`, used when Lyria writes its own words), how the vocals are delivered and how it should sound (`sound`).
 * Plain descriptions only: no artist, band or song names (the safety filter rejects them).
 */
export const GENRE_SONG_BRIEF: Record<string, { form: string; vocals: string; sound: string }> = {
  'Hip Hop': { form: '[Intro] -> [Verse 1] -> [Hook] -> [Verse 2] -> [Hook] -> [Outro]', vocals: 'rhythmic rapped verses with a sung, catchy hook', sound: 'punchy drums, deep sub bass, tight pocket groove, space in the beat for the rapper' },
  'Pop': { form: '[Intro] -> [Verse 1] -> [Pre-Chorus] -> [Chorus] -> [Verse 2] -> [Pre-Chorus] -> [Chorus] -> [Bridge] -> [Final Chorus] -> [Outro]', vocals: 'clear lead vocal, memorable hook, stacked harmonies on the chorus', sound: 'polished modern production, big chorus lift, bright and wide mix' },
  'R&B': { form: '[Intro] -> [Verse 1] -> [Chorus] -> [Verse 2] -> [Chorus] -> [Bridge] -> [Chorus] -> [Outro]', vocals: 'smooth melismatic lead vocal with soft harmonies', sound: 'warm bass, laid-back groove, lush chords, intimate mix' },
  'Jazz': { form: '[Intro] -> [Head: Verse 1] -> [Instrumental Solo] -> [Head: Verse 2] -> [Outro]', vocals: 'relaxed, behind-the-beat phrasing with a little improvisation', sound: 'swinging rhythm, walking bass, brushed drums, instrumental solos between the vocal choruses' },
  'Blues': { form: 'Twelve-bar blues form: [Intro] -> [Verse 1] -> [Verse 2] -> [Guitar Solo] -> [Verse 3] -> [Outro], each verse a statement, a repeat and an answer line', vocals: 'gritty, expressive vocal with call and response against the guitar', sound: 'shuffle groove, bending guitar, raw live feel' },
  'Electronic': { form: '[Intro] -> [Build] -> [Drop] -> [Breakdown] -> [Build] -> [Final Drop] -> [Outro]', vocals: 'sparse, processed vocal hooks and short phrases', sound: 'steady kick, evolving synth layers, tension and release, clean club mix' },
  'Rock': { form: '[Intro] -> [Verse 1] -> [Chorus] -> [Verse 2] -> [Chorus] -> [Guitar Solo] -> [Final Chorus] -> [Outro]', vocals: 'strong, energetic lead vocal with shouted group backing on the chorus', sound: 'driving drums, crunchy guitars, big open chorus, live band energy' },
  'Ambient': { form: 'one slowly evolving piece: [Intro] -> [Section 1] -> [Section 2] -> [Fade Out], no hard drops', vocals: 'few or no words, floating wordless voices', sound: 'long soft pads, wide reverb, no drums or very gentle pulse' },
  'Gaming': { form: '[Intro] -> [Main Theme] -> [Action Section] -> [Theme Returns, Bigger] -> [Outro]', vocals: 'heroic, anthemic voices only when the theme peaks', sound: 'adventurous melodic theme, rhythmic drive, cinematic layering' },
  'Classic': { form: '[Introduction] -> [Theme A] -> [Theme B] -> [Development] -> [Theme A Returns] -> [Coda]', vocals: 'elegant, trained classical voice or wordless vocalise', sound: 'natural acoustic orchestral balance, expressive dynamics, graceful phrasing' },
  'Opera': { form: '[Orchestral Prelude] -> [Aria: Verse 1] -> [Aria: Verse 2] -> [Dramatic Climax] -> [Final Cadence]', vocals: 'powerful trained operatic voice with wide vibrato and big high notes', sound: 'full dramatic orchestra, rubato, hall reverb' },
  'Marching': { form: '[Fanfare] -> [Main March] -> [Trio Section] -> [Main March Returns] -> [Final Flourish]', vocals: 'unison male voices chanting or singing in a steady march rhythm', sound: 'crisp snare cadence, bold brass, strong downbeat' },
  'Renascentist': { form: '[Instrumental Intro] -> [Verse 1] -> [Verse 2] -> [Dance Interlude] -> [Verse 3]', vocals: 'clear, unforced early-music voices in gentle polyphony', sound: 'lute, recorder and viol consort, light hand percussion, dry intimate room' },
  'Victorian': { form: '[Introduction] -> [Verse 1] -> [Refrain] -> [Verse 2] -> [Refrain] -> [Coda]', vocals: 'refined, sincere parlour singing with clear diction', sound: 'parlour piano and strings, graceful rubato, salon room' },
  'Spiritual': { form: '[Quiet Opening] -> [Verse 1] -> [Refrain] -> [Verse 2] -> [Refrain, Everyone Joins] -> [Amen]', vocals: 'warm, devotional voices with call and response and rising harmony', sound: 'slow reverent pulse, handclaps or soft organ, church acoustics' },
  'African': { form: '[Intro: Percussion] -> [Verse: Call] -> [Response] -> [Chorus] -> [Interlude] -> [Chorus]', vocals: 'call and response between a lead singer and a group', sound: 'interlocking polyrhythmic percussion, bright highlife guitar, joyful dance groove' },
  'Indian': { form: '[Alaap: Free Intro] -> [Verse (Mukhda)] -> [Interlude] -> [Verse (Antara)] -> [Refrain]', vocals: 'expressive melodic ornaments (gamaka), emotional phrasing', sound: 'tabla rhythm, drone, sitar and strings, raga-based melody' },
  'Irish': { form: '[Intro: Fiddle] -> [Verse 1] -> [Refrain] -> [Verse 2] -> [Refrain] -> [Instrumental Reel] -> [Final Refrain]', vocals: 'plain, heartfelt storytelling voice with group refrain', sound: 'fiddle, tin whistle, bodhran and acoustic guitar, lilting dance rhythm' },
  'Spanish': { form: '[Guitar Intro] -> [Verse 1] -> [Estribillo (Refrain)] -> [Verse 2] -> [Estribillo] -> [Guitar Falseta] -> [Final Refrain]', vocals: 'passionate, ornamented cante with rhythmic handclaps (palmas)', sound: 'nylon-string guitar rasgueado, compás rhythm, fiery and dramatic' },
  'Oriental': { form: '[Quiet Intro] -> [Verse 1] -> [Interlude] -> [Verse 2] -> [Closing Phrase]', vocals: 'gentle, delicate sung melody on a pentatonic scale', sound: 'plucked zither and flute, sparse space, flowing dynamics' },
  'Romanian': { form: '[Slow Doina Intro] -> [Verse 1] -> [Refrain] -> [Verse 2] -> [Fast Hora Dance] -> [Refrain]', vocals: 'heartfelt folk voice that opens into group singing', sound: 'fast violin, accordion, cimbalom, quick accelerating dance' },
  'European': { form: '[Instrumental Intro] -> [Verse 1] -> [Refrain] -> [Verse 2] -> [Refrain] -> [Dance Interlude] -> [Final Refrain]', vocals: 'warm, open-throated folk voice with the whole room joining the refrain', sound: 'accordion, mandolin or balalaika, fiddle, double bass and tambourine, acoustic village-hall feel' },
  'Western': { form: '[Guitar Intro] -> [Verse 1] -> [Chorus] -> [Verse 2] -> [Chorus] -> [Harmonica Solo] -> [Last Chorus]', vocals: 'plainspoken storytelling voice with a twang, sing-along chorus', sound: 'acoustic guitar, steady trail rhythm, harmonica and fiddle, open spaces' },
  'Hawaiian': { form: '[Ukulele Intro] -> [Verse 1] -> [Chorus] -> [Verse 2] -> [Chorus] -> [Outro]', vocals: 'sweet, relaxed voice with gentle falsetto turns and group harmony', sound: 'ukulele, slack-key guitar, soft steel guitar, easy island sway' }
};

/**
 * What "authentic" means for each folk, regional and traditional genre: the real scales, rhythms and ornaments of the
 * tradition. Used to keep Lyria from turning folk music into pop with a folk instrument on top.
 * Plain descriptions only: no artist, band or song names.
 */
export const GENRE_AUTHENTICITY: Record<string, string> = {
  'African': 'polyrhythmic interlocking percussion, call and response singing, pentatonic and modal melodies, cyclical grooves',
  'Indian': 'raga-based melody with microtonal ornaments called gamaka, tala rhythm cycles, a steady drone, tabla',
  'Irish': 'modal melodies with traditional ornaments such as cuts and rolls, jig, reel and slow air forms, plain unaccompanied-style singing',
  'Spanish': 'Phrygian flamenco mode, compas rhythm cycles, rasgueado guitar, ornamented cante and palmas',
  'Oriental': 'traditional pentatonic or maqam scales, plucked and bowed traditional instruments, sparse space, no Western harmony',
  'Romanian': 'doina-style free rubato, lautareasca violin ornaments, hora and sarba dance rhythms, Balkan modes',
  'European': 'living European folk traditions: Russian minor-key songs with balalaika tremolo, French bal-musette waltzes, Southern Italian tarantella in fast 6/8, Neapolitan serenades with mandolin tremolo',
  'Western': 'American frontier and country tradition: simple I-IV-V chords, open fifths, steady train-beat rhythm, storytelling melody',
  'Hawaiian': 'slack key guitar and ukulele strumming, steel guitar glides, gentle falsetto leaps, relaxed hula sway',
  'Spiritual': 'sacred tradition: modal chant lines, call and response, plain reverent harmony, church acoustics',
  'Renascentist': 'modal early music, polyphonic lines, dance forms such as pavane and galliard, period instruments',
  'Victorian': 'nineteenth-century parlour and music-hall tradition: waltz and polka forms, plain diatonic harmony, refined phrasing',
  'Blues': 'twelve-bar form, blue notes and bent pitches, shuffle rhythm, call and response between voice and instrument',
  'Marching': 'regimental march form with a steady two-beat cadence, bold brass melody, snare roll patterns',
  'Classic': 'authentic classical-period craft: clear themes, functional harmony, natural dynamics, no pop rhythms',
  'Opera': 'authentic operatic tradition: trained voices, recitative and aria forms, full dramatic orchestral support'
};

// Styles too broad to define a sound by themselves: these get the stronger "typical of the genre" push.
const GENERIC_STYLE_NAMES = ['folk', 'traditional', 'guitar', 'classic', 'modern', 'world', 'instrumental', 'standard', 'general', 'mix'];

/** True when the style says little (none, the genre's own name, or a catch-all word), so the genre must do the work. */
export function isGenericStyle(genre: string, style: string): boolean {
    const st = (style || '').trim().toLowerCase();
    return !st || st === genre.toLowerCase() || GENERIC_STYLE_NAMES.includes(st);
}

/** Short tags for the live (Lyria RealTime) prompt: it reads tags, not sentences. */
export function fidelityTags(genre: string, style: string): string[] {
    const name = style && !style.toLowerCase().includes(genre.toLowerCase()) ? `${genre} ${style}` : (style || genre);
    const tags: string[] = [];
    if (GENRE_AUTHENTICITY[genre]) tags.push(`authentic traditional ${name} music, ${GENRE_AUTHENTICITY[genre].split(',').slice(0, 3).join(',')}`);
    if (isGenericStyle(genre, style)) tags.push(`classic typical ${genre} sound, true to the genre`);
    return tags;
}

/** Sentences for the full-song prompt (Lyria 3.5): stay in the genre, and sound authentic for folk and traditional genres. */
export function fidelityLines(genre: string, style: string): string[] {
    const name = style && !style.toLowerCase().includes(genre.toLowerCase()) ? `${genre} ${style}` : (style || genre);
    const lines = [`Stay strictly within ${name}: no crossover with other genres.`];
    if (isGenericStyle(genre, style)) lines.push(`The style is broad, so use the most typical, recognizable conventions of ${genre}.`);
    if (GENRE_AUTHENTICITY[genre]) {
        lines.push(`Authenticity: play it as real traditional ${name} music, true to the tradition: ${GENRE_AUTHENTICITY[genre]}.`);
        lines.push('Avoid modern pop, electronic or generic world-music fusion arrangements; no pop chord loops.');
    }
    return lines;
}

/**
 * The story of a live performance when the DJ is off. Lyria RealTime has no memory of where it is in a piece: with
 * fixed prompts it settles into a short loop. So the app walks the prompts through an arc, the way a folk tune is
 * played: state the tune, repeat it with ornaments, a contrasting part, the return, a closing statement. Each cue is a
 * plain description of the music (never an instrument), `density` shifts Lyria's density (-1..+1 around its middle).
 */
interface ArcSection { until: number; name: string; cue: string; density: number }
const FOLK_ARC: ArcSection[] = [
    { until: 0.08, name: 'Opening', cue: 'opening: a single melodic line states the main tune, sparse and spacious', density: -0.35 },
    { until: 0.28, name: 'Theme', cue: 'the main tune played in full, clear, simple and singable', density: -0.05 },
    { until: 0.48, name: 'Varied repeat', cue: 'the main tune repeats with new ornaments and a fuller accompaniment', density: 0.1 },
    { until: 0.62, name: 'Contrast', cue: 'a contrasting second part with a new melody that answers the first', density: 0.0 },
    { until: 0.85, name: 'Return', cue: 'the main tune returns fuller and more energetic, building to a peak', density: 0.25 },
    { until: 1.01, name: 'Close', cue: 'a final embellished statement of the tune, then a gentle slowing close', density: -0.2 }
];
const MODERN_ARC: ArcSection[] = [
    { until: 0.08, name: 'Intro', cue: 'intro: sparse, setting the groove and the key', density: -0.35 },
    { until: 0.30, name: 'Verse', cue: 'verse: steady groove with a clear melodic hook', density: -0.05 },
    { until: 0.45, name: 'Lift', cue: 'chorus: bigger, fuller and brighter, the hook returns', density: 0.25 },
    { until: 0.58, name: 'Break', cue: 'breakdown: stripped back, a new melodic idea, tension building', density: -0.25 },
    { until: 0.85, name: 'Final push', cue: 'final chorus: the full groove at its peak with extra variations', density: 0.3 },
    { until: 1.01, name: 'Outro', cue: 'outro: winding down, resolving to the tonic', density: -0.3 }
];
// Two-bar-pair phrasing inside a section: a rising question, then a falling answer (breaks up "ta ti ta ti" loops)
const PHRASE_CUES = ['melody phrase rises and ends open, like a question', 'answering phrase falls and resolves, like a reply'];
const AUTO_PHRASE_BARS = 8;
// Genres whose scales are mostly not major/minor-pair material (raga, maqam, pentatonic, microtonal)
const NON_DIATONIC_GENRES = ['Indian', 'Oriental'];

/** The form line for a song with no given lyrics, trimmed to its length: short songs lose repeats, long ones get an extra verse. */
function formForLength(form: string, minutes: number): string {
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

export const TRADITIONAL_GENRES = ['Classic', 'Renascentist', 'Victorian', 'Spiritual', 'African', 'Indian', 'Irish', 'Spanish', 'Oriental', 'Romanian', 'European', 'Western', 'Hawaiian', 'Marching', 'Blues', 'Traditional'];

export function isTraditionalGenre(genre: string): boolean {
    return TRADITIONAL_GENRES.includes(genre);
}

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

// Lyrics language for the Voice dialog (Auto, and its dice): the native language for regional genres,
// classical/liturgical languages for traditional ones, and the popular languages of the charts for modern music.
const GENRE_LANGUAGES: Record<string, string[]> = {
    'African': ['Swahili', 'Zulu'], 'Indian': ['Hindi'], 'Irish': ['Irish Gaelic', 'English'], 'Spanish': ['Spanish'],
    'Oriental': ['Mandarin Chinese', 'Japanese'], 'Romanian': ['Romanian'], 'European': ['Russian', 'French', 'Italian'], 'Western': ['English'], 'Hawaiian': ['Hawaiian'],
    'Classic': ['Italian', 'German', 'Latin'], 'Opera': ['Italian', 'German', 'French'], 'Renascentist': ['Latin', 'Italian'],
    'Victorian': ['English'], 'Spiritual': ['Latin', 'English'], 'Marching': ['English', 'German'], 'Blues': ['English']
};
// A style tied to one culture sings in that culture's language, whatever the genre's general list says
// (Oriental / Japanese Folk is Japanese, never Chinese; Spanish / Bossa Nova is Portuguese). Checked before GENRE_LANGUAGES.
const STYLE_LANGUAGES: Record<string, string[]> = {
    // Oriental
    'Japanese Folk': ['Japanese'], 'Chinese Traditional': ['Mandarin Chinese'], 'Arabic Classical': ['Arabic'],
    'Turkish Folk': ['Turkish'], 'Balinese Gamelan': ['Indonesian'], 'Korean Folk': ['Korean'],
    // European
    'Russian Folk': ['Russian'], 'French Musette': ['French'], 'Tarantella': ['Italian'], 'Neapolitan Song': ['Italian'],
    // Indian
    'Hindustani': ['Hindi'], 'Bollywood': ['Hindi'], 'Bhangra': ['Punjabi'], 'Carnatic': ['Tamil'], 'Tabla Solo/Raga': ['Hindi'],
    // African
    'Afrobeats': ['Yoruba', 'English'], 'Highlife': ['English'], 'Malian Blues': ['French'], 'Desert Rock': ['French'], 'Marabi/Soweto': ['Zulu'],
    // Spanish genre: Brazil sings in Portuguese
    'Bossa Nova': ['Portuguese'],
    // Irish
    'Celtic Punk/Rock': ['English'],
    // Hawaiian
    'Island Reggae': ['English', 'Hawaiian'],
    // Classical and sacred
    'Viennese Waltz': ['German'], 'Baroque Opera': ['Italian'], 'Contemporary Opera': ['English'],
    'Gregorian Chant': ['Latin'], 'Byzantine Chant': ['Greek'], 'Gospel': ['English'], 'Christmas Carols': ['English', 'Latin'],
    'Cathedral': ['Latin'], 'Royal Court': ['English', 'Italian'], 'Minstrel Ballad': ['English'], 'Tudor Dance': ['English'], 'Village Festival': ['English']
};
const POPULAR_LANGUAGES: Array<[string, number]> = [['English', 60], ['Spanish', 12], ['French', 8], ['Portuguese', 8], ['Korean', 6], ['Italian', 6]];

export function chooseLyricsLanguage(genre: string, style?: string): string {
    const fixed = (style && STYLE_LANGUAGES[style]) || GENRE_LANGUAGES[genre];
    let language: string;
    if (fixed) language = fixed[Math.floor(Math.random() * fixed.length)];
    else {
        let roll = Math.random() * 100;
        language = 'English';
        for (const [lang, w] of POPULAR_LANGUAGES) { if ((roll -= w) < 0) { language = lang; break; } }
    }
    return language;
}


// Lyria takes a scale as a relative major/minor pair; index = pitch class of the major key.
const LYRIA_SCALES = ['C_MAJOR_A_MINOR', 'D_FLAT_MAJOR_B_FLAT_MINOR', 'D_MAJOR_B_MINOR', 'E_FLAT_MAJOR_C_MINOR', 'E_MAJOR_D_FLAT_MINOR', 'F_MAJOR_D_MINOR',
    'G_FLAT_MAJOR_E_FLAT_MINOR', 'G_MAJOR_E_MINOR', 'A_FLAT_MAJOR_F_MINOR', 'A_MAJOR_G_FLAT_MINOR', 'B_FLAT_MAJOR_G_MINOR', 'B_MAJOR_A_FLAT_MINOR'];
const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Maps a key such as "F# Minor" or "Bb Major" to the Lyria scale enum (all 12 pairs). */
export function scaleForKey(key: string): string | null {
    const m = key.trim().match(/^([A-G])([#b]?)\s+(major|minor)/i);
    if (!m) return null;
    let pc = NOTE_PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    if (m[3].toLowerCase() === 'minor') pc += 3; // relative major
    return LYRIA_SCALES[((pc % 12) + 12) % 12];
}

// Lyria has no lyrics input and only understands short descriptive prompts: vocals are just another instrument
// (VOCALIZATION mode + a prompt that names the voice), so instrument names are turned into plain voice descriptions.
export function describeVoice(instrument: string): string {
    const n = instrument.toLowerCase();
    if (n.includes('rapper') || n.includes('mc ')) return 'rap vocals, rhythmic spoken flow';
    if (n.includes('quartet')) return 'four human voices singing in harmony';
    if (n.includes('duet')) return 'two human voices singing in harmony';
    if (n.includes('solo') || n.includes('soprano') || n.includes('tenor') || n.includes('soloist')) return 'solo human singing voice';
    if (n.includes('chamber')) return 'chamber choir vocals, ooh and aah harmonies';
    if (n.includes('choir') || n.includes('chant') || n.includes('cappella') || n.includes('ensemble')) return `${instrument} vocals, ooh and aah harmonies`;
    if (n.includes('boy') || n.includes('girl') || n.includes('female') || n.includes('male')) return `${instrument} singing voice`;
    return `${instrument}, human vocals`;
}

// Artistic singer profiles, written the way the Lyria prompt guide describes voices (gender, range, timbre, delivery).
// One is picked at random per voice, so every song gets its own singer.
const VOICE_PERSONAS: Record<string, string[]> = {
    Soprano: ['female soprano lead vocal, clear crystalline timbre, agile soaring delivery', 'female soprano lead vocal, airy breathy tone, gentle vibrato',
        'female soprano lead vocal, bright bell-like voice, expressive phrasing'],
    Alto: ['female alto lead vocal, rich warm husky lower range', 'female alto lead vocal, smoky velvet tone, soulful phrasing',
        'female mezzo lead vocal, dark warm voice, intimate delivery'],
    Tenor: ['male tenor lead vocal, bright energetic voice, ringing high notes', 'male tenor lead vocal, smooth lyrical tone, tender falsetto',
        'male tenor lead vocal, open passionate voice, clear diction'],
    Baritone: ['male baritone lead vocal, deep velvet-smooth chest voice', 'male baritone lead vocal, warm resonant tone, relaxed delivery',
        'male baritone lead vocal, raspy gritty timbre, raw emotion'],
    Rap: ['rap vocal, confident rhythmic flow, clear diction, on-beat delivery', 'rap vocal, laid-back smooth flow, deep voice',
        'rap vocal, fast punchy delivery, sharp rhymes'],
    Girl: ['young girl lead vocal, pure clear innocent tone'],
    Boy: ['boy treble lead vocal, pure bell-like tone'],
};
const pickOne = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

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
export interface SentPrompt { text: string; weight: number }

export interface LiveMusicHelperEvents {
  'playback-state-changed': PlaybackState;
  'loop-changed-internal': boolean;
  'mode-changed-internal': MusicGenerationMode;
  'handshake-result': boolean;
  /** The vocal direction being sung, null when it ends */
  'vocal-signal-received': string | null;
  'seed-changed': { seed: number | null; locked: boolean };
  'prompt-improved': PromptImprovement;
  'prompt-filtered': LiveMusicFilteredPrompt & { payload: unknown; config: unknown };
  'config-applied': { guidance: number } & Record<string, unknown>;
  'config-failed': string;
  'prompts-sent': { prompts: SentPrompt[] } & Record<string, unknown>;
  'conductor-knobs-update': Map<string, Prompt>;
  'conductor-anticipation': { msg: string };
  'conductor-stage-changed': { name: string; isAi: boolean; type?: string; index?: number };
  'conductor-instruments-update': InstrumentSet;
  'recording-cleared': NoDetail;
  'recording-available': NoDetail;
  'recording-finished-auto': NoDetail;
  'warmup-started': { durationMs: number; warmupMs: number };
  'dj-vocal-message': { text: string; type: 'error' | 'info' };
  'song-render-started': { prompt: string };
  'song-render-progress': { seconds: number };
  'song-rendered': { duration: number; lyrics: string; prompt: string };
  'song-render-failed': { reason: string; blocked: boolean };
}

export class LiveMusicHelper extends EventTarget {
  /** The events it sends (a type only: see utils/events.ts) */
  declare readonly __events?: LiveMusicHelperEvents;
  private ai: GoogleGenAI;
  private session: LiveMusicSession | null = null;
  private sessionPromise: Promise<LiveMusicSession> | null = null;
  private sessionCounter = 0; 
  private nextStartTime = 0;
  public bufferTime = 3.0; // Large buffer: red cursor runs ahead, green starts after buffer fills
  public readonly audioContext: AudioContext;
  private rawGain: GainNode;
  private masterGain: GainNode;
  private recordingDestination: MediaStreamAudioDestinationNode;
  public playbackState: PlaybackState = 'stopped';
  private prompts: Map<string, Prompt>;
  private bpm = 120; private key = 'C Major';
  public genre = 'Jazz'; public style = 'Acid Jazz'; private meter = '4/4';
  private mood = 'None';
  public generationMode: MusicGenerationMode = 'DIVERSITY';
  public instruments: InstrumentSet = {
    lead: { instrument: 'Piano', active: true, weight: 1.0, visible: true },
    alto: { instrument: 'Alto Saxophone', active: true, weight: 1.0, visible: true },
    harmonic: { instrument: 'Strings', active: true, weight: 1.0, visible: true },
    bass: { instrument: 'Bass Guitar', active: true, weight: 1.0, visible: true },
    rhythm: { instrument: 'Drum Kit', active: true, weight: 1.0, visible: true }
  };
  public conductorMode = false;
  private soloMuted = false;
  private evolutionValue = 0; 
  private conductorTimer: number | null = null;
  private currentPlan: PerformancePlanStage[] = [];
  private currentPlanIdx = 0;
  private userInteractionCooldowns = new Map<string, number>();
  private djPersonality: DjPersonality | null = null;
  private lyricBlocks: { label: string; lines: string }[] = [];
  private lyricsPrompt = '';
  /** The lyrics as written in the Voice dialog (typed or generated). */
  public lyricsText = '';
  /** How strongly the voices sing (0 soft .. 1 powerful). */
  public voiceIntensity = 0.7;
  /** Lyria temperature: 0.0 to 3.0, default 1.1. Set from the DJ dialog. */
  private temperature = 1.1;
  public setTemperature(value: number) { this.temperature = Math.round(Math.max(0, Math.min(3, value)) * 10) / 10; this.scheduleRefresh(); }
  private static readonly STAGE_GUIDANCE: Record<string, number> = {
      intro: 3.5, outro: 3.5, breakdown: 4.0, build: 4.5, verse: 4.5, main: 4.5, groove: 4.5, percussion: 4.5,
      chorus: 5.0, climax: 5.0, solo: 5.6, duet: 5.6, trio: 5.3
  };
  /** Where the DJ wants guidance for the current section: tight formations (solo, duet) need the model to obey strictly. */
  private djGuidanceTarget(): number {
      const stage = this.currentPlan?.[this.currentPlanIdx];
      let g = LiveMusicHelper.STAGE_GUIDANCE[stage?.type || 'main'] ?? 4.5;
      if (stage && (stage.formation === 'solo' || stage.formation === 'duet')) g = Math.max(g, 5.6);
      if (this.currentVocalSignal) g += 0.4;
      // The genre profile has the last word: guidance (knob x 3) stays inside the genre's Guidance range,
      // except in solo sections where the DJ may override the genre maximum
      const range = this.genreProfile()['Guidance'];
      if (range) g = Math.max(range[0] * 3, isGenreOverrideStage(stage?.type, stage?.formation) ? g : Math.min(range[1] * 3, g));
      // Locked instruments: the model must stick to the selected instruments, so the DJ raises guidance above the
      // genre range (+0.8, at least 5.2). Kept under the Lyria maximum of 6 so section changes do not get too abrupt.
      if (this.instrumentsLocked) g = Math.max(g + 0.8, LOCKED_GUIDANCE_MIN);
      return Math.min(LYRIA_GUIDANCE_MAX, g);
  }
  private genreProfile(): Record<string, [number, number, number]> {
      return LiveMusicHelper.GENRE_KNOB_PROFILES[this.genre] || LiveMusicHelper.GENRE_KNOB_PROFILES['Pop'];
  }
  /** The guidance the app wants right now (the applied one is reported by 'config-applied'). */
  public get intendedGuidance(): number { return this.effectiveGuidance(); }
  /**
   * Guidance sent to Lyria: the Guidance knob (weight x 3), but never under a floor. With guidance near 0 Lyria
   * ignores the prompts, so genre, style and instruments are lost. Floor: 4 (Lyria default), 4.5 with voices on stage,
   * 5.2 with the channels locked.
   */
  private effectiveGuidance(): number {
      let g = 0;
      for (const p of this.prompts.values()) if (isGuidanceKnob(p)) g = p.weight * 3;
      const floor = this.instrumentsLocked ? LOCKED_GUIDANCE_MIN : this.voiceMode && this.isVocalInstrumentActive() ? VOICE_GUIDANCE_FLOOR : GUIDANCE_FLOOR;
      return Math.round(Math.max(floor, Math.min(LYRIA_GUIDANCE_MAX, g)) * 10) / 10;
  }
  private voiceIntensityPhrase(): string {
      const v = this.voiceIntensity;
      return v < 0.35 ? 'soft, intimate, hushed' : v < 0.65 ? 'warm, moderate volume' : v < 0.85 ? 'strong, expressive' : 'powerful, soaring, full-voiced';
  }
  /** The compact vocal prompt (language + opening line, or vowels) sent to Lyria. */
  public get vocalPrompt() { return this.lyricsPrompt; }
  public lyricsLanguage = 'English';
  public lyricsVowelsOnly = false;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  
  private segments: RecordingSegment[] = [];
  public recordedAudioBlob: Blob | null = null; 
  public automationLog: PlaybackSnapshot[] = [];
  
  private autoStopTimer: number | null = null;
  public maxDurationMinutes: number = 3; 
  
  public elapsedSeconds = 0;
  private playbackStartTime = 0;
  private timeTrackingFrame: number | null = null;
  private loopWaitTimer: number | null = null;

  private lastStateBeforePause: PlaybackState = 'stopped';
  private activeSources = new Set<AudioBufferSourceNode>();
  public isLooping = false; public isRewinding = false; private rewindFrame: number | null = null;

  public fadeIn = 5.0;
  public fadeOut = 10.0;
  private userVolume = 0.8;

  private currentVocalSignal: string | null = null;
  private vocalSignalTimer: number | null = null;
  private conductorActivationTime = 0;

  public isLiraMode = false;
  /** What a channel does in the music, as named in the prompts (Lyria tab: lead voice, harmony, orchestra, brass, percussion). */
  private channelRole(k: ChannelKey): string {
      if (!this.isLiraMode) return ({ lead: 'lead melody', alto: 'countermelody', harmonic: 'chords', bass: 'bassline', rhythm: 'rhythm' } as Record<ChannelKey, string>)[k];
      return ({ lead: 'lead melody', alto: 'harmony accompaniment', harmonic: 'orchestral backing', bass: 'brass', rhythm: 'percussion' } as Record<ChannelKey, string>)[k];
  }

  /** The solo voices (Soprano, Alto, Tenor, Baritone) chosen in the Voice dialog. Each new cast gets new random singers. */
  private voiceCast: { solos: string[] } = { solos: [] };
  private voicePersonas = new Map<string, string>();
  public setVoiceCast(solos: string[]) {
      this.voiceCast = { solos: [...solos] };
      this.voicePersonas.clear();
      this.scheduleRefresh();
  }
  /** The singers the prompts describe right now (for the prompt panel). */
  public get voiceDescriptions(): string[] { return [...this.voicePersonas.values()]; }

  /** The artistic voice Lyria is asked for on a voice channel, chosen once at random and kept for the song. */
  private voicePrompt(instrument: string): string {
      const cached = this.voicePersonas.get(instrument);
      if (cached) return cached;
      const n = instrument.toLowerCase();
      const solos = this.voiceCast.solos;
      const persona = (voice: string) => pickOne(VOICE_PERSONAS[voice] || VOICE_PERSONAS.Alto);
      let text: string;
      if (n.includes('rapper') || n.includes('mc ')) text = persona('Rap');
      else if (n.includes('quartet')) {
          const parts = (solos.length >= 3 ? solos : ['Soprano', 'Alto', 'Tenor', 'Baritone']).map(v => v.toLowerCase());
          text = `vocal quartet singing in close harmony, ${parts.join(', ')}`;
      } else if (n.includes('duet')) {
          const pair = n.includes('child') ? ['Girl', 'Boy']
              : n.includes('female') ? ['Soprano', 'Alto']
              : n.includes('male') ? ['Tenor', 'Baritone']
              : solos.length >= 2 ? solos.slice(0, 2) : [pickOne(['Soprano', 'Alto']), pickOne(['Tenor', 'Baritone'])];
          text = `vocal duet, ${pair.map(v => persona(v).replace(' lead vocal', '')).join(' and ')}, harmonies`;
      } else if (/choir|chant|cappella|ensemble|coral/.test(n)) text = describeVoice(instrument);
      else if (n.includes('child')) text = persona(pickOne(['Girl', 'Boy']));
      else if (n.includes('girl')) text = persona('Girl');
      else if (n.includes('boy')) text = persona('Boy');
      else if (n.includes('female') || n.includes('soprano')) text = persona(solos[0] === 'Alto' ? 'Alto' : pickOne(['Soprano', 'Alto']));
      else if (n.includes('male') || n.includes('tenor')) text = persona(solos[0] === 'Baritone' ? 'Baritone' : pickOne(['Tenor', 'Baritone']));
      else text = persona(solos[0] || pickOne(['Soprano', 'Alto', 'Tenor', 'Baritone']));
      this.voicePersonas.set(instrument, text);
      return text;
  }
  public toolbarLocks = {
      genre: false,
      style: false,
      tempo: false,
      key: false,
      mood: false,
      channels: false,
      manifest: false
  };

  // Track the current phase message for recording
  private currentStatusMessage: string = '';
  private lastAppliedStatusMessage: string = '';

  constructor(ai: GoogleGenAI) {
    super(); this.ai = ai; this.prompts = new Map();
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    });
    this.rawGain = this.audioContext.createGain(); this.masterGain = this.audioContext.createGain(); 
    this.masterGain.gain.value = this.userVolume;
    this.recordingDestination = this.audioContext.createMediaStreamDestination();
    this.rawGain.connect(this.recordingDestination); this.rawGain.connect(this.masterGain);
    this.masterGain.connect(this.audioContext.destination);
  }

  public get masterDestination() { return this._masterDestination; }
  private _masterDestination: AudioNode | null = null;
  public set masterDestination(node: AudioNode | null) {
    // Disconnect everything from masterGain first
    try { this.masterGain.disconnect(); } catch(e) {}
    
    this._masterDestination = node; 
    if (node) { 
        this.masterGain.connect(node); 
    } else {
        this.masterGain.connect(this.audioContext.destination);
    }
  }

  public setVolume(value: number) { 
    this.userVolume = value; 
    if (this.playbackState !== 'playing' && this.playbackState !== 'recording' && this.playbackState !== 'warmup' && this.playbackState !== 'preparing' && this.playbackState !== 'rewinding') {
      this.masterGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.05); 
    }
  }

  private updateGainWithFades() {
      if (this.playbackState !== 'playing' && this.playbackState !== 'recording' && this.playbackState !== 'warmup' && this.playbackState !== 'preparing' && this.playbackState !== 'rewinding') {
          return;
      }
      
      if (this.playbackState === 'warmup' || this.playbackState === 'preparing') {
          this.masterGain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.05);
          return;
      }

      const totalDuration = this.maxDurationMinutes * 60;
      let fadeFactor = 1.0;

      if (this.elapsedSeconds >= totalDuration) {
          fadeFactor = 0;
      } else if (this.elapsedSeconds < this.fadeIn && this.fadeIn > 0) {
          fadeFactor = this.elapsedSeconds / this.fadeIn;
      } else if (this.elapsedSeconds > (totalDuration - this.fadeOut) && this.fadeOut > 0) {
          fadeFactor = (totalDuration - this.elapsedSeconds) / this.fadeOut;
      }

      fadeFactor = Math.max(0, Math.min(1, fadeFactor));
      this.masterGain.gain.setTargetAtTime(this.userVolume * fadeFactor, this.audioContext.currentTime, 0.02);
  }

  public setMaxDuration(minutes: number) { this.maxDurationMinutes = minutes; }
  
  public setLoop(loop: boolean) { 
    this.isLooping = loop; 
    this.dispatchEvent(new CustomEvent('loop-changed-internal', { detail: loop }));
    if (loop && this.segments.length > 0) {
        this.playRecording(0);
    }
  }

  public setFades(fadeIn: number, fadeOut: number) { this.fadeIn = fadeIn; this.fadeOut = fadeOut; }
  public setMood(mood: string) { this.mood = mood; this.scheduleRefresh(); }
  public setEvolution(val: number) { this.evolutionValue = val; this.scheduleRefresh(); }
  public setGenerationMode(mode: MusicGenerationMode) { 
      let effectiveMode = mode;
      // Removed restriction: Allowing VOCALIZATION mode regardless of current instrument state
      this.generationMode = effectiveMode;
      this.dispatchEvent(new CustomEvent('mode-changed-internal', { detail: effectiveMode }));
      // Rebuild the instrument instruction: voices are named in it only while the voice master mode is on
      this.setInstruments(this.instruments);
      this.scheduleRefresh(); 
  }
  
  public setToolbarLocks(locks: any) {
      this.toolbarLocks = { ...this.toolbarLocks, ...locks };
      this.scheduleRefresh();
  }

  public setConductorMode(active: boolean) {
      this.conductorMode = active;
      this.syncAutoArrange();
      if (active) {
          this.conductorActivationTime = Date.now();
          const isLive = this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'loading';
          const isPlaying = this.playbackState === 'playing';
          
          // The DJ plans the whole song up front
          this.generatePerformancePlan();

          if (isLive || isPlaying) {
              this.startConductor();
              // Force an immediate update
              this.updateConductor();
          }
          this.dispatchEvent(new CustomEvent('handshake-result', { detail: true }));
      } else {
          this.stopConductor();
      }
      this.scheduleRefresh();
  }

  public setGlobalSettings(settings: any) {
    if (settings.bpm !== undefined) this.bpm = settings.bpm;
    if (settings.key !== undefined) this.key = settings.key;
    let knobsStale = false;
    if (settings.genre !== undefined) {
        knobsStale = settings.genre !== this.genre;
        this.genre = settings.genre;
    }
    if (settings.style !== undefined) {
        knobsStale = knobsStale || settings.style !== this.style;
        this.style = settings.style;
    }
    // Stage knob targets were baked for the old genre / style: rebuild them so the DJ steers the knobs by the new ones
    if (knobsStale && this.currentPlan?.length) {
        this.currentPlan.forEach(s => { if (s.type) s.targets = this.getKnobTargetsForStage(s.type); });
        if (this.conductorMode) this.updateConductor();
    }
    if (settings.meter !== undefined) this.meter = settings.meter;
    this.scheduleRefresh();
  }

  public setInstruments(channels: InstrumentSet) {
      this.instruments = channels;
      this.scheduleRefresh();
  }

  /** Regional genres sing in their own tradition. */
  private regionalVocalStyle(): string | null {
      const g = this.genre.toLowerCase();
      if (g.includes('indian')) return 'Hindustani vocal style';
      if (g.includes('irish') || g.includes('celtic')) return 'traditional Irish folk vocal style';
      if (g.includes('spanish') || g.includes('flamenco')) return 'flamenco vocal style';
      if (g.includes('romanian')) return 'Romanian folk vocal style';
      if (g.includes('european')) return 'European folk vocal style';
      return null;
  }

  /** Channels locked in the mixer: only the selected instruments may play, nothing else in the background or in solos. */
  private instrumentsLocked = false;
  public setInstrumentsLocked(locked: boolean) {
      if (this.instrumentsLocked === locked) return;
      this.instrumentsLocked = locked;
      this.setInstruments(this.instruments);
  }

  /** The genre colour the dice picked for the genre on the main bar; goes first in the special instruction. */
  private genreReference: string | null = null;
  public setGenreReference(text: string | null) {
      this.genreReference = text;
      this.setInstruments(this.instruments);
  }
  
  /** Store the lyrics from the Voice dialog (real words only, or open vowels). */
  public setLyrics(text: string, language?: string, vowelsOnly = false) {
      this.lyricsText = text;
      if (language) this.lyricsLanguage = language;
      this.lyricsVowelsOnly = vowelsOnly;
      this.lyricBlocks = [];
      let label = 'verse'; let lines: string[] = [];
      const flush = () => { if (lines.length) this.lyricBlocks.push({ label, lines: lines.join(' / ') }); lines = []; };
      text.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
          const header = l.match(/^\[(.+)\]$/);
          if (header) { flush(); label = header[1].toLowerCase(); }
          else lines.push(l);
      });
      flush();
      // Lyria cannot follow lyrics line by line, so only the essentials are handed over once, at the start:
      // the language plus the opening lines, and lets Lyria shape the singing itself.
      const opening = (this.lyricBlocks.find(b => /chorus|hook|refrain/.test(b.label)) ?? this.lyricBlocks[0])?.lines ?? '';
      // Lyria RealTime cannot sing given words: quoted lyric lines only come out as garbled syllables (noise),
      // so the prompt carries the language and the singing style, never the words themselves.
      this.lyricsPrompt = vowelsOnly || !opening
          ? 'wordless vocalise, ah and ooh'
          : `sung in ${this.lyricsLanguage}, verse and chorus song structure`;
  }

  public setDjPersonality(personality: DjPersonality | null) { this.djPersonality = personality; }
  public get djPersonalityChannels() { return this.djPersonality?.channels; }
  public get djPersonalityInfo() { return this.djPersonality; }

  public notifyUserInteraction(id: string) {
      this.userInteractionCooldowns.set(id, Date.now()); 
  }

  private scheduleRefresh = throttle(() => { this.refreshSessionPrompts(); }, 1000);

  /** The voice master mode: only in VOCALIZATION mode are voices, lyrics and vocal directions sent to Lyria. */
  private get voiceMode() { return this.generationMode === 'VOCALIZATION'; }

  public sendVocalSignal(signal: string, durationMs: number = 5000) {
    // Voice master mode (VOCALIZATION) off: no voice instruction goes to Lyria, whatever the voice dialog says
    if (!this.voiceMode) return;

    this.currentVocalSignal = signal;
    this.dispatchEvent(new CustomEvent('vocal-signal-received', { detail: this.currentVocalSignal }));
    this.scheduleRefresh();
    
    if (this.vocalSignalTimer) clearTimeout(this.vocalSignalTimer);
    this.vocalSignalTimer = window.setTimeout(() => {
        this.currentVocalSignal = null;
        this.dispatchEvent(new CustomEvent('vocal-signal-received', { detail: null }));
        this.scheduleRefresh();
    }, durationMs);
  }

  private currentSeed: number | null = null;
  private seedLocked = false;
  /** Lock the seed so the next recordings repeat the same take (same prompts + same seed = a similar performance). */
  public setSeedLock(locked: boolean) {
      this.seedLocked = locked;
      if (locked && this.currentSeed === null) this.currentSeed = Math.floor(Math.random() * 2147483647);
      this.dispatchEvent(new CustomEvent('seed-changed', { detail: { seed: this.currentSeed, locked: this.seedLocked } }));
      this.lastConfig = null; this.scheduleRefresh();
  }
  private prepareSeed() {
      if (!this.seedLocked || this.currentSeed === null) this.currentSeed = Math.floor(Math.random() * 2147483647);
      this.dispatchEvent(new CustomEvent('seed-changed', { detail: { seed: this.currentSeed, locked: this.seedLocked } }));
  }

  private contextResetTimer: number | null = null;
  private scheduleContextReset() {
      if (this.contextResetTimer) clearTimeout(this.contextResetTimer);
      this.contextResetTimer = window.setTimeout(() => {
          this.contextResetTimer = null;
          if (this.session && (this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing' || this.playbackState === 'playing')) {
              try { (this.session as any).resetContext(); } catch (e) { console.error("resetContext failed:", e); }
          }
      }, 800);
  }

  // Prompt weights are cross-faded: new prompts fade in, replaced prompts fade out, so a section change
  // is a smooth transition instead of a jump (Lyria's docs recommend sending intermediate weights).
  private smoothedPrompts = new Map<string, number>();
  /** Remembers prompts the safety filter rejected (also across sessions) and improves them on the fly. */
  private guard = new PromptGuard(
      (text) => this.aiRewritePrompt(text),
      (event) => { this.dispatchEvent(new CustomEvent('prompt-improved', { detail: event })); this.lastPrompts = null; this.scheduleRefresh(); }
  );
  /** Asks a Gemini text model for a version of a rejected prompt that the safety filter should accept. */
  private async aiRewritePrompt(text: string): Promise<string | null> {
      if (!this.ai) return null;
      try {
          const request = (this.ai as any).models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: `Rewrite this text prompt for a music generation model so that its safety filter accepts it. Remove every artist, band, producer, song and brand name and anything that could be seen as copyrighted, sensitive or violent. Keep the musical meaning and use short descriptive tags (instruments, genre, era, mood, tempo). Maximum 25 words. Return only the rewritten prompt, nothing else.

Prompt: ${text}`
          });
          const result = await Promise.race([request, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))]) as any;
          const better = String(result?.text || '').trim().replace(/^["']|["']$/g, '');
          return better && better.length < 300 ? better : null;
      } catch (e) {
          console.warn('Prompt rewrite failed:', e);
          return null;
      }
  }
  private crossfadeTimer: number | null = null;
  private crossfade(target: { text: string; weight: number }[]): { text: string; weight: number }[] {
      const goals = new Map<string, number>();
      target.forEach(p => goals.set(p.text, (goals.get(p.text) ?? 0) + p.weight));
      // First payload of a session: no fade
      if (this.smoothedPrompts.size === 0) { goals.forEach((w, t) => this.smoothedPrompts.set(t, w)); return target; }
      const out: { text: string; weight: number }[] = [];
      let moving = false;
      new Set([...goals.keys(), ...this.smoothedPrompts.keys()]).forEach(text => {
          const goal = goals.get(text) ?? 0;
          const cur = this.smoothedPrompts.get(text) ?? 0;
          let next = cur + (goal - cur) * 0.4;
          if (Math.abs(goal - next) < 0.06) next = goal;
          if (next !== goal) moving = true;
          if (next < 0.05 && goal === 0) { this.smoothedPrompts.delete(text); return; }
          this.smoothedPrompts.set(text, next);
          out.push({ text, weight: Math.round(next * 100) / 100 });
      });
      if (this.crossfadeTimer) clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = moving ? window.setTimeout(() => { this.crossfadeTimer = null; this.refreshSessionPrompts(); }, 350) : null;
      return out;
  }

  private lastConfig: any = null;
  private lastPrompts: any = null;

  // --- Self-arranging live performance (DJ off) ---
  /** Turn off to keep the live prompts fixed while the DJ is off. */
  public autoArrange = true;
  private autoArrangeTimer: number | null = null;
  private autoArrangeKey = '';
  private barSeconds(): number {
      const [num, den] = this.meter.split('/').map(n => parseInt(n, 10));
      const quarters = (num > 0 && den > 0 ? num : 4) * (4 / (num > 0 && den > 0 ? den : 4));
      return quarters * 60 / Math.max(40, this.bpm);
  }
  /** Where the live performance is in its story right now, or null when the DJ conducts or the song is not being generated. */
  private autoArrangement(): { section: ArcSection; phraseCue: string; key: string } | null {
      // Ambient is one slow continuous evolution: no verse/chorus-style arc
      if (!this.autoArrange || this.conductorMode || this.playbackState !== 'recording' || this.genre === 'Ambient') return null;
      const total = Math.max(30, this.maxDurationMinutes * 60);
      const p = Math.max(0, Math.min(1, this.elapsedSeconds / total));
      const arc = isTraditionalGenre(this.genre) ? FOLK_ARC : MODERN_ARC;
      const idx = arc.findIndex(sec => p < sec.until);
      const section = arc[idx < 0 ? arc.length - 1 : idx];
      const phraseSec = Math.max(8, Math.min(30, this.barSeconds() * AUTO_PHRASE_BARS));
      const phrase = Math.floor(this.elapsedSeconds / phraseSec);
      return { section, phraseCue: PHRASE_CUES[phrase % PHRASE_CUES.length], key: `${section.name}/${phrase % PHRASE_CUES.length}` };
  }
  /** Runs while recording: when the section or the phrase changes, the prompts are refreshed (and cross-faded). */
  private syncAutoArrange() {
      const run = this.playbackState === 'recording' && this.autoArrange && !this.conductorMode;
      if (!run) {
          if (this.autoArrangeTimer) { clearInterval(this.autoArrangeTimer); this.autoArrangeTimer = null; }
          this.autoArrangeKey = '';
          return;
      }
      if (this.autoArrangeTimer) return;
      this.autoArrangeTimer = window.setInterval(() => {
          const a = this.autoArrangement();
          if (!a) { this.syncAutoArrange(); return; }
          if (a.key !== this.autoArrangeKey) { this.autoArrangeKey = a.key; this.scheduleRefresh(); }
      }, 1000);
  }

  private async refreshSessionPrompts() {
    if (!this.session) return;
    
    // 1. Set Native API Config
    const config: any = {
        musicGenerationMode: this.generationMode,
        bpm: Math.max(60, Math.min(200, Math.round(this.bpm))), // API range 60-200
        guidance: this.effectiveGuidance(),
        temperature: this.temperature,
    };
    // The Density and Brightness knobs drive the real Lyria parameters (0..1, live, no context reset)
    const knobValue = (name: string): number | undefined => {
        for (const p of this.prompts.values()) if (p.text.trim().toLowerCase() === name && p.weight > 0.01) return Math.round(Math.min(1, p.weight / 2) * 100) / 100;
        return undefined;
    };
    const arrangement = this.autoArrangement();
    const density = knobValue('density');
    if (density !== undefined) config.density = density;
    else if (arrangement) config.density = Math.round(Math.max(0.15, Math.min(0.9, 0.5 + arrangement.section.density)) * 100) / 100;
    const brightness = knobValue('brightness'); if (brightness !== undefined) config.brightness = brightness;
    // Variation widens the token sampling pool (topK 1..1000): more varied playing without touching the prompts
    const variation = knobValue('variation');
    if (variation !== undefined) config.topK = Math.round(LYRIA_TOPK_DEFAULT + variation * (LYRIA_TOPK_KNOB_MAX - LYRIA_TOPK_DEFAULT));
    // A repeatable take: the same seed with the same prompts gives a similar performance
    if (this.currentSeed !== null) config.seed = this.currentSeed;
    // Lyria renders one stereo mix (no separate stems), but it can drop the bass and the drums on request:
    // a bass or drum channel that is switched off is really muted, not just left out of the prompt.
    const isOn = (k: ChannelKey) => { const c = this.instruments[k]; return c.active && c.visible !== false && c.weight > 0.05; };
    config.muteBass = !isOn('bass') && /bass|tuba/i.test(this.instruments.bass.instrument);
    const playingNow = (['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const).filter(isOn);
    // Rhythm-only sections (bass and/or drums, nothing else) use Lyria's dedicated mode
    config.onlyBassAndDrums = playingNow.length > 0 && playingNow.every(k => k === 'bass' || k === 'rhythm')
        && playingNow.every(k => k === 'bass' ? /bass|tuba/i.test(this.instruments.bass.instrument) : /drum|percussion|kit|tabla|djembe|conga|bongo|timbale|taiko|shaker|tambourine|snare|cajon/i.test(this.instruments.rhythm.instrument));
    config.muteDrums = !isOn('rhythm') && /drum|percussion|kit|tabla|djembe|conga|bongo|timbale|taiko|shaker|tambourine|snare|cajon/i.test(this.instruments.rhythm.instrument);
    
    // Lyria's scales are the 12 major/minor pairs. Ragas and maqam-based music is not diatonic, so forcing one of these
    // fights the melody (it sounds "wrong"); the model is left to find its own mode unless the user locked a key.
    const scale = scaleForKey(this.key);
    if (scale && (this.toolbarLocks.key || !NON_DIATONIC_GENRES.includes(this.genre))) config.scale = scale;

    if (JSON.stringify(config) !== JSON.stringify(this.lastConfig)) {
        const prev = this.lastConfig;
        try {
            await this.session.setMusicGenerationConfig({ musicGenerationConfig: config });
            this.lastConfig = config;
            // Tell the UI what Lyria really has now (not just what we intended)
            this.dispatchEvent(new CustomEvent('config-applied', { detail: config }));
            // Lyria only picks up a new BPM or scale after a context reset; the generation mode is not documented
            // as switchable mid-stream, so it gets the same treatment.
            if (prev && (prev.bpm !== config.bpm || prev.scale !== config.scale || prev.musicGenerationMode !== config.musicGenerationMode)) {
                this.scheduleContextReset();
            }
        } catch (e) {
            console.error("setMusicGenerationConfig failed:", e);
            this.dispatchEvent(new CustomEvent('config-failed', { detail: e instanceof Error ? e.message : String(e) }));
        }
    }

    // 2. Prompts. Lyria reads short tags, not sentences, and only the proportions of the weights count. Strength order:
    //    genre + style > instrument list > singer (voice mode) > each channel > mood, melody, tempo > knobs.
    //    Only what plays is named: no "no drums, no synths" negatives (naming an instrument invites it) and no genre
    //    colour text that lists other instruments. Lyrics are never quoted (Lyria RealTime cannot sing given words).
    const playingKeys = this.playingChannelKeys();
    const voiceKeys = playingKeys.filter(k => isVocalInstrument(this.instruments[k].instrument));
    const voiceLed = voiceKeys.length > 0;

    const styleTag = !this.style || this.style.toLowerCase().includes(this.genre.toLowerCase()) ? (this.style || this.genre) : `${this.style}, ${this.genre}`;
    const finalPayload: { text: string; weight: number }[] = [{ text: styleTag, weight: GENRE_PROMPT_WEIGHT }];
    fidelityTags(this.genre, this.style).forEach((tag, i) => finalPayload.push({ text: tag, weight: i === 0 ? 2.0 : 1.5 }));
    finalPayload.push({ text: `${this.key}, ${this.bpm} BPM, ${this.meter} time`, weight: 0.8 });
    if (this.mood && this.mood !== 'None') finalPayload.push({ text: moodPhrase(this.mood), weight: 1.2 });

    // The exact ensemble on the channels (solo, duet, trio, quartet or band), always, so no other instruments join in
    const currentStage = this.conductorMode ? this.currentPlan?.[this.currentPlanIdx] : undefined;
    const ensemble = this.describeEnsemble(playingKeys, currentStage?.featured ?? null, voiceLed);
    if (ensemble) finalPayload.push({ text: ensemble, weight: ENSEMBLE_PROMPT_WEIGHT });
    else if (this.genreReference) finalPayload.push({ text: this.genreReference, weight: 1.0 }); // nothing on the channels: the dice's genre colour

    if (voiceLed) {
        // Voice mode with a voice on stage: the singer leads, the instruments accompany
        voiceKeys.forEach(k => {
            const ch = this.instruments[k];
            finalPayload.push({ text: `${this.voicePrompt(ch.instrument)}, ${this.voiceIntensityPhrase()}`, weight: ch.weight * VOICE_PROMPT_WEIGHT });
        });
        finalPayload.push({ text: 'clear sung lead melody, catchy vocal hook', weight: 1.5 });
        if (this.lyricsPrompt) finalPayload.push({ text: this.lyricsPrompt, weight: 1.4 });
        const regional = this.regionalVocalStyle();
        if (regional) finalPayload.push({ text: regional, weight: 1.0 });
        if (this.currentVocalSignal) finalPayload.push({ text: `Vocal direction: ${this.currentVocalSignal}`, weight: 1.0 });
    } else {
        if (playingKeys.some(k => MELODIC_CHANNELS.includes(k))) finalPayload.push({ text: 'clear memorable melody', weight: 1.0 });
        finalPayload.push({ text: 'instrumental', weight: 0.8 });
    }

    // One prompt per instrument channel with its role in the music
    playingKeys.filter(k => !voiceKeys.includes(k)).forEach((k) => {
        const ch = this.instruments[k];
        const melodic = MELODIC_CHANNELS.includes(k);
        const isFeatured = !voiceLed && currentStage?.featured === k && melodic && playingKeys.length > 1;
        const role = isFeatured ? 'lead melody, featured' : voiceLed && melodic ? 'accompaniment' : this.channelRole(k);
        finalPayload.push({ text: `${ch.instrument} ${role}`, weight: ch.weight * CHANNEL_PROMPT_WEIGHT[k] * (voiceLed ? ACCOMPANIMENT_SCALE : 1) });
    });

    if (arrangement) {
        finalPayload.push({ text: arrangement.section.cue, weight: 1.0 });
        finalPayload.push({ text: arrangement.phraseCue, weight: 0.5 });
    }
    if (this.evolutionValue > 0) finalPayload.push({ text: 'progressive, evolving arrangement', weight: 0.6 });
    else if (this.evolutionValue < 0) finalPayload.push({ text: 'steady, minimal arrangement', weight: 0.6 });
    finalPayload.push({ text: 'high fidelity studio recording, clean balanced mix', weight: 0.6 });

    // Knobs colour the playing but never outweigh genre or instruments
    // (Density, Brightness, Variation and Guidance are sent as real config values, not as text)
    Array.from(this.prompts.values())
        .filter(p => !['density', 'brightness', 'guidance', 'variation'].includes(p.text.trim().toLowerCase()))
        .map(p => ({ text: this.knobPhrase(p.text), weight: p.weight * KNOB_PROMPT_SCALE }))
        .filter(p => p.weight > 0.05)
        .forEach(p => finalPayload.push(p));

    const fadedPayload = this.crossfade(this.guard.apply(finalPayload));
    if (JSON.stringify(fadedPayload) !== JSON.stringify(this.lastPrompts)) {
        try { await this.session.setWeightedPrompts({ weightedPrompts: fadedPayload }); this.lastPrompts = fadedPayload; this.dispatchEvent(new CustomEvent('prompts-sent', { detail: { prompts: fadedPayload, guidance: config.guidance } })); } catch (e) { console.error("setWeightedPrompts failed:", e); }
    }
  }
  /** Channels that play right now (voices only in the voice master mode, minus muted solo voices or choir). */
  private playingChannelKeys(): ChannelKey[] {
      return (['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const).filter((k) => {
          const ch = this.instruments[k];
          if (!ch.active || ch.visible === false || ch.weight <= 0.05 || !ch.instrument) return false;
          if (!isVocalInstrument(ch.instrument)) return true;
          if (!this.voiceMode) return false;
          return ch.instrument.toLowerCase().includes('choir') || !this.soloMuted;
      });
  }

  private knobPhrase(knobText: string): string {
      const key = knobText.trim().toLowerCase();
      // Locked instruments: "traditional {genre}" pulls in the genre's typical instruments, so ask for the playing style only
      if (key === 'authenticity' && this.instrumentsLocked) return `authentic ${this.style} phrasing`;
      const phrase = KNOB_PHRASES[key];
      if (!phrase) return knobText;
      return phrase.replace('{genre}', this.genre).replace('{style}', this.style);
  }

  /** Short name of a voice inside the instrument list (the singer itself is described in its own prompt). */
  private static voiceTag(instrument: string): string {
      const n = instrument.toLowerCase();
      if (n.includes('rapper') || n.includes('mc ')) return 'rap vocals';
      if (n.includes('quartet')) return 'vocal quartet';
      if (n.includes('duet')) return 'vocal duet';
      if (/choir|chant|cappella|ensemble|coral/.test(n)) return instrument.toLowerCase().includes('choir') ? instrument : `${instrument} choir`;
      return 'lead vocals';
  }

  /** The exact line-up as one tag: "trio of Piano, Upright Bass and Drum Kit only". Positive wording only. */
  private describeEnsemble(playingKeys: ChannelKey[], featured: ChannelKey | null, voiceLed: boolean): string | null {
      const names = playingKeys.map(k => this.instruments[k].instrument).filter(Boolean).map(n => isVocalInstrument(n) ? LiveMusicHelper.voiceTag(n) : n);
      if (names.length === 0) return null;
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
      const lead = !voiceLed && featured && playingKeys.includes(featured) && MELODIC_CHANNELS.includes(featured) ? this.instruments[featured].instrument : null;
      const leadHint = lead && names.length > 1 ? `, ${lead} carries the melody` : '';
      const size = ['', 'solo', 'duet of', 'trio of', 'quartet of'][names.length] ?? 'ensemble of';
      return names.length === 1 ? `solo ${list}, unaccompanied` : `${size} ${list} only${leadHint}`;
  }

  public toggleSolo(active: boolean) { this.soloMuted = !active; this.scheduleRefresh(); }

  public isVocalInstrumentActive(): boolean {
      return Object.values(this.instruments).some(ch => {
          if (!ch.active || ch.visible === false || !ch.instrument) return false;
          
          const inst = ch.instrument.toLowerCase();
          const isChoir = inst.includes('choir');
          
          if (!isChoir && this.soloMuted && isVocalInstrument(inst)) return false; // Simple heuristic for solo
          
          return isVocalInstrument(ch.instrument);
      });
  }


  /**
   * Dice roll: instead of clearing the knobs, set them to what the genre and style on the main bar call for.
   * Guidance and the real Lyria config knobs (Density, Brightness, Variation) get the genre default; the genre's
   * signature knobs (same choice the DJ makes for a "main" section) get their genre value; the rest sit at the
   * minimum position (0: first light off).
   */
  public applyGenreKnobs() {
      const profile = this.genreProfile();
      const styleAdj = LiveMusicHelper.STYLE_KNOB_ADJUST[this.style] || {};
      const clamp = (v: number) => Math.max(0, Math.min(2, v));
      const target = new Map<string, number>();
      for (const knob of ['Guidance', 'Density', 'Brightness', 'Variation']) {
          const def = profile[knob]?.[2];
          if (def !== undefined) target.set(knob, clamp(def + (styleAdj[knob] || 0)));
      }
      this.getKnobTargetsForStage('main').forEach(t => target.set(t.parameterName, clamp(t.targetValue)));
      this.prompts.forEach(p => {
          const w = target.get(p.text) ?? 0;
          p.weight = w;
          p.volume = w / 2;
      });
      this.dispatchEvent(new CustomEvent('conductor-knobs-update', { detail: this.prompts }));
      this.scheduleRefresh();
  }

  private getNarrativeStructure(genre: string): { name: string, type: string, durationPct: number }[] {
      const templates: { name: string, type: string, durationPct: number }[][] = [];
      
      const isClassical = ['Classic', 'Cinematic', 'Spiritual', 'Victorian', 'Renascentist', 'Ambient', 'Oriental', 'Marching'].includes(genre);
      const isJazz = ['Jazz', 'Blues'].includes(genre);
      const isWestern = ['Western', 'Hawaiian'].includes(genre);
      
      // --- Classical / Traditional / Cinematic / Marching ---
      if (isClassical) {
          if (genre === 'Marching') {
               // 1. Parade Approach (Drum Intro)
               templates.push([
                   { name: "Percussion Roll-off", type: 'percussion', durationPct: 0.15 },
                   { name: "Woodwinds/High Brass", type: 'duet', durationPct: 0.2 },
                   { name: "Full Band Inspection", type: 'climax', durationPct: 0.3 },
                   { name: "Drum Break", type: 'percussion', durationPct: 0.15 },
                   { name: "Final Pass", type: 'climax', durationPct: 0.2 }
               ]);
               // 2. Fanfare Approach (Brass Call)
               templates.push([
                   { name: "Trumpet Call", type: 'solo', durationPct: 0.15 },
                   { name: "Brass Response", type: 'build', durationPct: 0.15 },
                   { name: "Regimental March", type: 'main', durationPct: 0.4 },
                   { name: "Victory Flourish", type: 'climax', durationPct: 0.3 }
               ]);
               // 3. Full Attack
               templates.push([
                   { name: "Attention!", type: 'climax', durationPct: 0.1 },
                   { name: "The March", type: 'main', durationPct: 0.4 },
                   { name: "Sectional Feature", type: 'duet', durationPct: 0.2 },
                   { name: "Grand Review", type: 'climax', durationPct: 0.3 }
               ]);
          } else {
              // 1. The Arc (Standard)
              templates.push([
                  { name: "Overture", type: 'intro', durationPct: 0.15 },
                  { name: "Main Theme (Intimate)", type: 'duet', durationPct: 0.20 },
                  { name: "Development", type: 'main', durationPct: 0.25 },
                  { name: "Dramatic Tension", type: 'build', durationPct: 0.15 },
                  { name: "Finale", type: 'climax', durationPct: 0.25 }
              ]);
              // 2. The Concerto (Solo Focus)
              templates.push([
                  { name: "Solo Introduction", type: 'solo', durationPct: 0.2 },
                  { name: "Orchestral Response", type: 'main', durationPct: 0.2 },
                  { name: "Dialogue", type: 'duet', durationPct: 0.2 },
                  { name: "Virtuoso Cadenza", type: 'solo', durationPct: 0.15 },
                  { name: "Tutti Finale", type: 'climax', durationPct: 0.25 }
              ]);
              // 3. In Media Res (Full Start)
              templates.push([
                  { name: "Impact Start", type: 'climax', durationPct: 0.15 },
                  { name: "Receding Tide", type: 'breakdown', durationPct: 0.2 },
                  { name: "Rebuilding", type: 'build', durationPct: 0.25 },
                  { name: "Theme Return", type: 'main', durationPct: 0.4 }
              ]);
              // 4. Slow Burn (Ambient/Spiritual)
              templates.push([
                  { name: "Drone/Atmosphere", type: 'intro', durationPct: 0.25 },
                  { name: "Whispers", type: 'duet', durationPct: 0.25 },
                  { name: "Awakening", type: 'main', durationPct: 0.25 },
                  { name: "Ascension", type: 'climax', durationPct: 0.25 }
              ]);
          }
      } 
      // --- Western / Hawaiian ---
      else if (isWestern) {
          // 1. Cowboy Ballad (Slow, storytelling)
          templates.push([
              { name: "Lonesome Intro", type: 'intro', durationPct: 0.15 },
              { name: "Campfire Verse", type: 'main', durationPct: 0.25 },
              { name: "Trail Ride", type: 'groove', durationPct: 0.2 },
              { name: "Sunset Chorus", type: 'climax', durationPct: 0.25 },
              { name: "Fade to Prairie", type: 'outro', durationPct: 0.15 }
          ]);
          // 2. Bluegrass Hoedown (Fast, energetic)
          templates.push([
              { name: "Banjo Pickin'", type: 'intro', durationPct: 0.1 },
              { name: "Fiddle Tune", type: 'main', durationPct: 0.25 },
              { name: "Barn Dance", type: 'groove', durationPct: 0.25 },
              { name: "Hoedown Finale", type: 'climax', durationPct: 0.25 },
              { name: "Goodnight Y'all", type: 'outro', durationPct: 0.15 }
          ]);
          // 3. Spaghetti Western (Cinematic, dramatic)
          templates.push([
              { name: "Desert Wind", type: 'intro', durationPct: 0.2 },
              { name: "Gunfighter's Theme", type: 'main', durationPct: 0.25 },
              { name: "Showdown at Noon", type: 'build', durationPct: 0.2 },
              { name: "Final Duel", type: 'climax', durationPct: 0.25 },
              { name: "Ride into Sunset", type: 'outro', durationPct: 0.1 }
          ]);
      }
      // --- Jazz / Blues ---
      else if (isJazz) {
          // 1. Standard Jazz Form
          templates.push([
              { name: "Intro", type: 'intro', durationPct: 0.1 },
              { name: "Head", type: 'main', durationPct: 0.2 },
              { name: "Solo 1", type: 'solo', durationPct: 0.2 },
              { name: "Solo 2 (Rhythm Section)", type: 'trio', durationPct: 0.2 },
              { name: "Head Out", type: 'climax', durationPct: 0.3 }
          ]);
          // 2. Trading Fours
          templates.push([
              { name: "Rhythm Start", type: 'groove', durationPct: 0.15 },
              { name: "Head", type: 'main', durationPct: 0.25 },
              { name: "Call & Response", type: 'duet', durationPct: 0.25 },
              { name: "Collective Improv", type: 'climax', durationPct: 0.2 },
              { name: "Cool Down", type: 'outro', durationPct: 0.15 }
          ]);
          // 3. Ballad (Feature)
          templates.push([
              { name: "Rubato Intro", type: 'solo', durationPct: 0.15 },
              { name: "Ballad Theme", type: 'duet', durationPct: 0.35 },
              { name: "Double Time Feel", type: 'main', durationPct: 0.3 },
              { name: "Outro", type: 'outro', durationPct: 0.2 }
          ]);
      } 
      // --- Pop / Rock / Electronic / Others ---
      else {
          // 1. Verse-Chorus Standard
          templates.push([
              { name: "Intro", type: 'intro', durationPct: 0.1 },
              { name: "Verse 1", type: 'verse', durationPct: 0.15 },
              { name: "Chorus", type: 'chorus', durationPct: 0.15 },
              { name: "Verse 2", type: 'verse', durationPct: 0.15 },
              { name: "Bridge", type: 'breakdown', durationPct: 0.15 },
              { name: "Chorus Out", type: 'climax', durationPct: 0.3 }
          ]);
          // 2. The Build-Up (Electronic style)
          templates.push([
              { name: "Atmosphere", type: 'intro', durationPct: 0.15 },
              { name: "The Pulse", type: 'groove', durationPct: 0.2 },
              { name: "The Rise", type: 'build', durationPct: 0.2 },
              { name: "THE DROP", type: 'climax', durationPct: 0.3 },
              { name: "Outro", type: 'outro', durationPct: 0.15 }
          ]);
          // 3. Instrumental Breakdown
          templates.push([
              { name: "Riff Intro", type: 'main', durationPct: 0.15 },
              { name: "Jam Section", type: 'main', durationPct: 0.25 },
              { name: "Solo Feature", type: 'solo', durationPct: 0.2 },
              { name: "Drum/Bass Break", type: 'percussion', durationPct: 0.15 },
              { name: "Final Push", type: 'climax', durationPct: 0.25 }
          ]);
      }

      // Random selection
      return templates[Math.floor(Math.random() * templates.length)];
  }

  public generatePerformancePlan() {
      this.currentPlan = [];
      const totalSec = this.maxDurationMinutes * 60;
      
      // Get all available keys based on visibility (user preferences in RightSidebar)
      const availableKeys = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'].filter(k =>
          this.instruments[k as keyof InstrumentSet].visible !== false && !!this.instruments[k as keyof InstrumentSet].instrument
      ) as Array<keyof InstrumentSet>;
      // A DJ personality can bench channels; ignore that if it would leave nobody on stage
      const personalityKeys = this.djPersonality ? availableKeys.filter(k => this.djPersonality!.channels[k] !== false) : availableKeys;
      if (personalityKeys.length > 0 && personalityKeys.length < availableKeys.length) availableKeys.splice(0, availableKeys.length, ...personalityKeys);

      this.currentPlanIdx = 0;
      if (availableKeys.length === 0) return;

      // --- STORY GENERATION MODE ---
      
      // 1. Get Narrative Structure (Randomized based on Genre)
      // The DJ's arranging habits reshape it (solo turns, dialogs, breaks, openings, endings)
      const story = applyArrangingHabits(this.getNarrativeStructure(this.genre), this.djPersonality?.arranging, !this.songHasVoices, this.djPersonality?.habits ?? 80);

      // 2. Build Stages
      let currentTime = 0;
      story.forEach(seg => {
          // Normalize duration to avoid rounding gaps, though addStage handles timing
          const dur = seg.durationPct * totalSec;
          this.addStage(currentTime, seg.name, availableKeys, seg.type);
          if (seg.cue) this.currentPlan[this.currentPlan.length - 1].cue = seg.cue;
          currentTime += dur;
      });
      
      this.currentPlanIdx = 0;
  }

  // === GENRE KNOB DATABANK ===
  // Musical instruction profiles for each genre — defines appropriate knob ranges
  // Format: { knob: [min, max, default] } — DJ interpolates within these bounds
  private static readonly GENRE_KNOB_PROFILES: Record<string, Record<string, [number, number, number]>> = {
      'Jazz': {
          'Guidance': [0.8, 1.5, 1.2], 'Authenticity': [0.8, 1.5, 1.0], 'Organic': [0.8, 1.5, 1.2],
          'Dynamics': [0.6, 1.4, 1.0], 'Presence': [0.6, 1.2, 0.9], 'Space': [0.4, 1.0, 0.7],
          'Width': [0.3, 0.8, 0.5], 'Brightness': [0.3, 0.8, 0.5], 'Texture': [0.3, 0.8, 0.5],
          'Atmosphere': [0.4, 1.0, 0.6], 'Groove': [0.8, 1.5, 1.2], 'Complexity': [0.5, 1.2, 0.8],
          'Ornamentation': [0.3, 0.9, 0.6], 'Variation': [0.2, 0.8, 0.4], 'Density': [0.2, 0.7, 0.4],
          'Attack': [0.1, 0.5, 0.3], 'Staccato': [0.0, 0.4, 0.2], 'Glide': [0.2, 0.8, 0.5]
      },
      'Blues': {
          'Guidance': [0.8, 1.5, 1.2], 'Authenticity': [1.0, 1.8, 1.4], 'Organic': [1.0, 1.6, 1.3],
          'Dynamics': [0.7, 1.4, 1.0], 'Presence': [0.7, 1.3, 1.0], 'Space': [0.5, 1.1, 0.8],
          'Width': [0.3, 0.7, 0.5], 'Brightness': [0.2, 0.6, 0.4], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.5, 1.0, 0.7], 'Groove': [0.9, 1.5, 1.2], 'Complexity': [0.3, 0.8, 0.5],
          'Ornamentation': [0.4, 1.0, 0.7], 'Variation': [0.2, 0.6, 0.4], 'Density': [0.2, 0.6, 0.4],
          'Attack': [0.2, 0.6, 0.4], 'Staccato': [0.0, 0.3, 0.1], 'Glide': [0.3, 0.9, 0.6]
      },
      'Western': {
          'Guidance': [0.9, 1.6, 1.3], 'Authenticity': [1.2, 1.8, 1.5], 'Organic': [1.0, 1.6, 1.4],
          'Dynamics': [0.5, 1.2, 0.8], 'Presence': [0.6, 1.2, 0.9], 'Space': [0.8, 1.5, 1.2],
          'Width': [0.4, 0.9, 0.6], 'Brightness': [0.3, 0.7, 0.5], 'Texture': [0.2, 0.6, 0.4],
          'Atmosphere': [0.6, 1.2, 0.9], 'Groove': [0.5, 1.0, 0.7], 'Complexity': [0.2, 0.6, 0.4],
          'Ornamentation': [0.3, 0.8, 0.5], 'Variation': [0.2, 0.6, 0.4], 'Density': [0.1, 0.5, 0.3],
          'Attack': [0.1, 0.4, 0.2], 'Staccato': [0.0, 0.3, 0.1], 'Glide': [0.4, 1.0, 0.7]
      },
      'Hawaiian': {
          'Guidance': [0.9, 1.6, 1.3], 'Authenticity': [1.2, 1.8, 1.5], 'Organic': [1.0, 1.6, 1.4],
          'Dynamics': [0.4, 1.0, 0.7], 'Presence': [0.5, 1.1, 0.8], 'Space': [0.9, 1.5, 1.2],
          'Width': [0.4, 0.9, 0.6], 'Brightness': [0.4, 0.8, 0.6], 'Texture': [0.2, 0.5, 0.3],
          'Atmosphere': [0.7, 1.3, 1.0], 'Groove': [0.4, 0.9, 0.6], 'Complexity': [0.1, 0.5, 0.3],
          'Ornamentation': [0.2, 0.6, 0.4], 'Variation': [0.1, 0.5, 0.3], 'Density': [0.1, 0.4, 0.2],
          'Attack': [0.0, 0.3, 0.1], 'Staccato': [0.0, 0.2, 0.1], 'Glide': [0.5, 1.1, 0.8]
      },
      'Electronic': {
          'Guidance': [0.8, 1.4, 1.1], 'Authenticity': [0.3, 0.8, 0.5], 'Organic': [0.2, 0.6, 0.4],
          'Dynamics': [0.8, 1.5, 1.2], 'Presence': [0.7, 1.4, 1.0], 'Space': [0.3, 0.8, 0.5],
          'Width': [0.5, 1.2, 0.8], 'Brightness': [0.5, 1.2, 0.8], 'Texture': [0.6, 1.3, 0.9],
          'Atmosphere': [0.4, 1.0, 0.7], 'Groove': [0.8, 1.5, 1.2], 'Complexity': [0.4, 1.0, 0.7],
          'Ornamentation': [0.2, 0.7, 0.4], 'Variation': [0.4, 1.0, 0.7], 'Density': [0.6, 1.3, 1.0],
          'Attack': [0.5, 1.2, 0.8], 'Staccato': [0.3, 0.9, 0.6], 'Glide': [0.2, 0.7, 0.4]
      },
      'Gaming': {
          'Guidance': [0.8, 1.4, 1.1], 'Authenticity': [0.4, 0.9, 0.6], 'Organic': [0.3, 0.7, 0.5],
          'Dynamics': [0.9, 1.6, 1.3], 'Presence': [0.8, 1.5, 1.1], 'Space': [0.4, 0.9, 0.6],
          'Width': [0.6, 1.3, 0.9], 'Brightness': [0.5, 1.1, 0.8], 'Texture': [0.5, 1.2, 0.8],
          'Atmosphere': [0.5, 1.1, 0.8], 'Groove': [0.7, 1.4, 1.0], 'Complexity': [0.5, 1.1, 0.8],
          'Ornamentation': [0.3, 0.8, 0.5], 'Variation': [0.5, 1.1, 0.8], 'Density': [0.5, 1.2, 0.9],
          'Attack': [0.6, 1.3, 0.9], 'Staccato': [0.4, 1.0, 0.7], 'Glide': [0.3, 0.8, 0.5]
      },
      'Rock': {
          'Guidance': [0.9, 1.5, 1.2], 'Authenticity': [0.6, 1.2, 0.9], 'Organic': [0.5, 1.1, 0.8],
          'Dynamics': [1.0, 1.6, 1.3], 'Presence': [0.9, 1.5, 1.2], 'Space': [0.3, 0.7, 0.5],
          'Width': [0.6, 1.2, 0.9], 'Brightness': [0.6, 1.2, 0.9], 'Texture': [0.5, 1.0, 0.7],
          'Atmosphere': [0.3, 0.8, 0.5], 'Groove': [0.7, 1.3, 1.0], 'Complexity': [0.4, 0.9, 0.6],
          'Ornamentation': [0.3, 0.7, 0.5], 'Variation': [0.3, 0.8, 0.5], 'Density': [0.6, 1.2, 0.9],
          'Attack': [0.7, 1.4, 1.0], 'Staccato': [0.4, 0.9, 0.6], 'Glide': [0.1, 0.5, 0.3]
      },
      'Hip Hop': {
          'Guidance': [0.9, 1.5, 1.2], 'Authenticity': [0.6, 1.1, 0.8], 'Organic': [0.3, 0.8, 0.5],
          'Dynamics': [0.8, 1.4, 1.1], 'Presence': [0.9, 1.5, 1.2], 'Space': [0.3, 0.8, 0.5],
          'Width': [0.4, 0.9, 0.6], 'Brightness': [0.3, 0.8, 0.5], 'Texture': [0.5, 1.0, 0.7],
          'Atmosphere': [0.3, 0.8, 0.5], 'Groove': [1.1, 1.7, 1.4], 'Complexity': [0.3, 0.8, 0.5],
          'Ornamentation': [0.2, 0.6, 0.4], 'Variation': [0.4, 0.9, 0.6], 'Density': [0.4, 0.9, 0.6],
          'Attack': [0.8, 1.4, 1.1], 'Staccato': [0.5, 1.0, 0.7], 'Glide': [0.1, 0.5, 0.3]
      },
      'Pop': {
          'Guidance': [0.9, 1.5, 1.2], 'Authenticity': [0.5, 1.0, 0.7], 'Organic': [0.4, 0.9, 0.6],
          'Dynamics': [0.8, 1.4, 1.1], 'Presence': [0.8, 1.4, 1.1], 'Space': [0.4, 0.8, 0.6],
          'Width': [0.5, 1.1, 0.8], 'Brightness': [0.6, 1.2, 0.9], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.4, 0.9, 0.6], 'Groove': [0.8, 1.4, 1.1], 'Complexity': [0.3, 0.8, 0.5],
          'Ornamentation': [0.3, 0.7, 0.5], 'Variation': [0.4, 0.9, 0.6], 'Density': [0.5, 1.0, 0.7],
          'Attack': [0.5, 1.0, 0.7], 'Staccato': [0.3, 0.7, 0.5], 'Glide': [0.3, 0.7, 0.5]
      },
      'Classic': {
          'Guidance': [1.0, 1.8, 1.4], 'Authenticity': [1.4, 2.0, 1.7], 'Organic': [1.2, 1.8, 1.5],
          'Dynamics': [0.6, 1.4, 1.0], 'Presence': [0.7, 1.3, 1.0], 'Space': [0.8, 1.5, 1.2],
          'Width': [0.7, 1.4, 1.0], 'Brightness': [0.4, 0.9, 0.6], 'Texture': [0.5, 1.0, 0.7],
          'Atmosphere': [0.7, 1.4, 1.0], 'Groove': [0.3, 0.8, 0.5], 'Complexity': [0.6, 1.3, 0.9],
          'Ornamentation': [0.5, 1.1, 0.8], 'Variation': [0.3, 0.8, 0.5], 'Density': [0.3, 0.8, 0.5],
          'Attack': [0.2, 0.6, 0.4], 'Staccato': [0.2, 0.6, 0.4], 'Glide': [0.5, 1.1, 0.8]
      },
      'Opera': {
          'Guidance': [1.1, 1.8, 1.5], 'Authenticity': [1.5, 2.0, 1.8], 'Organic': [1.3, 1.8, 1.6],
          'Dynamics': [0.8, 1.6, 1.2], 'Presence': [0.9, 1.5, 1.2], 'Space': [0.9, 1.6, 1.3],
          'Width': [0.8, 1.5, 1.1], 'Brightness': [0.5, 1.0, 0.7], 'Texture': [0.6, 1.1, 0.8],
          'Atmosphere': [0.8, 1.5, 1.1], 'Groove': [0.2, 0.6, 0.4], 'Complexity': [0.7, 1.4, 1.0],
          'Ornamentation': [0.6, 1.2, 0.9], 'Variation': [0.4, 0.9, 0.6], 'Density': [0.4, 0.9, 0.6],
          'Attack': [0.3, 0.7, 0.5], 'Staccato': [0.2, 0.6, 0.4], 'Glide': [0.6, 1.2, 0.9]
      },
      'Marching': {
          'Guidance': [1.0, 1.7, 1.4], 'Authenticity': [1.3, 1.9, 1.6], 'Organic': [0.8, 1.4, 1.1],
          'Dynamics': [0.9, 1.6, 1.3], 'Presence': [1.0, 1.6, 1.3], 'Space': [0.5, 1.0, 0.7],
          'Width': [0.8, 1.4, 1.1], 'Brightness': [0.6, 1.1, 0.8], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.4, 0.9, 0.6], 'Groove': [0.8, 1.4, 1.1], 'Complexity': [0.4, 0.9, 0.6],
          'Ornamentation': [0.3, 0.8, 0.5], 'Variation': [0.2, 0.6, 0.4], 'Density': [0.6, 1.2, 0.9],
          'Attack': [0.7, 1.3, 1.0], 'Staccato': [0.6, 1.2, 0.9], 'Glide': [0.1, 0.4, 0.2]
      },
      'Ambient': {
          'Guidance': [0.8, 1.4, 1.1], 'Authenticity': [0.9, 1.6, 1.3], 'Organic': [1.0, 1.7, 1.4],
          'Dynamics': [0.3, 0.9, 0.6], 'Presence': [0.4, 1.0, 0.7], 'Space': [1.0, 1.8, 1.5],
          'Width': [0.7, 1.4, 1.0], 'Brightness': [0.2, 0.6, 0.4], 'Texture': [0.6, 1.2, 0.9],
          'Atmosphere': [0.9, 1.6, 1.3], 'Groove': [0.1, 0.5, 0.3], 'Complexity': [0.3, 0.8, 0.5],
          'Ornamentation': [0.2, 0.6, 0.4], 'Variation': [0.3, 0.8, 0.5], 'Density': [0.1, 0.5, 0.3],
          'Attack': [0.0, 0.3, 0.1], 'Staccato': [0.0, 0.2, 0.1], 'Glide': [0.7, 1.4, 1.0]
      },
      'Spiritual': {
          'Guidance': [1.0, 1.7, 1.4], 'Authenticity': [1.4, 2.0, 1.7], 'Organic': [1.2, 1.8, 1.5],
          'Dynamics': [0.4, 1.0, 0.7], 'Presence': [0.6, 1.2, 0.9], 'Space': [1.0, 1.7, 1.4],
          'Width': [0.6, 1.2, 0.9], 'Brightness': [0.3, 0.7, 0.5], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.9, 1.6, 1.3], 'Groove': [0.2, 0.6, 0.4], 'Complexity': [0.4, 0.9, 0.6],
          'Ornamentation': [0.4, 0.9, 0.6], 'Variation': [0.2, 0.6, 0.4], 'Density': [0.2, 0.6, 0.4],
          'Attack': [0.1, 0.4, 0.2], 'Staccato': [0.0, 0.3, 0.1], 'Glide': [0.6, 1.2, 0.9]
      },
      'African': {
          'Guidance': [0.9, 1.6, 1.3], 'Authenticity': [1.2, 1.8, 1.5], 'Organic': [1.1, 1.7, 1.4],
          'Dynamics': [0.7, 1.4, 1.0], 'Presence': [0.7, 1.3, 1.0], 'Space': [0.6, 1.2, 0.9],
          'Width': [0.4, 0.9, 0.6], 'Brightness': [0.5, 1.0, 0.7], 'Texture': [0.5, 1.0, 0.7],
          'Atmosphere': [0.6, 1.2, 0.9], 'Groove': [1.0, 1.6, 1.3], 'Complexity': [0.5, 1.0, 0.7],
          'Ornamentation': [0.4, 0.9, 0.6], 'Variation': [0.4, 0.9, 0.6], 'Density': [0.4, 0.9, 0.6],
          'Attack': [0.4, 0.9, 0.6], 'Staccato': [0.3, 0.8, 0.5], 'Glide': [0.3, 0.8, 0.5]
      },
      'Indian': {
          'Guidance': [1.0, 1.7, 1.4], 'Authenticity': [1.3, 1.9, 1.6], 'Organic': [1.1, 1.7, 1.4],
          'Dynamics': [0.5, 1.1, 0.8], 'Presence': [0.7, 1.3, 1.0], 'Space': [0.7, 1.4, 1.0],
          'Width': [0.5, 1.0, 0.7], 'Brightness': [0.4, 0.9, 0.6], 'Texture': [0.5, 1.0, 0.7],
          'Atmosphere': [0.7, 1.3, 1.0], 'Groove': [0.6, 1.2, 0.9], 'Complexity': [0.6, 1.2, 0.9],
          'Ornamentation': [0.6, 1.2, 0.9], 'Variation': [0.4, 0.9, 0.6], 'Density': [0.3, 0.7, 0.5],
          'Attack': [0.2, 0.6, 0.4], 'Staccato': [0.1, 0.5, 0.3], 'Glide': [0.5, 1.1, 0.8]
      },
      'Irish': {
          'Guidance': [0.9, 1.6, 1.3], 'Authenticity': [1.2, 1.8, 1.5], 'Organic': [1.1, 1.7, 1.4],
          'Dynamics': [0.6, 1.3, 0.9], 'Presence': [0.7, 1.3, 1.0], 'Space': [0.7, 1.3, 1.0],
          'Width': [0.4, 0.9, 0.6], 'Brightness': [0.5, 1.0, 0.7], 'Texture': [0.3, 0.8, 0.5],
          'Atmosphere': [0.6, 1.2, 0.9], 'Groove': [0.7, 1.3, 1.0], 'Complexity': [0.4, 0.9, 0.6],
          'Ornamentation': [0.5, 1.0, 0.7], 'Variation': [0.3, 0.8, 0.5], 'Density': [0.3, 0.7, 0.5],
          'Attack': [0.3, 0.7, 0.5], 'Staccato': [0.2, 0.6, 0.4], 'Glide': [0.4, 0.9, 0.6]
      },
      'Spanish': {
          'Guidance': [0.9, 1.6, 1.3], 'Authenticity': [1.2, 1.8, 1.5], 'Organic': [1.0, 1.6, 1.3],
          'Dynamics': [0.7, 1.4, 1.0], 'Presence': [0.8, 1.4, 1.1], 'Space': [0.6, 1.2, 0.9],
          'Width': [0.5, 1.0, 0.7], 'Brightness': [0.5, 1.0, 0.7], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.6, 1.2, 0.9], 'Groove': [0.8, 1.4, 1.1], 'Complexity': [0.5, 1.0, 0.7],
          'Ornamentation': [0.5, 1.0, 0.7], 'Variation': [0.4, 0.9, 0.6], 'Density': [0.4, 0.8, 0.6],
          'Attack': [0.4, 0.9, 0.6], 'Staccato': [0.3, 0.8, 0.5], 'Glide': [0.4, 0.9, 0.6]
      },
      'Oriental': {
          'Guidance': [1.0, 1.7, 1.4], 'Authenticity': [1.3, 1.9, 1.6], 'Organic': [1.1, 1.7, 1.4],
          'Dynamics': [0.4, 1.0, 0.7], 'Presence': [0.6, 1.2, 0.9], 'Space': [0.8, 1.5, 1.2],
          'Width': [0.5, 1.0, 0.7], 'Brightness': [0.3, 0.8, 0.5], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.8, 1.4, 1.1], 'Groove': [0.4, 0.9, 0.6], 'Complexity': [0.5, 1.0, 0.7],
          'Ornamentation': [0.5, 1.0, 0.7], 'Variation': [0.3, 0.7, 0.5], 'Density': [0.2, 0.6, 0.4],
          'Attack': [0.1, 0.5, 0.3], 'Staccato': [0.1, 0.4, 0.2], 'Glide': [0.6, 1.2, 0.9]
      },
      'Romanian': {
          'Guidance': [0.9, 1.6, 1.3], 'Authenticity': [1.2, 1.8, 1.5], 'Organic': [1.1, 1.7, 1.4],
          'Dynamics': [0.6, 1.3, 0.9], 'Presence': [0.7, 1.3, 1.0], 'Space': [0.7, 1.3, 1.0],
          'Width': [0.4, 0.9, 0.6], 'Brightness': [0.4, 0.9, 0.6], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.6, 1.2, 0.9], 'Groove': [0.7, 1.3, 1.0], 'Complexity': [0.5, 1.0, 0.7],
          'Ornamentation': [0.5, 1.0, 0.7], 'Variation': [0.4, 0.9, 0.6], 'Density': [0.3, 0.7, 0.5],
          'Attack': [0.3, 0.7, 0.5], 'Staccato': [0.2, 0.6, 0.4], 'Glide': [0.4, 0.9, 0.6]
      },
      'European': {
          'Guidance': [0.9, 1.6, 1.3], 'Authenticity': [1.2, 1.8, 1.5], 'Organic': [1.1, 1.7, 1.4],
          'Dynamics': [0.6, 1.3, 0.9], 'Presence': [0.7, 1.3, 1.0], 'Space': [0.7, 1.3, 1.0],
          'Width': [0.4, 0.9, 0.6], 'Brightness': [0.4, 0.9, 0.6], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.6, 1.2, 0.9], 'Groove': [0.7, 1.3, 1.0], 'Complexity': [0.5, 1.0, 0.7],
          'Ornamentation': [0.5, 1.0, 0.7], 'Variation': [0.4, 0.9, 0.6], 'Density': [0.3, 0.7, 0.5],
          'Attack': [0.3, 0.7, 0.5], 'Staccato': [0.2, 0.6, 0.4], 'Glide': [0.4, 0.9, 0.6]
      },
      'Victorian': {
          'Guidance': [1.0, 1.7, 1.4], 'Authenticity': [1.3, 1.9, 1.6], 'Organic': [1.0, 1.6, 1.3],
          'Dynamics': [0.6, 1.3, 0.9], 'Presence': [0.7, 1.3, 1.0], 'Space': [0.8, 1.4, 1.1],
          'Width': [0.6, 1.2, 0.9], 'Brightness': [0.4, 0.9, 0.6], 'Texture': [0.5, 1.0, 0.7],
          'Atmosphere': [0.7, 1.3, 1.0], 'Groove': [0.4, 0.9, 0.6], 'Complexity': [0.5, 1.0, 0.7],
          'Ornamentation': [0.5, 1.0, 0.7], 'Variation': [0.3, 0.7, 0.5], 'Density': [0.3, 0.7, 0.5],
          'Attack': [0.2, 0.6, 0.4], 'Staccato': [0.2, 0.6, 0.4], 'Glide': [0.5, 1.0, 0.7]
      },
      'Renascentist': {
          'Guidance': [1.0, 1.7, 1.4], 'Authenticity': [1.4, 2.0, 1.7], 'Organic': [1.1, 1.7, 1.4],
          'Dynamics': [0.5, 1.1, 0.8], 'Presence': [0.6, 1.2, 0.9], 'Space': [0.9, 1.5, 1.2],
          'Width': [0.5, 1.0, 0.7], 'Brightness': [0.4, 0.8, 0.6], 'Texture': [0.4, 0.9, 0.6],
          'Atmosphere': [0.8, 1.4, 1.1], 'Groove': [0.3, 0.7, 0.5], 'Complexity': [0.5, 1.0, 0.7],
          'Ornamentation': [0.5, 1.0, 0.7], 'Variation': [0.2, 0.6, 0.4], 'Density': [0.2, 0.6, 0.4],
          'Attack': [0.1, 0.5, 0.3], 'Staccato': [0.1, 0.4, 0.2], 'Glide': [0.5, 1.1, 0.8]
      }
  };

  // Style adjustments — the genre profile is the base, the style on the main bar shifts it (added to the genre default,
  // and widening the genre's min/max by the same amount). Styles not listed use the genre profile unchanged.
  private static readonly STYLE_KNOB_ADJUST: Record<string, Record<string, number>> = {
      // Jazz
      'Acid Jazz': { Groove: +0.3, Texture: +0.2, Brightness: +0.2 }, 'Jazz Fusion': { Complexity: +0.4, Density: +0.3, Dynamics: +0.2 },
      'Bebop': { Complexity: +0.4, Staccato: +0.3, Variation: +0.3, Density: +0.2 }, 'Cool Jazz': { Space: +0.3, Dynamics: -0.3, Brightness: -0.2 },
      'Smooth Jazz': { Density: -0.1, Glide: +0.2, Dynamics: -0.2, Brightness: +0.1 },
      // Blues
      'Delta Blues': { Authenticity: +0.2, Density: -0.1, Glide: +0.2 }, 'Chicago Blues': { Presence: +0.2, Groove: +0.2 },
      'Texas Blues': { Attack: +0.2, Presence: +0.2 }, 'Blues Rock': { Dynamics: +0.3, Attack: +0.3, Density: +0.2 }, 'Soul Blues': { Groove: +0.2, Glide: +0.2, Organic: +0.1 },
      // Electronic
      'Techno': { Groove: +0.3, Density: +0.2, Organic: -0.1 }, 'Drum & Bass': { Density: +0.3, Attack: +0.3, Staccato: +0.2, Groove: +0.2 },
      'Vaporwave': { Space: +0.3, Glide: +0.3, Attack: -0.2, Density: -0.2 }, 'Deep House': { Groove: +0.2, Atmosphere: +0.2, Attack: -0.1 },
      'Synthwave': { Brightness: +0.2, Atmosphere: +0.3, Width: +0.2 },
      // Rock
      'Classic Rock': { Authenticity: +0.2, Organic: +0.2 }, 'Shoegaze': { Texture: +0.4, Space: +0.3, Atmosphere: +0.3, Attack: -0.3, Brightness: -0.2 },
      'Heavy Metal': { Dynamics: +0.3, Attack: +0.3, Density: +0.3, Brightness: -0.1, Glide: -0.1 }, 'Indie Rock': { Texture: +0.1, Organic: +0.2 },
      // Pop / Hip Hop
      'Synth-Pop': { Brightness: +0.2, Organic: -0.2 }, 'Disco Pop': { Groove: +0.3, Brightness: +0.2 }, 'K-Pop': { Dynamics: +0.2, Complexity: +0.2, Variation: +0.2 },
      'Indie Pop': { Organic: +0.3, Density: -0.1 }, 'Pop Rock': { Dynamics: +0.2, Attack: +0.2 },
      'Boom Bap': { Groove: +0.2, Texture: +0.2, Organic: +0.2 }, 'Trap': { Attack: +0.3, Staccato: +0.3, Space: +0.2 }, 'Lo-Fi Hip Hop': { Texture: +0.3, Dynamics: -0.3, Brightness: -0.2, Space: +0.2 },
      'Drill': { Attack: +0.2, Staccato: +0.3, Atmosphere: +0.2 }, 'Cloud Rap': { Space: +0.4, Atmosphere: +0.4, Attack: -0.3 }, 'Jazz Rap': { Organic: +0.3, Complexity: +0.2 },
      // Ambient
      'Dark Ambient': { Atmosphere: +0.2, Brightness: -0.2, Texture: +0.2 }, 'Deep Space': { Space: +0.3, Width: +0.2 }, 'Cinematic': { Dynamics: +0.4, Width: +0.3, Presence: +0.2 },
      'Industrial Decay': { Texture: +0.4, Attack: +0.2, Organic: -0.3 }, 'Nature Soundscape': { Organic: +0.3, Texture: +0.1 }, 'Lofi Chill': { Dynamics: -0.1, Texture: +0.2 },
      // Gaming
      '8-Bit Retro': { Organic: -0.3, Staccato: +0.3, Brightness: +0.2 }, 'Epic Boss': { Dynamics: +0.3, Density: +0.2, Presence: +0.2 },
      'Stealth': { Dynamics: -0.4, Density: -0.3, Space: +0.2 }, 'Survival Horror': { Atmosphere: +0.3, Brightness: -0.3, Dynamics: -0.1 }, 'Cozy Simulation': { Dynamics: -0.3, Brightness: +0.1, Organic: +0.2 },
      'Racing Arcade': { Groove: +0.2, Attack: +0.2, Density: +0.2 },
      // Classical / early
      'Baroque': { Ornamentation: +0.3, Complexity: +0.2, Staccato: +0.1 }, 'Romantic': { Dynamics: +0.2, Glide: +0.2 }, 'Impressionist': { Atmosphere: +0.3, Texture: +0.2 },
      'Minimalist Classical': { Density: -0.2, Variation: -0.2, Space: +0.2 }, 'Viennese Waltz': { Groove: +0.2, Glide: +0.1 }, 'Cathedral': { Space: +0.3, Atmosphere: +0.2 },
      'Tudor Dance': { Groove: +0.3, Staccato: +0.2 }, 'Village Festival': { Groove: +0.3, Brightness: +0.2 },
      // Spiritual
      'Gregorian Chant': { Space: +0.3, Density: -0.2, Dynamics: -0.2 }, 'Byzantine Chant': { Glide: +0.2, Space: +0.2 }, 'Gospel': { Dynamics: +0.4, Groove: +0.3, Presence: +0.2 },
      'Zen Meditation': { Space: +0.3, Density: -0.3, Dynamics: -0.3 }, 'Shamanic Pulse': { Groove: +0.3, Atmosphere: +0.2 },
      // Regional
      'Afrobeats': { Groove: +0.2, Brightness: +0.2 }, 'Bhangra': { Groove: +0.4, Attack: +0.3, Dynamics: +0.3 }, 'Carnatic': { Ornamentation: +0.3, Complexity: +0.2 },
      'Hindustani': { Glide: +0.2, Ornamentation: +0.2 }, 'Bollywood': { Dynamics: +0.3, Width: +0.2, Brightness: +0.2 }, 'Tabla Solo/Raga': { Density: -0.1, Ornamentation: +0.3 },
      'Jig': { Groove: +0.3, Staccato: +0.2, Dynamics: +0.2 }, 'Reel': { Groove: +0.3, Attack: +0.2, Dynamics: +0.3 }, 'Air': { Space: +0.3, Dynamics: -0.3, Glide: +0.2, Groove: -0.3 },
      'Celtic Folk': { Atmosphere: +0.2, Organic: +0.2 }, 'Celtic Punk/Rock': { Dynamics: +0.4, Attack: +0.4, Density: +0.3, Organic: -0.3 },
      'Salsa': { Groove: +0.4, Dynamics: +0.3, Density: +0.2 }, 'Bossa Nova': { Dynamics: -0.3, Staccato: +0.1, Space: +0.2 }, 'Tango': { Staccato: +0.2, Dynamics: +0.2, Ornamentation: +0.2 },
      'Reggaeton': { Groove: +0.4, Attack: +0.2, Organic: -0.3 }, 'Flamenco': { Attack: +0.3, Ornamentation: +0.3, Dynamics: +0.3 }, 'Bolero': { Dynamics: -0.2, Glide: +0.2 }, 'Paso Doble': { Dynamics: +0.3, Staccato: +0.3 },
      'Manele': { Ornamentation: +0.3, Groove: +0.3, Brightness: +0.2 }, 'Russian Folk': { Ornamentation: +0.2, Dynamics: +0.2, Glide: +0.1 }, 'French Musette': { Groove: +0.2, Staccato: +0.2, Brightness: +0.1 }, 'Tarantella': { Groove: +0.3, Attack: +0.2, Staccato: +0.2 }, 'Neapolitan Song': { Glide: +0.3, Space: +0.2, Groove: -0.2 }, 'Korean Folk': { Ornamentation: +0.3, Glide: +0.3, Space: +0.2 },
      'Doina': { Space: +0.4, Groove: -0.4, Ornamentation: +0.3, Glide: +0.2, Dynamics: -0.2 },
      'Hora': { Groove: +0.3, Dynamics: +0.2 }, 'Sârbă': { Groove: +0.3, Staccato: +0.3, Attack: +0.2 }, 'Colinde': { Space: +0.2, Atmosphere: +0.2, Groove: -0.2 },
      'Bluegrass': { Attack: +0.3, Staccato: +0.2, Density: +0.3, Groove: +0.2 }, 'Honky Tonk': { Groove: +0.2, Attack: +0.2 }, 'Spaghetti Western': { Space: +0.3, Atmosphere: +0.3, Dynamics: +0.2 },
      'Cowboy Ballad': { Dynamics: -0.2, Space: +0.2, Groove: -0.2 }, 'Rockabilly': { Groove: +0.3, Attack: +0.3, Staccato: +0.2 },
      'Slack Key Guitar': { Glide: +0.2, Dynamics: -0.1 }, 'Traditional Hula': { Groove: +0.2, Authenticity: +0.1 }, 'Island Reggae': { Groove: +0.4, Space: +0.1, Dynamics: -0.1 },
      'Military Fanfare': { Attack: +0.3, Staccato: +0.2, Dynamics: +0.3 }, 'Ceremonial': { Dynamics: -0.2, Space: +0.2 },
      // Styles added later: each moves the genre profile toward what makes the style itself
      'R&B': { Groove: +0.2, Glide: +0.3, Space: +0.2, Attack: -0.2, Dynamics: -0.1, Brightness: -0.1 },
      'Freestyle Rap': { Groove: +0.2, Presence: +0.3, Variation: +0.2, Density: -0.1 }, 'Old School': { Groove: +0.2, Organic: +0.2, Brightness: +0.1 },
      'G-Funk': { Groove: +0.3, Glide: +0.3, Space: +0.2, Attack: -0.2 }, 'Conscious Rap': { Organic: +0.3, Presence: +0.2, Complexity: +0.2, Attack: -0.1 },
      'Arctic Tundra': { Space: +0.3, Brightness: -0.2, Atmosphere: +0.2, Density: -0.1 }, 'Solar Wind': { Brightness: +0.3, Width: +0.3, Atmosphere: +0.2 },
      'Deep Forest': { Organic: +0.3, Texture: +0.3, Space: +0.1 }, 'Australian Desert': { Space: +0.3, Organic: +0.2, Density: -0.2 },
      'African Jungle': { Organic: +0.3, Texture: +0.3, Groove: +0.3, Density: +0.2 }, 'Vast Ocean': { Width: +0.4, Space: +0.3, Glide: +0.3, Dynamics: +0.1 },
      'RPG Adventure': { Dynamics: +0.2, Complexity: +0.2, Authenticity: +0.1, Organic: +0.2 }, 'Cyberpunk': { Brightness: +0.2, Texture: +0.3, Organic: -0.3, Attack: +0.2 },
      'Dungeon Crawler': { Atmosphere: +0.3, Brightness: -0.3, Dynamics: -0.1, Space: +0.2 }, 'Platformer Bounce': { Staccato: +0.4, Groove: +0.3, Brightness: +0.3, Attack: +0.2 },
      'Victory Theme': { Dynamics: +0.3, Brightness: +0.3, Width: +0.2, Attack: +0.2 },
      'Modern Classical': { Space: +0.3, Texture: +0.3, Complexity: +0.2, Density: -0.1 }, 'Opera/Dramatic': { Dynamics: +0.3, Glide: +0.2, Presence: +0.2 },
      'Baroque Opera': { Ornamentation: +0.4, Staccato: +0.2, Complexity: +0.2, Dynamics: -0.1 }, 'Romantic Opera': { Dynamics: +0.3, Glide: +0.3, Width: +0.2 },
      'Contemporary Opera': { Complexity: +0.4, Texture: +0.3, Brightness: +0.1, Authenticity: -0.2 },
      'Royal Court': { Staccato: +0.1, Dynamics: +0.1, Brightness: +0.2, Space: +0.1 }, 'Minstrel Ballad': { Presence: +0.3, Organic: +0.2, Density: -0.2, Dynamics: -0.1 },
      'Gothic Horror': { Brightness: -0.3, Atmosphere: +0.4, Dynamics: +0.2, Space: +0.2 }, 'Parlour Waltz': { Glide: +0.2, Groove: +0.2, Dynamics: -0.1 },
      'Steampunk Factory': { Attack: +0.3, Staccato: +0.3, Density: +0.3, Texture: +0.3, Groove: +0.2 }, 'Industrial Revolution': { Attack: +0.3, Groove: +0.3, Density: +0.2, Texture: +0.2 },
      'Detective Mystery': { Space: +0.3, Atmosphere: +0.3, Brightness: -0.2, Dynamics: -0.1 },
      'New Age Healing': { Space: +0.3, Density: -0.2, Dynamics: -0.3, Glide: +0.2, Atmosphere: +0.3 }, 'Christmas Carols': { Brightness: +0.3, Dynamics: +0.1, Organic: +0.1, Groove: +0.1 },
      'Malian Blues': { Glide: +0.3, Groove: +0.3, Ornamentation: +0.2, Organic: +0.2 }, 'Highlife': { Groove: +0.3, Brightness: +0.3, Staccato: +0.2 },
      'Desert Rock': { Glide: +0.2, Attack: +0.2, Dynamics: +0.2, Groove: +0.2, Space: +0.1 }, 'Marabi/Soweto': { Groove: +0.3, Dynamics: +0.1, Staccato: +0.1, Presence: +0.1 },
      'Folk': { Organic: +0.3, Presence: +0.2, Density: -0.2, Dynamics: -0.1 }, 'Guitar': { Presence: +0.3, Ornamentation: +0.2, Density: -0.2, Organic: +0.2 },
      'Arabic Classical': { Ornamentation: +0.4, Glide: +0.4, Complexity: +0.2, Density: -0.1 }, 'Japanese Folk': { Space: +0.3, Density: -0.3, Dynamics: -0.2, Staccato: +0.1 },
      'Chinese Traditional': { Glide: +0.2, Ornamentation: +0.2, Space: +0.2, Brightness: +0.1 }, 'Turkish Folk': { Ornamentation: +0.3, Groove: +0.3, Glide: +0.2 },
      'Balinese Gamelan': { Brightness: +0.3, Groove: +0.3, Texture: +0.3, Density: +0.2, Glide: -0.2 },
      'Lautareasca': { Ornamentation: +0.4, Glide: +0.3, Dynamics: +0.2, Presence: +0.2 }, 'Bănățeană': { Groove: +0.2, Staccato: +0.1, Brightness: +0.1 },
      'Geampara': { Groove: +0.3, Attack: +0.2, Staccato: +0.2, Dynamics: +0.2 }, 'Invârtită': { Groove: +0.4, Attack: +0.3, Staccato: +0.2, Dynamics: +0.2 },
      'Etno-Dance': { Groove: +0.3, Organic: -0.3, Brightness: +0.2, Density: +0.2 }, 'Plugușorul': { Groove: +0.3, Attack: +0.3, Dynamics: +0.2, Staccato: +0.2, Space: -0.2 },
      'Country': { Groove: +0.2, Brightness: +0.2, Density: +0.1, Organic: +0.1 }, 'Americana': { Organic: +0.2, Space: +0.2, Dynamics: -0.1 },
      'Outlaw Country': { Attack: +0.2, Dynamics: +0.2, Brightness: -0.2, Authenticity: +0.1 }, 'Alt-Country': { Texture: +0.2, Dynamics: +0.2, Organic: +0.1 },
      'Texas Swing': { Groove: +0.3, Staccato: +0.2, Density: +0.2, Complexity: +0.2 }, 'Folk Revival': { Presence: +0.3, Organic: +0.3, Density: -0.2 },
      'Western Swing': { Groove: +0.3, Staccato: +0.2, Density: +0.2, Complexity: +0.3, Brightness: +0.1 }
  };

  // Stage modifiers — how much to adjust from the genre default for each stage type
  private static readonly STAGE_MODIFIERS: Record<string, Record<string, number>> = {
      'intro':      { 'Density': -0.3, 'Dynamics': -0.3, 'Space': +0.3, 'Atmosphere': +0.3, 'Brightness': -0.2, 'Attack': -0.2 },
      'percussion': { 'Groove': +0.5, 'Attack': +0.4, 'Density': +0.3, 'Dynamics': +0.3, 'Staccato': +0.3 },
      'verse':      { 'Groove': +0.2, 'Dynamics': +0.1, 'Presence': +0.1, 'Density': +0.1, 'Variation': +0.1 },
      'main':       { 'Groove': +0.2, 'Dynamics': +0.1, 'Presence': +0.1, 'Density': +0.1, 'Variation': +0.1 },
      'chorus':     { 'Dynamics': +0.5, 'Width': +0.4, 'Brightness': +0.3, 'Density': +0.3, 'Presence': +0.4, 'Attack': +0.3, 'Atmosphere': +0.2 },
      'climax':     { 'Dynamics': +0.5, 'Width': +0.4, 'Brightness': +0.3, 'Density': +0.3, 'Presence': +0.4, 'Attack': +0.3, 'Atmosphere': +0.2 },
      'build':      { 'Dynamics': +0.3, 'Density': +0.2, 'Atmosphere': +0.3, 'Variation': +0.2, 'Presence': +0.2 },
      'solo':       { 'Presence': +0.5, 'Ornamentation': +0.4, 'Dynamics': +0.3, 'Space': -0.1, 'Authenticity': +0.3, 'Organic': +0.3 },
      'duet':       { 'Presence': +0.3, 'Space': +0.2, 'Dynamics': +0.2, 'Organic': +0.2, 'Authenticity': +0.2 },
      'trio':       { 'Groove': +0.3, 'Presence': +0.2, 'Organic': +0.2, 'Ornamentation': +0.1 },
      'breakdown':  { 'Density': -0.4, 'Space': +0.4, 'Atmosphere': +0.4, 'Dynamics': -0.3, 'Brightness': -0.3, 'Attack': -0.3 },
      'groove':     { 'Groove': +0.5, 'Density': +0.3, 'Attack': +0.2, 'Dynamics': +0.2, 'Staccato': +0.2 },
      'outro':      { 'Space': +0.5, 'Atmosphere': +0.5, 'Dynamics': -0.4, 'Density': -0.4, 'Brightness': -0.3, 'Glide': +0.3 }
  };

  // DJ knob choice for a stage: up to 2 genre "anchor" knobs (the genre's signature, kept across stages so the
  // DJ stays in genre) plus stage "flavor" knobs, never more than the genre's knob limit and never a contradictory pair.
  // Every knob not returned here is driven to 0 while the DJ is in control.
  private getKnobTargetsForStage(type: string): { parameterName: string; targetValue: number }[] {
      const profile = this.genreProfile();
      const stageMod = LiveMusicHelper.STAGE_MODIFIERS[type] || {};

      // Genre default + stage modifier, always inside the genre's own min/max (the genre range is the ceiling);
      // solo sections may override the genre maximum (up to the knob's full scale)
      const override = isGenreOverrideStage(type);
      // The style on the main bar shifts the genre profile: its default and its limits move together
      const styleAdj = LiveMusicHelper.STYLE_KNOB_ADJUST[this.style] || {};
      const valueOf = (knob: string) => {
          const [min, max, defaultVal] = profile[knob];
          const adj = styleAdj[knob] || 0;
          const lo = Math.max(0, min + Math.min(0, adj));
          const hi = Math.min(2, max + Math.max(0, adj));
          return Math.max(lo, Math.min(override ? 2 : hi, defaultVal + adj + (stageMod[knob] || 0) + djKnobBias(this.djPersonality, knob)));
      };
      const conflicts = (a: string, b: string) =>
          CONFLICTING_KNOBS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

      const knobLimit = getDjKnobLimit(this.genre, this.djPersonality?.maxKnobs);
      const chosen: string[] = [];
      const tryAdd = (knob: string) => {
          if (chosen.length >= knobLimit || chosen.includes(knob) || !profile[knob]) return;
          if (chosen.some(c => conflicts(c, knob))) return;
          if (valueOf(knob) < 0.3) return; // A knob the genre barely allows is not worth a slot
          chosen.push(knob);
      };

      // 1. Genre anchors: the two highest genre defaults ('Guidance' is generic, not a musical colour)
      Object.entries(profile)
          .filter(([knob]) => knob !== 'Guidance')
          .sort((a, b) => (b[1][2] + (styleAdj[b[0]] || 0) + djKnobBias(this.djPersonality, b[0])) - (a[1][2] + (styleAdj[a[0]] || 0) + djKnobBias(this.djPersonality, a[0])))
          .slice(0, 2)
          .forEach(([knob]) => tryAdd(knob));

      // 2. Stage flavor: knobs this section boosts, strongest first, with a light shuffle between near-equals
      Object.entries(stageMod)
          .filter(([, mod]) => mod > 0)
          .map(([knob, mod]) => [knob, mod + Math.random() * 0.1] as [string, number])
          .sort((a, b) => b[1] - a[1])
          .forEach(([knob]) => tryAdd(knob));

      return chosen.map(parameterName => ({ parameterName, targetValue: valueOf(parameterName) }));
  }

  private addStage(time: number, name: string, availableKeys: Array<keyof InstrumentSet>, type: string) {
      const melodic = MELODIC_CHANNELS.filter(k => availableKeys.includes(k));
      const shuffled = <T>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);
      const isGrooveGenre = !['Classic', 'Cinematic', 'Spiritual', 'Victorian', 'Renascentist', 'Ambient', 'Oriental', 'Opera'].includes(this.genre);

      // Build a lineup of exactly `size` channels: preferred channels first (in order), then any other available one.
      // The first channel in the lineup is the featured voice.
      const lineupOf = (preferred: Array<ChannelKey | undefined>, size: number): ChannelKey[] => {
          const lineup: ChannelKey[] = [];
          [...preferred, ...availableKeys].forEach(k => {
              if (k && availableKeys.includes(k) && !lineup.includes(k) && lineup.length < size) lineup.push(k);
          });
          return lineup;
      };
      const melody = availableKeys.includes('lead') ? 'lead' : (availableKeys.includes('alto') ? 'alto' : melodic[0]);

      let lineup: ChannelKey[];
      switch (type) {
          case 'intro':
          case 'outro':
              // Sparse: one harmonic/melodic voice opens or closes the piece
              lineup = lineupOf(['harmonic', 'lead', 'alto'], 1);
              break;
          case 'percussion':
              lineup = lineupOf(['rhythm', 'bass'], 1);
              break;
          case 'solo':
              // True solo: one melodic instrument, unaccompanied
              lineup = lineupOf(shuffled(melodic), 1);
              break;
          case 'duet':
              // Two melodic voices in dialogue (random pairing for variety)
              lineup = lineupOf(shuffled(melodic), 2);
              break;
          case 'groove':
              // Rhythm section duet
              lineup = lineupOf(['bass', 'rhythm'], 2);
              break;
          case 'trio':
              // Soloist over a rhythm section (groove genres) or over harmony + bass (classical genres)
              lineup = lineupOf([shuffled(melodic)[0], 'bass', isGrooveGenre ? 'rhythm' : 'harmonic'], 3);
              break;
          case 'breakdown':
              // Drums and lead drop out: inner voices carry the bridge
              lineup = lineupOf(['alto', 'harmonic', 'bass'], 3);
              break;
          case 'verse':
          case 'main':
              // Quartet: one melody over harmony, bass and drums (avoids competing melodies)
              lineup = lineupOf([melody, 'harmonic', 'bass', 'rhythm'], 4);
              break;
          default:
              // chorus / climax / build: full band, lead melody on top
              lineup = lineupOf([melody], 5);
              break;
      }
      if (lineup.length === 0) lineup = [availableKeys[0]];

      const formation = (['solo', 'duet', 'trio', 'quartet', 'full'] as Formation[])[Math.min(lineup.length, 5) - 1];
      const featured = lineup[0];
      const stage: PerformancePlanStage = {
          stageName: name,
          stageStartTimeSec: time,
          activeChannels: { lead: false, alto: false, harmonic: false, bass: false, rhythm: false },
          channelWeights: { lead: 0, alto: 0, harmonic: 0, bass: 0, rhythm: 0 },
          targets: this.getKnobTargetsForStage(type),
          formation,
          featured,
          type
      };

      // Featured voice at full weight, supporting players slightly under it so the formation stays readable
      lineup.forEach(k => {
          stage.activeChannels[k] = true;
          stage.channelWeights[k] = k === featured ? 1.0 : FORMATION_SUPPORT_WEIGHT[formation];
      });

      const formationLabel = formation === 'solo'
          ? `${this.instruments[featured].instrument} Solo`
          : formation === 'full' ? 'Full Band' : formation.charAt(0).toUpperCase() + formation.slice(1);
      stage.stageName = `${name} · ${formationLabel}`;

      this.currentPlan.push(stage);
  }

  private startConductor() { if (this.conductorTimer) clearInterval(this.conductorTimer); if (!this.conductorMode) return; this.conductorTimer = window.setInterval(() => this.updateConductor(), 200); }
  public stopConductor() { 
      if (this.conductorTimer) { 
          clearInterval(this.conductorTimer); 
          this.conductorTimer = null; 
      } 
  }
  
  private updateConductor() {
      if (!this.conductorMode || (this.playbackState !== 'playing' && this.playbackState !== 'recording' && this.playbackState !== 'warmup' && this.playbackState !== 'preparing')) return;
      // A Lyria 3.5 song is finished audio: the DJ arranged it up front, there is nothing to conduct while it plays
      if (this.songTake && this.playbackState === 'playing') return;
      if (Date.now() - this.conductorActivationTime < 5000) return;
      
      const elapsed = this.elapsedSeconds;
      const nextStage = this.currentPlan?.[this.currentPlanIdx + 1];
      
      // Anticipation Messaging
      if (nextStage) {
          const timeToNext = nextStage.stageStartTimeSec - elapsed;
          if (timeToNext > 0 && timeToNext < 10) {
              let msg = "";
              if (timeToNext < 3) {
                  msg = `PREPARING ${nextStage.stageName.toUpperCase()}...`;
              } else {
                  msg = `NEXT: ${nextStage.stageName.toUpperCase()} IN ${Math.ceil(timeToNext)}S...`;
              }
              this.dispatchEvent(new CustomEvent('conductor-anticipation', { detail: { msg } }));
          }
      }

      if (nextStage && elapsed >= nextStage.stageStartTimeSec) {
          this.currentPlanIdx++;
          const currentStage = this.currentPlan[this.currentPlanIdx];
          this.currentStatusMessage = currentStage.stageName;

          this.synchronizeInstrumentsWithStage();

          this.dispatchEvent(new CustomEvent('conductor-stage-changed', { detail: { name: currentStage.stageName, isAi: false, type: currentStage.type, index: this.currentPlanIdx } }));
          this.interpolateParameters();
          this.scheduleRefresh();
      }
      this.interpolateParameters();
  }

  private synchronizeInstrumentsWithStage() {
      // Conductor STRICTLY controls weights and active state based on the Plan.
      // It does NOT change instrument strings.
      
      const currentStage = this.currentPlan[this.currentPlanIdx];
      if (!currentStage) return;

      let instrumentsModified = false;
      const currentSetup = { ...this.instruments };
      const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;

      const now = Date.now();
      channels.forEach(ch => {
          // If channel is not visible in manifest, ignore it
          if (currentSetup[ch].visible === false) return;
          // A channel you touched in the last 30 seconds stays as you left it
          if (now - (this.userInteractionCooldowns.get(ch) || 0) < USER_KNOB_HOLD_MS) return;

          const targetActive = currentStage.activeChannels[ch];
          
          if (currentSetup[ch].active !== targetActive) {
              currentSetup[ch].active = targetActive;
              instrumentsModified = true;
          }
      });

      if (instrumentsModified) {
          this.instruments = currentSetup;
          this.dispatchEvent(new CustomEvent('conductor-instruments-update', { detail: this.instruments }));
          this.scheduleRefresh();
      }
  }

  private interpolateParameters() {
      const currentTimeMs = Date.now();
      const currentStage = this.currentPlan?.[this.currentPlanIdx];
      if (!currentStage) return;

      // The DJ turns the Guidance knob to follow the section (eased in small steps: a jump makes the music change
      // abruptly). If you touched the knob, it is yours for the next 30 seconds.
      const guidanceKnob = Array.from(this.prompts.values()).find(isGuidanceKnob);
      if (guidanceKnob && currentTimeMs - (this.userInteractionCooldowns.get(guidanceKnob.promptId) || 0) >= USER_KNOB_HOLD_MS) {
          const targetWeight = this.djGuidanceTarget() / 3;
          const diff = targetWeight - guidanceKnob.weight;
          if (Math.abs(diff) > 0.005) {
              guidanceKnob.weight = Math.max(0, Math.min(2, guidanceKnob.weight + Math.sign(diff) * Math.min(Math.abs(diff), 0.04)));
              guidanceKnob.volume = guidanceKnob.weight / 2;
              this.dispatchEvent(new CustomEvent('conductor-knobs-update', { detail: this.prompts }));
              this.scheduleRefresh();
          }
      }

      // A channel you touched (instrument, weight, on/off) is also yours for 30 seconds
      const interactionCooldownMs = USER_KNOB_HOLD_MS;
      // Dynamic base step based on evolution. Higher evolution = faster cuts.
      const baseStep = 0.05 + (this.evolutionValue > 5 ? 0.05 : 0);
      // Warm-up: right after the DJ takes over the knobs move slowly, then the DJ settles into its normal pace
      const warmupSec = this.djPersonality?.warmup ?? 0;
      const warm = warmupSec > 0 ? Math.max(0.3, Math.min(1, 0.3 + 0.7 * ((currentTimeMs - this.conductorActivationTime) / 1000 / warmupSec))) : 1;
      const step = baseStep * (1.0 + (this.evolutionValue / 10.0)) * warm;
      // Knobs leaving the mix are pulled out faster so new ones can enter without breaking the knob cap
      const retireStep = Math.max(step, 0.15);

      const knobLimit = getDjKnobLimit(this.genre, this.djPersonality?.maxKnobs);
      const eagerness = this.djPersonality ? 0.5 + this.djPersonality.eagerness / 100 : 1;
      if (currentStage.targets) {
          // Knobs outside the stage's selection target 0, so at most knobLimit stay engaged
          // (knobs the user turned recently are theirs: the DJ neither moves nor counts them)
          const targets: Record<string, number> = {};
          currentStage.targets.forEach(t => { targets[t.parameterName] = t.targetValue; });
          const targetOf = (p: Prompt) => targets[p.text] ?? 0;

          const isEngaged = (p: Prompt) => p.weight > 0.01;
          // The Guidance knob is handled above (it follows the section), not as one of the DJ's musical knobs
          const isUserHeld = (p: Prompt) => currentTimeMs - (this.userInteractionCooldowns.get(p.promptId) || 0) < USER_KNOB_HOLD_MS;
          let engagedCount = 0;
          this.prompts.forEach(p => { if (isEngaged(p) && !isUserHeld(p) && !isGuidanceKnob(p)) engagedCount++; });

          const retiring: Prompt[] = [], adjusting: Prompt[] = [], entering: Prompt[] = [];
          this.prompts.forEach(p => {
              if (isUserHeld(p) || isGuidanceKnob(p)) return;
              const target = targetOf(p);
              if (Math.abs(target - p.weight) <= 0.01) return;
              if (target === 0) retiring.push(p);
              else if (isEngaged(p)) adjusting.push(p);
              else entering.push(p);
          });

          // Two hands: retire first, then adjust engaged knobs, and only then bring in new knobs while under the cap
          const hands: Prompt[] = [];
          for (const p of [...retiring, ...adjusting, ...entering]) {
              if (hands.length >= 2) break;
              if (entering.includes(p)) {
                  if (engagedCount >= knobLimit) continue;
                  engagedCount++;
              }
              hands.push(p);
          }

          hands.forEach(p => {
              const target = targetOf(p);
              const diff = target - p.weight;
              const move = Math.sign(diff) * Math.min(Math.abs(diff), (target === 0 ? retireStep : step) * eagerness);
              p.weight = Math.max(0, Math.min(2.0, p.weight + move));
              p.volume = p.weight / 2;
          });
          if (hands.length > 0) { this.dispatchEvent(new CustomEvent('conductor-knobs-update', { detail: this.prompts })); this.scheduleRefresh(); }
      }

      if (currentStage.channelWeights || currentStage.activeChannels) {
          let channelChanged = false;
          const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
          channels.forEach(ch => {
              const lastInteracted = this.userInteractionCooldowns.get(ch) || 0;
              if (currentTimeMs - lastInteracted < interactionCooldownMs) return;

              if (this.instruments[ch].visible === false) {
                  if (this.instruments[ch].active || this.instruments[ch].weight > 0) {
                      this.instruments[ch].active = false;
                      this.instruments[ch].weight = 0;
                      channelChanged = true;
                  }
                  return;
              }

              let targetWeight = currentStage.channelWeights?.[ch] ?? 1.0;
              // The DJ's voice intensity scales how loud the voice channels are
              if (targetWeight > 0 && isVocalInstrument(this.instruments[ch].instrument)) targetWeight *= 0.35 + 0.65 * this.voiceIntensity;
              const currentWeight = this.instruments[ch].weight;
              const weightDiff = targetWeight - currentWeight;
              
              if (Math.abs(weightDiff) > 0.005) {
                  // For DJ, if target is 0, cut faster
                  const cutBonus = (targetWeight === 0) ? 0.08 : 0;
                  const move = Math.sign(weightDiff) * Math.min(Math.abs(weightDiff), 0.05 + cutBonus); 
                  this.instruments[ch].weight = Math.max(0, Math.min(2.0, currentWeight + move));
                  channelChanged = true;
              }

              const targetActiveFromPlan = currentStage.activeChannels?.[ch];
              if (targetActiveFromPlan !== undefined && this.instruments[ch].active !== targetActiveFromPlan) {
                  this.instruments[ch].active = targetActiveFromPlan;
                  channelChanged = true;
              }
          });
          if (channelChanged) { 
              this.dispatchEvent(new CustomEvent('conductor-instruments-update', { detail: this.instruments })); 
              this.scheduleRefresh(); 
          }
      }
  }

  private startTimeTracking() {
    this.stopTimeTracking();
    if (this.loopWaitTimer) { clearTimeout(this.loopWaitTimer); this.loopWaitTimer = null; }
    this.playbackStartTime = performance.now();
    const startOffset = this.elapsedSeconds;
    let smoothedElapsed = startOffset;
    const tick = () => {
      if (this.playbackState === 'playing' || this.playbackState === 'recording' || this.playbackState === 'warmup' || this.playbackState === 'preparing') {
        const now = performance.now();
        const duration = (now - this.playbackStartTime) / 1000;
        const rawElapsed = startOffset + duration;

        // Exponential moving average to smooth out rAF timing jitter
        const alpha = 0.3;
        smoothedElapsed = smoothedElapsed + alpha * (rawElapsed - smoothedElapsed);
        // Snap to 1ms precision to eliminate sub-millisecond oscillation
        const nextElapsed = Math.round(smoothedElapsed * 1000) / 1000;

        if (this.playbackState === 'recording') {
            this.recordSnapshot(nextElapsed);
        } else if (this.playbackState === 'playing') {
            this.applySnapshot(nextElapsed);
        }

        if (this.playbackState === 'playing' && this.recordedDuration > 0) {
           if (nextElapsed >= this.recordedDuration) {
               this.pauseInternal();
               this.elapsedSeconds = this.recordedDuration; 
               if (this.isLooping) {
                   this.setPlaybackState('loop-waiting');
                   this.loopWaitTimer = window.setTimeout(() => { this.elapsedSeconds = 0; this.playRecording(0); }, 5000);
               } else this.stop();
               return; 
           }
        }
        this.elapsedSeconds = nextElapsed;
        this.updateGainWithFades();
        this.timeTrackingFrame = requestAnimationFrame(tick);
      }
    };
    this.timeTrackingFrame = requestAnimationFrame(tick);
  }

  private recordSnapshot(timestamp: number) {
      const snapshot: PlaybackSnapshot = {
          timestamp,
          promptWeights: new Map(),
          channelWeights: {
              lead: this.instruments.lead.weight,
              alto: this.instruments.alto.weight,
              harmonic: this.instruments.harmonic.weight,
              bass: this.instruments.bass.weight,
              rhythm: this.instruments.rhythm.weight,
          },
          channelActive: {
              lead: this.instruments.lead.active,
              alto: this.instruments.alto.active,
              harmonic: this.instruments.harmonic.active,
              bass: this.instruments.bass.active,
              rhythm: this.instruments.rhythm.active,
          },
          statusMessage: this.currentStatusMessage,
          isAiPhase: false
      };
      this.prompts.forEach((p, id) => snapshot.promptWeights.set(id, p.weight));
      this.automationLog.push(snapshot);
  }

  private applySnapshot(timestamp: number) {
      if (this.automationLog.length === 0) return;
      let low = 0; let high = this.automationLog.length - 1; let idx = 0;
      while (low <= high) {
          let mid = (low + high) >>> 1;
          if (this.automationLog[mid].timestamp < timestamp) { idx = mid; low = mid + 1; } 
          else { high = mid - 1; }
      }
      const snapshot = this.automationLog[idx];
      if (!snapshot) return;

      if (snapshot.statusMessage && snapshot.statusMessage !== this.lastAppliedStatusMessage) {
          this.lastAppliedStatusMessage = snapshot.statusMessage;
          this.dispatchEvent(new CustomEvent('conductor-stage-changed', { 
              detail: { name: snapshot.statusMessage, isAi: false } 
          }));
      }

      let promptsChanged = false;
      snapshot.promptWeights.forEach((weight, id) => {
          const p = this.prompts.get(id);
          if (p && Math.abs(p.weight - weight) > 0.001) {
              p.weight = weight; p.volume = weight / 2; promptsChanged = true;
          }
      });
      if (promptsChanged) this.dispatchEvent(new CustomEvent('conductor-knobs-update', { detail: this.prompts }));
      let instrumentsChanged = false;
      const channels = ['lead', 'alto', 'harmonic', 'bass', 'rhythm'] as const;
      channels.forEach(ch => {
          const targetWeight = snapshot.channelWeights[ch];
          const targetActive = snapshot.channelActive[ch];
          if (Math.abs(this.instruments[ch].weight - targetWeight) > 0.001 || this.instruments[ch].active !== targetActive) {
              this.instruments[ch].weight = targetWeight;
              this.instruments[ch].active = targetActive;
              instrumentsChanged = true;
          }
      });
      if (instrumentsChanged) this.dispatchEvent(new CustomEvent('conductor-instruments-update', { detail: this.instruments }));
  }

  private stopTimeTracking() { if (this.timeTrackingFrame) cancelAnimationFrame(this.timeTrackingFrame); this.timeTrackingFrame = null; }

  public async record() {
    await this.stop(true); 
    this.prepareSeed();
    this.segments = []; this.recordedAudioBlob = null; this.elapsedSeconds = 0;
    this.automationLog = [];
    this.songTake = false;
    this.dispatchEvent(new CustomEvent('recording-cleared'));
    this.audioContext.resume();
    this.currentStatusMessage = '';

    // Always use fallback/procedural routine for standalone conductor
    this.generatePerformancePlan();

    this.setPlaybackState('loading');
    
    await this.connect();

    if (this.conductorMode) {
      const d = this.maxDurationMinutes;
      const warmupTimeMs = Math.round(10000 + (d - 1) * (20000 / 54));
      const PREP_TRANSITION_MS = 5000;
      const totalPrepMs = warmupTimeMs + PREP_TRANSITION_MS;
      
      this.dispatchEvent(new CustomEvent('warmup-started', { detail: { durationMs: totalPrepMs, warmupMs: warmupTimeMs } }));
      this.setPlaybackState('warmup');
      
      // During warmup, ensure the first stage setup is applied immediately
      this.currentPlanIdx = 0;
      this.synchronizeInstrumentsWithStage();
      
      this.startConductor();
      this.startTimeTracking();

      await new Promise(resolve => setTimeout(resolve, warmupTimeMs));

      this.setPlaybackState('preparing');
      await new Promise(resolve => setTimeout(resolve, PREP_TRANSITION_MS));

      this.stopTimeTracking();
      this.elapsedSeconds = 0; 
      this.startMediaRecorder(); 
      this.updateRecordingSchedule(); 
      this.setPlaybackState('recording');
      this.startTimeTracking();
    } else {
      this.startMediaRecorder(); 
      this.updateRecordingSchedule(); 
      this.setPlaybackState('recording');
      this.startTimeTracking();
    }
  }

  private async connect(): Promise<LiveMusicSession> {
    // Ensure any stale session is closed before reconnecting
    if (this.session) {
        try { (this.session as any).close(); } catch(e) {}
        this.session = null;
    }
    
    this.sessionCounter++; const currentSessionId = this.sessionCounter;
    // A new session knows nothing yet: make sure config and prompts are sent again
    this.lastConfig = null; this.lastPrompts = null; this.smoothedPrompts.clear();

    // Create a timeout promise to prevent hanging indefinitely
    const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Connection to Lyria API timed out")), 10000)
    );

    const connectPromise = this.ai.live.music.connect({ 
      model: REALTIME_MODEL,
      callbacks: { 
        onmessage: async (e) => { 
          if (e.filteredPrompt?.text) this.guard.reportRejected(e.filteredPrompt.text);
          if (e.filteredPrompt) this.dispatchEvent(new CustomEvent('prompt-filtered', { detail: { ...e.filteredPrompt, payload: this.lastPrompts, config: this.lastConfig } }));
          if (currentSessionId === this.sessionCounter && e.serverContent?.audioChunks) await this.processAudioChunks(e.serverContent.audioChunks); 
        }, 
        onerror: (err: any) => { 
          this.stop(); 
          const errStr = err?.message || err?.toString() || 'API connection error';
          this.dispatchEvent(new CustomEvent('dj-vocal-message', { detail: { text: `API Error: ${errStr}.`, type: 'error' } })); 
        }, 
        onclose: () => this.stop(), 
      } 
    });

    try {
        this.sessionPromise = Promise.race([connectPromise, timeout]) as Promise<LiveMusicSession>;
        this.session = await this.sessionPromise;
    } catch (err) {
        this.session = null;
        this.sessionPromise = null;
        this.setPlaybackState('stopped');
        this.dispatchEvent(new CustomEvent('dj-vocal-message', { detail: { text: `Failed to connect to music engine: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' } }));
        throw err;
    }

    // Set prompts and config before starting the stream
    await this.refreshSessionPrompts();
    // Start the music stream - required by Lyria API
    this.session.play();
    return this.session;
  }

  private setPlaybackState(state: PlaybackState) { 
    this.playbackState = state; 
    this.dispatchEvent(new CustomEvent('playback-state-changed', { detail: state })); 
    this.syncAutoArrange();
    const totalSec = this.maxDurationMinutes * 60;
    const isAtEnd = this.elapsedSeconds >= (totalSec - 0.5);
    if ((state === 'stopped' || state === 'paused') && !isAtEnd) {
        this.masterGain.gain.setTargetAtTime(this.userVolume, this.audioContext.currentTime, 0.05);
    }
  }
  
  private async processAudioChunks(audioChunks: AudioChunk[]) {
    if (!this.session || this.playbackState === 'paused') return;
    const audioBuffer = await decodeAudioData(decode(audioChunks[0].data!), this.audioContext, 48000, 2);
    const source = this.audioContext.createBufferSource(); 
    source.buffer = audioBuffer; 

    const chunkGain = this.audioContext.createGain();
    // Increased safety buffer for startup timing to prevent clicking/stuttering
    const startTime = this.nextStartTime > this.audioContext.currentTime ? this.nextStartTime : this.audioContext.currentTime + 0.1;
    chunkGain.gain.setValueAtTime(0.01, startTime);
    chunkGain.gain.exponentialRampToValueAtTime(1.0, startTime + 0.05);

    source.connect(chunkGain);
    chunkGain.connect(this.rawGain);

    if (this.nextStartTime === 0 || this.nextStartTime < this.audioContext.currentTime) {
      this.nextStartTime = this.audioContext.currentTime + this.bufferTime;
    }
    
    source.start(this.nextStartTime); 
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
    };

    // Schedule next segment
    this.nextStartTime += audioBuffer.duration;
  }

  public readonly setWeightedPrompts = (prompts: Map<string, Prompt>) => { this.prompts = prompts; this.scheduleRefresh(); };
  
  private pauseInternal() {
    this.stopConductor(); this.stopTimeTracking();
    this.activeSources.forEach(s => { try { s.stop(); } catch(e) {} });
    this.activeSources.clear();
  }

  public async pause(manual = true) { 
    this.pauseInternal();
    if (this.loopWaitTimer) { clearTimeout(this.loopWaitTimer); this.loopWaitTimer = null; }
    if (manual) { this.isLooping = false; this.dispatchEvent(new CustomEvent('loop-changed-internal', { detail: false })); }
    this.lastStateBeforePause = this.playbackState; 
    this.setPlaybackState('paused'); 
  }

  public async resume() { 
    if (this.lastStateBeforePause === 'playing') await this.playRecording(this.elapsedSeconds);
    else if (this.lastStateBeforePause === 'recording') { this.setPlaybackState('recording'); this.startConductor(); this.startTimeTracking(); }
    else this.setPlaybackState('stopped');
  }

  private startMediaRecorder() {
    this.recordedChunks = []; this.mediaRecorder = new MediaRecorder(this.recordingDestination.stream);
    this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.recordedChunks.push(e.data); };
    this.mediaRecorder.onstop = async () => { 
        if (this.recordedChunks.length > 0) { 
            const blob = new Blob(this.recordedChunks, { type: 'audio/webm' }); 
            const arrayBuffer = await blob.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.segments = [{ startTime: 0, duration: audioBuffer.duration, buffer: audioBuffer }];
            this.recordedAudioBlob = blob; this.dispatchEvent(new CustomEvent('recording-available')); 
        } 
    };
    this.mediaRecorder.start();
  }

  private updateRecordingSchedule() {
    if (this.autoStopTimer) clearTimeout(this.autoStopTimer);
    const remainingTimeMs = Math.max(0, (this.maxDurationMinutes * 60) - this.elapsedSeconds) * 1000;
    this.autoStopTimer = window.setTimeout(() => { 
        this.stop(); 
        this.dispatchEvent(new CustomEvent('recording-finished-auto')); 
        if (this.isLooping) { this.elapsedSeconds = 0; this.playRecording(0); }
    }, remainingTimeMs + 5000);
  }

  /** Verses and lines per verse that fit the song: ~1 verse per minute at 120 BPM, more when faster, fewer when slower. */
  public lyricPlan(): { verses: number; lines: number } {
      const minutes = Math.max(0.5, this.maxDurationMinutes);
      const verses = Math.max(1, Math.min(5, Math.round(minutes * (this.bpm / 120))));
      const lines = this.bpm < 80 ? 3 : this.bpm > 150 ? 6 : 4;
      return { verses, lines };
  }

  /** Text models for lyrics, best first. A quota (429), retired model (404) or overload error moves on to the next. */
  private static readonly LYRICS_MODELS: { model: string; config?: object }[] = [
      // Lyrics need no deep reasoning: a low thinking level keeps the 3.8 answer to seconds instead of minutes
      { model: 'gemini-3.8-flash', config: { thinkingConfig: { thinkingLevel: 'low' } } },
      { model: 'gemini-3.1-flash-lite' }
  ];

  /** Runs a text prompt through LYRICS_MODELS in order and returns the first answer, or "Error: ..." if all fail. */
  private async runLyricsModels(prompt: string): Promise<string> {
      if (!this.ai) {
          console.error("AI not initialized");
          return "Error: AI not initialized.";
      }
      let lastError: unknown = null;
      for (const { model, config } of LiveMusicHelper.LYRICS_MODELS) {
          try {
              // A model that never answers must not hang the UI: give up after 15 s and try the next one
              let timer: ReturnType<typeof setTimeout> | undefined;
              const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${model} timed out`)), 15000); });
              const result: any = await Promise.race([(this.ai as any).models.generateContent({ model, contents: prompt, config }), timeout])
                  .finally(() => clearTimeout(timer));
              const text = (result.text || '').trim();
              if (text) return text;
              lastError = new Error(`${model} returned no text`);
          } catch (e) {
              console.warn(`Lyrics model ${model} failed, trying the next one:`, e);
              lastError = e;
          }
      }
      console.error("Lyrics generation failed:", lastError);
      return `Error: ${lastError}`;
  }

  /** The brief for new lyrics: genre, style, mood, language, length, tempo and meter. */
  private lyricsBrief(genre: string, lang: string, verseCount: number, lineCount: number, style?: string, mood?: string, withTitle = false): string {
      const plan = this.lyricPlan();
      const verses = verseCount > 0 ? verseCount : plan.verses;
      const lines = lineCount > 0 ? lineCount : plan.lines;
      const feel = this.bpm < 80 ? 'slow and spacious: long, held syllables and room to breathe'
          : this.bpm > 150 ? 'fast and driving: short, punchy, rhythmic lines'
          : 'mid-tempo: a relaxed, natural flow';
      const titleLine = withTitle ? `Start with one line "TITLE: <a short, catchy song title, at most 5 words, in ${lang}>", then the lyrics.` : '';
      return `Write the lyrics of a ${genre} song${style ? ` in ${style} style` : ''}${mood && mood !== 'None' ? ` with a ${mood} mood` : ''}, sung in ${lang}.
             Song: about ${Math.round(this.maxDurationMinutes * 10) / 10} minutes, ${this.bpm} BPM, ${this.meter} time, in ${this.key}. Tempo feel: ${feel}.
             Structure: ${verses} verse${verses > 1 ? 's' : ''} of ${lines} short lines each, with a 2-line [Chorus] between them.
             Fit the words to the ${this.meter} meter at ${this.bpm} BPM: stress the strong beats, keep every line singable in one or two bars, at most ${this.bpm > 150 ? 6 : 8} words each.
             Use ONLY real, correctly spelled ${lang} words that a native speaker would say (or open vowel sounds such as Ah, Oh, Ooh). Never invent nonsense words or fake syllables.
             Keep the vocabulary, imagery and rhythm authentic to ${genre}${genre === 'Hip Hop' ? ' (rhymed rap bars with strong flow)' : ''}.
             ${titleLine}
             Return ONLY ${withTitle ? 'that title line and ' : ''}the lyrics in block format ([Verse 1], [Chorus], [Verse 2], ...). No intro, outro, translation, explanations or commentary.`;
  }

  /** Splits a "TITLE: ..." first line off a model answer. */
  private static splitTitle(text: string): { title: string; lyrics: string } {
      const m = text.match(/^\s*\**\s*TITLE\s*:\s*(.+?)\s*\**\s*(?:\r?\n|$)/i);
      if (!m) return { title: '', lyrics: text.trim() };
      return { title: m[1].replace(/^["'“”]+|["'“”]+$/g, '').trim(), lyrics: text.slice(m[0].length).trim() };
  }

  /** Pass verseCount/lineCount of 0 to size the lyrics from the song length and tempo. */
  public async generateLyrics(genre: string, lang: string, verseCount: number, lineCount: number, songTitle?: string, style?: string, mood?: string): Promise<string> {
      const prompt = songTitle
          ? `Translate or adapt 2 verses of the song "${songTitle}" into ${lang}. The style should fit a ${genre} genre.`
          : this.lyricsBrief(genre, lang, verseCount, lineCount, style, mood);
      return this.runLyricsModels(prompt);
  }

  /** Lyrics and the song title from ONE model call (used by Generate and the dice). title is '' if the model gave none. */
  public async generateSong(genre: string, lang: string, style?: string, mood?: string): Promise<{ title: string; lyrics: string }> {
      const text = await this.runLyricsModels(this.lyricsBrief(genre, lang, 0, 0, style, mood, true));
      if (text.startsWith('Error')) return { title: '', lyrics: text };
      return LiveMusicHelper.splitTitle(text);
  }

  /** A title for lyrics that already exist (typed or written earlier), from the same model chain. */
  public async stop(resetToZero = false) {
    this.stopTimeTracking(); uiSounds.stopRewindSound();
    this.isLooping = false; this.dispatchEvent(new CustomEvent('loop-changed-internal', { detail: false }));
    if (this.loopWaitTimer) { clearTimeout(this.loopWaitTimer); this.loopWaitTimer = null; }
    if (this.rewindFrame) cancelAnimationFrame(this.rewindFrame); this.isRewinding = false;
    if (this.autoStopTimer) clearTimeout(this.autoStopTimer); if (this.session) { try { (this.session as any).close(); } catch(e) {} }
    if (this.mediaRecorder?.state !== 'inactive') this.mediaRecorder?.stop();
    this.activeSources.forEach(s => { try { s.stop(); } catch(e) {} });
    this.activeSources.clear();
    const totalSec = this.maxDurationMinutes * 60;
    const isAtEnd = this.elapsedSeconds >= (totalSec - 0.5);
    if (resetToZero) this.elapsedSeconds = 0;
    this.nextStartTime = 0; 
    if (!isAtEnd) {
        this.masterGain.gain.setTargetAtTime(this.userVolume, this.audioContext.currentTime, 0.05);
    } else {
        this.masterGain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.05);
    }
    this.setPlaybackState('stopped'); 
    this.session = null; this.sessionPromise = null;
    this.lastAppliedStatusMessage = '';
  }

  public async startRewind() {
      if (this.playbackState !== 'stopped') return;
      if (this.elapsedSeconds <= 0.05 && !this.isRewinding) return;
      this.stopTimeTracking();
      if (this.loopWaitTimer) { clearTimeout(this.loopWaitTimer); this.loopWaitTimer = null; }
      this.isRewinding = true; this.setPlaybackState('rewinding');
      uiSounds.startRewindSound();
      const rewindStartTime = performance.now();
      let lastFrameTime = rewindStartTime;
      const animateRewind = () => {
          const now = performance.now(); 
          const frameDelta = (now - lastFrameTime) / 1000; 
          lastFrameTime = now;
          const timeSinceStart = (now - rewindStartTime) / 1000;
          const currentSpeedMultiplier = 1.0 * Math.pow(50, Math.min(1, timeSinceStart / 4.0));
          this.elapsedSeconds = Math.max(0, this.elapsedSeconds - (frameDelta * currentSpeedMultiplier)); 
          if (this.elapsedSeconds > 0) { this.rewindFrame = requestAnimationFrame(animateRewind); }
          else { this.isRewinding = false; uiSounds.stopRewindSound(); this.setPlaybackState('stopped'); }
      };
      this.rewindFrame = requestAnimationFrame(animateRewind);
  }

  public async clearRecording() { 
      this.isLooping = false; this.dispatchEvent(new CustomEvent('loop-changed-internal', { detail: false }));
      await this.stop(true); this.segments = []; this.recordedAudioBlob = null; this.automationLog = [];
  }
  public get recordedDuration() { return this.segments.reduce((max, s) => Math.max(max, s.startTime + s.duration), 0); }

  public async playRecording(startTimeOffset?: number) {
    if (this.segments.length === 0) return;
    this.lastAppliedStatusMessage = '';
    this.activeSources.forEach(s => { try { s.stop(); } catch(e) {} });
    this.activeSources.clear();
    let offset = startTimeOffset !== undefined ? startTimeOffset : this.elapsedSeconds;
    if (this.recordedDuration > 0 && offset >= this.recordedDuration - 0.1) offset = 0;
    this.elapsedSeconds = offset;
    this.setPlaybackState('playing');
    const now = this.audioContext.currentTime;
    this.segments.forEach(segment => {
        const segmentEndTime = segment.startTime + segment.duration;
        if (segmentEndTime <= offset) return;
        const source = this.audioContext.createBufferSource();
        source.buffer = segment.buffer;
        const gain = this.audioContext.createGain();
        source.connect(gain); gain.connect(this.rawGain); 
        let segmentOffset = offset - segment.startTime;
        source.start(now, segmentOffset, segment.duration - segmentOffset);
        this.activeSources.add(source);
        source.onended = () => this.activeSources.delete(source);
    });
    if (this.conductorMode) this.startConductor();
    this.startTimeTracking();
  }

  // === Lyria 3.5 song rendering (voices with real words) ===
  // Lyria RealTime only makes instrumental music. When the voice mode has a voice or choir on stage, a take is
  // rendered as a whole song by Lyria 3.5 instead: one request, one finished MP3 with the singers and the lyrics.
  // It cannot be steered while it plays (no DJ, knobs or channel changes), it lands on the timeline like a recording.

  /** A voice or choir is on stage in the voice mode: takes are rendered by Lyria 3.5 (unless the API key may not use it). */
  public get usesSongModel(): boolean {
      if (this.songModelBlocked) return false;
      // Quality mode: a finished song by Lyria 3.5 whenever the song quota allows it, with or without voices.
      // With the DJ on, the DJ arranges it (djSongPlan): the song cannot be steered while it plays.
      if (this.generationMode === 'QUALITY' && this.songQuotaOk) return true;
      return this.songHasVoices;
  }
  /** The rendered song will have singers (voice mode on, a voice or choir on stage); otherwise it is instrumental. */
  public get songHasVoices(): boolean {
      return this.voiceMode && this.playingChannelKeys().some(k => isVocalInstrument(this.instruments[k].instrument));
  }
  /** The take on the timeline is a rendered Lyria 3.5 song (not a live recording). */
  public songTake = false;
  /** The user still has songs in the quota (kept up to date by index.tsx). */
  public songQuotaOk = true;
  /** Set when the API refused the song model for quota / tier reasons (free tier: 0 requests). Live takes are used then. */
  public songModelBlocked: string | null = null;

  private renderToken = 0;

  /**
   * Length of the song in seconds, from the lyrics, tempo and meter: every sung line takes about two bars (one more
   * for long lines), sections are separated by two bars of music, plus a four bar intro and outro.
   * Null when there are no real lyrics to measure (the length then stays the user's choice).
   */
  public estimateSongSeconds(): number | null {
      if (this.lyricsVowelsOnly) return null;
      const lines: string[] = []; let sections = 0;
      this.lyricsText.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => {
          if (/^\[.+\]$/.test(l)) sections++; else lines.push(l);
      });
      if (lines.length === 0) return null;
      if (sections === 0) sections = Math.ceil(lines.length / 4);
      const bars = 8 + sections * 2 + lines.reduce((sum, l) => sum + (l.split(/\s+/).length > 9 ? 3 : 2), 0);
      return Math.max(20, Math.min(600, Math.round(bars * this.barSeconds())));
  }

  /**
   * The DJ's arrangement of an instrumental Lyria 3.5 song: its performance plan in bars (whole four-bar phrases),
   * with the instruments that play each section and the DJ's cues. Null without the DJ or without a plan.
   */
  public djSongPlan(minutes: number): string[] | null {
      const dj = this.djPersonality;
      if (!this.conductorMode || !dj || this.currentPlan.length === 0) return null;
      const planSec = Math.max(1, this.maxDurationMinutes * 60);
      const totalBars = Math.max(16, Math.round(minutes * 60 / this.barSeconds() / 4) * 4);
      // Section boundaries on four-bar phrases; sections shorter than a phrase join the one before
      const starts = this.currentPlan.map(s => Math.round(s.stageStartTimeSec / planSec * totalBars / 4) * 4);
      const sections: { stage: PerformancePlanStage; from: number; to: number }[] = [];
      this.currentPlan.forEach((stage, i) => {
          const from = Math.min(starts[i], totalBars - 4);
          const to = i + 1 < starts.length ? Math.min(starts[i + 1], totalBars) : totalBars;
          if (to - from < 4 && sections.length) { sections[sections.length - 1].to = Math.max(sections[sections.length - 1].to, to); return; }
          if (to > from) sections.push({ stage, from, to });
      });
      if (sections.length) sections[sections.length - 1].to = totalBars;
      const typeCue: Record<string, string> = {
          intro: 'quiet, setting the scene', outro: 'winding down, resolving to the tonic', solo: 'a solo, free and expressive',
          duet: 'two instruments in dialog', trio: 'a small ensemble', groove: 'the rhythm section locks the groove',
          main: 'the main theme', verse: 'the main theme', chorus: 'the hook, fuller and brighter', build: 'building tension',
          breakdown: 'stripped back, a new melodic idea', percussion: 'percussion alone', climax: 'the full ensemble at its peak'
      };
      const lines = sections.map(({ stage, from, to }) => {
          const name = stage.stageName.split(' · ')[0];
          const players = (Object.keys(stage.activeChannels) as ChannelKey[]).filter(k => stage.activeChannels[k] && this.instruments[k]?.instrument)
              .map(k => this.instruments[k].instrument);
          const who = stage.formation === 'full' ? 'full ensemble' : stage.formation === 'solo' ? `${players[0]} alone` : players.length > 1 ? `${players.slice(0, -1).join(', ')} and ${players[players.length - 1]}` : players.join('');
          const lead = stage.featured && stage.formation !== 'solo' && players.length > 1 ? `, ${this.instruments[stage.featured].instrument} leads` : '';
          return `[${name}] bars ${from + 1}-${to}: ${who}${lead}; ${stage.cue || typeCue[stage.type || ''] || 'develop the theme'}.`;
      });
      return [
          `Arrangement by DJ ${dj.name}${dj.country ? ` (${dj.country})` : ''}, ${totalBars} bars in total. Follow these sections in order, with clear changes between them:`,
          ...lines
      ];
  }

  /**
   * The DJ's performance plan for a song with voices: how each section of the lyrics (or of the genre's form when
   * Lyria writes the words) is sung and accompanied, shaped by the DJ's arranging habits (a cappella openings,
   * call and response with the choir, instrumental solo breaks, key lifts, tag endings...). The DJ never changes the
   * voices or the words: it only arranges how they are performed. Null without the DJ.
   */
  public djVocalPlan(minutes: number): string[] | null {
      const dj = this.djPersonality;
      if (!this.conductorMode || !dj) return null;
      const keys = this.playingChannelKeys();
      const voiceKeys = keys.filter(k => isVocalInstrument(this.instruments[k].instrument));
      if (voiceKeys.length === 0) return null;
      const instruments = keys.filter(k => !isVocalInstrument(this.instruments[k].instrument)).map(k => this.instruments[k].instrument);
      const lead = this.instruments[voiceKeys[0]].instrument.toLowerCase();
      const second = voiceKeys[1] ? this.instruments[voiceKeys[1]].instrument.toLowerCase() : '';
      const chance = dj.habits ?? 80;
      const habits = dj.arranging ?? [];
      const has = (h: string) => habits.includes(h) && Math.random() * 100 < chance;
      const soloist = instruments.length ? instruments[Math.floor(Math.random() * instruments.length)] : '';
      const melodic = instruments.find(i => !/drum|percussion|shaker|cajon|tabla|bodhran|conga|bongo|timpani|snare|cowbell|clap/i.test(i)) || instruments[0] || '';
      const light = instruments.filter(i => !/drum|percussion|snare|timpani/i.test(i)).slice(0, 2);

      // The sections in singing order: the lyrics' own tags, else the genre's form trimmed to the length
      let names: string[] = [];
      if (this.lyricsText.trim() && !this.lyricsVowelsOnly) names = this.lyricsText.split(/\r?\n/).map(l => l.trim()).filter(l => /^\[.+\]$/.test(l)).map(l => l.slice(1, -1));
      if (names.length === 0) {
          const brief = GENRE_SONG_BRIEF[this.genre];
          names = formForLength(brief?.form ?? '[Intro] -> [Verse 1] -> [Chorus] -> [Verse 2] -> [Chorus] -> [Outro]', minutes)
              .split('->').map(p => p.trim().replace(/^\[|\]$/g, ''));
      }
      const kind = (n: string) => /intro/i.test(n) ? 'intro' : /outro|coda|ending/i.test(n) ? 'outro'
          : /chorus|refrain|hook|estribillo/i.test(n) ? 'chorus' : /pre-?chorus|build/i.test(n) ? 'pre'
          : /bridge|middle/i.test(n) ? 'bridge' : /solo|instrumental|interlude|break|falseta/i.test(n) ? 'break' : 'verse';
      const seen: Record<string, number> = {};
      const sections = names.map(n => { seen[n] = (seen[n] || 0) + 1; return { label: seen[n] > 1 ? `[${n}] (time ${seen[n]})` : `[${n}]`, kind: kind(n), cues: [] as string[] }; });
      const sung = sections.filter(s => !['intro', 'outro', 'break'].includes(s.kind));
      const verses = sections.filter(s => s.kind === 'verse');
      const choruses = sections.filter(s => s.kind === 'chorus');
      const lastChorus = choruses[choruses.length - 1];
      const bridge = sections.find(s => s.kind === 'bridge');
      const band = instruments.length ? 'the band' : 'the voices';

      // The default performance: sparse verses, the second voice joins on the choruses, the last one is the biggest
      sections.forEach(s => {
          if (s.kind === 'intro') s.cues.push(instruments.length ? `${melodic || band} alone, setting the mood, no vocals` : 'a hummed opening');
          else if (s.kind === 'outro') s.cues.push(instruments.length ? 'the band winds down, resolving to the tonic' : 'the voices fade on a held chord');
          else if (s.kind === 'break') s.cues.push(instruments.length ? `instrumental, ${soloist} leads, no vocals` : 'wordless humming');
          else if (s.kind === 'verse') s.cues.push(`${lead}${light.length ? ` over ${light.join(' and ')}` : ''}, intimate`);
          else if (s.kind === 'pre') s.cues.push('building, the band rises under the voice');
          else if (s.kind === 'bridge') s.cues.push('stripped back, a new color');
          else s.cues.push(`${lead}${second ? ` with the ${second} in harmony` : ''}, ${instruments.length ? 'full band' : 'full voices'}`);
      });
      if (lastChorus && choruses.length > 1) lastChorus.cues.push('the biggest chorus');

      // The DJ's habits
      const firstSung = sung[0];
      let aCappella = false;
      if ((has('a cappella opening') || has('unaccompanied verse')) && firstSung && instruments.length) { firstSung.cues = [`${lead} alone, a cappella, no instruments; the band enters at the next section`]; aCappella = true; }
      else if (has('free rubato opening') && firstSung) firstSung.cues.push('free time (rubato), the steady beat starts at the next section');
      if (has('hook first') && sections[0]?.kind === 'intro' && choruses.length) sections[0].cues = ['the intro already plays the chorus melody, the hook up front'];
      if (has('long intro') && sections[0]?.kind === 'intro') sections[0].cues.push('long and patient');
      // After an a cappella opening the layers build up under the next verse
      const layered = verses.find(v => !(aCappella && v === firstSung));
      if (has('layers enter one by one') && layered && instruments.length > 1) layered.cues.push('the instruments enter one at a time under the voice');
      if (has('slow build')) sung.forEach((s, i) => { if (i > 0 && i < sung.length - 1) s.cues.push('a little fuller than before'); });
      if (has('call and response') && choruses[0]) choruses.forEach(c => c.cues.push(second ? `call and response: the ${lead} sings each line, the ${second} answers` : instruments.length ? `call and response: the voice sings each line, ${melodic} answers` : 'call and response between the voices'));
      if ((has('instrument dialog') || has('instrument trading')) && melodic) (bridge || verses[1] || verses[0])?.cues.push(`the voice and ${melodic} trade phrases`);
      if (has('stop-time break') && instruments.length) (bridge || verses[verses.length - 1])?.cues.push('stop-time: the band hits only beat one while the voice sings the gaps');
      if (has('no drums')) sections.forEach(s => s.cues = s.cues.map(c => c.replace('full band', 'full ensemble'))) ;
      const inserts: { after: typeof sections[number]; text: string }[] = [];
      if ((has('solo turns') || has('surprise solo')) && soloist && choruses[0] && !sections.some(s => s.kind === 'break'))
          inserts.push({ after: choruses[0], text: `an 8-bar instrumental solo by ${soloist}, no vocals` });
      if (has('percussion break') && lastChorus && instruments.some(i => /drum|percussion|cajon|tabla|conga|bongo|clap|bodhran/i.test(i)))
          inserts.push({ after: sections[Math.max(0, sections.indexOf(lastChorus) - 1)], text: 'a 4-bar percussion break, hand claps, no vocals' });
      if (has('build and drop') && lastChorus) lastChorus.cues.push('after a bar of silence everything drops in at once');
      if (has('key lift') && lastChorus) lastChorus.cues.push('key change: up a whole step');
      if (has('cinematic swell') && lastChorus) lastChorus.cues.push('a broad cinematic swell');
      if (has('grand finale') && lastChorus) lastChorus.cues.push('grand and triumphant');
      if (has('stabs') && choruses[0]) choruses.forEach(c => c.cues.push('short accented stabs from the band'));
      if (has('soft dynamics')) sung.forEach(s => s.cues.push('soft'));
      const end = sections[sections.length - 1];
      if (has('tag ending') && lastChorus) lastChorus.cues.push('tag ending: the last line repeated three times');
      else if (has('accelerando ending') && end) end.cues.push('accelerando to a fiery finish');
      else if (has('fade out') && end) end.cues.push('slow fade out');

      const out: string[] = [];
      sections.forEach(s => {
          out.push(`${s.label}: ${s.cues.join('; ')}.`);
          inserts.filter(x => x.after === s).forEach(x => out.push(`Then ${x.text}.`));
      });
      return [`Performance plan by DJ ${dj.name}${dj.country ? ` (${dj.country})` : ''} (stage directions, never sung):`, ...out];
  }

  /** The text prompt for Lyria 3.5: song description in labelled lines, then the lyrics with section tags. */
  public buildSongPrompt(): string {
      const keys = this.playingChannelKeys();
      // Without the voice mode the song is instrumental: the channel instruments are played, any voice on a channel is not sung
      const voiceKeys = this.voiceMode ? keys.filter(k => isVocalInstrument(this.instruments[k].instrument)) : [];
      const instruments = keys.filter(k => !isVocalInstrument(this.instruments[k].instrument)).map(k => this.instruments[k].instrument);
      const voices = voiceKeys.map(k => this.voicePrompt(this.instruments[k].instrument));
      const minutes = Math.max(0.5, Math.round(this.maxDurationMinutes * 2) / 2);
      const styleTag = !this.style || this.style.toLowerCase().includes(this.genre.toLowerCase()) ? (this.style || this.genre) : `${this.style} ${this.genre}`;
      const knobs = Array.from(this.prompts.values())
          .filter(p => p.weight > 0.3 && !['density', 'brightness', 'guidance', 'variation'].includes(p.text.trim().toLowerCase()))
          .sort((a, b) => b.weight - a.weight).slice(0, 4).map(p => this.knobPhrase(p.text));
      const regional = this.regionalVocalStyle();
      const brief = GENRE_SONG_BRIEF[this.genre];
      // Quality mode without any voice on stage: an instrumental piece, no singing and no lyrics
      const instrumental = voices.length === 0;
      const lyricsGiven = !instrumental && !!this.lyricsText.trim() && !this.lyricsVowelsOnly;
      // An instrumental with the DJ on follows the DJ's arrangement instead of a generic form
      const djPlan = instrumental ? this.djSongPlan(minutes) : null;
      // A song with voices and the DJ on: the DJ's performance plan for the singers and the band
      const vocalPlan = instrumental ? null : this.djVocalPlan(minutes);

      const lines = [
          `Create a ${minutes}-minute ${styleTag} ${instrumental ? 'instrumental piece with no vocals' : 'song with vocals'}.`,
          `Genre: ${this.genre}. Style: ${this.style}.`,
          ...fidelityLines(this.genre, this.style),
          this.mood && this.mood !== 'None' ? `Mood: ${moodPhrase(this.mood)}.` : '',
          `Tempo: ${this.bpm} BPM, ${this.meter} time. Key: ${this.key}.`,
          instruments.length ? `Instruments (only these): ${instruments.join(', ')}.` : instrumental ? '' : 'A cappella: voices only, no instruments.',
          voices.length ? `Vocals: ${voices.join('; ')}, ${this.voiceIntensityPhrase()}${regional ? `, ${regional}` : ''}${brief && !this.lyricsVowelsOnly ? `, ${brief.vocals}` : ''}.`
              : brief && !instrumental && !this.lyricsVowelsOnly ? `Vocals: ${brief.vocals}.` : '',
          // The sound notes name typical instruments: with a fixed lineup they only describe the feel
          brief ? `Sound: ${brief.sound}${instruments.length ? ' (describes the feel only, use just the instruments listed)' : ''}.` : this.genreReference ? `Sound: ${this.genreReference}.` : '',
          knobs.length ? `Playing style: ${knobs.join(', ')}.` : '',
          djPlan ? '' : this.evolutionValue > 0 ? 'Arrangement: progressive, building and evolving.' : this.evolutionValue < 0 ? 'Arrangement: steady and minimal.' : '',
          instrumental ? 'Clear, memorable melody with a developing arrangement, clean high fidelity mix. No singing, no spoken words.' : 'Clear, memorable sung melody, clean high fidelity mix.'
      ];
      const lyrics = this.lyricsText.trim();
      let words: string;
      if (djPlan) words = djPlan.join('\n');
      else if (instrumental) words = `Structure: ${formForLength('[Intro] -> [Theme A] -> [Theme B] -> [Development] -> [Theme A] -> [Outro]', minutes)}`;
      else if (this.lyricsVowelsOnly) words = 'Lyrics: wordless vocalise on open vowels (ah, oh, ooh), no words.';
      else if (lyrics) words = `Language: ${this.lyricsLanguage}. Sing these lyrics exactly, clearly pronounced.\n\nLyrics:\n${lyrics}`;
      else words = `Language: ${this.lyricsLanguage}. Write original lyrics in ${this.lyricsLanguage}, sung clearly, fitting ${this.meter} time at ${this.bpm} BPM.\n`
          + `Structure: ${formForLength(brief?.form ?? '[Intro] -> [Verse 1] -> [Chorus] -> [Verse 2] -> [Chorus] -> [Outro]', minutes)}`;
      if (lyricsGiven) lines.push(vocalPlan ? 'Follow the section order of the lyrics exactly, with the instrumental parts of the performance plan; no extra lyrics.'
          : 'Follow the section order of the lyrics exactly; add a short instrumental intro and outro, and no extra lyrics.');
      return [...lines.filter(Boolean), ...(vocalPlan ? [vocalPlan.join('\n'), ''] : []), words].join('\n');
  }

  /** Asks the server to render the song (Lyria 3.5, then Lyria 3 Pro) and returns the interaction. */
  private static async fetchSong(prompt: string): Promise<any> {
      const devSecret = import.meta.env.VITE_DEV_SONG_SECRET;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), SONG_RENDER_TIMEOUT_MS);
      try {
          const res = await fetch('/api/song', {
              method: 'POST', credentials: 'same-origin', signal: ctrl.signal,
              headers: { 'Content-Type': 'application/json', ...(devSecret ? { 'x-dev-secret': devSecret } : {}) },
              body: JSON.stringify({ prompt, ticket: takeSongTicket() })
          });
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error(`${res.status} ${data?.error || 'the song server did not answer'}`);
          return data;
      } finally {
          clearTimeout(timer);
      }
  }

  /** Pulls the audio (base64 + mime type) and the text parts out of a Lyria 3 interaction, whatever the response shape. */
  private static readSongResponse(interaction: any): { audio: string | null; mime: string; text: string } {
      const blocks: any[] = [];
      (interaction?.steps || []).forEach((s: any) => { if (s?.type === 'model_output') blocks.push(...(s.content || [])); });
      blocks.push(...(interaction?.outputs || []));
      if (interaction?.output_audio) blocks.push({ type: 'audio', ...interaction.output_audio });
      const audioBlock = [...blocks].reverse().find(b => b?.type === 'audio' && b.data);
      const text = blocks.filter(b => b?.type === 'text' && b.text).map(b => b.text).join('\n').trim() || String(interaction?.output_text || '').trim();
      return { audio: audioBlock?.data ?? null, mime: audioBlock?.mime_type || audioBlock?.mimeType || 'audio/mpeg', text };
  }

  /**
   * Renders the take as one song with Lyria 3.5 (falls back to Lyria 3 Pro) and puts it on the timeline.
   * Fires 'song-render-progress' while waiting, 'song-rendered' (with the sung lyrics) or 'song-render-failed'.
   */
  public async renderSong(): Promise<boolean> {
      await this.stop(true);
      const token = ++this.renderToken;
      this.segments = []; this.recordedAudioBlob = null; this.elapsedSeconds = 0; this.automationLog = [];
      this.dispatchEvent(new CustomEvent('recording-cleared'));
      this.audioContext.resume();
      // The DJ arranges each song afresh, for the lineup and length of this take
      if (this.conductorMode && !this.songHasVoices) this.generatePerformancePlan();
      const prompt = this.buildSongPrompt();
      this.dispatchEvent(new CustomEvent('song-render-started', { detail: { prompt } }));
      this.setPlaybackState('loading');
      const started = Date.now();
      const progress = window.setInterval(() => {
          this.dispatchEvent(new CustomEvent('song-render-progress', { detail: { seconds: Math.round((Date.now() - started) / 1000) } }));
      }, 5000);
      try {
          // The paid key lives on the server (api/song.ts): it renders the song when it gets the quota ticket
          const interaction = await LiveMusicHelper.fetchSong(prompt);
          if (token !== this.renderToken) return false; // stopped or overtaken while rendering
          const { audio, mime, text } = LiveMusicHelper.readSongResponse(interaction);
          if (!audio) throw new Error(text ? `Lyria returned no audio: ${text.slice(0, 160)}` : 'Lyria returned no audio');
          const bytes = decode(audio);
          const blob = new Blob([bytes], { type: mime });
          const buffer = await this.audioContext.decodeAudioData(bytes.buffer.slice(0) as ArrayBuffer);
          if (token !== this.renderToken) return false;
          this.segments = [{ startTime: 0, duration: buffer.duration, buffer }];
          this.recordedAudioBlob = blob;
          this.songTake = true;
          // Lyria wrote the words itself: keep them so the Voice dialog shows what is sung
          if (this.songHasVoices && !this.lyricsText.trim() && text && !this.lyricsVowelsOnly) this.setLyrics(text, this.lyricsLanguage, false);
          this.setPlaybackState('stopped');
          this.dispatchEvent(new CustomEvent('song-rendered', { detail: { duration: buffer.duration, lyrics: text, prompt } }));
          return true;
      } catch (e) {
          if (token !== this.renderToken) return false;
          const reason = e instanceof Error ? e.message : String(e);
          // Quota or tier refusal: the same key will keep failing, so later takes go live straight away
          const blocked = /\b429\b|rate limit|quota|tier/i.test(reason);
          if (blocked) this.songModelBlocked = reason;
          this.setPlaybackState('stopped');
          this.dispatchEvent(new CustomEvent('song-render-failed', { detail: { reason, blocked } }));
          return false;
      } finally {
          clearInterval(progress);
      }
  }

  /** Stop pressed while a song renders: the result is thrown away when it arrives. */
  public cancelSongRender() { this.renderToken++; }

  /** Length of the recording in bars of the current tempo and meter (a free meter counts as 4 beats). */
  private recordedBars(): number {
    const seconds = this.segments.reduce((sum, seg) => sum + seg.duration, 0);
    const [num, den] = this.meter.split('/').map(Number);
    // Compound meters (6/8, 9/8, 12/8) beat in dotted quarters, other eighth meters in pairs of eighths
    const beats = !num || !den ? 4 : den === 8 ? (num % 3 === 0 ? num / 3 : num / 2) : num;
    return Math.max(1, Math.round(seconds * this.bpm / 60 / beats));
  }

  /** File name of a song without a name: Genre-Style-Mood-tempo-bars, e.g. Jazz-CoolJazz-Chill-90BPM-25BAR */
  private defaultSongName(): string {
    const part = (t: string) => t.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '');
    return [this.genre, this.style, this.mood && this.mood !== 'None' ? this.mood : '', `${this.bpm}BPM`, `${this.recordedBars()}BAR`]
      .map(part).filter(Boolean).join('-');
  }

  public async download(format: 'webm' | 'mp3' | 'wav' = 'mp3', songName = '') {
    if (this.segments.length === 0) return;
    const url = URL.createObjectURL(this.recordedAudioBlob!);
    const a = document.createElement('a');
    a.href = url;
    // A named song (Voice dialog) is saved under its name, spaces replaced by underscores
    const named = songName.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
    const filename = `${named || this.defaultSongName()}.${format}`;
    a.download = filename; a.click();
    window.URL.revokeObjectURL(url);
  }
}
