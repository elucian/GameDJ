export const FALLBACK_POOLS = {
  lead: ['Synthesizer', 'Electric Guitar', 'Acoustic Guitar', 'Spanish Guitar', 'Flamenco Guitar', 'Classical Guitar', 'Tres', 'Bandurria', 'Saxophone', 'Trumpet', 'Trombone', 'Clarinet', 'Flute', 'Violin', 'Cello', 'Viola', 'Oboe', 'English Horn', 'French Horn', 'Bassoon', 'Harmonica', 'Chromatic Harmonica', 'Accordion', 'Banjo', 'Mandolin', 'Sitar', 'Koto', 'Erhu', 'Oud', 'Bagpipes', 'Bell Synth', 'Whistle', 'Didgeridoo', 'Recorder', 'Pan Flute', 'Pipe Flute', 'Marimba', 'Xylophone', 'Ocarina'].sort(),
  alto: ['Saxophone', 'Trumpet', 'Trombone', 'Clarinet', 'Viola', 'Violin', 'Cello', 'French Horn', 'English Horn', 'Bassoon', 'Oboe', 'Brass Section', 'Strings', 'Flute', 'Recorder', 'Accordion', 'Synthesizer', 'Electric Piano', 'Vibraphone', 'Harp', 'Low Whistle', 'Mandocello', 'Pan Flute', 'Harmonica', 'Chromatic Harmonica', 'Electric Violin', 'Pipe Flute', 'Solo Male', 'Solo Female'].sort(),
  harmonic: ['Piano', 'Electric Piano', 'Acoustic Guitar', 'Spanish Guitar', 'Flamenco Guitar', 'Electric Guitar', 'Organ', 'Strings', 'Pads', 'Harpsichord', 'Harp', 'Marimba', 'Cimbalom', 'Tanpura', 'Synthesizer', 'Stab Chords', 'Accordion', 'Harmonium', 'Guzheng', 'Qanun', 'Celesta'].sort(),
  bass: ['Electric Bass', 'Synth Bass', 'Double Bass', 'Tuba', 'Trombone', 'French Horn', 'Cello', 'Bassoon', 'Bass Clarinet', 'Baritone Saxophone', 'Didgeridoo', 'Timpani', 'Bass Harmonica', 'Bass Recorder', 'Bass Trombone'].sort(),
  rhythm: ['Drum Kit', 'Electronic Drums', 'Hand Drum', 'Tabla', 'Djembe', 'Congas', 'Bongos', 'Timbales', 'Taiko Drums', 'Percussion', 'Shakers', 'Tambourine', 'Bells', 'Stomps', 'Industrial Percussion', 'Woodblock', 'Cowbell', 'Snare Drum', 'Cymbals', 'Bass Drum', 'Gong', 'Triangle', 'Wind Chimes'].sort()
};


// === LYRIA (orchestra) POOLS ===
// Lyria channels: lead = orchestra, alto = voice (the kind of voice is set in the Voice dialog),
// harmonic = choir, bass = brass, rhythm = orchestral percussion.
type ChannelName = 'lead' | 'alto' | 'harmonic' | 'bass' | 'rhythm';

export const LYRIA_DEFAULT_POOLS: Record<ChannelName, string[]> = {
  lead: ['Symphony Orchestra', 'String Orchestra', 'Chamber Orchestra', 'Chamber Strings', 'Violin Section', 'Cello Ensemble', 'Woodwind Section', 'Harp & Strings'],
  alto: ['Solo Voice', 'Duet Voices', 'Quartet Voices', 'Choir Voices', 'Chamber Choir'],
  harmonic: ['Mixed Choir', 'Chamber Choir', 'Male Choir', 'Female Choir', 'Childrens Choir', 'Epic Choir', 'Gospel Choir', 'Gregorian Chant', 'A Cappella Group'],
  bass: ['Brass Section', 'Low Brass', 'French Horns', 'Trombones', 'Tuba', 'Brass Quintet', 'Cinematic Brass'],
  rhythm: ['Timpani & Drums', 'Orchestral Percussion', 'Cinematic Drums', 'Taiko Drums', 'Snare Ensemble']
};

// Voice instruments that can always be picked on the Band tab too, so the Voice dialog and the channels can stay in sync.
export const VOICE_CHANNEL_POOLS: Partial<Record<ChannelName, string[]>> = {
  alto: ['Solo Voice', 'Duet Voices', 'Quartet Voices'],
  harmonic: ['Chamber Choir', 'Mixed Choir', 'Gospel Choir', 'Male Choir', 'Female Choir', 'Childrens Choir']
};

// Per-genre overrides: only the channels listed differ from the default pools.
export const LYRIA_GENRE_POOLS: Record<string, Partial<Record<ChannelName, string[]>>> = {
  'Classic': { lead: ['Symphony Orchestra', 'Chamber Orchestra', 'String Orchestra', 'Violin Section', 'Cello Ensemble', 'Woodwind Section'], harmonic: ['Mixed Choir', 'Chamber Choir', 'Male Choir', 'Female Choir'], bass: ['French Horns', 'Brass Quintet', 'Low Brass', 'Trombones'], rhythm: ['Timpani & Drums', 'Orchestral Percussion'] },
  'Renascentist': { lead: ['Chamber Strings', 'Chamber Orchestra', 'Harp & Strings', 'Woodwind Section'], harmonic: ['Chamber Choir', 'A Cappella Group', 'Mixed Choir'], bass: ['Brass Quintet', 'Trombones'], rhythm: ['Timpani & Drums', 'Snare Ensemble'] },
  'Victorian': { lead: ['String Orchestra', 'Chamber Orchestra', 'Violin Section', 'Harp & Strings'], harmonic: ['Mixed Choir', 'Chamber Choir', 'Female Choir'], bass: ['French Horns', 'Brass Quintet', 'Low Brass'], rhythm: ['Timpani & Drums', 'Snare Ensemble'] },
  'Spiritual': { lead: ['String Orchestra', 'Chamber Strings', 'Harp & Strings'], harmonic: ['Gregorian Chant', 'Gospel Choir', 'Mixed Choir', 'Chamber Choir', 'Epic Choir'], bass: ['French Horns', 'Low Brass'], rhythm: ['Timpani & Drums', 'Orchestral Percussion'] },
  'Opera': { lead: ['Symphony Orchestra', 'Chamber Orchestra', 'String Orchestra'], harmonic: ['Mixed Choir', 'Male Choir', 'Female Choir', 'Chamber Choir', 'Epic Choir'], bass: ['French Horns', 'Brass Section', 'Trombones'], rhythm: ['Timpani & Drums', 'Orchestral Percussion'] },
  'Marching': { lead: ['Symphony Orchestra', 'Woodwind Section', 'String Orchestra'], harmonic: ['Male Choir', 'Mixed Choir', 'Epic Choir'], bass: ['Military Fanfare', 'Brass Section', 'Tuba', 'Trombones'], rhythm: ['Snare Ensemble', 'Timpani & Drums', 'Cinematic Drums'] },
  'Ambient': { lead: ['String Orchestra', 'Chamber Strings', 'Harp & Strings', 'Cello Ensemble'], harmonic: ['Female Choir', 'Chamber Choir', 'Epic Choir', 'Mixed Choir'], bass: ['French Horns', 'Low Brass'], rhythm: ['Orchestral Percussion', 'Timpani & Drums'] },
  'Gaming': { lead: ['Symphony Orchestra', 'String Orchestra', 'Chamber Orchestra'], harmonic: ['Epic Choir', 'Mixed Choir', 'Chamber Choir'], bass: ['Cinematic Brass', 'Brass Section', 'French Horns'], rhythm: ['Cinematic Drums', 'Taiko Drums', 'Timpani & Drums'] },
  'African': { harmonic: ['A Cappella Group', 'Gospel Choir', 'Mixed Choir', 'Female Choir'], rhythm: ['Orchestral Percussion', 'Taiko Drums', 'Timpani & Drums'] },
  'Indian': { lead: ['String Orchestra', 'Violin Section', 'Woodwind Section', 'Harp & Strings'], harmonic: ['Mixed Choir', 'Female Choir', 'Chamber Choir'], rhythm: ['Orchestral Percussion', 'Snare Ensemble'] },
  'Irish': { lead: ['Chamber Strings', 'Violin Section', 'Woodwind Section', 'Harp & Strings'], harmonic: ['Mixed Choir', 'Male Choir', 'A Cappella Group'], rhythm: ['Snare Ensemble', 'Orchestral Percussion'] },
  'Spanish': { lead: ['Chamber Strings', 'Violin Section', 'String Orchestra', 'Harp & Strings'], harmonic: ['Mixed Choir', 'Male Choir', 'A Cappella Group'], bass: ['Brass Quintet', 'Trombones'], rhythm: ['Orchestral Percussion', 'Snare Ensemble'] },
  'Oriental': { lead: ['String Orchestra', 'Woodwind Section', 'Harp & Strings', 'Cello Ensemble'], harmonic: ['Female Choir', 'Chamber Choir', 'Mixed Choir'], rhythm: ['Taiko Drums', 'Orchestral Percussion'] },
  'Romanian': { lead: ['Violin Section', 'String Orchestra', 'Chamber Strings'], harmonic: ['Mixed Choir', 'Male Choir', 'A Cappella Group'], bass: ['Brass Quintet', 'Tuba', 'Low Brass'], rhythm: ['Orchestral Percussion', 'Snare Ensemble'] },
  'Western': { lead: ['String Orchestra', 'Violin Section', 'Chamber Strings'], harmonic: ['Male Choir', 'Mixed Choir', 'A Cappella Group'], rhythm: ['Snare Ensemble', 'Cinematic Drums', 'Timpani & Drums'] },
  'Hawaiian': { lead: ['Chamber Strings', 'Harp & Strings', 'String Orchestra'], harmonic: ['Female Choir', 'Mixed Choir', 'A Cappella Group'], bass: ['Low Brass', 'French Horns'], rhythm: ['Orchestral Percussion', 'Timpani & Drums'] }
};

export function getLyriaPool(genre: string, channel: ChannelName): string[] {
  return LYRIA_GENRE_POOLS[genre]?.[channel] || LYRIA_DEFAULT_POOLS[channel];
}
