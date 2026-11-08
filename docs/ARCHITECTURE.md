# Architecture

A desktop app (Electron) with a DAW-style UI in [Preact](https://preactjs.com) and [signals](https://preactjs.com/guide/v10/signals). `src/app/main.jsx` is bundled by esbuild into `dist/app.js` (`just build`), which `index.html` loads. Everything below `src/app/` is plain ES modules with no DOM in the music logic, so the tools in `tools/` and the tests in `test/` run it in Node as it is.

## This app

A rule-based composer that writes multi-instrument songs from a feeling or a spec, played with sampled instruments from three openly licensed General MIDI SoundFont libraries (`soundfonts/`), and a whistle track that turns whistled melodies and chords into songs. The composing method is in [COMPOSING.md](COMPOSING.md).

The window has a transport bar at the top, a browser on the left (songs, instruments, saved ideas), the arrangement in the middle (a ruler, the whistle track, a row per part) and an editor at the bottom (the piano roll for the selected track, or the mixer).

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
| `src/lib/wav.js` | mono 16-bit WAV files, for saving whistled takes |
| `src/lib/motif.js` | a motif's developments: sequence, inversion, retrograde, augmentation, diminution, fragmentation |
| `src/platform/audio-engine.js` | the AudioContext, master volume and mastering chain (air, glue compressor, limiter), resumed on the first gesture |
| `src/platform/ticker.js` | a Worker-driven interval for audio scheduling, so a background tab doesn't starve a song |
| `src/platform/mic.js`, `mic-worklet.js` | the microphone, raw (no echo cancelling, noise suppression or gain riding), in blocks stamped with the app's AudioContext time, so a take lines up with a click on the same context; audio files decoded to mono |
| `src/platform/midi.js` | Web MIDI input as note/cc messages |
| `src/platform/keys.js` | musical typing: computer keys → semitones and octave steps, and whether focus is in a text field |
| `src/platform/storage.js` | the settings, through the desktop app's `window.appStorage` hook |
| `src/audio/soundfont.js` | downloads and caches `.sf2` files; `createInstrument(font, preset, destination)` plays notes as Web Audio voices, with optional delayed vibrato and legato glides |
| `src/audio/pitch-moves.js` | a voice's pitch moves on its detune: delayed vibrato, scoops, tracker arpeggios, falls |
| `src/audio/mixer.js` | a song's mixer: channel strips (layer gain, the user's gain, low cut, tone filter, fader, pan with optional auto-pan) and shared reverb and tempo-synced, slowly modulated delay buses |
| `src/audio/soundfont-libraries-data.js` | the libraries: id, name, folder and license |
| `src/audio/soundfont-catalog-data.js` | generated list of every library's files and presets, so the menu doesn't need the files up front (`just catalog`) |
| `src/audio/chip-instruments-data.js` | the chip instruments and kits (waves, layers, envelopes, filters), their banks, and the one each part falls back to; `soundfont.js` builds them for the url `chip:` and every library lists them |
| `src/audio/soundfont-library.js` | the library in use, switched in the browser's Instruments tab; songs load their instruments from it |
| `src/composer/` | song spec → score, top down: the song plan (`plan.js`: form, keys, meters, energy curve, cadences, tempo map, loop), chords per section (`harmony.js`: cadences, harmonic rhythm, passing dim7s, harmony voices, call and response), the motif and melody (`melody.js`; repeats in `melody-repeats.js`, hand-written degree notation in `notation.js`), the parts in any meter (`parts.js`, `meter-patterns.js`, `meter.js`), arrangement and rhythm passes (`arrange.js`, `syncopation.js`), a chip song's techniques (`chip.js`), all driven by `compose.js`. The knowledge tables: `composer-data.js`, `patterns-data.js`, `song-craft-data.js` (styles, variation, curve, tempo, motifs), `genre-data.js` (genre profiles: defaults, progressions, extensions, voicing, cadences, scales, blue notes, phrase repeats), `performance-data.js`, `adaptive-data.js` (layers, stingers, ear candy). Written songs: `songs-data.js`, `genre-songs-data.js` (one per genre, with a story), `game-songs-data.js` (loops, a meter-changing boss, a leitmotif in two moods), `chip-songs-data.js` and `classical-songs-data.js`; `catalog.js` lists them and the feelings for the browser. The performance (`perform.js`: ghost notes, scoops, slides, vibrato, swing, timing; `ear-candy.js`), the mix plan (`mix-plan.js`), stingers (`stingers.js`), the instruments a score needs, with any the user picked instead (`band-loader.js`), and audio-clock playback from any beat, with loops, section queueing, intensity layers and live gain and pan per track (`song-player.js`). Intensity, stingers and queueing are for games; the app doesn't use them |
| `src/sketch/` | the whistle track's logic: recording a take over a click and count-in, read live a beat behind the playhead (`recorder.js`); reading and editing takes, their key, the chords whistled over stretches and the ones guessed for the rest (`takes.js`); a sketch as a section, a playable spec and pasteable text (`sketch-spec.js`); saving and reading takes in `ideas/` (`sketch-files.js`); defaults and the view's sizes (`sketchpad-data.js`) |
| `src/app/store.js` | the app's state as signals: settings (saved), the song and its score, the tracks' mixer settings and instrument picks, the selected track, the transport |
| `src/app/player.js` | opens a song (composes it), plays it from the playhead, follows it, stops, seeks, and keeps the mixer's settings on the playing channels |
| `src/app/live.js` | musical typing and MIDI input playing the selected track's instrument |
| `src/app/sketchpad.js` | the whistle track's actions: record, drop files, edit, make a song, copy, save, open ideas. Its state is a plain object changed in place, with a `padTick` signal bumped after each change |
| `src/app/components/` | the views: `Transport`, `Browser`, `Arrange`, `Editor` (`PianoRoll` for a song's track, `Whistle` for the whistle track, `Mixer`); `canvas.js` is a canvas that redraws when the signals it reads change, `roll-draw.js` what both rolls draw with |
| `src/app/app.css` | the look: colour tokens and the panel grid |
| `tools/compose.mjs` | composes a song in Node: prints the plan and melody, writes a `.mid` (`just compose`) |
| `tools/build.mjs` | bundles the UI with esbuild (`just build`, `--watch` for `just dev`, `--check` for `just check`) |
| `tools/install-app.sh` | installs the desktop app that runs this checkout (`just install`): a renamed Electron in `~/Applications` on macOS, with the icon from `assets/icon/`; a launcher on Linux |
| `assets/icon.svg`, `tools/make-icons.sh` | the app icon's source, and the script (`just icons`) that renders it into `assets/icon/` |
| `tools/ideas-files.mjs` | the desktop app's `ideas/` requests: `GET /ideas/` lists the sketches, `GET /ideas/<sketch>/` a sketch's files, `PUT /ideas/<sketch>/<file>` saves one |
| `electron/main.js`, `electron/preload.cjs` | the desktop app (`just app`): serves the checkout on `app://game/`, allows the microphone for that origin only, answers `ideas/` requests, and keeps the settings in a file through the `window.appStorage` hook. `--dev` reloads the window when `dist/` changes; `--headless` runs it hidden and muted, with its own settings, for automated tests |
| `tools/whistle.mjs` | transcribes a whistled recording into a section's `melody:` line, or with `--chords` an arpeggio take into its `progression:` (`just whistle`) |
| `tools/nsf-report.mjs`, `tools/nsf/` | studies NES music: plays an NSF's 6502 driver (`cpu6502.js`, `nsf.js`), turns its 2A03/VRC6 register writes into notes, drum hits and loops (`decode.js`), and reports how each song's lead moves, its rows, echoes, vibrato and drums (`just nsf`) |
| `tools/audio-report.mjs`, `tools/audio/`, `tools/music-stats.js` | the same lead statistics from recorded music: follows the lead's pitch in the mixed audio (`lead.js`) and reuses `decode.js`'s note finding; `music-stats.js` holds the interval, turn and leap measures both reports share (`just audio`) |
| `tools/ab-server.mjs`, `tools/ab/` | A/B listening: renders each song with an older commit and with this checkout, offline in the browser, side by side (`just ab`) |

The synth covers the parts of SF2 that matter for these files: key/velocity splits, preset+instrument generator merging, root key and tuning, loop modes, sample address offsets, a low-pass filter swept by the modulation envelope (`modEnvToFilterFc`), modulators driven by the note's velocity or key (a font's own velocity→cutoff one replaces the default, which lowers the cutoff for soft notes), pan, the DAHDSR volume envelope, and exclusive classes (drum kits). Modulators on CCs, pressure or the pitch wheel, the modulation envelope's pitch amount, LFOs, reverb and chorus sends are not implemented. Many GeneralUser GS presets (distortion guitar, French horn, clarinet) start their filter at a few hundred Hz and open it with the modulation envelope, so they need both.

### SoundFont libraries

The libraries live in `soundfonts/<folder>/`, ignored by git and downloaded by `just soundfonts`; `src/audio/soundfont-libraries-data.js` lists them. The instrument menu is built from `soundfont-catalog-data.js`, generated from the files by `just catalog`, so no `.sf2` (32–216 MB each) is fetched until one of its instruments is picked. `soundfont.js` then downloads it once and keeps it in memory. `soundfont-library.js` holds the library in use: switching it reloads the instrument musical typing plays, and the song (restarted if it's playing) loads its instruments from the new library. How to add one is in [Developer-Guide.md](Developer-Guide.md#soundfont-libraries).

## Layout

| Folder | Holds | May import |
|---|---|---|
| `src/lib/` | pure helpers: SoundFont parsing, music theory, pitch tracking, transcription, files | nothing |
| `src/platform/` | the AudioContext, mic, MIDI, keys, storage | lib |
| `src/audio/` | SoundFont instruments, the mixer, the library in use | lib, platform |
| `src/composer/`, `src/sketch/` | composing and playing songs; whistled takes | the above, **not each other** |
| `src/app/` | the Preact UI | everything above |

`architecture.json` lists these layers for `tools/coupling-report.mjs`.

## Rules

- Imports only point down the table. For upward needs, pass a callback or a parameter.
- Content (songs, tables, tuning) goes in `*-data.js` files that import nothing.
- State the UI shows lives in signals in `app/store.js` (or, for the whistle track, `pad` plus `padTick` in `app/sketchpad.js`). Components read it and call actions; they don't keep copies.
- Files are named for what they do. No `utils.js`, `helpers.js`, `misc.js`.
- `lib/` and `*-data.js` import no DOM code, and are covered by tests in `test/`.

## Checking

```sh
just check    # syntax check, the UI bundle, then tools/coupling-report.mjs --strict for the layer rules
just test     # node --test
```

Setting up, the other `just` recipes and the tools are in [Developer-Guide.md](Developer-Guide.md).
