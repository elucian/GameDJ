# GameDJ User Guide

GameDJ is a live AI music workstation built on Google's Lyria. You choose a genre, style, mood, key and tempo, pick the instruments, then record while an optional **DJ** conducts. This guide covers everything you can control.

## 1. Getting started

1. `npm install`, put your `GEMINI_API_KEY` in `.env.local`, then `npm run dev` (see the [README](../README.md)).
2. Click anywhere once so the browser allows audio.
3. Press **Record** in the left sidebar. Music generates live, and you can press **Play** to hear the recording back.

## 2. Screen layout

| Area | What it holds |
|---|---|
| Top toolbar | Genre, Style, Mood, Key, Tempo (BPM) and Meter, each with a lock |
| Left sidebar | Record / Pause / Stop / Play, Loop, Dice, DJ Presets, DJ, Voice, Mode, Export, Theme, Reset |
| Centre | The mixer knobs (musical qualities such as Density, Groove, Space) and the message display |
| Right sidebar | Channels (instruments), Manifest switches, Duration, Evolution, Volume |
| Bottom | Timeline with fades and seeking |

## 3. Choosing the music

- **Genre** is grouped as Modern (Hip Hop, Jazz, Pop, Blues, Electronic, Rock, Ambient, Gaming), Traditional (Classic, Opera, Marching, Renascentist, Victorian, Spiritual) and Regional (African, Indian, Irish, Spanish, Oriental, Romanian, Western, Hawaiian).
- **Style** lists the styles of the genre. Hip Hop has Freestyle Rap, Boom Bap, Trap, Old School, Lo-Fi, G-Funk, Drill, Jazz Rap, Conscious Rap and Cloud Rap.
- **Mood, Key, Tempo, Meter** default to the style's signature values.
- **Locks.** Every toolbar item has a lock. Locked items are never changed by the Dice or the DJ.

## 4. Channels: Band or Lyria

The right sidebar has two tabs with five channels each:

| Channel | Band tab | Lyria tab |
|---|---|---|
| lead | Lead | Voice/Lead |
| alto | Alto | Voice/Harmony |
| harmonic | Harmonic | Orchestra |
| bass | Bass | Brass |
| rhythm | Rhythm | Percussion |

- Lyria itself has no channels: it plays one mixed stream from text prompts. The channels are how the app builds those prompts, one prompt per channel, named by its role.
- The dropdowns only list **recommended** instruments for the genre. Band lists are generous, so combinations like a sax in a rock band are possible.
- **Voice/Lead (Lyria)**: a solo voice or the genre's solo instrument (violin, sitar, whistle, harmonica...).
- **Voice/Harmony (Lyria)**: the genre's accompaniment (piano, harp, organ, harmonium, guitars, string quartet...) or a choir.
- Voices and choirs are offered only in the Voice primary mode; in the other modes these two channels play instruments. The exact voices come from the Voice dialog.
- Each channel has an on/off checkbox and a weight slider.
-  Changing an instrument locks the channels so the Dice and DJ won't overwrite your choice. Use the lock icon to release them.
- **Manifest** switches decide which channels are part of the piece at all. A switch that is on keeps its light lit, even when it is greyed out during recording.

## 5. Recording and playback

- **Record** starts a new take (it overwrites the previous one). **Stop** ends it. **Play Recording** replays it, including the automation of knobs and channels. **Loop** replays automatically after 5 seconds, and a finished recording auto-loops after a 20-second countdown unless you touch something.
- **Duration** sets the target length. **Evolution** (−10 to +10) sets how much the music changes: negative is steady, positive is progressive and quick to change.
- **Mode**: Quality, Diversity or Vocalization. Vocalization is selected automatically when a voice channel is used.
- **Export** downloads the recording (choose the format with the format button).

## 6. The Dice (Random)

The dice button (only while stopped) picks genre, style, mood, key, tempo and meter (except locked ones), chooses Lyria or Band, fills all channels with instruments, switches every channel on and resets the knobs to zero. The Band tab is used most of the time for modern genres.

## 7. The knobs

Knobs add musical qualities (Density, Dynamics, Groove, Space, Brightness and so on) on top of the style. Turn them by dragging or with the arrow keys. The **Density** and **Brightness** knobs control Lyria's real density and brightness settings. The **Guidance** knob is Lyria's overall guidance (how strictly it follows the prompts): guidance = knob value x 3, so a knob that is not set means guidance 0, and full is 6. While the DJ conducts it turns this knob itself (up to 6 for solos, duets and a cappella sections, lower for intros), so the knob always shows the real value; if you touch it, it is yours for 30 seconds. Guidance 0 lets Lyria follow your prompts loosely, so raise the knob for a tighter result. Higher guidance can make changes sound more abrupt. Keep a few active rather than all of them; contradictory pairs (for example Density and Space) work against each other.

## 8. The DJ

Press **DJ** to let the conductor take charge.

**Before recording (baton not raised)** the DJ plans the whole piece:
- picks **Lyria or Band** (Lyria half the time for classical/regional genres, mostly Band for modern),
- chooses the **instruments** and the **manifest**, and may switch some channels off entirely to work with 3 to 5 channels,
- sets the **master mood** and the starting **evolution**,
- when it picks a voice channel, sets the **Voice dialog** and writes **lyrics** (see section 9).

Anything you have locked (channels, manifest, mood) is left alone.

**During recording** it conducts but never changes the instruments or manifest. At each new section it:
- changes **volume** and **evolution** (even though those controls are locked for you while it conducts),
- sometimes varies **tempo, key or rhythm (meter)** within what the style allows,
- brings sections in and out: solos, duets, trios, quartets, full band,
- turns knobs, with a limit per genre: **6** knobs for modern genres, **4** for traditional, **2** for regional.

**Your hands win.** When you turn a knob yourself, the DJ leaves it alone for **30 seconds** before touching it again.

## 9. Voices, lyrics and a cappella

- The **Voice** button opens the Voice dialog: the SOLO voices (Soprano, Alto, Tenor, Baritone) are always at the top; below them the **CHOIR** and **LYRICS** tabs switch between the choir kind (Church, Chamber, Gospel, Military, Youth, Children, Mixed) and the lyrics editor with its Generate Lyrics button.
- When the DJ activates a voice channel it configures this dialog itself and writes lyrics in a language that suits the genre: the native language for regional music (for example Hindi, Swahili, Romanian, Hawaiian), Latin, Italian or German for traditional, and popular languages (mostly English) for modern. Lyrics are always real words, or open vowels (Ah, Oh, Ooh), never made-up syllables.
- During play the DJ cues the next lines at each section, and turns the voice on or off where it fits the arrangement.
- In some genres (Hip Hop most of all) the DJ occasionally drops the band for an **a cappella** section with only the voices.
- You can type or edit lyrics in the dialog; press Apply and the DJ will sing them.

## 10. DJ Presets (personalities)

The **DJ Presets** dialog has four personalities: **Shadow, Tiësto, Krush, Daft**. Each has its own settings: bass, reverb, filter, BPM offset, active channels, warm-up, eagerness, diversity, pause, **Max Knobs** (0 to 10, default 6: the most knobs the DJ may hold in modern styles; above 6 traditional and regional styles get 1 to 3 more, below 6 modern styles lose knobs first, then the others, down to 0) and **Lyria Temp** (Lyria's temperature, 0.0 to 3.0, default 1.1: lower is more predictable, higher is more varied). The channel switches and eagerness change how the DJ works (benched channels are not used, higher eagerness moves knobs faster). Presets are saved in your browser and restored on restart, together with the last applied personality.

## 11. Tips

- **Repeat a take:** the SEED chip (next to VOLUME) shows AUTO. Click it to lock the current seed: the next recordings reuse it, so with the same settings you get a similar performance. Click again to go back to a fresh seed each time.

- Lock the things you like, then Dice the rest.
- For rap, choose Hip Hop, use a Band channel with a rapper, then start the DJ before recording so it can write lyrics and plan a cappella sections.
- If nothing plays, check the API key and that audio was allowed by clicking the page.
- **Engine Reset** (power button) stops everything and restores defaults.

## 12. Other documents

- [`LYRIA_REFERENCE.md`](LYRIA_REFERENCE.md): what Lyria RealTime supports (config, prompts, limits) and the rules to follow when changing the engine.
- [`refactor-prompt.md`](refactor-prompt.md): the original engine refactoring task list.
- [`engine-architecture-specification.md`](engine-architecture-specification.md): engine and interface architecture notes.
