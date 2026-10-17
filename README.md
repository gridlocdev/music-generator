# SoundFont Player

A LittleJS keyboard that plays the instruments of the GeneralUser GS SoundFont library (287 presets in one `.sf2` file, including GS drum kits on bank 128), with a SoundFont 2 parser and Web Audio sampler written from scratch.

```sh
just play     # serve on localhost:8000 and open the browser
just check    # syntax + layer rules
just test     # node --test
just catalog  # regenerate the instrument list after changing the .sf2 files
just compose first-light --melody --midi first-light.mid   # compose without a browser
```

**Play:** `A S D F G H J K L ; '` are white keys and `W E T Y U O P` the black keys · `Z`/`X` octave · `↑`/`↓` instrument · `I` focuses the instrument list (arrows browse, `Esc` or `Enter` returns to playing) · hold `Space` to sustain · click or drag across the on-screen keys (lower on a key = louder) · **Connect MIDI** for a hardware keyboard (notes, velocity, sustain pedal).

**Compose:** pick a song or a feeling in the **Composer** bar. Twelve genre songs each tell a story, scene by scene: bossa nova, reggae, funk, synthwave, lo-fi hip hop, tango, country, celtic, chiptune, gospel, cinematic and blues and press **Play song**. The composer writes melody, countermelody, arpeggio, chords, pad, bass and drums by rule (no randomness: the same song always comes out the same), and shows every part as its own piano with the notes falling onto their keys. Click the timeline at the bottom to jump anywhere in the song, or `←`/`→` to step between its sections. **Esc** stops. The **Game music** songs show what a game can do with it: loops that vary every pass, an **Intensity** slider that brings parts in and out, **♪ Sting** for in-key event cues, **Next section** to move on at the next phrase, a boss that switches into 7/4, and one leitmotif heard in two moods. Songs are plain specs in `src/features/composer/songs-data.js`; they can also be played from the console (`composer.play({ title: 'Test', emotion: 'tender' })`) or a link (`#song=first-light`, `#feel=heroic`). How it composes and how to write a song: [docs/COMPOSING.md](docs/COMPOSING.md).

The `.sf2` is 32 MB and downloads the first time you pick an instrument; it stays in memory afterwards.

The library lives in `soundfonts/GeneralUser-GS/` (ignored here; download it from https://github.com/mrbumpy409/GeneralUser-GS and see its LICENSE.txt). The game serves the `.sf2` file from that folder.

Layout and rules: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
