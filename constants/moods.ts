/**
 * The moods of the Mood menu are exactly the mood words Lyria documents ("Mood and Atmosphere" in the Lyria prompt
 * guide, https://ai.google.dev/gemini-api/docs/lyria-prompt-guide). The model knows these words, so they steer it
 * reliably; invented moods ("Sexy", "Party", "Heroic" ...) are not in that list and were removed.
 */
export const LYRIA_MOODS = [
  'Ambient', 'Bright', 'Chill', 'Dark', 'Dreamy', 'Emotional', 'Ethereal', 'Euphoric', 'Funky', 'Groovy',
  'Melancholic', 'Nostalgic', 'Ominous', 'Psychedelic', 'Relaxed', 'Soulful', 'Triumphant', 'Upbeat', 'Whimsical'
] as const;

/** Menu entries: no mood, then Lyria's moods. */
export const MOODS: string[] = ['None', ...LYRIA_MOODS];

/**
 * Moods that belong to each genre. The dice and the DJ pick from these (a lullaby-calm hip hop track or an
 * aggressive Gregorian chant is rarely what anyone wants), and the Mood menu lists them first.
 * Every name must be in LYRIA_MOODS.
 */
export const GENRE_MOODS: Record<string, string[]> = {
  'Pop': ['Upbeat', 'Euphoric', 'Bright', 'Emotional', 'Dreamy', 'Nostalgic', 'Chill'],
  'Hip Hop': ['Dark', 'Groovy', 'Funky', 'Chill', 'Nostalgic', 'Ominous', 'Triumphant', 'Soulful'],
  'Jazz': ['Groovy', 'Soulful', 'Chill', 'Nostalgic', 'Relaxed', 'Melancholic', 'Funky'],
  'Blues': ['Soulful', 'Melancholic', 'Emotional', 'Nostalgic', 'Groovy', 'Dark'],
  'Electronic': ['Euphoric', 'Psychedelic', 'Dark', 'Upbeat', 'Dreamy', 'Ambient', 'Funky', 'Groovy'],
  'Rock': ['Upbeat', 'Dark', 'Triumphant', 'Nostalgic', 'Emotional', 'Psychedelic', 'Funky'],
  'Ambient': ['Ambient', 'Relaxed', 'Ethereal', 'Dreamy', 'Ominous', 'Psychedelic', 'Chill'],
  'Gaming': ['Triumphant', 'Upbeat', 'Whimsical', 'Ominous', 'Dark', 'Bright', 'Ethereal'],
  'Classic': ['Emotional', 'Melancholic', 'Triumphant', 'Relaxed', 'Bright', 'Nostalgic'],
  'Opera': ['Emotional', 'Triumphant', 'Melancholic', 'Dark', 'Ominous'],
  'Marching': ['Triumphant', 'Upbeat', 'Bright', 'Emotional'],
  'Renascentist': ['Bright', 'Whimsical', 'Relaxed', 'Nostalgic', 'Emotional'],
  'Victorian': ['Nostalgic', 'Emotional', 'Whimsical', 'Melancholic', 'Bright', 'Relaxed'],
  'Spiritual': ['Ethereal', 'Relaxed', 'Emotional', 'Soulful', 'Triumphant', 'Bright'],
  'African': ['Upbeat', 'Euphoric', 'Groovy', 'Funky', 'Soulful', 'Bright'],
  'Indian': ['Relaxed', 'Ethereal', 'Emotional', 'Soulful', 'Psychedelic', 'Euphoric'],
  'Irish': ['Upbeat', 'Nostalgic', 'Melancholic', 'Whimsical', 'Euphoric', 'Emotional'],
  'Spanish': ['Emotional', 'Soulful', 'Dark', 'Upbeat', 'Nostalgic', 'Euphoric'],
  'Oriental': ['Relaxed', 'Ethereal', 'Dreamy', 'Melancholic', 'Ominous', 'Emotional'],
  'Romanian': ['Upbeat', 'Euphoric', 'Nostalgic', 'Melancholic', 'Soulful'],
  'European': ['Nostalgic', 'Melancholic', 'Upbeat', 'Emotional', 'Euphoric', 'Whimsical'],
  'Western': ['Nostalgic', 'Melancholic', 'Ominous', 'Triumphant', 'Relaxed', 'Dark'],
  'Hawaiian': ['Relaxed', 'Chill', 'Bright', 'Dreamy', 'Nostalgic', 'Upbeat']
};

/** Older mood names (style signatures, saved settings) and the Lyria mood that replaces each. */
const LEGACY_MOODS: Record<string, string> = {
  'Aggressive': 'Dark', 'Calm': 'Relaxed', 'Cinematic': 'Emotional', 'Dramatic': 'Emotional', 'Elegant': 'Bright',
  'Energetic': 'Upbeat', 'Epic': 'Triumphant', 'Happy': 'Upbeat', 'Heroic': 'Triumphant', 'Hypnotic': 'Psychedelic',
  'Intense': 'Dark', 'Joyful': 'Upbeat', 'Meditative': 'Relaxed', 'Mysterious': 'Ethereal', 'Party': 'Euphoric',
  'Peaceful': 'Relaxed', 'Romantic': 'Emotional', 'Sad': 'Melancholic', 'Sentimental': 'Nostalgic', 'Sexy': 'Soulful',
  'Spiritual': 'Ethereal', 'Tense': 'Ominous', 'Triumphal': 'Triumphant', 'Uplifting': 'Upbeat'
};

/** A mood that is on the Lyria list: legacy names are translated, an empty one becomes 'None'. */
export function canonicalMood(mood: string | undefined | null): string {
  if (!mood) return 'None';
  return LEGACY_MOODS[mood] ?? mood;
}

/**
 * What a mood word means in musical terms: the Lyria word first (the model knows it), then a few plain musical
 * hints. Never an instrument or an artist.
 */
export const MOOD_PHRASES: Record<string, string> = {
  'Ambient': 'ambient, atmospheric and spacious, slowly evolving textures',
  'Bright': 'bright, clear and sunny, major colours',
  'Chill': 'chill, laid-back and easygoing, relaxed pocket',
  'Dark': 'dark, brooding, minor harmony, low register',
  'Dreamy': 'dreamy, floating, soft and hazy with gentle reverb',
  'Emotional': 'emotional, heartfelt and expressive, tender dynamics',
  'Ethereal': 'ethereal, airy, shimmering and weightless',
  'Euphoric': 'euphoric, ecstatic, uplifting and celebratory',
  'Funky': 'funky, syncopated and tight, infectious groove',
  'Groovy': 'groovy, laid-back pocket, infectious rhythm',
  'Melancholic': 'melancholic, wistful, bittersweet minor colours',
  'Nostalgic': 'nostalgic, warm, wistful and familiar',
  'Ominous': 'ominous, foreboding, low and slow-building',
  'Psychedelic': 'psychedelic, swirling, hypnotic and trippy',
  'Relaxed': 'relaxed, gentle, unhurried and calm',
  'Soulful': 'soulful, deeply felt, expressive and warm',
  'Triumphant': 'triumphant, victorious, majestic and rising',
  'Upbeat': 'upbeat, lively, positive and energetic',
  'Whimsical': 'whimsical, playful, quirky and light'
};

/** The mood as it goes into a prompt: the musical phrase, or the plain word for a custom mood. */
export function moodPhrase(mood: string): string {
  const m = canonicalMood(mood);
  return MOOD_PHRASES[m] || m.toLowerCase();
}

/** A fitting mood for the genre, or null if the genre has no list. */
export function pickGenreMood(genre: string): string | null {
  const list = GENRE_MOODS[genre];
  return list?.length ? list[Math.floor(Math.random() * list.length)] : null;
}

