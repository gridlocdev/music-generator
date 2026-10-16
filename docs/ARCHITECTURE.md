# Architecture

The game is native ES modules served as static files, with no bundler. `src/main.js` boots storage and the engine, then hands control to `src/game/loop.js`, which builds, updates and draws the shared systems listed in `main.js` and every feature listed in `src/features/index.js`, in that order. The engine is imported only in `src/platform/engine.js`, by the bare name mapped in `index.html`'s import map.

## This game

A keyboard that plays every instrument in the GeneralUser GS SoundFont library (`soundfonts/GeneralUser-GS/*.sf2`).

| File | Does |
|---|---|
| `src/lib/sf2.js` | parses a `.sf2` ArrayBuffer into presets → regions (key/velocity range, sample, merged generators) |
| `src/lib/sf2-voice.js` | region + key + velocity → pitch, gain, pan, loop points, filter, volume envelope |
| `src/lib/notes.js` | MIDI note names and black/white keys |
| `src/platform/audio-engine.js` | the AudioContext and master volume, resumed on the first gesture |
| `src/platform/midi.js` | Web MIDI input as note/cc messages |
| `src/platform/input.js` | computer keys → semitone offsets, octave, instrument step, sustain |
| `src/audio/soundfont.js` | downloads and caches `.sf2` files; `createInstrument(font, preset)` plays notes as Web Audio voices |
| `src/audio/soundfont-catalog-data.js` | generated list of every preset and its file, so the menu doesn't need the file up front (`just catalog`) |
| `src/features/keyboard/` | the playable piano: picker bar, on-screen keys, mouse/keys/MIDI input, its save slice |

The synth covers the parts of SF2 that matter for these files: key/velocity splits, preset+instrument generator merging, root key and tuning, loop modes, sample address offsets, static low-pass filter, pan, the DAHDSR volume envelope, and exclusive classes (drum kits). Modulators, LFOs, the modulation envelope, reverb and chorus sends are not implemented.

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
