# Architecture

A desktop app (Electron) with a DAW-style UI in [Preact](https://preactjs.com) and [signals](https://preactjs.com/guide/v10/signals). `src/app/main.jsx` is bundled by esbuild into `dist/app.js` (`just build`), which `index.html` loads. Everything below `src/app/` is plain ES modules with no DOM in the music logic, so the tools in `tools/` and the tests in `test/` run it in Node as it is.

## This app

A small DAW (projects of tracks and clips of notes, played with sampled instruments from three openly licensed General MIDI SoundFont libraries in `soundfonts/`) with two things on top: a rule-based composer that writes a new project from a feeling, a genre or a song spec, and whistle-to-MIDI recording onto any track. The DAW (`src/daw/`) knows nothing of either. The composing method is in [COMPOSING.md](COMPOSING.md).

The window has a transport bar at the top, a browser on the left (projects, instruments, the open project's takes), the arrangement in the middle (a ruler with the markers, the chord track, a row per track) and an editor at the bottom (the piano roll for the selected track, or the mixer).

| File | Does |
|---|---|
| `src/lib/sf2.js` | parses a `.sf2` ArrayBuffer into presets → regions (key/velocity range, sample, merged generators) |
| `src/lib/sf2-voice.js` | region + key + velocity → pitch, gain, pan, loop points, filter, volume envelope |
| `src/lib/notes.js` | MIDI note names and black/white keys |
| `src/lib/music-theory.js` | keys, modes, scale degrees, Roman-numeral chords (secondary, slash and extended), accidentals that follow a chord, a stable hash for tie-breaks |
| `src/lib/voicing.js` | chord voicings: least-motion voice leading, shells, drop 2 |
| `src/lib/chip-synth.js` | chip instruments made in code: band-limited pulse, PWM, triangle, saw and sine cycles per key zone, drum hits from LFSR noise and falling tones, and the NES sample channel's delta coding for both, as an in-memory font in `parseSf2`'s shape |
| `src/lib/impulse.js` | a seeded synthetic reverb impulse response |
| `src/lib/midi-file.js` | writes a Standard MIDI File from a score, with tempo and meter changes (`just compose … --midi`) |
| `src/lib/tempo-map.js` | a song's tempo over time (steady or ramping segments) and conversion between beats and seconds |
| `src/lib/pitch-track.js` | a whistled or sung line's pitch and level, 100 frames a second (YIN), vibrato kept in the frames |
| `src/lib/transcribe.js` | pitch frames → notes in 8ths and triplets, chosen beat by beat: tuning offset, note starts (silences, dips, pitch changes, glides left out), the beat grid near a rough tempo (or on a click's, `clickGrid`), vibrato per note, key guess, and the composer's degree notation with `~` for vibrato; `freeNotes` reads notes whistled with no beat |
| `src/lib/chord-guess.js` | a whistled arpeggio take → a progression: chords in the key scored against the notes, the changes found with them by dynamic programming over beats, slash basses from the arpeggio's first note, runners-up, and the key settled by which reading fits best; with `melody` it harmonises a tune instead (triads, changes on bar lines and half bars); `nameChord` names one chord whistled freely |
| `src/lib/wav.js` | 16-bit WAV files, mono or more channels: whistled takes and audio exports |
| `src/lib/motif.js` | a motif's developments: sequence, inversion, retrograde, augmentation, diminution, fragmentation |
| `src/platform/audio-engine.js` | the AudioContext, master volume and mastering chain (air, glue compressor, limiter), resumed on the first gesture; the output's level; `render`, which swaps in an offline context to render faster than real time |
| `src/platform/ticker.js` | a Worker-driven interval for audio scheduling, so a background tab doesn't starve a song |
| `src/platform/mic.js`, `mic-worklet.js` | the microphone, raw (no echo cancelling, noise suppression or gain riding), in blocks stamped with the app's AudioContext time, so a take lines up with a click on the same context; audio files decoded to mono |
| `src/platform/midi.js` | Web MIDI input as note/cc messages |
| `src/platform/keys.js` | musical typing: computer keys → semitones and octave steps, and whether focus is in a text field |
| `src/platform/storage.js` | the settings, through the desktop app's `window.appStorage` hook |
| `src/platform/app-menu.js` | the native menu bar and right-click menus, built by the desktop app from plain items; each item's action stays in the page, which gets back the id of the item picked; also opening a doc, showing a file in the Finder and saving a file where the user picks |
| `src/platform/project-files.js` | the project files in `projects/`, through the desktop app: listing them, reading and writing one, and its takes |
| `src/audio/soundfont.js` | downloads and caches `.sf2` files; `createInstrument(font, preset, destination)` plays notes as Web Audio voices, with optional delayed vibrato and legato glides |
| `src/audio/pitch-moves.js` | a voice's pitch moves on its detune: delayed vibrato, scoops, tracker arpeggios, falls |
| `src/audio/mixer.js` | a project's mixer: channel strips (layer gain, the user's gain, low cut, tone filter, fader, pan with optional auto-pan) and shared reverb and tempo-synced, slowly modulated delay buses |
| `src/audio/soundfont-libraries-data.js` | the libraries: id, name, folder and license |
| `src/audio/soundfont-catalog-data.js` | generated list of every library's files and presets, so the menu doesn't need the files up front (`just catalog`) |
| `src/audio/chip-instruments-data.js` | the chip instruments and kits (waves, layers, envelopes, filters), their banks, and the one each part falls back to; `soundfont.js` builds them for the url `chip:` and every library lists them |
| `src/audio/soundfont-library.js` | the library in use, switched in the browser's Instruments tab; projects load their instruments from it |
| `src/daw/project.js` | the project model (see [the format](#project-files)), every edit as a pure function returning a new project (notes, clips, tracks, tempo, meter, mixer, inserting and deleting time), and the undo history: a list of earlier projects, with consecutive edits of the same kind (a fader drag) merged into one step |
| `src/daw/project-format.js` | `project.json`: writing it with one compact line per note, reading it with a format and version check |
| `src/daw/project-midi.js` | a project as a Standard MIDI File: a track each, drums on channel 10 |
| `src/daw/meter.js` | bars from meter changes: bar lines, the bar a beat is in, beats per bar |
| `src/daw/automation.js` | automation lanes: the value at a beat from keyframes |
| `src/daw/fx.js` | MIDI FX: a registry of types (the app registers them) and `performProject(project, pass)`, which runs each track's notes through its FX for one pass round the loop, returning the notes and any events (a tape stop, a send swell) |
| `src/daw/instruments.js` | the SoundFont preset each track plays, from the library in use, loaded once and shared |
| `src/daw/player.js` | `playProject(project, instruments, { from, mix, click, ticker })`: a channel strip per track with a level meter, its notes through the MIDI FX and its automation and ducking, scheduled ahead on the audio clock through the tempo map, from any beat, round the loop with a new pass each time, with an optional metronome; the handle seeks, takes new faders and pans, reads the meters, and stops. `ticker` is what calls the scheduler: a timer live, the render's pauses offline |
| `src/composer/` | song spec → score, top down: the song plan (`plan.js`: form, keys, meters, energy curve, cadences, tempo map, loop), chords per section (`harmony.js`: cadences, harmonic rhythm, passing dim7s, harmony voices, call and response), the motif and melody (`melody.js`; repeats in `melody-repeats.js`, hand-written degree notation in `notation.js`, `ornaments.js`), the parts in any meter (`parts.js`, `meter-patterns.js`, `meter.js`), arrangement and rhythm passes (`arrange.js`, `syncopation.js`), a chip song's techniques (`chip.js`), all driven by `compose.js`. The knowledge tables: `composer-data.js`, `patterns-data.js`, `song-craft-data.js` (styles, variation, curve, tempo, motifs), `genre-data.js` (genre profiles: defaults, progressions, extensions, voicing, cadences, scales, blue notes, phrase repeats), `performance-data.js`, `ear-candy-data.js`. Written songs: `songs-data.js`, `genre-songs-data.js` (one per genre, with a story), `game-songs-data.js` (loops, a meter-changing boss, a leitmotif in two moods), `chip-songs-data.js` and `classical-songs-data.js`; `catalog.js` lists them and the feelings for File → New. The score becomes a project in `to-project.js` (a clip per section, markers, the chord track, the mix plan from `mix-plan.js` as channel strips, automation and ducking). The performance (`perform.js`: ghost notes, scoops, slides, vibrato, swing, timing; `ear-candy.js`) runs at play time as the **Humanize** MIDI FX (`humanize-fx.js`), which rebuilds the score's shape from a project's tracks, markers and groove |
| `src/sketch/` | whistle → notes: recording a take over a click and count-in, read live a beat behind the playhead (`recorder.js`); reading a take, the chords whistled over stretches and the ones guessed for the rest (`takes.js`); a melody and its chords as a section and a spec for New from melody (`sketch-spec.js`); recording settings and the band it's composed for (`sketchpad-data.js`) |
| `src/app/store.js` | the app's state as signals: settings (saved), the open project, its name, history and whether it's saved, the selection (track, clip, notes, a stretch of the chord track), the transport |
| `src/app/document.js` | the open project as a document: open, save, save as, New (empty, or from the composer), and `edit(fn, mergeKey)`, through which every edit goes so undo can take it back |
| `src/app/player.js` | plays the open project from the playhead, follows it (and the mixer's meters), stops, seeks, keeps the mixer's settings on the playing channels, and restarts after an edit that changes what's heard |
| `src/app/bounce.js` | Export as Audio File: the project, or a range of it, played once through an offline render and saved as a stereo WAV, or one WAV per track (stems) into a folder, optionally normalized |
| `src/app/components/ExportDialog.jsx` | the Export dialog: range, mix or stems, normalize, tail |
| `src/app/recording.js` | whistle → MIDI: recording a take into a new clip on the selected track (or a chord onto the chord track), dropped audio files and kept takes read the same way, keeping takes beside the project, and New from melody |
| `src/app/live.js` | musical typing and MIDI input playing the selected track's instrument |
| `src/app/commands.js` | every command (label, shortcut, action, when it can be used); `menu-bar.js` builds the menu bar from them and keeps it current, `keys.js` answers the plain-key shortcuts (Cmd shortcuts are the menu bar's) |
| `src/app/timeline.js` | tempo and meter: the whole song's, changes from a bar on, and the flags the ruler shows for them with their menu |
| `src/app/context-menus.js` | the right-click menus, one per thing clicked, which select it first and are built from the commands and the actions below |
| `src/app/tracks.js`, `src/app/notes.js`, `src/app/clipboard.js` | the actions on tracks and clips, on the piano roll's picked notes, and cut, copy, paste and duplicate for either |
| `src/app/focus.js`, `src/app/ask.js` | which pane the editing keys act on; an in-app question for a name or a yes (Electron has no `prompt`) |
| `src/app/components/` | the views: `Transport`, `Browser`, `Arrange` (`Ruler`, `ChordLane`, a `TrackRow` per track, sharing `arrange-view.js`), `Editor` (`PianoRoll` or `Mixer`), `NewProject` (the New dialog), `Ask`; `canvas.js` is a canvas that redraws when the signals it reads change, the piano roll's parts are `roll-view.js` (what's shown, its geometry), `roll-draw.js` (drawing), `roll-input.js` (the pointer), `RollToolbar` and `RollPlayhead` |
| `src/app/app.css` | the look: colour tokens and the panel grid |
| `tools/compose.mjs` | composes a song in Node: prints the plan and melody, writes a `.mid` (`just compose`) |
| `tools/make-projects.mjs` | writes the written songs as project files in `projects/` (`just projects`) |
| `tools/build.mjs` | bundles the UI with esbuild (`just build`, `--watch` for `just dev`, `--check` for `just check`) |
| `tools/install-app.sh` | installs the desktop app that runs this checkout (`just install`): a renamed Electron in `~/Applications` on macOS, with the icon from `assets/icon/`; a launcher on Linux |
| `assets/icon.svg`, `tools/make-icons.sh` | the app icon's source, and the script (`just icons`) that renders it into `assets/icon/` |
| `tools/project-files.mjs` | the desktop app's `projects/` requests: `GET /projects/` lists the projects, `PUT /projects/<name>/project.json` saves one (to a temporary file, then swapped in), `GET` and `PUT /projects/<name>/takes/…` list and keep its takes |
| `electron/main.js`, `electron/preload.cjs` | the desktop app (`just app`): serves the checkout on `app://game/`, allows the microphone for that origin only, answers `projects/` requests, and keeps the settings in a file through the `window.appStorage` hook. `--dev` reloads the window when `dist/` changes; `--headless` runs it hidden and muted, with its own settings, for automated tests |
| `electron/menus.js` | the native menus from the page's items: the menu bar with macOS's app and Window menus round it, and right-click menus; Edit items act on a text field while one has focus. Headless, a right-click menu is kept as `globalThis.contextMenu` for a test to click |
| `tools/whistle.mjs` | transcribes a whistled recording into a section's `melody:` line, or with `--chords` an arpeggio take into its `progression:` (`just whistle`) |
| `tools/nsf-report.mjs`, `tools/nsf/` | studies NES music: plays an NSF's 6502 driver (`cpu6502.js`, `nsf.js`), turns its 2A03/VRC6 register writes into notes, drum hits and loops (`decode.js`), and reports how each song's lead moves, its rows, echoes, vibrato and drums (`just nsf`) |
| `tools/audio-report.mjs`, `tools/audio/`, `tools/music-stats.js` | the same lead statistics from recorded music: follows the lead's pitch in the mixed audio (`lead.js`) and reuses `decode.js`'s note finding; `music-stats.js` holds the interval, turn and leap measures both reports share (`just audio`) |
| `tools/ab-server.mjs`, `tools/ab/` | A/B listening: renders each song with an older commit and with this checkout, offline in the browser, side by side (`just ab`) |

The synth covers the parts of SF2 that matter for these files: key/velocity splits, preset+instrument generator merging, root key and tuning, loop modes, sample address offsets, a low-pass filter swept by the modulation envelope (`modEnvToFilterFc`), modulators driven by the note's velocity or key (a font's own velocity→cutoff one replaces the default, which lowers the cutoff for soft notes), pan, the DAHDSR volume envelope, and exclusive classes (drum kits). Modulators on CCs, pressure or the pitch wheel, the modulation envelope's pitch amount, LFOs, reverb and chorus sends are not implemented. Many GeneralUser GS presets (distortion guitar, French horn, clarinet) start their filter at a few hundred Hz and open it with the modulation envelope, so they need both.

### SoundFont libraries

The libraries live in `soundfonts/<folder>/`, ignored by git and downloaded by `just soundfonts`; `src/audio/soundfont-libraries-data.js` lists them. The instrument menu is built from `soundfont-catalog-data.js`, generated from the files by `just catalog`, so no `.sf2` (32–216 MB each) is fetched until one of its instruments is picked. `soundfont.js` then downloads it once and keeps it in memory. `soundfont-library.js` holds the library in use: switching it reloads the instrument musical typing plays, and the project (restarted if it's playing) loads its instruments from the new library. How to add one is in [Developer-Guide.md](Developer-Guide.md#soundfont-libraries).

### Project files

A project is a folder, `projects/<name>/`, holding `project.json` and, once whistled into, `takes/` (the takes' WAVs are ignored by git). The file:

```
{ format: 'music-generator-project', version: 1, title, length (beats),
  tempoMap: [{ beat, bpm, to? }], meters: [{ beat, sig }], key: { tonic, mode } | null,
  markers: [{ beat, name, meta? }], loop: { from, to } | null, groove: {…}, chords: [{ beat, beats, name, tones }],
  tracks: [{ id, name, color, instrument: { bank, program },
             mixer: { volumeDb, pan, mute, solo, lowCut, sends, autoPan, duck },
             fx: [{ type, …params }], automation: { tone?, reverb?, delay? },
             clips: [{ id, start, beats, mute?, notes: [[beat, beats, key, vel, marks?], …] }] }] }
```

A beat is a quarter note; a note's beat is from its clip's start. `marker.meta`, `groove`, the FX params and a note's marks are opaque to the DAW: the Humanize FX reads them (a section's type and energy, swing, a track's role, a note's ornament). The reader takes version 1 only.

## Layout

| Folder | Holds | May import |
|---|---|---|
| `src/lib/` | pure helpers: SoundFont parsing, music theory, pitch tracking, transcription, files | nothing |
| `src/platform/` | the AudioContext, mic, MIDI, keys, storage | lib |
| `src/audio/` | SoundFont instruments, the mixer, the library in use | lib, platform |
| `src/daw/` | projects, their file, edits and undo, playback, the MIDI FX hook | the above |
| `src/composer/`, `src/sketch/` | composing projects and the Humanize FX; whistle → notes | the above, **not each other** |
| `src/app/` | the Preact UI | everything above |

`architecture.json` lists these layers for `tools/coupling-report.mjs`.

## Rules

- Imports only point down the table. For upward needs, pass a callback or a parameter.
- Content (songs, tables, tuning) goes in `*-data.js` files that import nothing.
- State the UI shows lives in signals in `app/store.js` (the recording in progress in `app/recording.js`). Components read it and call actions; they don't keep copies.
- Files are named for what they do. No `utils.js`, `helpers.js`, `misc.js`.
- `lib/` and `*-data.js` import no DOM code, and are covered by tests in `test/`.

## Checking

```sh
just check    # syntax check, the UI bundle, then tools/coupling-report.mjs --strict for the layer rules
just test     # node --test
```

Setting up, the other `just` recipes and the tools are in [Developer-Guide.md](Developer-Guide.md).
