# Music Generator

Pick a feeling or a song, and Music Generator composes it: melody, countermelody, arpeggio,
chords, pad, bass and drums, written by rule and played in the browser with sampled
instruments. There's no randomness, so the same song always comes out the same.

![A song playing: one piano per part (trumpet melody, French horn countermelody, harp arpeggio, string chords, choir pad, double bass and orchestral drums) with notes falling onto their keys, the Intensity slider, Sting and Next section buttons above, and the song's sections along the timeline at the bottom](docs/images/composer.webp)

It's also a keyboard you can play with your computer keys, the mouse or a MIDI keyboard, through
every instrument in three openly licensed General MIDI SoundFont libraries.

## What it does

- **Composes from a feeling.** Pick a song or a feeling in the **Composer** bar and press
  **Play song**. Each part shows as its own piano, with the notes falling onto its keys.
- **Tells a story.** Twelve genre songs each tell a story, scene by scene: bossa nova, reggae, funk,
  synthwave, lo-fi hip hop, tango, country, celtic, chiptune, gospel, cinematic and blues.
- **Makes game music.** The **Game music** songs show what a game can do with it: loops that
  vary every pass, an **Intensity** slider that brings parts in and out, **♪ Sting** for in-key
  event cues, **Next section** to move on at the next phrase, a boss that switches into 7/4, and
  one leitmotif heard in two moods.
- **Puts it in a game.** **▶ Adaptive music test level** is a dungeon corridor where the music
  follows you, from pad and bass at the gate to everything in the arena, with stingers for coins,
  guards and a hidden alcove.
- **Plays like an instrument.** Every key responds to how hard you play, from the mouse or a
  hardware keyboard with velocity and a sustain pedal.
- **Compares sound libraries.** Switch library and the keyboard keeps the same instrument, and
  the next song you play uses the new one, so you can hear the difference.

## Running it

Music Generator runs in the browser. You need Node.js, Python 3 and
[just](https://github.com/casey/just):

```bash
just soundfonts  # download the three libraries, about 400 MB
just play        # serve on http://localhost:8000 and open it
```

Each library's file downloads to the browser the first time you pick one of its instruments.

## Controls

| | Keyboard | Mouse or MIDI |
| --- | --- | --- |
| Play a note | `A S D F G H J K L ; '` white keys, `W E T Y U O P` black keys | click or drag across the keys (lower on a key is louder), or play a MIDI keyboard |
| Octave down, up | `Z`, `X` | |
| Change instrument | `↑` `↓` | the instrument list |
| Browse the instrument list | `I`, then the arrows; `Esc` or `Enter` to play again | |
| Sustain | hold `Space` | sustain pedal |
| Jump through a song | `←` `→` step between sections | click the timeline |
| Stop a song | `Esc` | **■ Stop** |
| Walk the test level | arrows or `W A S D` | |

**Connect MIDI** in the control bar turns on a hardware keyboard.

## Sound libraries

| Library | By | License |
| --- | --- | --- |
| [GeneralUser GS](https://github.com/mrbumpy409/GeneralUser-GS) 2.0.3 | S. Christian Collins | GeneralUser GS License v2.0: free for commercial music and software |
| FluidR3_GM | Frank Wen | MIT |
| MuseScore_General 0.2 | Frank Wen, Michael Cowgill and S. Christian Collins | MIT |

They aren't stored in this repository: `just soundfonts` downloads them, each with its license.

## Documentation

**[Read how it composes](docs/COMPOSING.md)**: the rules the composer follows and how to write
a song, for example:

- [How does a feeling turn into music?](docs/COMPOSING.md#2-from-emotion-to-parameters)
- [How do I write a song?](docs/COMPOSING.md#12-the-song-spec-writing-a-song)
- [What makes a funk song sound like funk?](docs/COMPOSING.md#13-genre-recipes)
- [How does the music follow the game?](docs/COMPOSING.md#11-adaptive-music-for-games)

## For developers

Setting up, checking your work, writing songs, composing from the command line, comparing
versions by ear and adding a library are covered in the
[developer guide](docs/Developer-Guide.md). The code layout and its rules are in
[ARCHITECTURE.md](docs/ARCHITECTURE.md).
