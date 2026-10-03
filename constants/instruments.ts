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

// Voice instruments that can always be picked on the Band tab too, so the Voice dialog and the channels can stay in sync.
export const VOICE_CHANNEL_POOLS: Partial<Record<ChannelName, string[]>> = {
  alto: ['Solo Voice', 'Duet Voices', 'Quartet Voices'],
  harmonic: ['Chamber Choir', 'Mixed Choir', 'Gospel Choir', 'Male Choir', 'Female Choir', 'Childrens Choir']
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
  'Western': { lead: ['Solo Voice', 'Duet Voices', 'Harmonica', 'Violin', 'Steel Guitar', 'Banjo'], alto: ['Acoustic Guitar', 'Banjo', 'Piano', 'Mandolin', 'Male Choir', 'A Cappella Group'], harmonic: ['String Orchestra', 'Violin Section', 'Chamber Strings'], rhythm: ['Snare Ensemble', 'Cinematic Drums', 'Timpani & Drums'] },
  'Hawaiian': { lead: ['Solo Voice', 'Steel Guitar', 'Ukulele', 'Flute'], alto: ['Ukulele', 'Slack Key Guitar', 'Acoustic Guitar', 'Harp', 'Female Choir', 'Mixed Choir'], harmonic: ['Chamber Strings', 'Harp & Strings', 'String Orchestra'], bass: ['Low Brass', 'French Horns'], rhythm: ['Orchestral Percussion', 'Timpani & Drums'] }
};

/** Lyria tab: the channel that carries solo voices (VOICE/LEAD) and the one that carries choirs (VOICE/HARMONY). */
export const LYRIA_VOICE_CHANNELS = { solo: 'lead', choir: 'alto' } as const;

export function getLyriaPool(genre: string, channel: ChannelName): string[] {
  return LYRIA_GENRE_POOLS[genre]?.[channel] || LYRIA_DEFAULT_POOLS[channel];
}
