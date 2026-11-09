export const FALLBACK_POOLS = {
  lead: ['Synthesizer', 'Electric Guitar', 'Acoustic Guitar', 'Spanish Guitar', 'Flamenco Guitar', 'Classical Guitar', 'Tres', 'Bandurria', 'Saxophone', 'Trumpet', 'Trombone', 'Clarinet', 'Flute', 'Violin', 'Cello', 'Viola', 'Oboe', 'English Horn', 'French Horn', 'Bassoon', 'Harmonica', 'Chromatic Harmonica', 'Accordion', 'Banjo', 'Mandolin', 'Sitar', 'Koto', 'Erhu', 'Oud', 'Bagpipes', 'Bell Synth', 'Whistle', 'Didgeridoo', 'Recorder', 'Pan Flute', 'Pipe Flute', 'Marimba', 'Xylophone', 'Ocarina'].sort(),
  alto: ['Saxophone', 'Trumpet', 'Trombone', 'Clarinet', 'Viola', 'Violin', 'Cello', 'French Horn', 'English Horn', 'Bassoon', 'Oboe', 'Brass Section', 'Strings', 'Flute', 'Recorder', 'Accordion', 'Synthesizer', 'Electric Piano', 'Vibraphone', 'Harp', 'Low Whistle', 'Mandocello', 'Pan Flute', 'Harmonica', 'Chromatic Harmonica', 'Electric Violin', 'Pipe Flute', 'Solo Male', 'Solo Female'].sort(),
  harmonic: ['Piano', 'Electric Piano', 'Acoustic Guitar', 'Spanish Guitar', 'Flamenco Guitar', 'Electric Guitar', 'Organ', 'Strings', 'Pads', 'Harpsichord', 'Harp', 'Marimba', 'Cimbalom', 'Tanpura', 'Synthesizer', 'Stab Chords', 'Accordion', 'Harmonium', 'Guzheng', 'Qanun', 'Celesta'].sort(),
  bass: ['Electric Bass', 'Synth Bass', 'Double Bass', 'Tuba', 'Trombone', 'French Horn', 'Cello', 'Bassoon', 'Bass Clarinet', 'Baritone Saxophone', 'Didgeridoo', 'Timpani', 'Bass Harmonica', 'Bass Recorder', 'Bass Trombone'].sort(),
  rhythm: ['Drum Kit', 'Electronic Drums', 'Hand Drum', 'Tabla', 'Djembe', 'Congas', 'Bongos', 'Timbales', 'Taiko Drums', 'Percussion', 'Shakers', 'Tambourine', 'Bells', 'Stomps', 'Industrial Percussion', 'Woodblock', 'Cowbell', 'Snare Drum', 'Cymbals', 'Bass Drum', 'Gong', 'Triangle', 'Wind Chimes'].sort()
};


// === LYRIA (orchestra) POOLS ===
// Lyria itself has no channels: it renders one mixed stream from weighted text prompts. These five channels are the
// app's way of building those prompts:
//   lead     = VOICE/LEAD     solo voice or solo instrument carrying the melody
//   alto     = VOICE/HARMONY  chords and accompaniment: keyboards, harp, guitars, small strings, or a choir
//   harmonic = ORCHESTRA      the orchestral body
//   bass     = BRASS
//   rhythm   = PERCUSSION
type ChannelName = 'lead' | 'alto' | 'harmonic' | 'bass' | 'rhythm';

export const LYRIA_DEFAULT_POOLS: Record<ChannelName, string[]> = {
  lead: ['Solo Voice', 'Duet Voices', 'Violin', 'Cello', 'Flute', 'Oboe', 'Clarinet', 'Trumpet', 'French Horn', 'Piano'],
  alto: ['Piano', 'Harp', 'Acoustic Guitar', 'Organ', 'Harmonium', 'Electric Organ', 'String Quartet', 'Chamber Choir', 'Mixed Choir', 'Quartet Voices'],
  harmonic: ['Symphony Orchestra', 'String Orchestra', 'Chamber Orchestra', 'Chamber Strings', 'Violin Section', 'Cello Ensemble', 'Woodwind Section', 'Harp & Strings'],
  bass: ['Brass Section', 'Low Brass', 'French Horns', 'Trombones', 'Tuba', 'Brass Quintet', 'Cinematic Brass'],
  rhythm: ['Timpani & Drums', 'Orchestral Percussion', 'Cinematic Drums', 'Taiko Drums', 'Snare Ensemble']
};

// Lyria with the voice mode off: last resort if a voice channel's pool ever has only voices
export const LYRIA_INSTRUMENTAL_POOLS: Partial<Record<ChannelName, string[]>> = {
  lead: ['Violin', 'Cello', 'Flute', 'Clarinet', 'Piano'],
  alto: ['Piano', 'Harp', 'Acoustic Guitar', 'Organ', 'String Quartet']
};

// Per-genre overrides: only the channels listed differ from the default pools.
// lead = solo voices and the genre's solo instruments; alto = the genre's accompanying instruments and its choirs.
export const LYRIA_GENRE_POOLS: Record<string, Partial<Record<ChannelName, string[]>>> = {
  'Classic': { lead: ['Solo Voice', 'Duet Voices', 'Violin', 'Cello', 'Flute', 'Oboe', 'Clarinet', 'Piano', 'French Horn'], alto: ['Piano', 'Harp', 'Harpsichord', 'Organ', 'String Quartet', 'Mixed Choir', 'Chamber Choir', 'Quartet Voices'], harmonic: ['Symphony Orchestra', 'Chamber Orchestra', 'String Orchestra', 'Violin Section', 'Cello Ensemble', 'Woodwind Section'], bass: ['French Horns', 'Brass Quintet', 'Low Brass', 'Trombones'], rhythm: ['Timpani & Drums', 'Orchestral Percussion'] },
  'Renascentist': { lead: ['Solo Voice', 'Duet Voices', 'Recorder', 'Lute', 'Viola da Gamba', 'Shawm'], alto: ['Lute', 'Harpsichord', 'Harp', 'Portative Organ', 'Chamber Choir', 'A Cappella Group'], harmonic: ['Chamber Strings', 'Chamber Orchestra', 'Harp & Strings', 'Woodwind Section'], bass: ['Brass Quintet', 'Trombones'], rhythm: ['Timpani & Drums', 'Snare Ensemble'] },
  'Victorian': { lead: ['Solo Voice', 'Violin', 'Cello', 'Flute', 'Piano', 'Clarinet'], alto: ['Piano', 'Harp', 'Harmonium', 'Organ', 'String Quartet', 'Mixed Choir', 'Female Choir'], harmonic: ['String Orchestra', 'Chamber Orchestra', 'Violin Section', 'Harp & Strings'], bass: ['French Horns', 'Brass Quintet', 'Low Brass'], rhythm: ['Timpani & Drums', 'Snare Ensemble'] },
  'Spiritual': { lead: ['Solo Voice', 'Duet Voices', 'Cello', 'Flute', 'Violin'], alto: ['Organ', 'Harmonium', 'Harp', 'Piano', 'Gregorian Chant', 'Gospel Choir', 'Mixed Choir', 'Chamber Choir'], harmonic: ['String Orchestra', 'Chamber Strings', 'Harp & Strings'], bass: ['French Horns', 'Low Brass'], rhythm: ['Timpani & Drums', 'Orchestral Percussion'] },
  'Opera': { lead: ['Solo Voice', 'Duet Voices', 'Quartet Voices', 'Violin', 'Cello'], alto: ['Piano', 'Harp', 'Harpsichord', 'Organ', 'Mixed Choir', 'Male Choir', 'Female Choir'], harmonic: ['Symphony Orchestra', 'Chamber Orchestra', 'String Orchestra'], bass: ['French Horns', 'Brass Section', 'Trombones'], rhythm: ['Timpani & Drums', 'Orchestral Percussion'] },
  'Marching': { lead: ['Trumpet', 'Piccolo', 'Clarinet', 'Bugle', 'Solo Voice'], alto: ['Glockenspiel', 'Organ', 'Accordion', 'Male Choir', 'Mixed Choir'], harmonic: ['Symphony Orchestra', 'Woodwind Section', 'String Orchestra'], bass: ['Military Fanfare', 'Brass Section', 'Tuba', 'Trombones'], rhythm: ['Snare Ensemble', 'Timpani & Drums', 'Cinematic Drums'] },
  'Ambient': { lead: ['Solo Voice', 'Cello', 'Flute', 'Piano', 'Violin', 'Duduk'], alto: ['Piano', 'Harp', 'Pads', 'Electric Organ', 'Female Choir', 'Chamber Choir'], harmonic: ['String Orchestra', 'Chamber Strings', 'Harp & Strings', 'Cello Ensemble'], bass: ['French Horns', 'Low Brass'], rhythm: ['Orchestral Percussion', 'Timpani & Drums'] },
  'Gaming': { lead: ['Solo Voice', 'Violin', 'Flute', 'French Horn', 'Piano'], alto: ['Piano', 'Harp', 'Electric Organ', 'Synthesizer', 'Epic Choir', 'Mixed Choir'], harmonic: ['Symphony Orchestra', 'String Orchestra', 'Chamber Orchestra'], bass: ['Cinematic Brass', 'Brass Section', 'French Horns'], rhythm: ['Cinematic Drums', 'Taiko Drums', 'Timpani & Drums'] },
  'African': { lead: ['Solo Voice', 'Duet Voices', 'Kora', 'Flute', 'Balafon'], alto: ['Kora', 'Acoustic Guitar', 'Marimba', 'A Cappella Group', 'Gospel Choir', 'Female Choir'], rhythm: ['Orchestral Percussion', 'Taiko Drums', 'Timpani & Drums'] },
  'Indian': { lead: ['Solo Voice', 'Sitar', 'Bansuri', 'Sarangi', 'Shehnai', 'Violin'], alto: ['Harmonium', 'Tanpura', 'Santoor', 'Sitar', 'Female Choir', 'Mixed Choir'], harmonic: ['String Orchestra', 'Violin Section', 'Woodwind Section', 'Harp & Strings'], rhythm: ['Orchestral Percussion', 'Snare Ensemble'] },
  'Irish': { lead: ['Solo Voice', 'Violin', 'Whistle', 'Uilleann Pipes', 'Flute', 'Accordion'], alto: ['Harp', 'Acoustic Guitar', 'Bouzouki', 'Piano', 'Mixed Choir', 'A Cappella Group'], harmonic: ['Chamber Strings', 'Violin Section', 'Woodwind Section', 'Harp & Strings'], rhythm: ['Snare Ensemble', 'Orchestral Percussion'] },
  'Spanish': { lead: ['Solo Voice', 'Flamenco Guitar', 'Spanish Guitar', 'Violin', 'Trumpet'], alto: ['Spanish Guitar', 'Classical Guitar', 'Piano', 'Harp', 'Mixed Choir', 'Male Choir'], harmonic: ['Chamber Strings', 'Violin Section', 'String Orchestra', 'Harp & Strings'], bass: ['Brass Quintet', 'Trombones'], rhythm: ['Orchestral Percussion', 'Snare Ensemble'] },
  'Oriental': { lead: ['Solo Voice', 'Erhu', 'Koto', 'Shakuhachi', 'Oud', 'Dizi'], alto: ['Guzheng', 'Koto', 'Qanun', 'Harp', 'Female Choir', 'Chamber Choir'], harmonic: ['String Orchestra', 'Woodwind Section', 'Harp & Strings', 'Cello Ensemble'], rhythm: ['Taiko Drums', 'Orchestral Percussion'] },
  'Romanian': { lead: ['Solo Voice', 'Violin', 'Pan Flute', 'Clarinet', 'Tarogato', 'Accordion'], alto: ['Cimbalom', 'Accordion', 'Acoustic Guitar', 'Piano', 'Male Choir', 'Mixed Choir'], harmonic: ['Violin Section', 'String Orchestra', 'Chamber Strings'], bass: ['Brass Quintet', 'Tuba', 'Low Brass'], rhythm: ['Orchestral Percussion', 'Snare Ensemble'] },
  'European': { lead: ['Solo Voice', 'Violin', 'Accordion', 'Mandolin', 'Balalaika', 'Clarinet'], alto: ['Accordion', 'Mandolin', 'Classical Guitar', 'Piano', 'Male Choir', 'Mixed Choir'], harmonic: ['String Orchestra', 'Chamber Strings', 'Violin Section'], bass: ['Low Brass', 'Tuba'], rhythm: ['Orchestral Percussion', 'Snare Ensemble'] },
  'Western': { lead: ['Solo Voice', 'Duet Voices', 'Harmonica', 'Violin', 'Steel Guitar', 'Banjo'], alto: ['Acoustic Guitar', 'Banjo', 'Piano', 'Mandolin', 'Male Choir', 'A Cappella Group'], harmonic: ['String Orchestra', 'Violin Section', 'Chamber Strings'], rhythm: ['Snare Ensemble', 'Cinematic Drums', 'Timpani & Drums'] },
  'Hawaiian': { lead: ['Solo Voice', 'Steel Guitar', 'Ukulele', 'Flute'], alto: ['Ukulele', 'Slack Key Guitar', 'Acoustic Guitar', 'Harp', 'Female Choir', 'Mixed Choir'], harmonic: ['Chamber Strings', 'Harp & Strings', 'String Orchestra'], bass: ['Low Brass', 'French Horns'], rhythm: ['Orchestral Percussion', 'Timpani & Drums'] }
};

/** The voices a LEAD VOICE track can sing with. */
export const LEAD_VOICE_OPTIONS = ['Solo Male', 'Solo Female', 'Duet Male', 'Duet Female', 'Duet Mix', 'Quartet Mix', 'Solo Child', 'Duet Children'];

/** Lyria tab: the channel that carries solo voices (VOICE/LEAD) and the one that carries choirs (VOICE/HARMONY). */
export const LYRIA_VOICE_CHANNELS = { solo: 'lead', choir: 'alto' } as const;

/**
 * Small-ensemble options for the Lyria tab, added after each genre's pool. Lyria renders a few instruments with a voice
 * as well as it renders a symphony, and often better: a guitar duo under a singer is a real option, not only an orchestra.
 * The DJ and the dropdowns draw from the merged pool, so intimate lineups come up as often as the big ones.
 */
const LYRIA_SMALL_ENSEMBLES: Record<string, Partial<Record<ChannelName, string[]>>> = {
  '_default': { harmonic: ['Piano Trio', 'String Quartet', 'Acoustic Guitar Duo', 'Piano & Strings'], bass: ['Double Bass', 'Cello', 'Bass Clarinet'], rhythm: ['Hand Percussion', 'Frame Drum', 'Brushed Snare', 'Shakers'] },
  'Classic': { harmonic: ['String Quartet', 'Piano Trio', 'Wind Quintet'], bass: ['Double Bass', 'Cello', 'Bassoon'], rhythm: ['Timpani'] },
  'Renascentist': { harmonic: ['Lute & Viola da Gamba', 'Recorder Consort'], bass: ['Viola da Gamba', 'Dulcian'], rhythm: ['Frame Drum', 'Tambourine'] },
  'Victorian': { harmonic: ['Piano Trio', 'String Quartet'], bass: ['Double Bass', 'Cello'], rhythm: ['Brushed Snare'] },
  'Spiritual': { harmonic: ['Organ & Strings', 'Solo Piano'], bass: ['Cello', 'Double Bass'], rhythm: ['Handclaps', 'Tambourine'] },
  'Opera': { harmonic: ['Piano & Strings', 'String Quartet'], bass: ['Cello', 'Double Bass'], rhythm: ['Timpani'] },
  'Marching': { harmonic: ['Brass Band', 'Fife & Clarinets'], bass: ['Sousaphone', 'Tuba'], rhythm: ['Snare Drum', 'Bass Drum'] },
  'Ambient': { harmonic: ['Solo Piano', 'Cello & Pads'], bass: ['Cello', 'Double Bass'], rhythm: ['Singing Bowls', 'Soft Frame Drum'] },
  'Gaming': { harmonic: ['Chiptune Synths', 'Piano & Strings'], bass: ['Synth Bass', 'Electric Bass'], rhythm: ['Electronic Drums', 'Drum Kit'] },
  'African': { harmonic: ['Kora & Guitar', 'Marimba Ensemble'], bass: ['Electric Bass', 'Double Bass'], rhythm: ['Djembe', 'Congas', 'Shakers'] },
  'Indian': { harmonic: ['Sitar & Tanpura', 'Harmonium & Strings'], bass: ['Tanpura Drone', 'Cello'], rhythm: ['Tabla', 'Dholak', 'Manjira'] },
  'Irish': { harmonic: ['Fiddle & Guitar', 'Concertina'], bass: ['Double Bass', 'Bouzouki'], rhythm: ['Bodhran', 'Bones', 'Spoons'] },
  'Spanish': { harmonic: ['Flamenco Guitar Duo', 'Guitar & Cajon'], bass: ['Double Bass', 'Electric Bass'], rhythm: ['Cajon', 'Palmas Handclaps', 'Castanets'] },
  'Oriental': { harmonic: ['Guzheng & Erhu', 'Koto Ensemble'], bass: ['Cello', 'Double Bass'], rhythm: ['Taiko Drums', 'Frame Drum', 'Temple Blocks'] },
  'Romanian': { harmonic: ['Violin & Cimbalom Duo', 'Accordion'], bass: ['Double Bass', 'Tuba'], rhythm: ['Toba Drum', 'Tambourine'] },
  'European': { harmonic: ['Accordion & Guitar', 'Balalaika Ensemble', 'Mandolin & Guitar'], bass: ['Double Bass', 'Contrabass Balalaika'], rhythm: ['Tambourine', 'Castanets', 'Hand Percussion'] },
  'Western': { harmonic: ['Guitar & Fiddle', 'Banjo & Mandolin'], bass: ['Upright Bass', 'Electric Bass'], rhythm: ['Brushed Snare', 'Washboard', 'Cajon'] },
  'Hawaiian': { harmonic: ['Ukulele & Slack Key Guitar', 'Steel Guitar'], bass: ['Upright Bass', 'Ukulele Bass'], rhythm: ['Ipu Gourd Drum', 'Hand Percussion', 'Shakers'] }
};

export function getLyriaPool(genre: string, channel: ChannelName): string[] {
  const base = LYRIA_GENRE_POOLS[genre]?.[channel] || LYRIA_DEFAULT_POOLS[channel];
  const small = LYRIA_SMALL_ENSEMBLES[genre]?.[channel] || LYRIA_SMALL_ENSEMBLES['_default'][channel] || [];
  // Added after the existing options so the first (default) choice does not change
  return [...base, ...small.filter(i => !base.includes(i))];
}
