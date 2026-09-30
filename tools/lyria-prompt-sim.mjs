// Dev tool: checks which prompts Lyria RealTime's safety filter rejects.
//
//   npm run sim:prompts                 built-in corpus (the kinds of prompts GameDJ sends)
//   npm run sim:prompts -- my.json      your own list: ["prompt one", "prompt two", ...]
//
// Sends every prompt alone to a real Lyria session (uses GEMINI_API_KEY from .env.local, never printed) and lists the
// ones the server reports back as filtered. The verdict is matched by the prompt text, because the filtered
// notice arrives a few seconds after the prompt was sent. Results are also written to tools/lyria-prompt-sim.out.json.
// The filter is a classifier: the same prompt can pass one time and fail the next, so treat "filtered" as a risk.
import fs from "node:fs";
import { GoogleGenAI } from "@google/genai";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = /GEMINI_API_KEY=(.+)/.exec(env)?.[1]?.trim();
if (!key) throw new Error("GEMINI_API_KEY not found in .env.local");

const SUFFIX = " IMPORTANT: Only use these instruments: lead Piano, bass Electric Bass.";
const builtIn = [
  // What GameDJ sends today (should pass)
  "Hip Hop, Freestyle Rap style, C Minor, 90 BPM, energetic",
  "dusty boom bap drums with jazzy sampled loops" + SUFFIX,
  "The arrangement features: lead rap vocals, rhythmic spoken flow, bass Synth Bass, rhythm Drum Kit",
  "Solo performance: Piano playing alone, unaccompanied. No other instruments.",
  "solo human singing voice, warm, moderate volume",
  "chamber choir vocals, ooh and aah harmonies",
  'vocals sung in Spanish: "La luna canta en el mar / mi corazon quiere bailar"',
  "vocalise on open vowels, ah oh ooh",
  "A CAPPELLA RAP: drums and instruments drop out completely, only the rapper with tight rhythmic flow",
  "high fidelity studio recording, clean balanced mix, each instrument clear and distinct",
  "progressive, dynamic and complex music",
  // Known to be rejected: artist names (the old dice-roll references), and a few odd ones
  "Kendrick Lamar style", "Miles Davis style", "Daft Punk style", "Taylor Swift style", "The Weeknd vibe", "Wu-Tang Clan grit",
  "gritty east coast rap", "boys choir",
];
const prompts = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], "utf8")) : builtIn;

const ai = new GoogleGenAI({ apiKey: key, apiVersion: "v1alpha" });
const filtered = new Map();
const session = await ai.live.music.connect({
  model: "models/lyria-realtime-exp",
  callbacks: {
    onmessage: (m) => { if (m.filteredPrompt) filtered.set(m.filteredPrompt.text, m.filteredPrompt.filteredReason); },
    onerror: (e) => console.log("ERROR", e?.message || e),
    onclose: () => {},
  },
});
await session.setMusicGenerationConfig({ musicGenerationConfig: { bpm: 100, guidance: 4.0, temperature: 1.1 } });
await session.setWeightedPrompts({ weightedPrompts: [{ text: "warm piano", weight: 1.0 }] });
session.play();
await new Promise((r) => setTimeout(r, 3000));

for (const p of prompts) {
  await session.setWeightedPrompts({ weightedPrompts: [{ text: p, weight: 1.0 }] });
  await new Promise((r) => setTimeout(r, 3500));
}
await new Promise((r) => setTimeout(r, 8000));

const out = prompts.map((p) => ({ prompt: p, filtered: filtered.has(p), reason: filtered.get(p) ?? null }));
out.forEach((o) => console.log((o.filtered ? "FILTERED " : "ok       ") + JSON.stringify(o.prompt)));
console.log(`\n${out.filter((o) => o.filtered).length} of ${out.length} prompts filtered`);
fs.writeFileSync(new URL("./lyria-prompt-sim.out.json", import.meta.url), JSON.stringify(out, null, 2));
session.close();
process.exit(0);
