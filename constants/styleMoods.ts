import { GENRE_MOODS, pickGenreMood } from './moods';

/**
 * The Genre/Style matrix: the moods that fit each style, best first, all from the Lyria mood list (constants/moods.ts).
 * The first one is the style's default mood; the dice, the DJ and the "Suits" part of the Mood menu use the whole list.
 */
export const STYLE_MOODS: Record<string, string[]> = {
  // Pop
  'Synth-Pop': ['Upbeat', 'Nostalgic', 'Euphoric'], 'Disco Pop': ['Funky', 'Groovy', 'Euphoric'], 'K-Pop': ['Upbeat', 'Euphoric', 'Bright'],
  'R&B': ['Soulful', 'Chill', 'Groovy'], 'Indie Pop': ['Nostalgic', 'Dreamy', 'Bright'], 'Pop Rock': ['Upbeat', 'Bright', 'Triumphant'],
  // Hip Hop
  'Freestyle Rap': ['Groovy', 'Dark', 'Funky'], 'Boom Bap': ['Groovy', 'Nostalgic', 'Dark'], 'Trap': ['Dark', 'Ominous', 'Triumphant'],
  'Old School': ['Funky', 'Upbeat', 'Groovy'], 'Lo-Fi Hip Hop': ['Chill', 'Nostalgic', 'Dreamy'], 'G-Funk': ['Funky', 'Chill', 'Groovy'],
  'Drill': ['Ominous', 'Dark'], 'Jazz Rap': ['Soulful', 'Chill', 'Groovy'], 'Conscious Rap': ['Emotional', 'Soulful', 'Nostalgic'],
  'Cloud Rap': ['Dreamy', 'Ethereal', 'Chill'],
  // Blues
  'Delta Blues': ['Melancholic', 'Soulful', 'Dark'], 'Chicago Blues': ['Groovy', 'Soulful', 'Funky'], 'Texas Blues': ['Soulful', 'Groovy', 'Upbeat'],
  'Blues Rock': ['Groovy', 'Dark', 'Upbeat'], 'Soul Blues': ['Soulful', 'Emotional', 'Melancholic'],
  // Jazz
  'Acid Jazz': ['Funky', 'Groovy', 'Chill'], 'Jazz Fusion': ['Groovy', 'Funky', 'Psychedelic'], 'Bebop': ['Upbeat', 'Groovy', 'Bright'],
  'Cool Jazz': ['Chill', 'Relaxed', 'Melancholic'], 'Smooth Jazz': ['Relaxed', 'Chill', 'Soulful'],
  // Electronic
  'Techno': ['Dark', 'Psychedelic', 'Euphoric'], 'Drum & Bass': ['Upbeat', 'Dark', 'Euphoric'], 'Vaporwave': ['Dreamy', 'Nostalgic', 'Ethereal'],
  'Deep House': ['Groovy', 'Chill', 'Euphoric'], 'Synthwave': ['Nostalgic', 'Dreamy', 'Upbeat'],
  // Rock
  'Classic Rock': ['Upbeat', 'Triumphant', 'Nostalgic'], 'Shoegaze': ['Dreamy', 'Ethereal', 'Melancholic'], 'Heavy Metal': ['Dark', 'Triumphant', 'Ominous'],
  'Indie Rock': ['Upbeat', 'Nostalgic', 'Bright'],
  // Ambient
  'Deep Space': ['Ambient', 'Ethereal', 'Ominous'], 'Lofi Chill': ['Chill', 'Relaxed', 'Dreamy'], 'Cinematic': ['Emotional', 'Triumphant', 'Ominous'],
  'Nature Soundscape': ['Ambient', 'Relaxed', 'Ethereal'], 'Dark Ambient': ['Ominous', 'Dark', 'Ambient'], 'Arctic Tundra': ['Ethereal', 'Ambient', 'Melancholic'],
  'Solar Wind': ['Ethereal', 'Psychedelic', 'Ambient'], 'Industrial Decay': ['Ominous', 'Dark'], 'Deep Forest': ['Ambient', 'Ethereal', 'Dreamy'],
  'Australian Desert': ['Ethereal', 'Ambient', 'Psychedelic'], 'African Jungle': ['Ambient', 'Groovy', 'Ominous'], 'Vast Ocean': ['Ambient', 'Relaxed', 'Dreamy'],
  // Gaming
  '8-Bit Retro': ['Whimsical', 'Upbeat', 'Bright'], 'Epic Boss': ['Dark', 'Triumphant', 'Ominous'], 'RPG Adventure': ['Triumphant', 'Emotional', 'Bright'],
  'Cyberpunk': ['Dark', 'Psychedelic', 'Funky'], 'Stealth': ['Ominous', 'Dark'], 'Dungeon Crawler': ['Dark', 'Ominous', 'Ethereal'],
  'Racing Arcade': ['Upbeat', 'Euphoric', 'Funky'], 'Cozy Simulation': ['Relaxed', 'Bright', 'Whimsical'], 'Platformer Bounce': ['Whimsical', 'Upbeat', 'Bright'],
  'Survival Horror': ['Ominous', 'Dark'], 'Victory Theme': ['Triumphant', 'Bright', 'Euphoric'],
  // Classic
  'Baroque': ['Bright', 'Triumphant', 'Emotional'], 'Romantic': ['Emotional', 'Nostalgic', 'Melancholic'], 'Impressionist': ['Dreamy', 'Ethereal', 'Relaxed'],
  'Modern Classical': ['Emotional', 'Ominous', 'Ethereal'], 'Opera/Dramatic': ['Emotional', 'Triumphant', 'Dark'], 'Viennese Waltz': ['Bright', 'Nostalgic', 'Euphoric'],
  'Minimalist Classical': ['Relaxed', 'Ethereal', 'Psychedelic'],
  // Renascentist
  'Royal Court': ['Bright', 'Triumphant', 'Relaxed'], 'Cathedral': ['Ethereal', 'Emotional', 'Triumphant'], 'Minstrel Ballad': ['Nostalgic', 'Emotional', 'Whimsical'],
  'Tudor Dance': ['Upbeat', 'Whimsical', 'Bright'], 'Village Festival': ['Upbeat', 'Euphoric', 'Whimsical'],
  // Victorian
  'Gothic Horror': ['Ominous', 'Dark', 'Melancholic'], 'Parlour Waltz': ['Nostalgic', 'Bright', 'Emotional'], 'Steampunk Factory': ['Dark', 'Funky', 'Whimsical'],
  'Industrial Revolution': ['Ominous', 'Dark', 'Triumphant'], 'Detective Mystery': ['Ominous', 'Dark', 'Whimsical'],
  // Spiritual
  'Gregorian Chant': ['Ethereal', 'Relaxed', 'Ambient'], 'Byzantine Chant': ['Ethereal', 'Emotional', 'Melancholic'], 'Gospel': ['Soulful', 'Triumphant', 'Euphoric'],
  'New Age Healing': ['Relaxed', 'Ethereal', 'Ambient'], 'Shamanic Pulse': ['Psychedelic', 'Ethereal', 'Ominous'], 'Zen Meditation': ['Relaxed', 'Ambient', 'Ethereal'],
  'Christmas Carols': ['Bright', 'Nostalgic', 'Whimsical'],
  // African
  'Afrobeats': ['Groovy', 'Upbeat', 'Euphoric'], 'Malian Blues': ['Soulful', 'Psychedelic', 'Melancholic'], 'Highlife': ['Upbeat', 'Bright', 'Funky'],
  'Desert Rock': ['Psychedelic', 'Soulful', 'Dark'], 'Marabi/Soweto': ['Upbeat', 'Euphoric', 'Soulful'],
  // Indian
  'Hindustani': ['Relaxed', 'Ethereal', 'Soulful'], 'Bhangra': ['Upbeat', 'Euphoric', 'Bright'], 'Carnatic': ['Ethereal', 'Emotional', 'Bright'],
  'Bollywood': ['Emotional', 'Upbeat', 'Euphoric'], 'Tabla Solo/Raga': ['Relaxed', 'Psychedelic', 'Ethereal'],
  // Irish
  'Folk': ['Nostalgic', 'Emotional', 'Whimsical'], 'Jig': ['Upbeat', 'Whimsical', 'Euphoric'], 'Reel': ['Upbeat', 'Euphoric', 'Bright'],
  'Air': ['Melancholic', 'Emotional', 'Ethereal'], 'Celtic Folk': ['Nostalgic', 'Emotional', 'Dreamy'], 'Celtic Punk/Rock': ['Upbeat', 'Euphoric', 'Dark'],
  // Spanish
  'Salsa': ['Upbeat', 'Euphoric', 'Funky'], 'Bossa Nova': ['Relaxed', 'Chill', 'Soulful'], 'Guitar': ['Emotional', 'Nostalgic', 'Soulful'],
  'Tango': ['Emotional', 'Dark', 'Soulful'], 'Reggaeton': ['Groovy', 'Upbeat', 'Dark'], 'Flamenco': ['Emotional', 'Dark', 'Soulful'],
  'Bolero': ['Emotional', 'Nostalgic', 'Soulful'], 'Paso Doble': ['Triumphant', 'Emotional', 'Upbeat'],
  // Oriental
  'Arabic Classical': ['Emotional', 'Ethereal', 'Soulful'], 'Japanese Folk': ['Relaxed', 'Melancholic', 'Ethereal'], 'Chinese Traditional': ['Relaxed', 'Dreamy', 'Ethereal'],
  'Turkish Folk': ['Soulful', 'Emotional', 'Upbeat'], 'Balinese Gamelan': ['Ethereal', 'Ambient', 'Psychedelic'],
  'Korean Folk': ['Melancholic', 'Soulful', 'Upbeat'],
  // European
  'Russian Folk': ['Melancholic', 'Soulful', 'Upbeat'], 'French Musette': ['Nostalgic', 'Whimsical', 'Bright'],
  'Tarantella': ['Upbeat', 'Euphoric', 'Whimsical'], 'Neapolitan Song': ['Emotional', 'Nostalgic', 'Soulful'],
  // Romanian
  'Manele': ['Euphoric', 'Upbeat', 'Soulful'], 'Doina': ['Melancholic', 'Emotional', 'Soulful'], 'Hora': ['Upbeat', 'Euphoric', 'Bright'],
  'Sârbă': ['Upbeat', 'Euphoric', 'Bright'], 'Lautareasca': ['Soulful', 'Emotional', 'Nostalgic'], 'Bănățeană': ['Upbeat', 'Groovy', 'Whimsical'],
  'Geampara': ['Upbeat', 'Groovy', 'Euphoric'], 'Invârtită': ['Upbeat', 'Euphoric', 'Whimsical'], 'Etno-Dance': ['Euphoric', 'Upbeat', 'Funky'],
  'Colinde': ['Bright', 'Ethereal', 'Nostalgic'], 'Plugușorul': ['Upbeat', 'Whimsical', 'Bright'],
  // Western
  'Bluegrass': ['Upbeat', 'Bright', 'Nostalgic'], 'Country': ['Nostalgic', 'Relaxed', 'Upbeat'], 'Americana': ['Nostalgic', 'Emotional', 'Melancholic'],
  'Outlaw Country': ['Dark', 'Soulful', 'Nostalgic'], 'Honky Tonk': ['Groovy', 'Upbeat', 'Nostalgic'], 'Rockabilly': ['Upbeat', 'Funky', 'Euphoric'],
  'Alt-Country': ['Melancholic', 'Nostalgic', 'Dreamy'], 'Texas Swing': ['Groovy', 'Upbeat', 'Bright'], 'Spaghetti Western': ['Ominous', 'Dark', 'Triumphant'],
  'Folk Revival': ['Nostalgic', 'Emotional', 'Bright'], 'Western Swing': ['Groovy', 'Upbeat', 'Bright'], 'Cowboy Ballad': ['Nostalgic', 'Melancholic', 'Relaxed'],
  // Hawaiian
  'Slack Key Guitar': ['Relaxed', 'Dreamy', 'Nostalgic'], 'Traditional Hula': ['Bright', 'Relaxed', 'Whimsical'], 'Island Reggae': ['Chill', 'Groovy', 'Upbeat'],
  // Marching
  'Military Fanfare': ['Triumphant', 'Bright', 'Upbeat'], 'Ceremonial': ['Triumphant', 'Emotional', 'Bright'],
  // Opera
  'Baroque Opera': ['Triumphant', 'Emotional', 'Bright'], 'Romantic Opera': ['Emotional', 'Melancholic', 'Triumphant'], 'Contemporary Opera': ['Dark', 'Emotional', 'Ominous']
};

/** Moods for a genre/style, best first: the style's own, then the genre's, no repeats. */
export function moodsFor(genre: string, style: string): string[] {
  return [...new Set([...(STYLE_MOODS[style] || []), ...(GENRE_MOODS[genre] || [])])];
}

/** A random fitting mood for the style (mostly its own list), or null when nothing is known about it. */
export function pickStyleMood(genre: string, style: string): string | null {
  const own = STYLE_MOODS[style];
  if (own?.length && Math.random() < 0.75) return own[Math.floor(Math.random() * own.length)];
  return pickGenreMood(genre);
}
