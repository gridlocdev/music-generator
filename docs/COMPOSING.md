# Composing: a knowledge base for writing music by rule

This is how an AI, or anyone without an instrument in hand, can turn a feeling into a finished multi-instrument song without leaning on chance. It explains each decision the composer in `src/features/composer/` makes and why, then shows how to write a song for it.

The tables in `composer-data.js` and `patterns-data.js` are this document in data form. When the two disagree, the code is what plays; fix whichever one is wrong.

**Contents**

1. [Principles: no dice](#1-principles-no-dice)
2. [From emotion to parameters](#2-from-emotion-to-parameters)
3. [Anatomy of a song: form and sections](#3-anatomy-of-a-song-form-and-sections)
4. [Harmony: keys, modes, progressions](#4-harmony-keys-modes-progressions)
5. [Melody: motif, phrase, cadence](#5-melody-motif-phrase-cadence)
6. [Rhythm and grooves](#6-rhythm-and-grooves)
7. [Arrangement and orchestration](#7-arrangement-and-orchestration)
8. [Energy, repetition and variation](#8-energy-repetition-and-variation)
9. [The song spec: writing a song](#9-the-song-spec-writing-a-song)
10. [Workflow and checklist](#10-workflow-and-checklist)
11. [Analysing songs you like](#11-analysing-songs-you-like)
12. [Reference tables](#12-reference-tables)

---

## 1. Principles: no dice

Generative music usually means rolling dice: pick a random note from the scale, a random chord, a random rhythm. The output is "in key" but aimless, because nothing chose it for a reason. This composer replaces each roll with a decision.

- **Every musical choice has a rule.** Mode comes from valence. Tempo comes from arousal. Instruments come from the section's energy. Each melody note is scored against named rules, and the lowest score wins.
- **Ties are broken by a hash, not a random number.** When two candidates score exactly the same, a hash of (song title, section, note index, candidate) picks one. The same spec always produces the same song, note for note, so a spec can be discussed, versioned and refined like code. A test checks this (`composing is deterministic`).
- **Structure comes before notes.** Form, then sections and their energy, then harmony, then melody, then accompaniment. Each layer only fills in what the layer above left open.
- **Repetition is deliberate.** A chorus is written once and replayed. Listeners recognise a song by what comes back, so the chorus must come back the same.
- **Anything can be pinned by hand.** A progression, a melody, a section's length or energy, an instrument: a spec field overrides the rule that would have chosen it. Rules fill gaps and never fight the author.

The tie-break hash is not hidden randomness. Change the title and a few tied choices change, but no rule is ever broken to make room for them.

## 2. From emotion to parameters

Music psychology describes emotion on two axes. Valence runs from sad to happy, arousal from calm to excited. Listeners agree reliably on which musical features move a piece along each axis:

| Feature | Higher valence (happier) | Higher arousal (more excited) |
|---|---|---|
| Mode | major, lydian, mixolydian | — |
| Harmony | diatonic, consonant, resolved | more chord changes, dominant tension |
| Tempo | slightly faster | much faster |
| Loudness | — | louder, more accents |
| Register | higher | higher, wider |
| Rhythm | regular, bouncy | denser, more syncopated |
| Articulation | — | shorter (staccato) |
| Melodic motion | rising, stepwise | wider leaps, more notes |
| Timbre | bright (flute, piano, strings) | brighter and harsher (brass, distortion) |

Minor mode, slow tempo, low register, legato and falling lines read as sad. Major mode, fast tempo, high register, staccato and bouncing rhythm read as happy. High arousal with low valence (fast, loud, minor, dissonant) reads as anger or fear. Low arousal with high valence (slow, soft, major, sustained) reads as calm or tender.

`EMOTIONS` in `composer-data.js` turns this into eleven presets:

| Emotion | Valence / arousal | Mode | Tempo | Groove | Signature moves |
|---|---|---|---|---|---|
| joyful | .9 / .8 | major | 126 | pop | I–V–vi–IV chorus, brass lead, vibraphone arpeggio |
| hopeful | .7 / .55 | major | 100 | pop | sus4 resolving to I, rising verse contour, flute and harp |
| tender | .6 / .2 | major | 76 | waltz 3/4 | maj7 and m7 chords, violin over warm pad, brushes |
| nostalgic | .4 / .4 | major | 86 | ballad | borrowed **iv** (I–iii–IV–iv), music box, bVI–bVII–I bridge |
| melancholy | .15 / .3 | minor | 72 | ballad | i–VI–III–VII, falling verse, oboe and cello |
| mysterious | .4 / .35 | dorian | 88 | halftime | the dorian major IV, sus2 intro, shakuhachi and celesta |
| tense | .15 / .85 | harmonic minor | 132 | halftime | major V in minor, Neapolitan bII bridge, string ostinato |
| heroic | .75 / .85 | major | 116 | march | I–bVII–IV–I, trumpet and horns, choir pad, orchestral kit |
| serene | .65 / .1 | lydian | 66 | none | I–II (lydian #4), no drums, AABA form, pan flute |
| angry | .1 / .95 | minor | 144 | rock | power chords (root + fifth), driving eighths, distortion guitar |
| playful | .85 / .65 | major | 112 | bounce + swing | secondary dominants (III7, II7), staccato marimba, pizzicato |

To invent a new emotion, place it on the two axes first, then choose:

1. **Mode** from valence: major ≥ .6, mixolydian/lydian for bright but unusual, dorian ≈ .4 (minor but hopeful), minor ≤ .3, phrygian or harmonic minor for threat.
2. **Tempo** from arousal: about 60 + 90 × arousal bpm.
3. **Groove** from arousal and genre: none, waltz or ballad when calm; pop, march or bounce in the middle; rock, dance or halftime when intense.
4. **Legato** (how much of each note's length sounds) falls as playfulness or aggression rises: 1.0 tender, 0.55 playful.
5. **Dynamics** (overall loudness, 0–1) follows arousal.
6. **Progressions** per section (section 4).
7. **Band** per role (section 7).

## 3. Anatomy of a song: form and sections

### Forms

A form names its sections by role. The letter forms are the classic ones:

| Form | Sections | Use |
|---|---|---|
| AAA | repeating chorus | hymns, folk, loops; identity through pure repetition |
| ABAB | verse–chorus–verse–chorus | the plainest pop shape |
| ABCABC | verse–pre-chorus–chorus ×2 | modern pop; the pre-chorus builds anticipation |
| AABA | 32-bar form; B is the "middle 8" | standards and lyrical songs; no real verse or chorus |
| ABAC | call and response with two different answers | playful or conversational pieces |
| ABCDE | through-composed, no exact repeats | soundtracks, journeys; can change tone along the way |
| BABA | chorus first | grab attention, then explain |

`FORMS` in `composer-data.js` adds intros and outros and two longer shapes: `pop` (with a bridge before the last chorus) and `ballad`.

### What each section does

| Section | Job | Energy | Melody | Notes |
|---|---|---|---|---|
| **Intro** | sets key, tempo and colour | .3 | none | usually the verse's groove before the verse melody begins; sometimes a flourish heard nowhere else |
| **Verse** | follows up the idea set by the chorus; tells the story | .5 | low register, simpler | less musical, simpler accompaniment; each verse slightly different (melody tweaks, new instruments) |
| **Pre-chorus** | builds anticipation for the chorus | .65 | rising, denser | ends on V (a half cadence) so the chorus feels like an arrival; a drum fill leads in |
| **Chorus** | the main focus and dynamic peak; the song's identity | .9 | highest register, longer notes on the hook, more acrobatic | unique but familiar; new instruments and voices come in; louder |
| **Post-chorus** | leads the chorus back into the next section (rarer) | .7 | hook fragment, falling | instrumental hook |
| **Bridge** | something new with the chorus's impact, inside the song's world | .7 | new contour | new chords, often starting off the tonic (vi, IV, bVI); may drop the drums; may change key; breaks the monotony of verse and chorus |
| **Outro (coda)** | ends the song | .3 | none | thins out and lands on the tonic: a final held chord, bass root, one crash |

A bridge introduces one or more of: a new melody, new chords, new instruments, a new key. It recontextualises the story from a different angle. The pre-chorus differs from the bridge because it prepares for the chorus, while the bridge brings a completely different idea.

`SECTIONS` in `composer-data.js` stores each section's default bars, energy, melody register, density, contour and cadences.

## 4. Harmony: keys, modes, progressions

### Writing chords

Chords are written as Roman numerals relative to the song's key and mode, so a progression carries its emotion into any key.

| Symbol | Meaning (in C major) |
|---|---|
| `I` `IV` `V` | uppercase = major triad: C, F, G |
| `ii` `iii` `vi` | lowercase = minor triad: Dm, Em, Am |
| `vii°` | diminished: Bdim |
| `ø` `+` | half-diminished seventh, augmented |
| `V7` `ii7` `Imaj7` `IV6` `V9` `Imaj9` | sevenths, sixths and ninths; lowercase `7` is minor seventh |
| `Isus2` `Vsus4` | suspended: the third replaced by the 2nd or 4th |
| `Iadd9` | triad plus ninth |
| `bVII` `bVI` `#iv°` | root shifted a semitone from the mode's scale step: Bb, Ab, F#dim |
| `III7` `II7` | uppercase on a minor step = a secondary dominant (E7 = V of vi, D7 = V of V) |
| `V:2` `ii:0.5` | length in bars (default 1) |

Numerals count in the song's mode. In A minor, `VI` is F major and `V` is E major (the harmonic-minor dominant). The parser is `parseChord` in `src/lib/music-theory.js`.

### Function: what each chord wants

- **Tonic** (I, vi, iii): home, rest. Sections end here.
- **Subdominant / predominant** (IV, ii): moves away and prepares the dominant.
- **Dominant** (V, V7, vii°): tension that wants to resolve to I. Ending a phrase on V is a **half cadence**: a question.
- **V → I** is the **authentic cadence**: the answer. **IV → I** is the plagal "amen" cadence, softer.
- **Borrowed chords** from the parallel minor (iv, bVI, bVII) add bittersweet colour to major keys. The minor iv is the most nostalgic chord in pop.
- **Secondary dominants** (II7 → V, III7 → vi) briefly make another chord feel like home. They're playful and jazzy.

### Progressions by feeling

| Feeling | Progression | Why it works |
|---|---|---|
| uplifting pop | I–V–vi–IV | tonic → tension → sad colour → lift; endlessly reusable |
| pensive pop | vi–IV–I–V | the same four chords started on the minor; more yearning |
| hopeful | IV–I–V–vi | starts away from home, so it always feels like it's arriving |
| nostalgic | I–iii–IV–iv | the major IV darkening to minor iv is a sigh |
| melancholy | i–VI–III–VII | natural minor; never resolves strongly |
| andalusian | i–VII–VI–V | stepwise descent to a major V; drama, flamenco |
| heroic | I–bVII–IV–I | mixolydian "rock anthem" plagal motion |
| victory | bVI–bVII–I | the "Mario cadence": borrowed chords rising stepwise to home |
| mysterious | i–IV (dorian) | a minor tonic with a bright major IV: unresolved wonder |
| dreamy | I–II (lydian) | the raised fourth floats and never settles |
| tense | i–VI–iv–V | harmonic-minor V pulls hard back to i |
| dread | bII–V–i | the Neapolitan: a semitone above the tonic, then the dominant |
| jazzy, playful | I–vi–ii–V7 | the "rhythm changes" turnaround |

### Section harmony rules

1. **Verse and chorus use different progressions**, or at least different starting chords, so the chorus feels like a new place. If they share chords, start them on different ones (verse vi, chorus I).
2. **The pre-chorus ends on V** or a sus chord, the half cadence.
3. **The chorus starts on I or IV** and lands on I at its end (or deliberately avoids it, to loop back).
4. **The bridge starts on a non-tonic chord** (vi, IV, bVI, ii) and ends on V to set up the last chorus.
5. **The outro ends on I**, approached from IV, iv or V.
6. **Harmonic rhythm** (how often chords change): one chord per bar is the default. Two per bar adds urgency (pre-chorus, final cadence). Two bars per chord calms things down (intro, tender sections).

### Voice leading

Every chordal part is voiced by `voiceChord` in `music-theory.js`. It tries every placement of the chord's notes in the part's range and picks the one that moves least from the previous chord. That cost also penalises spreads wider than an octave and seconds packed together. As a result, chords glide instead of jumping in parallel blocks, which is the difference between "a keyboard playing chords" and "an arrangement". Chords with five or more notes drop the fifth, which adds least. Power chords (`power: true`) are root, fifth and octave.

## 5. Melody: motif, phrase, cadence

A melody comes from a few ideas, repeated and varied, never from a stream of new notes.

### The phrase plan

Each section is cut into 4-bar phrases. Each bar has a role:

| Bar | Role | Rhythm |
|---|---|---|
| 1 | **motif**: the basic idea | the rhythm cell closest to the section's density |
| 2 | **answer**: a contrasting idea | the next-closest cell (varies per verse) |
| 3 | **motif again** in the first phrase, **continuation** (busier) in the second | |
| 4 | **cadence**: a long note that ends the phrase | `[2, 2]` for a half cadence, `[4]` for a full one |

This is the classical *sentence*: idea, idea, development, cadence. Two phrases make a *period*. The first ends with a half cadence (a question, on degree 2 or 5) and the second with a full cadence (the answer, on degree 1). Choruses and verses use `['half', 'full']`. Bridges use `['half', 'half']` so they keep pushing toward the last chorus.

### Choosing each note

For every note, the composer scores each scale degree in the lead's range and keeps the cheapest (`MELODY_RULES`):

| Rule | Cost | Why |
|---|---|---|
| distance from the contour (or motif) target | 1 per degree | gives the phrase its shape |
| non-chord tone on a strong beat | 5 | strong beats must agree with the harmony |
| non-chord tone on a weak beat not reached by step | 3 | weak-beat dissonance is fine only as a passing or neighbour tone |
| leap beyond a third | 1.2 per degree | singable lines mostly move by step |
| leap beyond a sixth | +6 per degree | big leaps are rare and special |
| leap of a fourth or more not followed by a step back | 3 | gap-fill: a leap creates a gap the ear wants filled |
| the same pitch twice in a row | 0.8 | allowed, but motion is better |
| the same pitch three times in a row | 2.5 | static |
| a phrase ending off its cadence degrees | 12 | phrases must land |

A beat is strong if it's beat 1 or 3 in 4/4, or beat 1 in 3/4. Any note of two beats or more also counts as strong.

### Contour

The target height follows a contour across the phrase (`CONTOURS`, in scale degrees above the section's home pitch):

| Contour | Shape | Feels |
|---|---|---|
| arch | 0 2 4 3 0 | complete, satisfying: the default chorus shape, peaking about two-thirds through |
| rise | 0 1 2 3 4 | building, hopeful: pre-choruses, heroic verses |
| fall | 4 3 2 1 0 | sighing, resigned: sad verses, post-choruses |
| wave | 0 2 0 2 0 | conversational: verses, playful sections |
| valley | 3 1 0 1 2 | introspective: bridges, mysterious verses |
| plateau | 0 2 2 2 1 | insistent, tense: chant-like lines |

The chorus home pitch sits about 3 degrees above the verse's (`register`), so the chorus is literally higher. That is one of the strongest signals that "this is the chorus".

### Motivic repetition

The motif bar's pitches are remembered. When the motif comes back, its *shape* (the intervals between its notes) is replayed, shifted by the smallest step that puts its first note on a chord tone of the new chord. This is a *sequence*: the same idea at a new height, fitted to new harmony. It's how a few notes turn into a tune.

### Writing a melody by hand

The rules make a good, singable line; a hook you write yourself will usually be better. A section's `melody` takes degree notation:

```
'6:1.5 5:0.5 4 6 | 8:2 5 3 | 5 7 9:1.5 8:0.5 | 6:3 r'
```

- a number is a scale degree: 1 = tonic, 8 = tonic an octave up, 0 = the 7th below
- `b`/`#` before it bends it a semitone (`b3`, `#4`)
- `'` after it raises it an octave and `,` lowers it (`5'`, `7,`)
- `:n` is the length in beats (default 1); `r` is a rest
- `|` is ignored; use it to mark bars
- the line repeats if it is shorter than the section

When writing one, put chord tones on strong beats. Check the progression: in `IV I V vi` the first bar's chord is IV, whose tones are degrees 4, 6 and 1. Step between them on weak beats, peak once per phrase, and end the last phrase on 1 (or 3 or 5 for an open ending). Read it back with `just compose <song> --melody`.

## 6. Rhythm and grooves

### Drum grooves

A groove is a one-bar pattern per drum on a 16-step grid (12 in 3/4), with three levels by energy and a fill (`GROOVES` in `patterns-data.js`):

```
pop, mid:   kick  X.....x.X.......      X accent · x normal · o ghost · . rest
            snare ....X.......X...
            hat   x.x.x.x.x.x.x.x.
```

| Groove | Character | Backbone |
|---|---|---|
| pop | modern, steady | kick on 1 and the "and" of 2, snare 2 and 4, eighth hats |
| ballad | slow, spacious | kick 1 and 3½, snare on 3 (half-time feel) at mid energy |
| rock | driving | kick 1, 3, 3½, snare 2 and 4, open hats when loud |
| dance | four-on-the-floor | kick every beat, clap 2 and 4, offbeat open hats |
| march | ceremonial | kick every beat, snare rolls with ghost notes |
| swing | jazz | ride "ding, ding-a-ding", hi-hat pedal on 2 and 4, swung |
| bounce | playful shuffle | pop pattern with swing and tambourine |
| halftime | cinematic, heavy | snare only on 3; toms carry the pulse |
| waltz | 3/4 | kick on 1, brushes on 2 and 3 |
| none | no drums | — |

Rules:

- **Levels by energy**: below .55 low, below .8 mid, otherwise high. Quiet sections get only kick and hat. The snare backbeat arrives with energy.
- **Fills** replace the last bar of a section when the next section is louder, and always at the end of a pre-chorus. A fill signals that something is about to change.
- **Crash** on beat 1 of every section with energy ≥ .6, to mark the arrival.
- **Swing** pushes every offbeat eighth late by up to a triplet sixth of a beat (`swing` 0–1). At 0.6 the feel is a lazy triplet.
- **Metric accents** replace random "humanising". Velocity rises on the downbeat (+10) and beat 3 (+5) and falls on offbeats (−6). Real players accent this way, and the result is the same every time.

### Melody rhythm

Melody rhythms come from a fixed library of one-bar cells (`RHYTHMS`), chosen by how close their note count is to the section's density. Negative values are rests: `[-1, 1, 2]` waits a beat and then enters, which gives a verse room to breathe. Dotted cells (`[1.5, 0.5, 2]`) and offbeat entries (`[0.5, 1, 0.5, 2]`) add syncopation. A cadence bar holds a long note so the phrase audibly ends.

## 7. Arrangement and orchestration

### Roles

Every song is built from up to seven parts, each with a job and a register (`ROLES`, `RANGES`):

| Role | Job | Range (MIDI) | Typical instruments (GM program) |
|---|---|---|---|
| **lead** (Melody) | the tune; the focus | 60–86 | flute 73, violin 40, trumpet 56, oboe 68, alto sax 65, music box 10, marimba 12, pan flute 75, distortion guitar 30 |
| **counter** (Countermelody) | a second, slower voice answering the lead; guide tones (3rds and 7ths) | 53–79 | cello 42, violin 40, french horns 60, flute 73, clarinet 71 |
| **arp** (Arpeggio) | motion and sparkle; spreads the chord in time | 57–88 | harp 46, vibraphone 11, celesta 8, nylon guitar 24, pizzicato 45 |
| **chords** | rhythmic harmony | 52–74 | piano 0, e-piano 4, strings 48, guitars 29/30 |
| **pad** | sustained harmony; the glue | 48–76 | warm pad 89, slow strings 49, choir 52, synth strings 50 |
| **bass** | roots and the groove's low end | 28–52 | fingered 33, acoustic 32, picked 34, fretless 35, contrabass 43 |
| **drums** | time and energy | kit keys 36–57 | kits on bank 128: standard 0, room 8, power 16, dance 26, jazz 32, brush 40, orchestra 48 |

Orchestration rules:

1. **Separate the registers.** Bass below C3, chords and pad around C4, melody above. Parts in the same register mask each other. The ranges above keep them apart.
2. **One focus at a time.** The lead is loudest (+12 velocity, mix 1.0). The pad sits furthest back (−14, mix 0.45).
3. **Contrast timbres.** Pair a breathy lead (flute) with plucked support (harp, piano), and a bowed lead (violin) with a struck one (piano, vibes). Avoid two instruments of the same family in the same register.
4. **Match the instrument to the emotion.** Brass is bold, woodwinds intimate, plucked strings light, bowed strings emotional, synths modern or cold, bells magical, distortion aggressive.
5. **Bass patterns** (`BASS`): roots on strong beats, fifths and octaves for motion, and an **approach note** (A) one step from the next chord's root at the end of the bar, to pull the ear into the change.
6. **Comping patterns** (`COMPING`): sustain (calm), push (anticipating beat 3, pop), pulse (quarters, tension), eighths (rock), offbeat (2 and 4 stabs, bounce or swing), march, waltz (beats 2 and 3). Below .5 energy every style sustains.
7. **Arpeggio patterns** (`ARPS`): up, up-down, Alberti (low–high–mid–high, classical), broken, and ostinato (a repeated low note against the others, for tension).

### The arrangement curve

Parts enter by energy, so the arrangement grows and shrinks with the song without being written bar by bar (`ARRANGEMENT`):

| Part | Plays at energy ≥ |
|---|---|
| pad | 0 (always) |
| chords | .25 |
| bass | .35 |
| drums | .40 |
| arp | .60 |
| counter | .80 |

The resulting shape: the intro is pad only, the first verse adds chords, bass and drums, the pre-chorus adds the arpeggio, the chorus adds the countermelody, and the bridge pulls back. A section's `mute` list removes parts by hand, for example a drumless bridge.

## 8. Energy, repetition and variation

- **A song is an energy curve.** A typical pop curve: intro .3 → verse .5 → pre .65 → chorus .9 → verse .57 → pre .72 → chorus .97 → bridge .7 → chorus 1.0 → outro .3. Energy sets which parts play, their loudness, drum level, comping style and melody density.
- **Repeats get a lift** (`REPEAT_LIFT` = .07 per occurrence), so the second verse is fuller than the first: a part enters, the drums go up a level.
- **The chorus repeats exactly.** Its melody is written once and replayed, because recognition is the point.
- **Verses vary.** Each verse keeps its motif bars but swaps its answer-bar rhythm, the "change the melody slightly" rule.
- **The last chorus can lift** a key: `lift: true` raises it a whole step, `lift: 1` a semitone. Every part follows, and the outro stays in the new key. This is the "truck driver's gear change": cheap and effective.
- **Contrast before the end.** The bridge drops energy and changes harmony, so the final chorus hits harder by comparison.

## 9. The song spec: writing a song

A song is a plain object. Only `title` (or `id`) and `emotion` are needed; every other field overrides the emotion's default.

```js
{
    id: 'first-light',              // for menus, URLs and the CLI
    title: 'First Light',           // also seeds the tie-breaks
    emotion: 'hopeful',             // a key of EMOTIONS: sets everything not given below
    key: 'D',                       // C, C#, Db … B
    mode: 'major',                  // major, minor, dorian, phrygian, lydian, mixolydian, harmonicMinor
    tempo: 100,                     // bpm
    groove: 'pop',                  // a key of GROOVES; its beats set the meter (waltz = 3/4)
    swing: 0,                       // 0–1
    legato: 0.9,                    // fraction of each note that sounds
    dynamics: 0.65,                 // 0–1 overall loudness
    comp: 'push', arp: 'updown',    // keys of COMPING and ARPS
    power: false,                   // power chords
    form: 'ABCABC',                 // a key of FORMS, or a list: ['intro', 'verse', 'chorus', …]
    lift: true,                     // last chorus up a whole step (or a number of semitones)
    band: { lead: 73, drums: 40, counter: null },   // GM programs per role; null removes a part
    sections: {
        chorus: {
            progression: 'IV I V vi',               // Roman numerals, ':bars'
            melody: '6:1.5 5:0.5 4 6 | 8:2 5 3',    // degree notation, or false for no melody
            bars: 8, energy: 0.9,                   // length and intensity
            contour: 'arch', register: 3, density: 0.8,   // for a composed melody
            mute: ['drums'],                        // parts to leave out
        },
    },
}
```

**Where specs go.**

- In the game: add it to `SONGS` in `src/features/composer/songs-data.js`, and it appears in the Composer menu.
- In the browser console, or from a page that embeds the game: `composer.play({ title: 'Test', emotion: 'tender', key: 'A' })`, `composer.play('first-light')`, `composer.stop()`, and `composer.compose(spec)` to get the score without playing it.
- In a link: `index.html#song=first-light`, `#feel=heroic`, or `#spec=` followed by the URI-encoded JSON. Browsers need a click before sound, so the song starts on the first click or key press.
- On the command line: `just compose first-light --melody --midi out.mid` prints the plan (sections, energy, chords, parts) and the melody bar by bar, and writes a Standard MIDI File any DAW can open. Run `just compose path/to/spec.json` for a spec saved as a file.

**What comes out.** `compose(spec)` returns a score: tempo and meter; `sections` with labels, start beats and energy; `chords` with names; and one track per part, each `{ role, name, program, bank, notes: [{ key, beat, beats, vel }] }`. The player schedules those notes on the Web Audio clock through the SoundFont instruments. The view draws each track as its own piano in a grid, with notes falling onto the keys that play them.

## 10. Workflow and checklist

How to compose a song, in order:

1. **Name the feeling**, and place it on valence and arousal. Pick the closest emotion or tune one with `mode`, `tempo` and `groove`.
2. **Pick a form.** Short and loopable: AAA or ABAB. A story: pop or ABCABC. Lyrical: AABA. Playful: ABAC. A journey: ABCDE.
3. **Plan the energy curve.** Where is the peak? What drops out in the bridge?
4. **Write the chorus progression first**; it is the identity. Then a verse progression that differs from it, a pre-chorus that ends on V, and a bridge that starts away from I.
5. **Write the hook by hand** (the chorus melody) if you have one in mind. Let the rules write the verses.
6. **Choose the band**: one lead timbre that is the emotion, with contrasting support.
7. **Compose and read it**: `just compose <id> --melody`. Check the plan against the curve you wanted.
8. **Listen** in the game, and fix one thing at a time: a progression, a section's energy, a contour, an instrument.

Checklist before calling it done:

- [ ] The chorus is higher, louder and fuller than the verse.
- [ ] Verse and chorus progressions differ, at least in starting chord.
- [ ] The pre-chorus or bridge ends on V, or another chord that pulls forward.
- [ ] Strong-beat melody notes are chord tones (a test checks more than 80%).
- [ ] Phrases end on cadences: 2 or 5 for questions, 1 for answers.
- [ ] Each part has its own register and none masks the lead.
- [ ] Something changes every 8 bars: a part enters or leaves, the harmony shifts, the drums fill.
- [ ] The song ends on the tonic.

## 11. Analysing songs you like

Composers learn by playing songs they love and asking *why* each choice was made. That matters as much as *how*. To add a new emotion, groove or progression to these tables, analyse a reference track on six axes and translate each into spec fields:

| Listen for | Ask | Becomes |
|---|---|---|
| **Melody** | Range? Steps or leaps? Where's the peak? Is there a countermelody, and how do they relate? | `register`, `contour`, `density`, a hand-written `melody`, `counter` |
| **Chords** | Which progression? How often do they change? Borrowed or secondary chords? How do they sit under the melody? | `progression` per section |
| **Rhythm & meter** | Prevailing rhythm? Drum pattern? How do bass and drums lock? | a `GROOVES` entry, a `BASS` pattern, `swing` |
| **Instrumentation & timbre** | Which instruments, in which ranges? What changes through the piece? | `band`, `ARRANGEMENT` thresholds, `mute` |
| **Structure** | What are the sections, and how do the four qualities above evolve through them? | `form`, section `bars` and `energy` |
| **Production** | Effects, panning, sample choice | the SoundFont preset (`band`); this synth has no effects |

Transcribe by hand into degree notation and progressions to learn the patterns, but never ship an exact copy of someone else's melody. Write a new hook that uses the same *moves*.

The person who wrote the notes this guide grew from learned by making up music at the piano and transcribing it into a DAW. The equivalent here: write a spec, compose it, listen, and change one rule at a time. No trick produces a great song on the first try; the process is knowledge plus iteration.

## 12. Reference tables

**General MIDI programs** (0-based) used most, by family: pianos 0–7 · chromatic percussion 8–15 (celesta 8, glockenspiel 9, music box 10, vibraphone 11, marimba 12) · organs 16–23 · guitars 24–31 (nylon 24, steel 25, clean 27, overdrive 29, distortion 30) · basses 32–39 · strings 40–47 (violin 40, viola 41, cello 42, contrabass 43, tremolo 44, pizzicato 45, harp 46, timpani 47) · ensembles 48–55 (strings 48, slow strings 49, choir 52) · brass 56–63 (trumpet 56, trombone 57, tuba 58, horns 60) · reeds 64–71 (sax 64–67, oboe 68, clarinet 71) · pipes 72–79 (piccolo 72, flute 73, pan flute 75, shakuhachi 77) · synth leads 80–87 · synth pads 88–95 (fantasia 88, warm 89, space voice 91) · effects, ethnic and percussive 96–127. The full list of what this library has is `src/audio/soundfont-catalog-data.js`.

**GM drum keys**: kick 36 · side stick 37 · snare 38 · clap 39 · closed hat 42 · pedal hat 44 · low tom 45 · open hat 46 · mid tom 47 · crash 49 · high tom 50 · ride 51 · tambourine 54.

**Modes** (semitones from the tonic, and the colour note):

| Mode | Steps | Colour |
|---|---|---|
| major (ionian) | 0 2 4 5 7 9 11 | bright, resolved |
| lydian | 0 2 4 **6** 7 9 11 | raised 4th: dreamy, floating |
| mixolydian | 0 2 4 5 7 9 **10** | flat 7th: bluesy, anthemic |
| dorian | 0 2 3 5 7 **9** 10 | minor with a raised 6th: soulful, mysterious |
| minor (aeolian) | 0 2 3 5 7 8 10 | sad, natural |
| phrygian | 0 **1** 3 5 7 8 10 | flat 2nd: dark, exotic |
| harmonic minor | 0 2 3 5 7 8 **11** | raised 7th: tense, dramatic |

**Cadences**: authentic V→I (closed) · plagal IV→I (gentle) · half →V (open) · deceptive V→vi (surprise) · backdoor bVII→I (warm) · Mario bVI→bVII→I (triumph).
