# Music Generator

I built Music Generator to make it simpler and easier to create music for the games I make.
It's a small DAW: projects of tracks and clips, a piano roll, a mixer, and sampled instruments.
On top of that it composes. Pick a feeling, a genre or one of its songs, or whistle a tune, and it
writes a new project: melody, countermelody, arpeggio, chords, pad, bass and drums, written by rule.

![The Warden boss fight open in the app: the transport across the top, the browser on the left, the arrangement with a row per track (melody muted), and the melody's piano roll at the bottom with its chords above](docs/images/daw.webp)

It's laid out like a DAW: a transport, a browser, an arrangement, a piano roll and a mixer.

## What it does

- **Keeps projects.** A project is a folder in `projects/` with a `project.json`: tracks,
  clips of notes, instruments, the mixer, tempo, meter, markers and a chord track. The 38 songs
  it ships with are projects you can open, edit and save.
- **Composes new projects.** **New…** writes one from a feeling, a genre or one of the songs.
  Twelve genre songs each tell a story, scene by scene: bossa nova, reggae, funk, synthwave,
  lo-fi hip hop, tango, country, celtic, chiptune, gospel, cinematic and blues, plus solo piano
  pieces with a left hand, rubato and ornaments. The game music loops; a boss fight switches
  into 7/4.
- **Plays them like a band.** Each composed track has a **Humanize** effect that adds ghost
  notes, swing, timing and ornaments as it plays, so every pass round a loop is a little different,
  and your edits are played the same way.
- **Edits.** Draw, move, resize and delete notes and their velocity in the piano roll, on a grid
  or free. Move, copy, split and delete clips, add and delete tracks, change the tempo and meter.
  Everything can be undone.
- **Turns whistling into notes.** Press record and whistle a melody over a click onto any track,
  vibrato included. Pick a stretch of the chord track and whistle a chord's notes to set the chord
  there. **New from melody** composes a band around the selected clip. A saved project keeps its
  takes in `projects/<name>/takes/`, and an audio file dropped on a track is read the same way.
- **Mixes.** Mute, solo, a fader and pan for every track, and any instrument from the libraries
  on any track: click it in the browser, or drag it onto the track.
- **Plays like an instrument.** Your computer keys or a MIDI keyboard, with velocity and a sustain
  pedal, play the selected track's instrument.

## Running it

Music Generator is a desktop app. You need Node.js and [just](https://github.com/casey/just):

```bash
just soundfonts  # download the three libraries, about 400 MB
just install     # install it as an app: ~/Applications/Music Generator.app on macOS
just app         # or just open it in its own window, without installing
```

The installed app runs this folder, so it uses its sound libraries and its `projects/` folder, and
picks up your changes the next time it opens (run `just build` first). The first time you record,
macOS asks whether it may use the microphone.

## Controls

| | Keyboard | Mouse or MIDI |
| --- | --- | --- |
| Play and stop | `Space` | **▶** and **■**; **■** twice goes back to the start |
| Move the playhead | | click the ruler |
| Zoom the arrangement or piano roll | | `Cmd` + scroll |
| New, save, save as | `Cmd N`, `Cmd S`, `Shift Cmd S` | **New…**, **Save**, **Save as** |
| Undo, redo | `Cmd Z`, `Shift Cmd Z` | |
| Record a melody on the selected track | `R` starts and stops | **●** |
| Set a chord | drag over the chord track, then `R` and whistle its notes | |
| Draw a note | | click empty space in the piano roll; `Alt` turns off the grid |
| Move or resize a note | `↑` `↓` transpose, with `Shift` an octave | drag it, or drag its right edge |
| Select notes | `Cmd A` selects all | `Shift` click adds or removes one |
| Delete notes, a clip or a stretch of chords | `Delete` | |
| Move or copy a clip | | drag it; `Alt` drag copies it |
| Split a clip at the playhead | `Cmd T` | |
| Draw an empty clip | | double-click a track's lane |
| Play the selected track's instrument | `A S D F G H J K L ; '` white keys, `W E T Y U O P` black keys | a MIDI keyboard, with its sustain pedal |
| Octave down, up | `Z`, `X` | |
| Show or hide the browser | `B` | |
| Put an instrument on a track | | click it in the browser's Instruments tab, or drag it onto the track |

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
