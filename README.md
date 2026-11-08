# Music Generator

I built Music Generator to make it simpler and easier to create music for the games I make.
Pick a feeling or a song, or whistle a tune, and it composes one: melody, countermelody, arpeggio,
chords, pad, bass and drums, written by rule and played with sampled instruments. There's no
randomness, so the same song always comes out the same.

![The Warden boss fight open in the app: the transport across the top, the song list on the left, the arrangement with the whistle track and a row per part (melody muted), and the melody's piano roll at the bottom with its chords above](docs/images/daw.webp)

It's laid out like a DAW: a transport, a browser, an arrangement, a piano roll and a mixer.

## What it does

- **Composes from a feeling.** Pick a song or a feeling in the browser and press play. Each part
  gets a row in the arrangement, and its notes show in the piano roll.
- **Tells a story.** Twelve genre songs each tell a story, scene by scene: bossa nova, reggae, funk,
  synthwave, lo-fi hip hop, tango, country, celtic, chiptune, gospel, cinematic and blues, plus
  solo piano pieces with a left hand, rubato and ornaments.
- **Makes game music.** The game music songs loop with a variation every pass; a boss fight switches
  into 7/4, and one leitmotif is heard in two moods.
- **Turns whistling into songs.** Press record and whistle a melody over a click, at whatever tempo
  suits you, vibrato included. Drag over bars and whistle a chord's notes to set the chord there.
  **Make song** composes a band around it; **Save** keeps the takes in `ideas/`.
- **Mixes.** Mute, solo, a fader and pan for every part, and any instrument from the libraries on
  any part: click it in the browser, or drag it onto the track.
- **Plays like an instrument.** Your computer keys or a MIDI keyboard, with velocity and a sustain
  pedal, play the selected track's instrument.

## Running it

Music Generator is a desktop app. You need Node.js and [just](https://github.com/casey/just):

```bash
just soundfonts  # download the three libraries, about 400 MB
just install     # install it as an app: ~/Applications/Music Generator.app on macOS
just app         # or just open it in its own window, without installing
```

The installed app runs this folder, so it uses its sound libraries and its `ideas/` folder, and
picks up your changes the next time it opens (run `just build` first). The first time you record,
macOS asks whether it may use the microphone.

## Controls

| | Keyboard | Mouse or MIDI |
| --- | --- | --- |
| Play and stop | `Space` | **▶** and **■**; **■** twice goes back to the start |
| Move the playhead | | click the ruler, or the chords above the piano roll |
| Zoom the arrangement or piano roll | | `Cmd` + scroll |
| Record a melody on the whistle track | `R` starts and stops | **●** |
| Set a chord | drag over bars in the whistle track's roll, then `R` and whistle its notes | |
| Edit a whistled note | `↑` `↓` move it, `←` `→` select, `V` vibrato, `Delete`, `Esc` lets go | drag it up or down; click a chord for its next reading |
| Play the selected track's instrument | `A S D F G H J K L ; '` white keys, `W E T Y U O P` black keys | a MIDI keyboard, with its sustain pedal |
| Octave down, up | `Z`, `X` | |
| Show or hide the browser | `B` | |
| Put an instrument on a track | | click it in the browser's Instruments tab, or drag it onto the track |

Audio files dropped on the whistle track are read as takes.

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

## For developers

Setting up, checking your work, writing songs, composing from the command line, comparing
versions by ear and adding a library are covered in the
[developer guide](docs/Developer-Guide.md). The code layout and its rules are in
[ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

[MIT](LICENSE). The sound libraries have their own licenses, listed above.
