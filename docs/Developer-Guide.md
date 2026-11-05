# Developer guide

Music Generator is plain JavaScript ES modules on [LittleJS](https://github.com/KilledByAPixel/LittleJS),
with no bundler: the browser loads `src/` as it is, and the import map in `index.html` points at
the engine in `node_modules/`. The SoundFont 2 parser and the Web Audio sampler are written from
scratch. The rules in `AGENTS.md` at the repository root apply to everyone working on it, and the
code layout and its layer rules are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Getting set up

You need Node.js, Python 3 and [just](https://github.com/casey/just).

```bash
just install     # install the pinned LittleJS into node_modules
just soundfonts  # download GeneralUser GS, FluidR3_GM and MuseScore_General into soundfonts/
just play        # serve on http://localhost:8000 and open the browser
just serve       # serve on http://localhost:8000 without opening a browser
```

`just play` and `just serve` run `npm install` first if the engine is missing. Pages must be
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

`just whistle <file or folder> --tempo <bpm>` (`tools/whistle.mjs`, needs ffmpeg for anything but
`.wav`) turns a whistled recording into a section's `melody:` line. `--tempo` is the speed you
whistled at, roughly: the tool fits the beat grid within ±10% of it, and since the notation counts
beats you can whistle slower than the song plays. It snaps notes to 8ths, guesses the key (or takes
`--key Eb --mode major`), writes `~` on notes with vibrato, and flags notes more than 30 cents off.
`--meter 3/4` places the bar lines; `--json out.json` keeps the notes. Keep takes in `ideas/`: git
ignores the audio there but keeps anything else.

```bash
just whistle ideas/lantern-hook.m4a --tempo 60 --meter 3/4
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
