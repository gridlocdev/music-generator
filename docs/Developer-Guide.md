# Developer guide

Music Generator is plain JavaScript ES modules on [LittleJS](https://github.com/KilledByAPixel/LittleJS),
with no bundler: the browser loads `src/` as it is, and the import map in `index.html` points at
the engine in `node_modules/`. The SoundFont 2 parser and the Web Audio sampler are written from
scratch. The rules in `AGENTS.md` at the repository root apply to everyone working on it, and the
code layout and its layer rules are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Getting set up

You need Node.js, Python 3 and [just](https://github.com/casey/just).

```bash
just deps        # install the pinned LittleJS and Electron into node_modules
just soundfonts  # download GeneralUser GS, FluidR3_GM and MuseScore_General into soundfonts/
just play        # serve on http://localhost:8000 and open the browser
just serve       # serve on http://localhost:8000 without opening a browser
just app         # run it in its own window (Electron), with the microphone and ideas/ saving
just install     # install that window as an app: ~/Applications/Music Generator.app on macOS
```

`just play`, `just serve`, `just app` and `just install` run `just deps` first if the engine or Electron is missing. Pages must be
served over HTTP, not opened as files, because ES modules don't load from `file://`. Without
just: `npm install && npm start`.

## Checking your work

Run both after every change:

```bash
just check   # syntax-check every module, then the layer rules (tools/coupling-report.mjs --strict)
just test    # node --test: the tests in test/ for lib/ and *-data.js files
```

## Writing songs

Songs are plain specs in `src/features/composer/`: `songs-data.js`, `genre-songs-data.js` (one
per genre, each with a story), `game-songs-data.js` (the game music) and `chip-songs-data.js`
(chiptune in different moods). The spec format and how
the composer reads it are in [COMPOSING.md](COMPOSING.md#12-the-song-spec-writing-a-song).

In the browser, a song can also be played from the console or opened from a link:

```js
composer.play({ title: 'Test', emotion: 'tender' })
```

```
http://localhost:8000/#song=first-light
http://localhost:8000/#feel=heroic
```

### Composing without a browser

`just compose` (`tools/compose.mjs`) composes a song in Node and prints its plan. It takes a
song id, `feel:<emotion>` or a path to a spec in JSON:

```bash
just compose first-light                               # the plan
just compose first-light --melody                      # and the lead line, bar by bar, as note names
just compose first-light --midi first-light.mid        # and a Standard MIDI File
just compose feel:tender
```

### Transcribing a whistled melody

**The sketchpad.** `just sketch` serves the game like `just serve`, through `tools/sketch-server.mjs`,
which also saves into `ideas/`. Open **🎙 Whistle sketchpad**, set the tempo you'll whistle at and
the meter, and press **● Record** (or `R`). After a bar of count-in, whistle the melody. The click is
a low tick under the pitch tracker's range, but use headphones anyway. A playhead sweeps across the
bars, your pitch is drawn as you go, the note you're on shows faintly at the playhead, and notes are
written out about a beat behind it. When you stop, the whole take is read again on the click's grid.

Then the chords: drag over bars (it snaps to half bars, or to beats with Alt held), press `R` and
whistle the chord's notes as an arpeggio, in any order and octave, in your own time. Nothing plays
while you do, so the band can't leak into the take. Press `R` again and the chord is named from the
notes you held longest; starting on its lowest note, a third or seventh, makes an inversion. Bars with
no chord whistled get chords guessed from the melody, drawn faint. Click any chord to step through
its runners-up; `Delete` on a dragged stretch forgets the chords whistled there. Fix a note by
dragging it or with `↑` `↓` (`←` `→` select, `V` vibrato, `Delete` removes). The key is guessed from
the melody and the chords' notes; the key menu overrides it.

**▶ Play sketch** plays the sketch at the song tempo, **Copy** puts the section's lines on the
clipboard, and **Save to ideas/** writes the melody take and every chord take (`take-n.wav`,
`take-n.json`) and `section.js.txt` to `ideas/<name>/`. `just app` saves the same way. Under any other server, the files download
instead. Audio files dropped on the page become melody takes, read at the tempo set, or the chord for
a dragged stretch.

**From the command line.**

`just whistle <file or folder> --tempo <bpm>` (`tools/whistle.mjs`, needs ffmpeg for anything but
`.wav`) turns a whistled recording into a section's `melody:` line. `--tempo` is the speed you
whistled at, roughly: the tool fits the beat grid within ±10% of it, and since the notation counts
beats you can whistle slower than the song plays. It snaps notes to 8ths or triplets, beat by beat
(a triplet is written `5:1/3`), keeps staccato notes however short, guesses the key (or takes
`--key Eb --mode major`), writes `~` on notes with vibrato, and flags notes more than 30 cents off.
`--meter 3/4` places the bar lines; `--json out.json` keeps the notes. Keep takes in `ideas/`: git
ignores the audio there but keeps anything else.

```bash
just whistle ideas/lantern-hook.m4a --tempo 60 --meter 3/4
```

**Chords.** With `--chords` the take is read as arpeggios: whistle each chord's notes, in any order and
octave, and the tool finds the chords and where they change (on beats; bar lines and half bars are
likelier), and prints a `progression:` with each chord's runners-up. Only the chord is kept, so
the composer voices it to fit the song. Start an arpeggio on the chord's third or seventh for an
inversion (3-5-8 is `I/3`); starting on the fifth is just the chord. A 7th chord needs its 7th
whistled in its own bar. Between relative keys (G major and E minor) it keeps the one whose
chords fit best, which usually means the one the take starts and ends on.

```bash
just whistle ideas/lantern-chords.m4a --tempo 60 --meter 3/4 --chords
```

Tips: start each note with your tongue (a soft "t") when repeating a pitch, so it is heard as a new
note, and leave a second of silence before the first note.

### Studying NES soundtracks

`just nsf <file.nsf> [songs…]` (`tools/nsf-report.mjs`) plays an NSF file's music driver in a
6502 emulator and reports what each song does: each channel's range and duty, the row length, how
the lead moves (interval sizes, turns, leaps), note lengths, vibrato, slides, arpeggios, echo
channels, drum hits and the loop. `--json out.json` saves the notes too. Keep the files in
`reference/`, which git ignores; they are for learning techniques, not for copying tunes into the
song lists. It reads the 2A03 and the VRC6 expansion; other expansion chips are ignored.

```bash
just nsf reference/Shovel_Knight_Music.nsf 1 4
```

For music that isn't an NSF (an OGG or MP3 soundtrack), `just audio <files…>`
(`tools/audio-report.mjs`, needs ffmpeg) follows the loudest high pitched line and reports the same
lead statistics, plus the tempo and how much of the lead stays on seven pitch classes. It is a
guess from the mixed sound: checked against Mega Man 2 rendered from its NSF it picks the right
note 67–85% of the time. It counts too few repeated notes and too many leaps, and it can't see
fast arpeggios. Busy mixes with pads, reverb or a loud bass confuse it more. Compare its numbers
with each other rather than with `just nsf`'s.

```bash
just audio reference/vvvvvv/ogg/*.ogg
```

### Comparing versions by ear

`just ab` (or `just ab <commit>`, default `main`) serves a page at
http://localhost:8010/tools/ab/ (or the next free port) that renders every song with that commit
and with your checkout, side by side, so you can hear what a change did. It shows each render's
length, peak and loudness, has a blind mode, and saves the WAVs in `.ab/out/`, which git ignores.

### The desktop app

`just app` runs the checkout in Electron. `just install` (`tools/install-app.sh`) makes it an app you
open from the Dock: on macOS a copy of the Electron in `node_modules`, renamed to Music Generator with its own
bundle id, whose only code is a stub that loads `electron/main.js` from the checkout, so it always runs
what's checked out, with its `soundfonts/` and `ideas/`. On Linux it adds a launcher to
`~/.local/share/applications`. Run it again after moving the checkout or updating Electron. There is no
packaged build to share. `electron/main.js` serves the
repository on a private `app://game/` origin, lets that origin (and nothing else) use the
microphone, and answers the same `ideas/` requests as `tools/sketch-server.mjs`
(`tools/ideas-files.mjs`). The game's save goes to `save.json` in Electron's user data folder
through `electron/preload.cjs`, so it is separate from the browser's. On macOS `just app` starts
Electron with `open`, so the microphone prompt is for the app and not for the terminal. If you
refused it, turn on Electron (or Music Generator, for the installed app) under System Settings →
Privacy & Security → Microphone.

## SoundFont libraries

| Library | Folder | Size | License |
|---|---|---|---|
| GeneralUser GS 2.0.3 | `soundfonts/GeneralUser-GS/` | 32 MB | GeneralUser GS License v2.0: free for commercial music and software |
| FluidR3_GM | `soundfonts/FluidR3_GM/` | 148 MB | MIT |
| MuseScore_General 0.2 | `soundfonts/MuseScore_General/` | 216 MB | MIT; keep its credits in any derivative |

`soundfonts/` is ignored by git; `just soundfonts` runs `tools/fetch-soundfonts.sh`, which
downloads every library that isn't on disk yet, with its license file next to its `.sf2`. The
deploy runs the same script. The libraries and their folders are listed in
`src/audio/soundfont-libraries-data.js`.

### Adding or replacing a library

1. Put the `.sf2` and its license file in `soundfonts/<folder>/`, and add the download to
   `tools/fetch-soundfonts.sh`, so `just soundfonts` and the deploy fetch it too.
2. Add the library to `LIBRARY_SOURCES` in `src/audio/soundfont-libraries-data.js`.
3. Run `just catalog` to regenerate `src/audio/soundfont-catalog-data.js`, the list of every
   file and preset that lets the instrument menu load without the files.
4. Run `just check` and `just test`.

### Chip instruments

The chip instruments aren't a file. `src/lib/chip-synth.js` builds them in memory the first time
one is played: pulse waves at the NES's 12.5%, 25% and 50% widths, a pulse-width sweep, triangle,
saw and sine, each stored with only the harmonics its notes can play cleanly, and drum kits made
from NES-style LFSR noise and falling tones. They come with every library, listed under
"Chip · built in" (melodic on bank 64, kits on bank 192). A song uses them with `sound: 'chip'`.
The Chiptune genre sets that.

To change how they sound, edit `src/audio/chip-instruments-data.js`; the fields are documented
at the top of `chip-synth.js`:

- `wave`: the shape. `steps` quantises it, like the NES triangle's 16 levels. `dpcm` plays the
  cycle through the NES sample channel's delta coding (a counter stepping 2 a clock), for the
  gritty DPCM Bass; fewer clocks a cycle is grittier.
- `soft`: how far the upper harmonics are rolled off. 0 is the raw chip; 0.3–0.6 is the modern sound.
- `layers`: detuned, panned or octave copies, for width.
- `env`: attack, decay, sustain and release.
- `filter`: a low-pass, optionally swept for a pluck.
- `velocityTone: false`: soft notes are quieter but not darker.
- A kit drum's `dpcm` is the sample-channel rate its hit is delta-coded at. The DPCM Kit (kit
  program 2) has its kick, snare, clap and toms on the sample channel and its hats on the noise
  channel, as the later NES soundtracks did.

Keep each program in its General MIDI family (80–87 leads, 38–39 bass, 88–95 pads), so the
composer's vibrato, slide and scoop rules still pick it up. `CHIP_ROLES` is the instrument each part
falls back to when the band names one the chip bank doesn't have.

## Adding a feature

A feature goes in its own folder, `src/features/<name>/`, with its code, its `*-data.js` content
and its save slice, and is registered in `src/features/index.js`. Features don't import each
other: they talk through `src/game/events.js` (the adventure level drives the composer only
through `music:*` events). The full rules are in [ARCHITECTURE.md](ARCHITECTURE.md#rules).
