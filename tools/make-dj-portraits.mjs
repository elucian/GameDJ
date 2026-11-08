// Generates the DJ portraits (flat vector avatars of fictional people) with a Gemini image model.
// Usage: node tools/make-dj-portraits.mjs [name ...]   (no names: all DJs; existing files are kept unless named)
// Needs GEMINI_SONG_KEY (or GEMINI_LIVE_KEY) in private/.env. Writes private/dj-portraits/<name>.png (git-ignored), then
// tools/shrink-portraits.py makes the small JPEGs the app uses.
import fs from 'node:fs';
import path from 'node:path';

const env = Object.fromEntries(fs.readFileSync('private/.env', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
// The paid song key first: the free live key has no image quota (HTTP 429)
const KEYS = [env.GEMINI_SONG_KEY, env.GEMINI_LIVE_KEY, env.GEMINI_API_KEY].filter(Boolean);
const MODELS = ['gemini-3-pro-image', 'gemini-3.1-flash-image', 'gemini-2.5-flash-image'];

// Fictional people only: no likeness of any real musician or DJ. Flat vector avatars: bold dark outlines, flat colours,
// one pastel background colour per DJ, studio headphones on the ears, head and shoulders, front view. Attractive and
// stylish, each one recognisable by hair, clothes and a small detail from home.
// [who, clothes, background colour, headset (optional: replaces the big headphones)]
const DJS = {
  diego:   ['a handsome 31-year-old Spanish man, short dark wavy hair, light stubble, warm natural tanned skin (healthy skin tone, not green), confident smile', 'black shirt open at the collar, a dark red scarf', 'soft terracotta', 'classic black DJ headphones with one cup pressed on his right ear and the other cup pushed back behind his left ear, the DJ way'],
  viktor:  ['a distinguished, elegant 66-year-old Russian man, swept-back ash-blond hair, neatly trimmed blond beard, blue eyes, refined poised expression', 'a tailored charcoal suit jacket over a black turtleneck', 'pale steel blue',
            'a small, slim behind-the-neck headset: a thin band running behind the back of his neck, small earpieces on both ears, and a thin microphone boom attached to the left earpiece curving forward to the corner of his mouth'],
  jiwoo:   ['a beautiful, alluring 24-year-old Korean woman, sleek black bob with blunt fringe, confident flirty smile, small hoop earrings, slender with broad, well-defined shoulders that reach close to both edges of the image (about two and a half head widths across), the head large', 'a stylish fitted cream off-the-shoulder top showing her collarbones', 'pastel lavender', 'a cute pastel lilac gaming headset with small glowing cat ears on the band and a short flexible microphone near her chin'],
  ioana:   ['a pretty 42-year-old Romanian woman, dark hair tied back with a few grey strands, warm friendly eyes', 'white blouse with red Romanian folk embroidery', 'pale rose', 'small vintage on-ear headphones with round cream ear pads and a thin red band, matching her embroidery'],
  luc:     ['a charming 58-year-old French man, salt-and-pepper hair, round tortoiseshell glasses, half smile', 'navy striped scarf over a jacket', 'pale butter yellow', '1970s vintage headphones in tan leather with chrome sliders and a coiled black cable, worn on his head over both ears'],
  aria:    ['a gorgeous 29-year-old Italian woman, long dark curly hair, green eyes, red lips, glamorous', 'emerald velvet top with bare shoulders', 'soft mint green', 'sleek rose-gold wireless headphones with slim ear cups, elegant like jewellery'],
  siobhan: ['an elegant, stylish 63-year-old Irish woman with an old-fashioned artistic look, silver-auburn hair in a neat vintage chignon, a few freckles, refined gentle smile, red lipstick, a cameo brooch and small pearl earrings', 'a high-collared vintage blouse in cream lace under a tailored forest-green velvet jacket', 'pale sage', 'elegant vintage headphones with brass ear cups and a dark green leather band, worn on her head over both ears'],
  imani:   ['a beautiful, alluring, modern 38-year-old African-American woman from Chicago, long sleek straight black hair past her shoulders, natural proportions with broad, well-defined shoulders as wide as in a real photo (about two and a half head widths across), gold hoop earrings, glossy lips, confident smile', 'a fitted deep blue satin blouse', 'soft peach', 'glossy white wireless over-ear headphones with gold accents'],
  desmond: ['a very handsome, sexy 33-year-old Jamaican man, dark skin, long black dreadlocks flowing past his shoulders, short neat beard, strong jaw, confident charming smile', 'a cream linen shirt open at the collar under an olive waistcoat', 'pale teal', 'retro headphones with polished walnut wood ear cups and a thin band striped in green, gold and black, sitting over his locs'],
  marcus:  ['a rugged, good-looking 45-year-old Texan man, short dark beard, short tousled dark brown hair, no hat', 'denim shirt', 'warm sand beige', 'rugged headphones with brown tooled-leather ear cups and brass hinges, like saddle leather']
};

const prompt = ([who, clothes, bg, headset]) => [
  `Flat vector avatar illustration of ${who}, a fictional DJ (not a real person), wearing ${clothes}, and ${headset || "large over-ear studio headphones worn on the head, covering both ears (not around the neck)"}.`,
  'Modern flat design: clean bold dark outlines, flat colour fills with very little shading, simple elegant facial features, stylish and attractive.',
  `Head and shoulders, front view, centred, the head large (about half the image height); natural adult proportions with full-width shoulders, the torso continuing down and running off the bottom edge of the image (not cut into a rounded bust shape, no floating cut-off body), on a plain flat ${bg} background that fills the whole image edge to edge, nothing else.`,
  `Square composition. ${headset ? 'No other microphone' : 'No microphone'}, no text, no logo, no signature, no frame, no border, no white margin: the colour reaches every edge.`
].join(' ');

async function render(dj) {
  let last = '';
  for (const model of MODELS) for (const key of KEYS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt(dj) }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } } })
    });
    const data = await res.json().catch(() => ({}));
    const part = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
    if (part) return { bytes: Buffer.from(part.inlineData.data, 'base64'), model };
    last = `${model}: ${res.status} ${JSON.stringify(data?.error?.message || data?.candidates?.[0]?.finishReason || '').slice(0, 160)}`;
    console.warn('  failed', last);
  }
  throw new Error(last);
}

const names = process.argv.slice(2);
fs.mkdirSync('private/dj-portraits', { recursive: true });
for (const [name, dj] of Object.entries(DJS)) {
  const out = path.join('private/dj-portraits', `${name}.png`);
  if (names.length ? !names.includes(name) : fs.existsSync(out)) continue;
  process.stdout.write(`${name}... `);
  const { bytes, model } = await render(dj);
  fs.writeFileSync(out, bytes);
  console.log(`ok (${model}, ${Math.round(bytes.length / 1024)} KB)`);
}
