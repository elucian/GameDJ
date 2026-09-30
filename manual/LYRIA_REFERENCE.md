# Lyria RealTime Reference for GameDJ

Adapted from Google's Lyria RealTime documentation and the installed `@google/genai` 1.52 typings.
Sources: <https://ai.google.dev/gemini-api/docs/realtime-music-generation> and <https://ai.google.dev/gemini-api/docs/lyria-prompt-guide>.
Read this before changing anything that talks to Lyria (`utils/LiveMusicHelper.ts`). Section 7 lists the rules to follow.

## 1. What Lyria RealTime is

- Model `models/lyria-realtime-exp` (experimental), API version `v1beta`. GameDJ connects with `ai.live.music.connect`.
- It streams **instrumental music only** ("The model generates instrumental music only"). There is **no lyrics input**.
- It steers with **weighted text prompts** plus a **config object**. That is all: no stems, no MIDI, no per-instrument output.
- Output: raw **16-bit PCM, 48 kHz, stereo**, one mixed stream (GameDJ decodes it at 48000 Hz, 2 channels).
- Output is always watermarked. Prompts that trigger safety filters are ignored, and the reason appears in the server message's `filtered_prompt` field (GameDJ does not read it yet).

## 2. Session flow

1. `connect()` with callbacks `onmessage` (audio chunks), `onerror`, `onclose`.
2. `setWeightedPrompts({ weightedPrompts })`.
3. `setMusicGenerationConfig({ musicGenerationConfig })`.
4. `play()`. Then `pause()` (resume with `play()`), `stop()` (resets context, keeps prompts and config, `play()` restarts), or `resetContext()` (resets the musical context without stopping; keeps prompts and config).
5. Prompts and config can be sent at any time while playing.

## 3. Config parameters

| Parameter | Range | Default | Takes effect |
|---|---|---|---|
| `guidance` | 0.0 to 6.0 | 4.0 | live. Higher follows the prompts more strictly but makes transitions more abrupt |
| `bpm` | 60 to 200 (int) | none | **needs `resetContext()` or stop/play** |
| `scale` | enum (below) | `SCALE_UNSPECIFIED` | **needs `resetContext()` or stop/play** |
| `density` | 0.0 to 1.0 | none | live |
| `brightness` | 0.0 to 1.0 | none | live |
| `muteBass` | bool | false | live |
| `muteDrums` | bool | false | live |
| `onlyBassAndDrums` | bool | false | live |
| `musicGenerationMode` | `QUALITY`, `DIVERSITY`, `VOCALIZATION` | `QUALITY` | **not documented as live**; treat it like bpm and scale |
| `temperature` | 0.0 to 3.0 | 1.1 | live |
| `topK` | 1 to 1000 | 40 | live |
| `seed` | 0 to 2147483647 | random | live |

Rules from the docs:
- **Always send the whole config.** "You can't just update a parameter, you need to set the whole configuration otherwise the other fields will be reset back to their default values."
- Modes: `QUALITY` steers toward higher-quality music, `DIVERSITY` toward more varied music, `VOCALIZATION` toward music "more likely to generate music with vocals": "let the model generate vocalizations as another instrument (add them as new prompts)".
- Scales are relative major/minor pairs, so C major and A minor share one value: `C_MAJOR_A_MINOR`, `D_FLAT_MAJOR_B_FLAT_MINOR`, `D_MAJOR_B_MINOR`, `E_FLAT_MAJOR_C_MINOR`, `E_MAJOR_D_FLAT_MINOR`, `F_MAJOR_D_MINOR`, `G_FLAT_MAJOR_E_FLAT_MINOR`, `G_MAJOR_E_MINOR`, `A_FLAT_MAJOR_F_MINOR`, `A_MAJOR_G_FLAT_MINOR`, `B_FLAT_MAJOR_G_MINOR`, `B_MAJOR_A_FLAT_MINOR`.

## 4. Prompts

- A `WeightedPrompt` is `{ text, weight }`. Weight can be any value except 0; 1.0 is typical. Weights are normalized by the server.
- **Prompts are tags, not instructions.** Short descriptive phrases work as well as long ones: genre, instrument, mood, tempo and key words. Long imperative sentences ("please focus on this directive...") dilute the result.
- Keep instruments and moods in **separate prompts** so each can be weighted on its own. Example from the guide: `minimal techno (1.0)`, `deep sub bass (0.6)`, `shimmering hi-hats (0.4)`.
- Blend styles with balanced weights (for example `ambient synth pads 0.8` with `lo-fi hip-hop drums 0.6`).
- Vocals are an **instrument**: add a prompt that names the voice (for example "solo human singing voice", "chamber choir vocals, ooh and aah harmonies") and use `VOCALIZATION` mode. Do not send lyrics expecting the words to be sung.

Descriptor vocabulary listed in the guide (use these words, they are known to work):
- Hip-Hop and R&B: 808 Hip Hop, Boom-Bap, Contemporary R&B, G-funk, Grime, Lo-Fi Hip Hop, Neo-Soul, New Jack Swing, Trap Beat.
- Electronic: Acid House, Breakbeat, Chillout, Chiptune, Deep House, Drum & Bass, Dubstep, EDM, Electro Swing, Glitch Hop, Hyperpop, Minimal Techno, Moombahton, Psytrance, Synthpop, Techno, Trance, Trip Hop, Vaporwave.
- Rock: Alternative Country, Blues Rock, Classic Rock, Funk Metal, Garage Rock, Indie Folk, Indie Pop, Post-Punk, 60s Psychedelic Rock, Shoegaze, Surf Rock.
- Jazz, soul, funk: Acid Jazz, Afrobeat, Bossa Nova, Disco Funk, Funk, Jazz Fusion, Latin Jazz.
- Folk and traditional: Bengal Baul, Bhangra, Bluegrass, Celtic Folk, Cumbia, Indian Classical, Irish Folk, Merengue, Polka, Reggae, Reggaeton, Renaissance Music, Salsa.
- Classical and acoustic: Baroque, Orchestral Score, Piano Ballad.
- Instruments: Moog, Buchla, Rhodes, Mellotron, 303 Acid Bass, 808 drums, TR-909, flamenco guitar, sitar, cello, saxophone, trumpet, clarinet, kalimba, hang drum, steel drum.
- Moods: Ambient, Bright, Chill, Dark, Dreamy, Emotional, Ethereal, Euphoric, Funky, Groovy, Melancholic, Nostalgic, Ominous, Psychedelic, Relaxed, Soulful, Triumphant, Upbeat, Whimsical.

## 5. Steering and transitions

- Sending new prompts mid-stream makes the model transition smoothly, but "can be a bit abrupt when drastically changing the prompts". Cross-fade by sending intermediate weights.
- "Iterate and steer gradually": add or modify elements instead of replacing the whole prompt.
- Dynamic transition recipe: start with a high weight on the current style, introduce the next elements, raise them while lowering the old ones.
- A change of bpm or scale, and (to be safe) of the generation mode, must be followed by `resetContext()`; expect a short musical restart.

## 6. How GameDJ uses Lyria today

| Lyria feature | GameDJ |
|---|---|
| Prompts | `refreshSessionPrompts()` builds one narrative prompt (weight 2.0), a quality prompt (0.8), an ensemble/formation prompt, one prompt per active channel (weight = channel weight x per-channel factor x Guide slider), one per active knob, a compact vocal/lyrics prompt (1.2) when a voice is on stage. Weights are **cross-faded** (`crossfade`): new prompts fade in and replaced ones fade out over a few 350 ms steps. Sent only when the payload changed. |
| Config | `musicGenerationMode`, `bpm` (clamped 60 to 200), `scale` (from the key, all 12 pairs), `guidance` (channel Guide sliders, 1 to 5; raised by the DJ up to 6), `temperature` 1.1 (Lyria's default), `density` and `brightness` (driven by the Density and Brightness knobs, 0 to 1), `muteBass` and `muteDrums` (a switched-off bass or drum channel is really muted), `onlyBassAndDrums` (rhythm-only sections), `seed` (new per recording, lockable from the SEED chip in the mixer panel). Whole config resent whenever it changes. |
| `resetContext()` | scheduled 0.8 s after a bpm, scale or mode change (`scheduleContextReset`). |
| Vocals | `VOCALIZATION` mode + voice descriptions (`describeVoice`). Lyrics are sent once as a short prompt (language plus the opening line, or vowels). |
| Server messages | `filteredPrompt` is shown in the message log as `PROMPT FILTERED: reason`. |
| Not used yet | `topK`. |

The right-hand panel above the knobs shows the prompt list and the guidance value last sent.

## 7. Rules for future changes

1. **One mixed stereo stream.** Never promise separate audio per channel or per voice. Channel control means prompts, weights and the bass/drum mutes.
2. **Keep prompts short and tag-like.** New wording should be descriptive phrases (genre, instrument, mood), not commands.
3. **No lyrics playback.** Anything about words is a hint for language and style only.
4. **Send the full config every time**, and add every new config field to the object built in `refreshSessionPrompts` rather than sending partial configs.
5. **After changing bpm, scale or mode, call `resetContext()`** (already handled by comparing with the last config). New code that changes them must go through that path.
6. **Never send a prompt with weight 0.** Filter tiny weights out (the code drops channel and knob prompts under 0.05).
7. **Change prompts gradually.** For big style changes ramp weights over a few updates instead of swapping text.
8. **Stay in range:** guidance 0 to 6, temperature 0 to 3, bpm 60 to 200 (the tempo slider must respect this), density and brightness 0 to 1.
9. **Guidance is global** (one value for the whole session). Per-channel emphasis has to be done with prompt weights.
10. **New session, new state.** `connect()` clears the remembered config and prompts so they are sent again.
11. The model is experimental: names, ranges and behaviour can change. Re-check the two source pages above before large changes.
12. Done from the earlier idea list: Density and Brightness knobs drive the real config, `onlyBassAndDrums` for rhythm-only sections, a lockable `seed`, prompt cross-fading, and filtered prompts in the log. Still open: `topK` control, and ramping `density` and `brightness` themselves in small steps.
