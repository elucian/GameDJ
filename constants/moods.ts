/**
 * Moods that belong to each genre. The dice and the DJ pick from these (a lullaby-calm hip hop track or an
 * aggressive Gregorian chant is rarely what anyone wants), and the Mood menu lists them first.
 * Every name must exist in MOODS (components/TopToolbar.ts).
 */
export const GENRE_MOODS: Record<string, string[]> = {
  'Pop': ['Happy', 'Energetic', 'Uplifting', 'Romantic', 'Party', 'Joyful', 'Sentimental', 'Dreamy'],
  'Hip Hop': ['Aggressive', 'Groovy', 'Intense', 'Dark', 'Party', 'Nostalgic', 'Triumphal', 'Mysterious'],
  'Jazz': ['Groovy', 'Soulful', 'Romantic', 'Nostalgic', 'Elegant', 'Sexy', 'Mysterious', 'Melancholic'],
  'Blues': ['Soulful', 'Melancholic', 'Sad', 'Sexy', 'Nostalgic', 'Groovy', 'Dark'],
  'Electronic': ['Energetic', 'Hypnotic', 'Party', 'Intense', 'Dark', 'Uplifting', 'Dreamy'],
  'Rock': ['Energetic', 'Aggressive', 'Intense', 'Triumphal', 'Heroic', 'Nostalgic', 'Dark', 'Epic'],
  'Ambient': ['Calm', 'Peaceful', 'Meditative', 'Ethereal', 'Dreamy', 'Mysterious', 'Hypnotic'],
  'Gaming': ['Epic', 'Heroic', 'Tense', 'Whimsical', 'Mysterious', 'Triumphal', 'Energetic', 'Ominous'],
  'Classic': ['Elegant', 'Romantic', 'Dramatic', 'Peaceful', 'Melancholic', 'Triumphal', 'Sentimental'],
  'Opera': ['Dramatic', 'Romantic', 'Epic', 'Tense', 'Sad', 'Triumphal', 'Sentimental'],
  'Marching': ['Heroic', 'Triumphal', 'Energetic', 'Epic', 'Intense', 'Uplifting'],
  'Renascentist': ['Elegant', 'Joyful', 'Peaceful', 'Whimsical', 'Romantic', 'Nostalgic'],
  'Victorian': ['Elegant', 'Romantic', 'Sentimental', 'Nostalgic', 'Whimsical', 'Melancholic'],
  'Spiritual': ['Spiritual', 'Peaceful', 'Meditative', 'Uplifting', 'Soulful', 'Ethereal', 'Joyful'],
  'African': ['Joyful', 'Energetic', 'Groovy', 'Party', 'Uplifting', 'Spiritual', 'Soulful'],
  'Indian': ['Meditative', 'Spiritual', 'Romantic', 'Joyful', 'Soulful', 'Hypnotic', 'Party'],
  'Irish': ['Joyful', 'Nostalgic', 'Melancholic', 'Energetic', 'Party', 'Whimsical', 'Sentimental'],
  'Spanish': ['Romantic', 'Sexy', 'Dramatic', 'Energetic', 'Sentimental', 'Party', 'Soulful'],
  'Oriental': ['Peaceful', 'Meditative', 'Mysterious', 'Elegant', 'Dreamy', 'Melancholic', 'Ethereal'],
  'Romanian': ['Joyful', 'Energetic', 'Party', 'Nostalgic', 'Melancholic', 'Soulful'],
  'Western': ['Nostalgic', 'Melancholic', 'Tense', 'Heroic', 'Peaceful', 'Epic', 'Sentimental'],
  'Hawaiian': ['Peaceful', 'Happy', 'Dreamy', 'Romantic', 'Joyful', 'Calm', 'Nostalgic']
};

/**
 * What a mood word means in musical terms. "Sexy" or "Party" alone are vague to a music model; these name the
 * sound (tempo feel, harmony, dynamics, timbre) and never an instrument or an artist.
 */
export const MOOD_PHRASES: Record<string, string> = {
  'Aggressive': 'aggressive, hard-hitting, forceful attack',
  'Calm': 'calm, gentle, unhurried',
  'Cinematic': 'cinematic, wide and dramatic, slowly building',
  'Dark': 'dark, brooding, minor harmony, low register',
  'Dramatic': 'dramatic, big contrasts between soft and loud, tension and release',
  'Dreamy': 'dreamy, floating, soft and hazy with gentle reverb',
  'Elegant': 'elegant, refined, graceful phrasing',
  'Energetic': 'energetic, driving, forward momentum',
  'Epic': 'epic, grand, soaring and powerful',
  'Ethereal': 'ethereal, airy, shimmering and weightless',
  'Groovy': 'groovy, laid-back pocket, infectious rhythm',
  'Happy': 'happy, bright, major key, bouncy',
  'Heroic': 'heroic, bold, noble and rising',
  'Hypnotic': 'hypnotic, repetitive and trance-like, slowly evolving',
  'Intense': 'intense, urgent, tightly wound',
  'Joyful': 'joyful, celebratory, lively and warm',
  'Meditative': 'meditative, slow, still and spacious',
  'Melancholic': 'melancholic, wistful, bittersweet minor colours',
  'Mysterious': 'mysterious, curious, sparse with unresolved harmony',
  'Nostalgic': 'nostalgic, warm, wistful and familiar',
  'Ominous': 'ominous, foreboding, low and slow-building',
  'Party': 'festive party energy, upbeat and danceable',
  'Peaceful': 'peaceful, soft, serene and consoling',
  'Romantic': 'romantic, tender, warm and expressive',
  'Sad': 'sad, mournful, slow and sorrowful',
  'Sentimental': 'sentimental, heartfelt, tender and emotional',
  'Sexy': 'sensual, slow and smoky, close and intimate',
  'Soulful': 'soulful, deeply felt, expressive and warm',
  'Spiritual': 'spiritual, reverent, uplifting and sacred',
  'Tense': 'tense, suspenseful, restless and edgy',
  'Triumphal': 'triumphant, victorious, majestic',
  'Uplifting': 'uplifting, hopeful, rising and bright',
  'Whimsical': 'whimsical, playful, quirky and light'
};

/** The mood as it goes into a prompt: the musical phrase, or the plain word for a custom mood. */
export function moodPhrase(mood: string): string {
  return MOOD_PHRASES[mood] || mood.toLowerCase();
}

/** A fitting mood for the genre, or null if the genre has no list. */
export function pickGenreMood(genre: string): string | null {
  const list = GENRE_MOODS[genre];
  return list?.length ? list[Math.floor(Math.random() * list.length)] : null;
}
