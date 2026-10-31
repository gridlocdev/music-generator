# Architecture

The game is native ES modules served as static files, with no bundler. `src/main.js` boots storage and the engine, then hands control to `src/game/loop.js`, which builds, updates and draws the shared systems listed in `main.js` and every feature listed in `src/features/index.js`, in that order. The engine is imported only in `src/platform/engine.js`, by the bare name mapped in `index.html`'s import map.

## This game

A keyboard that plays every instrument in three openly licensed General MIDI SoundFont libraries (`soundfonts/`), switchable to compare them, and a rule-based composer that writes multi-instrument songs from a feeling and plays them as a grid of pianos with falling notes. The composing method is in [COMPOSING.md](COMPOSING.md).

| File | Does |
|---|---|
| `src/lib/sf2.js` | parses a `.sf2` ArrayBuffer into presets → regions (key/velocity range, sample, merged generators) |
| `src/lib/sf2-voice.js` | region + key + velocity → pitch, gain, pan, loop points, filter, volume envelope |
| `src/lib/notes.js` | MIDI note names and black/white keys |
| `src/lib/music-theory.js` | keys, modes, scale degrees, Roman-numeral chords (secondary, slash and extended), accidentals that follow a chord, a stable hash for tie-breaks |
| `src/lib/voicing.js` | chord voicings: least-motion voice leading, shells, drop 2 |
| `src/lib/impulse.js` | a seeded synthetic reverb impulse response |
| `src/lib/midi-file.js` | writes a Standard MIDI File from a score, with tempo and meter changes (`just compose … --midi`) |
| `src/lib/tempo-map.js` | a song's tempo over time (steady or ramping segments) and conversion between beats and seconds |
| `src/lib/motif.js` | a motif's developments: sequence, inversion, retrograde, augmentation, diminution, fragmentation |
| `src/platform/audio-engine.js` | the AudioContext, master volume and mastering chain (air, glue compressor, limiter), resumed on the first gesture |
| `src/platform/ticker.js` | a Worker-driven interval for audio scheduling, so a background tab doesn't starve a song |
| `src/platform/midi.js` | Web MIDI input as note/cc messages |
| `src/platform/input.js` | computer keys → semitone offsets, octave, instrument step, section step, sustain |
| `src/audio/soundfont.js` | downloads and caches `.sf2` files; `createInstrument(font, preset, destination)` plays notes as Web Audio voices, with optional delayed vibrato and legato glides |
| `src/audio/mixer.js` | a song's mixer: channel strips (layer gain, fader, pan with optional auto-pan, low cut, tone filter) and shared reverb and tempo-synced, slowly modulated delay buses |
| `src/audio/soundfont-libraries-data.js` | the libraries: id, name, folder and license |
| `src/audio/soundfont-catalog-data.js` | generated list of every library's files and presets, so the menu doesn't need the files up front (`just catalog`) |
| `src/audio/soundfont-library.js` | the library in use, switched from the keyboard's control bar; songs load their instruments from it |
| `src/features/keyboard/` | the playable piano: picker bar, on-screen keys, mouse/keys/MIDI input, its save slice; steps aside while an activity runs |
| `src/features/composer/` | song spec → score, top down: the song plan (`plan.js`: form, keys, meters, energy curve, cadences, tempo map, loop), chords per section (`harmony.js`: cadences, harmonic rhythm, passing dim7s, harmony voices, call and response), the motif and melody (`melody.js`; repeats in `melody-repeats.js`, hand-written degree notation in `notation.js`), the parts in any meter (`parts.js`, `meter-patterns.js`, `meter.js`), arrangement and rhythm passes (`arrange.js`, `syncopation.js`), all driven by `compose.js`. The knowledge tables: `composer-data.js`, `patterns-data.js`, `song-craft-data.js` (styles, variation, curve, tempo, motifs), `genre-data.js` (genre profiles: defaults, progressions, extensions, voicing, cadences, scales, blue notes, phrase repeats), `performance-data.js`, `adaptive-data.js` (layers, stingers, ear candy). Written songs: `songs-data.js`, `genre-songs-data.js` (one per genre, with a story) and `game-songs-data.js` (loops, a meter-changing boss, a leitmotif in two moods). The performance (`perform.js`: ghost notes, scoops, slides, vibrato, swing, timing; `ear-candy.js`), the mix plan (`mix-plan.js`), stingers (`stingers.js`), the instruments a score needs (`band-loader.js`), audio-clock playback with loops, section queueing and intensity layers (`song-player.js`), the falling-notes grid (`song-view.js`) and its control bar; a playing song is an activity |
| `src/features/adventure/` | a test level for adaptive music: walk a corridor whose zones raise the music's intensity, with coins, guards, a hidden alcove and an arena that switches the song's phase. It drives the composer only through `music:*` events (`level.js` the rules, `level-view.js` the drawing, `adventure-data.js` the layout) |
| `tools/compose.mjs` | composes a song in Node: prints the plan and melody, writes a `.mid` (`just compose`) |
| `tools/ab-server.mjs`, `tools/ab/` | A/B listening: renders each song with an older commit and with this checkout, offline in the browser, side by side (`just ab`) |

The synth covers the parts of SF2 that matter for these files: key/velocity splits, preset+instrument generator merging, root key and tuning, loop modes, sample address offsets, static low-pass filter (lowered for soft notes, like SF2's default velocity modulator), pan, the DAHDSR volume envelope, and exclusive classes (drum kits). Modulators, LFOs, the modulation envelope, reverb and chorus sends are not implemented.

### SoundFont libraries

The libraries live in `soundfonts/<folder>/`, ignored by git and downloaded by `just soundfonts`; `src/audio/soundfont-libraries-data.js` lists them. The instrument menu is built from `soundfont-catalog-data.js`, generated from the files by `just catalog`, so no `.sf2` (32–216 MB each) is fetched until one of its instruments is picked. `soundfont.js` then downloads it once and keeps it in memory. `soundfont-library.js` holds the library in use: switching it keeps the keyboard on the same instrument when the new library has it, and the next song loads its instruments from the new library. How to add one is in [Developer-Guide.md](Developer-Guide.md#soundfont-libraries).

## Layout

| Folder | Holds | May import |
|---|---|---|
| `src/lib/` | pure helpers (math, noise, curves) | nothing |
| `src/platform/` | engine setup, storage, input, audio primitives | lib |
| `src/game/` | loop, state and save slices, activity, interactables, events | lib, platform |
| `src/world/ player/ render/ ui/ audio/` | shared systems | the above, and each other without cycles |
| `src/features/<name>/` | one gameplay feature each: code, data, save slice | everything above, **not other features** |

## Rules

- Imports only point down the table. For upward needs, register a callback, emit an event, or pass a parameter.
- A feature lives entirely in its folder and registers in `src/features/index.js`. Adding one never edits `main.js`.
- Each feature owns its save slice (`state.slice('<id>', defaults)`). No other code writes it.
- Takeovers of player control go through `activity.start()` / `activity.end()`.
- Content (text, tables, tuning) goes in `*-data.js` files that import nothing.
- Files are named for what they do. No `utils.js`, `helpers.js`, `misc.js`.
- Import another folder through its `index.js` when it has one, not its private files.
- `lib/` and `*-data.js` import no engine or DOM code, and are covered by tests in `test/`.

## Checking

```sh
just check    # syntax check, then tools/coupling-report.mjs --strict for the layer rules
just test     # node --test
```

Setting up, the other `just` recipes and the tools are in [Developer-Guide.md](Developer-Guide.md).
