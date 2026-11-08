# Developer guide

Music Generator is an Electron app. Its interface is [Preact](https://preactjs.com) with
[signals](https://preactjs.com/guide/v10/signals/), written in JSX and bundled by
[esbuild](https://esbuild.github.io) into `dist/app.js`. Everything under the interface (the
composer, the whistle transcription, the SoundFont 2 parser and the Web Audio sampler, all written
from scratch) is plain JavaScript ES modules that also run as they are in Node, for the tools and
tests. The rules in `AGENTS.md` at the repository root apply to everyone working on it, and the
code layout and its layer rules are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Getting set up

You need Node.js, Python 3 and [just](https://github.com/casey/just).

```bash
just deps        # install the pinned Preact, signals, esbuild and Electron into node_modules
just soundfonts  # download GeneralUser GS, FluidR3_GM and MuseScore_General into soundfonts/
just build       # bundle src/app/main.jsx into dist/app.js
just app         # build, then run it in its own window
just dev         # rebuild on every change and reload the window
just install     # install it as an app: ~/Applications/Music Generator.app on macOS
```

`just build`, `just app`, `just dev` and `just install` run `just deps` first if anything is
missing. `dist/` is ignored by git.

## Checking your work

Run both after every change:

```bash
just check   # syntax-check every module, build the bundle without writing it, then the layer rules
just test    # node --test: the tests in test/ for lib/ and *-data.js files
```

## Writing songs

Songs are plain specs in `src/composer/`: `songs-data.js`, `genre-songs-data.js` (one
per genre, each with a story), `game-songs-data.js` (the game music), `chip-songs-data.js`
(chiptune in different moods) and `classical-songs-data.js` (solo piano). Each is a preset in the
app's New dialog (New → Song), which composes it into a new project. The spec format and how the
composer reads it are in [COMPOSING.md](COMPOSING.md#12-the-song-spec-writing-a-song).

The songs are also kept as project files in `projects/`, which open like any other project and can
be edited and saved. `just projects` (`tools/make-projects.mjs`) writes them again from the specs:
all of them, or the ids you name (`just projects first-light`). It overwrites the edits made to
those projects in the app, so commit or save under another name first.

### Composing from the command line

`just compose` (`tools/compose.mjs`) composes a song in Node and prints its plan. It takes a
song id, `feel:<emotion>` or a path to a spec in JSON:

```bash
just compose first-light                               # the plan
just compose first-light --melody                      # and the lead line, bar by bar, as note names
just compose first-light --midi first-light.mid        # and a Standard MIDI File
just compose feel:tender
```

### Transcribing a whistled melody

**In the app.** Select a track (or none, and a Whistle track is added) and press **●** (or `R`).
After a bar of count-in, at the project's tempo and meter where the playhead is, whistle the melody.
The click is a low tick under the pitch tracker's range, but use headphones anyway. Nothing else
plays while you record, so the band can't leak into the take. The playhead follows the take and
notes are written out about a beat behind it. When you stop, the whole take is read again on the
click's grid and put in a new clip from the bar you started in.

Then the chords: drag over the chord track above the tracks (bars, or beats with Shift held), press
`R` and whistle the chord's notes as an arpeggio, in any order and octave, in your own time. Press
`R` again and the chord is named in the project's key from the notes you held longest, and replaces
the chords there. Fix notes in the piano roll like any others.

**New from melody** (in the piano roll's toolbar) takes the selected clip and the chords over it
(guessing chords from the melody where none were whistled) and composes a band round it in a new
project. In a saved project each take's audio is kept as `projects/<name>/takes/take-n.wav`
(ignored by git), listed in the browser's Takes tab: click one, or drag it onto a track, to read it
again. Audio files dropped on a track are read the same way, at the project's tempo.

**From the command line.**

`just whistle <file or folder> --tempo <bpm>` (`tools/whistle.mjs`, needs ffmpeg for anything but
`.wav`) turns a whistled recording into a section's `melody:` line. `--tempo` is the speed you
whistled at, roughly: the tool fits the beat grid within ±10% of it, and since the notation counts
beats you can whistle slower than the song plays. It snaps notes to 8ths or triplets, beat by beat
(a triplet is written `5:1/3`), keeps staccato notes however short, guesses the key (or takes
`--key Eb --mode major`), writes `~` on notes with vibrato, and flags notes more than 30 cents off.
`--meter 3/4` places the bar lines; `--json out.json` keeps the notes. Keep takes in `scratch/`: git
ignores that folder, so they stay on your machine.

```bash
just whistle scratch/lantern-hook.m4a --tempo 60 --meter 3/4
```

**Chords.** With `--chords` the take is read as arpeggios: whistle each chord's notes, in any order and
octave, and the tool finds the chords and where they change (on beats; bar lines and half bars are
likelier), and prints a `progression:` with each chord's runners-up. Only the chord is kept, so
the composer voices it to fit the song. Start an arpeggio on the chord's third or seventh for an
inversion (3-5-8 is `I/3`); starting on the fifth is just the chord. A 7th chord needs its 7th
whistled in its own bar. Between relative keys (G major and E minor) it keeps the one whose
chords fit best, which usually means the one the take starts and ends on.

```bash
just whistle scratch/lantern-chords.m4a --tempo 60 --meter 3/4 --chords
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
what's checked out (as last built), with its `soundfonts/` and `projects/`. On Linux it adds a launcher to
`~/.local/share/applications`. Run it again after moving the checkout or updating Electron. There is no
packaged build to share.

`electron/main.js` serves the repository on a private `app://game/` origin, lets that origin (and
nothing else) use the microphone, and answers the `projects/` requests (`tools/project-files.mjs`: list the projects, save one, keep and list its takes). The
settings (library, panel sizes, browser tab, last project, grid) go to `save.json` in Electron's user data
folder through `electron/preload.cjs`. On macOS `just app` starts Electron with `open`, so the
microphone prompt is for the app and not for the terminal. If you refused it, turn on Electron (or
Music Generator, for the installed app) under System Settings → Privacy & Security → Microphone.

The app icon is drawn by hand in `assets/icon.svg`: a tile on Apple's icon grid with a white glyph.
`just icons` (`tools/make-icons.sh`, needs Inkscape) renders it into `assets/icon/`: `icon.icns`
for the macOS app, which `just install` copies into the bundle, and `icon.ico` and `icon.png` for
Windows and Linux. The rendered files are committed, so only a change to the SVG needs Inkscape.

Two flags help while working on it:

- `--dev` (what `just dev` passes) reloads the window whenever `dist/` changes.
- `--headless` shows no window and mutes the audio, asks for no microphone, and keeps its settings
  in a temporary folder. Use it for scripted UI tests (for example with Playwright's `_electron`),
  so they don't play sound or change your settings.

  Menus in a headless run: click a menu-bar item with
  `app.evaluate(({ Menu }, id) => Menu.getApplicationMenu().getMenuItemById(id).click(), 'undo')`
  (ids are the keys of `COMMANDS` in `src/app/commands.js`; Cmd shortcuts belong to the menu bar,
  so a scripted `Meta+Z` does nothing). A right-click menu isn't shown; it is kept as
  `globalThis.contextMenu` in the main process, whose `items` a test can read and click.

  Exports in a headless run: swap the save dialog for a stub in the main process, with
  `ipcMain.removeHandler('file:save')` and a new `ipcMain.handle('file:save', …)` that keeps the
  bytes, then run `exportAudio` and read the WAV it was given. The audio export renders offline, so
  it works with the audio muted.

## Adding a command

Add it to `COMMANDS` in `src/app/commands.js` with a label, an `accelerator` (a Cmd shortcut the
menu bar answers) or `shown` (a plain key the page answers, which still types in a text field; never one of
the musical-typing letters `A`–`L`, `;`, `'`, `W E T Y U O P`, `Z`, `X`), and
`enabled`/`checked` if it has them; then put `item('id')` in the menu bar in `menuBar()` and in any
right-click menu in `src/app/context-menus.js` it belongs in.

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

## Adding to the interface

The interface lives in `src/app/`: the state as signals in `store.js`, what the controls do in
`document.js` (open, save, New and `edit`), `player.js`, `recording.js` and `live.js`, and the
views in `components/`. A view reads signals and calls actions; it doesn't touch the audio engine or
the composer itself. Every change to the project goes through `edit(p => …)` with one of the pure
edits in `src/daw/project.js`, so it can be undone; add a new edit there, with a test. DAW logic that isn't about
songs goes in `src/daw/`; music logic goes in `src/composer/` or `src/sketch/`, which know nothing of the interface and don't import each other,
and content goes in a `*-data.js` file with a test. Show a control only when there is code behind
it. The full rules are in [ARCHITECTURE.md](ARCHITECTURE.md#rules).
