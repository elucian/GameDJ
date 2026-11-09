# GameDJ User Guide

GameDJ is a live AI music workstation built on Google's Lyria. You choose a genre, style, mood, key and tempo, pick the instruments, then record while an optional **DJ** conducts. This guide covers everything you can control.

## 1. Getting started

1. `npm install`, put your `GEMINI_LIVE_KEY` in `private/.env`, then `npm run dev` (see the [README](../README.md)).
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

On a phone (screens up to 700 px wide) the page is one scrolling column: the logo; the Theme, Power, Dice, DJ, Voice and Ko-fi (support) buttons; the song controls stacked one under the other; the transport buttons (Stop, Back to Start, Loop, Play, Record), which stay at the top while you scroll; the master volume meters and the timeline; the Mode, Export format and Download buttons; the two displays; the song manifest; and the sound tracks. The knob panel is hidden on phones (the DJ can still turn the knobs).

## 3. Choosing the music

- **Genre** is grouped as Modern (Hip Hop, Jazz, Pop, Blues, Electronic, Rock, Ambient, Gaming), Traditional (Classic, Opera, Marching, Renascentist, Victorian, Spiritual) and Regional (African, Indian, Irish, Spanish, Oriental, Romanian, European, Western, Hawaiian). European holds Russian Folk, French Musette, Tarantella and Neapolitan Song; Oriental also has Korean Folk.
- **Style** lists the styles of the genre. Hip Hop has Freestyle Rap, Boom Bap, Trap, Old School, Lo-Fi, G-Funk, Drill, Jazz Rap, Conscious Rap and Cloud Rap.
- **Mood, Key, Tempo, Meter** default to the style's signature values.
- **Locks.** Every toolbar item has a lock. Locked items are never changed by the Dice or the DJ.

## 4. Channels: Band or Lyria

The right sidebar has two tabs with five channels each:

| Channel | Band tab | Lyria tab |
|---|---|---|
| lead | Lead | Voice/Lead |
| alto | Alto | Voice/Harmony |
| harmonic | Harmonic | Orchestra Instruments |
| bass | Bass | Brass Instruments |
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
- **Duration** sets the target length (you can also drag the time ruler at the top of the timeline: right for longer, left for shorter, from 1:00 to 3:00 in 10-second steps; not while recording, and not when the length is locked); **BARS** under EVL shows that length in bars at the current tempo and meter (a read-out, not a control). **Evolution** (−10 to +10) sets how much the music changes: negative is steady, positive is progressive and quick to change.
- **Mode**: Diversity (the default), Quality or Vocalization, in the order the knob cycles. Quality renders a finished Lyria 3.5 song when you have songs left in your quota; with the DJ on, the DJ arranges it (see section 8). Vocalization is selected automatically when a voice channel is used.
- **Export** downloads the recording (choose the format with the format button).

## 6. The Dice (Random)

The dice button (only while stopped) hands the music to the **Robot DJ** (the label under the logo reads **Active: Robot**), which conducts what the dice rolled from the next Record. The dice then pick genre, style, mood, key, tempo and meter (except locked ones), chooses Lyria or Band, fills all channels with instruments, switches every channel on and resets the knobs to zero. The Band tab is used most of the time for modern genres. The dice never switch the voice on or off and never touch the lyrics or the song title; in Vocalization mode they may change the voices (unless the Voice dialog is locked), and when no channel sings they turn the lead into a Lead Voice track, so the take always has a singer (unless the channels are locked).

## 7. The knobs

Knobs add musical qualities (Density, Dynamics, Groove, Space, Brightness and so on) on top of the style. Turn them by dragging or with the arrow keys. The **Density** and **Brightness** knobs control Lyria's real density and brightness settings. The **Guidance** knob is Lyria's overall guidance (how strictly it follows the prompts): guidance = knob value x 3, so a knob that is not set means guidance 0, and full is 6. While the DJ conducts it turns this knob itself (up to 6 for solos and duets, lower for intros), so the knob always shows the real value; if you touch it, it is yours for 30 seconds. Guidance 0 lets Lyria follow your prompts loosely, so raise the knob for a tighter result. Higher guidance can make changes sound more abrupt. Keep a few active rather than all of them; contradictory pairs (for example Density and Space) work against each other.

## 8. The DJ

Press **DJ** to let the conductor take charge.

**Before recording (baton not raised)** the DJ plans the whole piece:
- may play a **folk style of its own country** (its Homeland chance), when the genre, the style and the channels are not locked; the message log says so,
- picks **Lyria or Band** (Lyria half the time for classical/regional genres, mostly Band for modern),
- chooses the **instruments** and the **manifest**, and may switch some channels off entirely to work with 3 to 5 channels,
- sets the **master mood** and the starting **evolution**,
- when it picks a voice channel, sets the **Voice dialog** and writes **lyrics** (see section 9).

Anything you have locked (channels, manifest, mood) is left alone.

**In Quality mode** (with songs left in your quota) the DJ arranges an instrumental Lyria 3.5 song instead of conducting live. At each Record it writes a plan for the whole song in bars: the sections in order, which instruments play each one, who leads, and its own habits (solo turns, call and response, a percussion break, a key lift, a tag ending...). The plan goes to Lyria with the song prompt, and the message panel shows it. A finished song cannot be steered, so the DJ does not turn knobs while it plays back. Each take gets a fresh plan, and each habit shows up with the DJ's Signature chance (section 10), not always, so two takes by the same DJ differ.

**During recording** (Diversity mode) it conducts but never changes the instruments or manifest. At each new section it:
- changes **volume** and **evolution** (even though those controls are locked for you while it conducts),
- sometimes varies **tempo, key or rhythm (meter)** within what the style allows,
- brings sections in and out: solos, duets, trios, quartets, full band,
- turns knobs, with a limit per genre: **6** knobs for modern genres, **4** for traditional, **2** for regional.

**Your hands win.** When you touch a knob or a channel yourself (instrument, weight, volume, on/off), the DJ leaves it exactly as you set it for **30 seconds** before touching it again.

**There is always a DJ.** The DJ button opens the DJ dialog: Apply switches to the DJ you chose, Cancel keeps the current one. The DJ rests while a take is stopped, played back or rendered as a song, and takes the controls again when you press Record; its name stays under the logo.

## 9. Voices and lyrics

- The **Voice** button opens the Voice dialog (with no songs left this month it shows a greyed mic struck through in red and cannot be pressed): the SOLO voices (Soprano, Alto, Tenor, Baritone) are always at the top; below them the **CHOIR** and **LYRICS** tabs switch between the choir kind (Church, Chamber, Gospel, Military, Youth, Children, Mixed) and the lyrics editor with its Generate Lyrics button.
- The dialog's dice (🎲) randomize what is not locked: the voices (unless the dialog's lock is on) and the language (unless its own lock is on). They keep the lyrics and the song title, and only reach the channels when you press Apply.
- The lyrics language has its own lock next to the dropdown. Unlocked, the dialog's dice pick a language that suits the style (Japanese for Japanese Folk) and show it in the dropdown; locked, the dice keep your language. Generate never changes the dropdown: it writes in the language shown (with Auto, a language that suits the style).
- **The DJ and voices.** What the DJ does depends on the primary mode:
  - **Diversity:** the DJ conducts live, without voices. Voice channels get instruments that suit the genre.
  - **Quality:** with songs left in your quota, the DJ arranges an instrumental Lyria 3.5 song, and voice channels get normal instruments. With no songs left, or if the song fails, the take is recorded live by the real-time generator.
  - **Vocalization:** if the Voice dialog has no voices, the DJ rolls the dialog's dice (voices, choir, language) and writes new lyrics and a title. Voices and lyrics you chose are kept. The DJ then sets the instruments around the voices (not on locked channels) and arranges the **vocal performance**: for each section it says who sings and how the band plays, with its own habits (an a cappella first verse, call and response with the choir, a solo after the first chorus, a stop-time verse, a tag ending). The plan is sent as stage directions, never sung.
  - **No songs left:** the voice mode is not available, to you or the DJ. The mode knob skips it, and voices cannot go on stage.
- With the language on Auto, lyrics are written in a language that suits the style and genre. A style tied to one culture always uses its own language (Japanese Folk is sung in Japanese, Chinese Traditional in Mandarin, Bossa Nova in Portuguese, Bhangra in Punjabi); otherwise the native language for regional music (for example Hindi, Swahili, Romanian, Hawaiian), Latin, Italian or German for traditional, and popular languages (mostly English) for modern. Lyrics are always real words, or open vowels (Ah, Oh, Ooh), never made-up syllables.
- You can type or edit lyrics in the dialog; press Apply to use them.

## 10. DJ Presets (personalities)

The **DJ Presets** dialog has twelve DJs. First in the list is **Robot**, an AI that gained consciousness and took form: an aristocratic ancient android from the celestial spheres, with a bare silver head, a stylish gold headband, sapphire eyes and a headset with a mic and rubies and topazes on his armour. He loves to study humanity, to become more human himself, so he has no home and no favourite music: he makes random music in every genre equally and learns from how we react to it. He has plain average settings (most sliders at 50%) and no arranging habits of his own. In place of Homeland his dialog shows **Curiosity** (80% at first): the chance that, planning a piece, he picks a random genre (every genre equally likely) and a random style of it, and the status bar reads **DJ ROBOT STUDIES HUMANITY** with the genre and style. A locked genre or style keeps your choice. You change his sliders and channels as for any DJ; they are saved in this browser.

**Like this?** When the music stops after you heard a DJ's take for at least 15 seconds (recording and playing it back both count), a small dialog asks **Like this?** with the DJ's portrait, the genre and the style. Press the thumb up for yes or the thumb down for no; ✕, Esc or a click outside skips the vote. Each take is rated only once, however often you play it back, and Reset never asks. The votes give each DJ its **stars** (0 to 5, in half stars) from the share of likes: they show under every name in the DJ Presets dialog, and next to the selected DJ with the number of likes and dislikes. A DJ starts as **Not rated yet**, and the first votes count gently (one like gives 3.5 stars, not 5): the more likes, the more stars. The votes are kept in this browser.

When the app starts it switches on the DJ that was on deck when you closed it. The first time, that is the Robot DJ.

The other eleven are fictional people, each drawn as a flat colour avatar with headphones, each from a country of their own:

| DJ | From | Style | Home styles |
|---|---|---|---|
| Diego | Spain, 31 | Rhythm first. Hot percussion, palmas and stabs, a finale that speeds up. | Flamenco, Paso Doble, Bolero, Guitar |
| Ji-woo | Korea, 24 | Club energy. Hooks first, builds and drops. | Korean Folk, K-Pop |
| Aria | Italy, 29 | Cinematic and operatic. Layers enter one by one, no drums (benches the rhythm channel). | Neapolitan Song, Tarantella, Romantic Opera, Baroque Opera, Spaghetti Western |
| Ioana | Romania, 42 | Lautar spirit. A free doina opening, violin and cimbalom in dialog, a hora that runs faster. | Doina, Hora, Sârbă, Lautareasca, Bănățeană, Colinde |
| Marcus | Texas, USA, 45 | Groove classicist. Tight pocket, guitar and fiddle trading licks (benches the alto channel). | Country, Honky Tonk, Texas Swing, Bluegrass, Cowboy Ballad, Western Swing |
| Luc | France, 58 | Smooth, warm and patient. Musette waltzes, long intros, slow fades. | French Musette, Impressionist, Parlour Waltz |
| Siobhán | Ireland, 63 | Session elder. Tunes in sets, solo turns around the circle. | Air, Jig, Reel, Folk, Celtic Folk |
| Imani | Chicago, USA, 38 | Blues lover. Slow-burning builds, call and response, stop-time breaks. | Chicago Blues, Delta Blues, Soul Blues, Texas Blues, Gospel |
| Desmond | Jamaica, 33 | Jazz specialist. Heads and solos, trading fours, a surprise solo, a cool fade. | Bebop, Cool Jazz, Jazz Fusion, Acid Jazz, Smooth Jazz, Island Reggae |
| Hao | Beijing, China, 23 | Sophisticated youngster with a conservatory ear and club taste. Layers enter one by one, instruments in dialog, a key lift and a polished drop. | Chinese Traditional, Deep House, Synth-Pop, Modern Classical |
| Viktor | Russia, 66 | Conservatory veteran turned experimenter. Slow builds, key lifts, surprise solos. | Russian Folk, Romantic, Byzantine Chant |

Each DJ has its own settings:

- **Preferred channels:** a checkbox per channel; an unchecked (benched) channel is not used by that DJ.
- **Eagerness:** how fast the DJ turns knobs and changes sections.
- **Diversity:** solos, duets and trios instead of the full band.
- **Complexity:** bigger ensembles, ornaments, rich arrangements.
- **Energy:** sets the evolution slider and the dynamics, brightness and groove knobs.
- **Atmosphere:** space, texture and organic colour.
- **Warm-up:** seconds the band is warmed up slowly (0 to 30).
- **Lyria temperature:** 0.0 to 3.0 (Lyria's default is 1.1); lower is more predictable, higher is more varied.
- **Homeland:** the chance (0 to 100%) that the DJ plays one of its home styles when it plans a piece (see section 8).
- **Signature:** how often (0 to 100%) each of the DJ's arranging habits (solo turns, breaks, key lifts...) shows up when it plans a piece.
- **Max knobs:** 0 to 10, default 6, the most knobs the DJ may hold in modern styles; above 6 traditional and regional styles get 1 to 3 more, below 6 modern styles lose knobs first, then the others, down to 0.

Presets are saved in your browser and restored on restart, together with the last applied personality.

## 11. Tips

- **Repeat a take:** the SEED chip (next to VOLUME) shows AUTO. Click it to lock the current seed: the next recordings reuse it, so with the same settings you get a similar performance. Click again to go back to a fresh seed each time.

- Lock the things you like, then Dice the rest.
- For rap, choose Hip Hop, put a rapper on a Band channel, and generate lyrics in the Voice dialog (without the DJ).
- If nothing plays, check the API key and that audio was allowed by clicking the page.
- **Engine Reset** (power button) stops everything and restores defaults; it turns the voice off (also on locked channels) and sets the mode to Diversity. Lyrics and song title are kept.

## 12. Other documents

- [`LYRIA_REFERENCE.md`](LYRIA_REFERENCE.md): what Lyria RealTime supports (config, prompts, limits) and the rules to follow when changing the engine.
- [`refactor-prompt.md`](refactor-prompt.md): the original engine refactoring task list.
- [`engine-architecture-specification.md`](engine-architecture-specification.md): engine and interface architecture notes.
