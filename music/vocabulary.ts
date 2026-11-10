/**
 * The musical vocabulary GameDJ speaks to Lyria: which instruments are voices, how each genre and style is
 * described (descriptors, song briefs, authenticity and fidelity tags), the genre families, the lyric languages,
 * the scales of each key and the singer descriptions. Data and pure functions only.
 */
import { Scale } from '@google/genai';

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

/** Words that name an instrument in the genre text (to leave those parts out when the channels choose the instruments) */
const INSTRUMENT_WORDS = /guitar|ukulele|violin|fiddle|tabla|sitar|balalaika|mandolin|drum|percussion|piano|flute|accordion|harp|banjo|bagpipe|pipes|whistle|bouzouki|\boud\b|dulcimer|zither|lute|bodhran|trumpet|horn|brass|organ|cello|bass|synth|marimba|xylophone|kora|djembe/i;

/** Short tags for the live (Lyria RealTime) prompt: it reads tags, not sentences. */
export function fidelityTags(genre: string, style: string, withoutInstruments = false): string[] {
    const name = style && !style.toLowerCase().includes(genre.toLowerCase()) ? `${genre} ${style}` : (style || genre);
    const tags: string[] = [];
    if (GENRE_AUTHENTICITY[genre]) {
        // With instruments chosen on the channels the tag must not name others (a ukulele in the text competes with the chosen trumpet)
        const parts = GENRE_AUTHENTICITY[genre].split(',').map(p => p.trim()).filter(p => !withoutInstruments || !INSTRUMENT_WORDS.test(p));
        tags.push(`authentic traditional ${name} music${parts.length ? ', ' + parts.slice(0, 3).join(', ') : ''}`);
    }
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

// Genres whose scales are mostly not major/minor-pair material (raga, maqam, pentatonic, microtonal)
export const NON_DIATONIC_GENRES = ['Indian', 'Oriental'];

export const TRADITIONAL_GENRES = ['Classic', 'Renascentist', 'Victorian', 'Spiritual', 'African', 'Indian', 'Irish', 'Spanish', 'Oriental', 'Romanian', 'European', 'Western', 'Hawaiian', 'Marching', 'Blues', 'Traditional'];

export function isTraditionalGenre(genre: string): boolean {
    return TRADITIONAL_GENRES.includes(genre);
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
const LYRIA_SCALES: Scale[] = [Scale.C_MAJOR_A_MINOR, Scale.D_FLAT_MAJOR_B_FLAT_MINOR, Scale.D_MAJOR_B_MINOR, Scale.E_FLAT_MAJOR_C_MINOR,
    Scale.E_MAJOR_D_FLAT_MINOR, Scale.F_MAJOR_D_MINOR, Scale.G_FLAT_MAJOR_E_FLAT_MINOR, Scale.G_MAJOR_E_MINOR, Scale.A_FLAT_MAJOR_F_MINOR,
    Scale.A_MAJOR_G_FLAT_MINOR, Scale.B_FLAT_MAJOR_G_MINOR, Scale.B_MAJOR_A_FLAT_MINOR];
const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Maps a key such as "F# Minor" or "Bb Major" to the Lyria scale enum (all 12 pairs). */
export function scaleForKey(key: string): Scale | null {
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
export const VOICE_PERSONAS: Record<string, string[]> = {
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
export const pickOne = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
