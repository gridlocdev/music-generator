# Developer guide

Music Generator is plain JavaScript ES modules on [LittleJS](https://github.com/KilledByAPixel/LittleJS),
with no bundler: the browser loads `src/` as it is, and the import map in `index.html` points at
the engine in `node_modules/`. The SoundFont 2 parser and the Web Audio sampler are written from
scratch. The rules in `AGENTS.md` at the repository root apply to everyone working on it, and the
code layout and its layer rules are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Getting set up

You need Node.js, Python 3 and [just](https://github.com/casey/just).

```bash
just install     # install the pinned LittleJS into node_modules
just soundfonts  # download GeneralUser GS, FluidR3_GM and MuseScore_General into soundfonts/
just play        # serve on http://localhost:8000 and open the browser
just serve       # serve on http://localhost:8000 without opening a browser
```

`just play` and `just serve` run `npm install` first if the engine is missing. Pages must be
served over HTTP, not opened as files, because ES modules don't load from `file://`. Without
just: `npm install && npm start`.

## Checking your work

Run both after every change:

```bash
just check   # syntax-check every module, then the layer rules (tools/coupling-report.mjs --strict)
just test    # node --test: the tests in test/ for lib/ and *-data.js files
```

## Writing songs

Songs are plain specs in `src/features/composer/`: `songs-data.js`, `genre-songs-data.js` (one
per genre, each with a story) and `game-songs-data.js` (the game music). The spec format and how
the composer reads it are in [COMPOSING.md](COMPOSING.md#12-the-song-spec-writing-a-song).

In the browser, a song can also be played from the console or opened from a link:

```js
composer.play({ title: 'Test', emotion: 'tender' })
```

```
http://localhost:8000/#song=first-light
http://localhost:8000/#feel=heroic
```

### Composing without a browser

`just compose` (`tools/compose.mjs`) composes a song in Node and prints its plan. It takes a
song id, `feel:<emotion>` or a path to a spec in JSON:

```bash
just compose first-light                               # the plan
just compose first-light --melody                      # and the lead line, bar by bar, as note names
just compose first-light --midi first-light.mid        # and a Standard MIDI File
just compose feel:tender
```

### Comparing versions by ear

`just ab` (or `just ab <commit>`, default `main`) serves a page at
http://localhost:8010/tools/ab/ (or the next free port) that renders every song with that commit
and with your checkout, side by side, so you can hear what a change did. It shows each render's
length, peak and loudness, has a blind mode, and saves the WAVs in `.ab/out/`, which git ignores.

## SoundFont libraries

| Library | Folder | Size | License |
|---|---|---|---|
| GeneralUser GS 2.0.3 | `soundfonts/GeneralUser-GS/` | 32 MB | GeneralUser GS License v2.0: free for commercial music and software |
| FluidR3_GM | `soundfonts/FluidR3_GM/` | 148 MB | MIT |
| MuseScore_General 0.2 | `soundfonts/MuseScore_General/` | 216 MB | MIT; keep its credits in any derivative |

`soundfonts/` is ignored by git; `just soundfonts` downloads every library, with its license
file next to its `.sf2`. The libraries and their folders are listed in
`src/audio/soundfont-libraries-data.js`.

### Adding or replacing a library

1. Put the `.sf2` and its license file in `soundfonts/<folder>/`, and add the download to the
   `soundfonts` recipe in the `justfile`.
2. Add the library to `LIBRARY_SOURCES` in `src/audio/soundfont-libraries-data.js`.
3. Run `just catalog` to regenerate `src/audio/soundfont-catalog-data.js`, the list of every
   file and preset that lets the instrument menu load without the files.
4. Run `just check` and `just test`.

## Adding a feature

A feature goes in its own folder, `src/features/<name>/`, with its code, its `*-data.js` content
and its save slice, and is registered in `src/features/index.js`. Features don't import each
other: they talk through `src/game/events.js` (the adventure level drives the composer only
through `music:*` events). The full rules are in [ARCHITECTURE.md](ARCHITECTURE.md#rules).
