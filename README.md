# Music Generator

A LittleJS keyboard that plays the instruments of three openly licensed General MIDI SoundFont libraries (GeneralUser GS, FluidR3_GM and MuseScore_General), with a SoundFont 2 parser and Web Audio sampler written from scratch.

```sh
just play     # serve on localhost:8000 and open the browser
just check    # syntax + layer rules
just test     # node --test
just soundfonts  # download GeneralUser GS, FluidR3_GM and MuseScore_General into soundfonts/
just catalog  # regenerate the instrument list after changing the .sf2 files
just compose first-light --melody --midi first-light.mid   # compose without a browser
```

**Play:** `A S D F G H J K L ; '` are white keys and `W E T Y U O P` the black keys · `Z`/`X` octave · `↑`/`↓` instrument · `I` focuses the instrument list (arrows browse, `Esc` or `Enter` returns to playing) · hold `Space` to sustain · click or drag across the on-screen keys (lower on a key = louder) · **Connect MIDI** for a hardware keyboard (notes, velocity, sustain pedal).

**Compose:** pick a song or a feeling in the **Composer** bar. Twelve genre songs each tell a story, scene by scene: bossa nova, reggae, funk, synthwave, lo-fi hip hop, tango, country, celtic, chiptune, gospel, cinematic and blues and press **Play song**. The composer writes melody, countermelody, arpeggio, chords, pad, bass and drums by rule (no randomness: the same song always comes out the same), and shows every part as its own piano with the notes falling onto their keys. Click the timeline at the bottom to jump anywhere in the song, or `←`/`→` to step between its sections. **Esc** stops. The **Game music** songs show what a game can do with it: loops that vary every pass, an **Intensity** slider that brings parts in and out, **♪ Sting** for in-key event cues, **Next section** to move on at the next phrase, a boss that switches into 7/4, and one leitmotif heard in two moods. **▶ Adaptive music test level** puts it in a game: walk a dungeon corridor (arrows or WASD) and the music follows you, from pad and bass at the gate to everything in the arena, with stingers for coins, guards and a hidden alcove.

**Compare versions:** `just ab` (or `just ab <commit>`) serves a page at http://localhost:8010/tools/ab/ that renders every song with that commit and with your checkout, so you can hear what a change did. It shows each render's length, peak and loudness, has a blind mode, and saves the WAVs in `.ab/out/`. Songs are plain specs in `src/features/composer/songs-data.js`; they can also be played from the console (`composer.play({ title: 'Test', emotion: 'tender' })`) or a link (`#song=first-light`, `#feel=heroic`). How it composes and how to write a song: [docs/COMPOSING.md](docs/COMPOSING.md).

**Libraries:** the first list in the control bar switches library. The keyboard keeps the same instrument when the new library has it, and the next song you play uses the new library, so you can compare them by ear. Each `.sf2` file (32–216 MB) downloads the first time you pick one of its instruments and stays in memory afterwards.

| Library | Folder | Size | License |
|---|---|---|---|
| GeneralUser GS 2.0.3 | `soundfonts/GeneralUser-GS/` | 32 MB | GeneralUser GS License v2.0: free for commercial music and software |
| FluidR3_GM | `soundfonts/FluidR3_GM/` | 148 MB | MIT |
| MuseScore_General 0.2 | `soundfonts/MuseScore_General/` | 216 MB | MIT; keep its credits in any derivative |

`soundfonts/` is ignored here; each library's license file sits next to its `.sf2`. The libraries and their folders are listed in `src/audio/soundfont-libraries-data.js`.

Layout and rules: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
