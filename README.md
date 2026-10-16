# SoundFont Player

A LittleJS keyboard that plays the instruments of the GeneralUser GS SoundFont library (287 presets in one `.sf2` file, including GS drum kits on bank 128), with a SoundFont 2 parser and Web Audio sampler written from scratch.

```sh
just play     # serve on localhost:8000 and open the browser
just check    # syntax + layer rules
just test     # node --test
just catalog  # regenerate the instrument list after changing the .sf2 files
```

**Play:** `A S D F G H J K L ; '` are white keys and `W E T Y U O P` the black keys · `Z`/`X` octave · `↑`/`↓` instrument · `I` focuses the instrument list (arrows browse, `Esc` or `Enter` returns to playing) · hold `Space` to sustain · click or drag across the on-screen keys (lower on a key = louder) · **Connect MIDI** for a hardware keyboard (notes, velocity, sustain pedal).

The `.sf2` is 32 MB and downloads the first time you pick an instrument; it stays in memory afterwards.

The library lives in `soundfonts/GeneralUser-GS/` (ignored here; download it from https://github.com/mrbumpy409/GeneralUser-GS and see its LICENSE.txt). The game serves the `.sf2` file from that folder.

Layout and rules: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
