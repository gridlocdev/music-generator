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
9. [Meter and tempo](#9-meter-and-tempo)
10. [Detail passes and styles](#10-detail-passes-and-styles)
11. [Adaptive music for games](#11-adaptive-music-for-games)
12. [The song spec: writing a song](#12-the-song-spec-writing-a-song)
13. [Genre recipes](#13-genre-recipes)
14. [Telling a story with a song](#14-telling-a-story-with-a-song)
15. [Workflow and checklist](#15-workflow-and-checklist)
16. [Analysing songs you like](#16-analysing-songs-you-like)
17. [Reference tables](#17-reference-tables)

**The pipeline.** `compose()` works top down, and each stage only fills in what the one above left open:

1. **Song plan** (`plan.js`): the form as sections, each with its key, mode, meter, energy, cadence, harmonic rhythm and texture; the energy curve with one climax; the tempo map; the loop; and the motif (`melody.js`).
2. **Section plan** (`harmony.js`): the chords at the section's harmonic rhythm, ending on its cadence, with passing chords.
3. **Phrases**: the melody from the motif's development, call and response, harmony voices, then the accompaniment (`parts.js`, `meter-patterns.js`).
4. **Arrangement and rhythm passes** (`arrange.js`, `syncopation.js`): entries, exits, the breath before a payoff, anticipations, offbeat accents, echo rhythms.
5. **Playback** (`perform.js`, `mix-plan.js`, `song-player.js`): ghost notes, scoops, ear candy, swing, timing, mix automation and adaptive control.

---

## 1. Principles: no dice

Generative music usually means rolling dice: pick a random note from the scale, a random chord, a random rhythm. The output is "in key" but aimless, because nothing chose it for a reason. This composer replaces each roll with a decision.

- **Every musical choice has a rule.** Mode comes from valence. Tempo comes from arousal. Instruments come from the section's energy. Each melody note is scored against named rules, and the lowest score wins.
- **Ties are broken by a hash, not a random number.** When two candidates score exactly the same, a hash of (song title, section, note index, candidate) picks one. The same spec always produces the same song, note for note, so a spec can be discussed, versioned and refined like code. A test checks this (`composing is deterministic`).
- **Structure comes before notes.** Form, then sections and their energy, then harmony, then melody, then accompaniment. Each layer only fills in what the layer above left open.
- **Repetition is deliberate, and varied.** A chorus is written once and replayed. Listeners recognise a song by what comes back, so the chorus comes back the same, except for one thing that changes each time (section 8).
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

`FORMS` in `composer-data.js` adds intros and outros and some longer shapes:

| Form | Sections | Use |
|---|---|---|
| `pop` | intro, V, PC, C, V, PC, C, bridge, C, outro | the default story shape |
| `verseChorus` | intro, V, PC, C, V, PC, C, bridge, C, C, outro | most pop and rock: the doubled last chorus; the first of the two ends deceptively |
| `ballad` | intro, V, C, V, C, bridge, C, outro | no pre-chorus |
| `edm` | intro, build, drop, breakdown, build, drop, outro | the electronic equivalent of verse and chorus |
| `blues` | intro, three 12-bar choruses, outro | a fixed I–IV–V cycle repeated with variations |

A form is a grammar of sections, and every section type carries parameters that later passes read (`SECTIONS`). **Phrases come in 4s and 8s**, and sections in 8 or 16 bars. A `link` section (one bar of 2/4) breaks that on purpose: a phrase one bar longer than the ear expects, the large-scale version of syncopation.

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
| **Build** | the electronic pre-chorus | .6 | none | the snare rolls from quarters to sixteenths, chords change twice as fast, then two beats of silence |
| **Drop** | the electronic chorus | .95 | the hook | everything lands on its beat 1 |
| **Breakdown** | the electronic bridge | .4 | slow, augmented motif | drums and bass out; few parts (`fullness` .2) at a bigger feel |
| **Blues chorus** | a 12-bar line | .6 | three 4-bar lines | `I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7`, turning around to V |
| **Link** | one bar of 2/4 | .6 | none | delays what comes next by two beats; ends on V |

Each section's parameters, in `SECTIONS`:

| Field | Does |
|---|---|
| `endOn` | the cadence its chords end on: `dominant`, `tonic`, `plagal`, `deceptive` (section 4) |
| `harmonicRhythm` | how much faster chords change than written: 2 for a pre-chorus, 0.5 for an intro |
| `develop` | how its motif bars transform the song's motif (section 5) |
| `fullness` | which parts play, in place of energy: a breakdown is big in feel but small in parts |
| `breath` | its last beats keep only some parts: space that makes the next section hit |
| `answer` | the countermelody answers the lead (section 7) |
| `feel` | the drums play `half`-time, `double`-time, or a `roll` (section 9) |
| `entries`, `exits` | parts come in one at a time across it, or leave one at a time |
| `meter` | a meter of its own (section 9) |

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
| `bVII` `bVI` `#iv°` | with a flat or sharp, the numeral counts from the major scale: Bb, Ab, F#dim in any mode |
| `III7` `II7` | uppercase on a minor step = a secondary dominant (E7 = V of vi, D7 = V of V) |
| `V:2` `ii:0.5` | length in bars (default 1) |

Plain numerals count in the song's mode. In A minor, `VI` is F major and `V` is E major (the harmonic-minor dominant). With an accidental they count from the major scale, as is usual: `bVII` is a whole step below the tonic whatever the mode, so the heroic `I bVII IV` means the same in D major and D mixolydian. The parser is `parseChord` in `src/lib/music-theory.js`.

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

### Cadences, harmonic rhythm and passing chords

Cadences are punctuation, and each section ends with the one its job needs (`endOn`, from `CADENCES`):

| Cadence | Chords | Like | Ends |
|---|---|---|---|
| authentic (`tonic`) | V → I | a full stop | choruses, outros, the A of AABA |
| half (`dominant`) | → V | a question mark | pre-choruses, bridges, builds, the link; and a game loop's last bar, which leads back to its first |
| plagal | IV → I | a soft "amen" | by request |
| deceptive | V → vi | a surprise | a chorus followed straight by another: the payoff is delayed once more |

The planner makes the section's last bar the cadence chord. If the bar before doesn't already lead in (IV, V or bVII before I), the approach chord takes its second half. A progression that already ends right is left alone, including `Imaj7` for I and a Picardy major I for i. A hand-written melody keeps its own ending: if its last note isn't in the cadence chord, there's no cadence. The melody's last phrase lands on the matching degrees: 2 or 5 on a half cadence, 1 on a full one, 1 or 3 on a deceptive one.

**Harmonic rhythm** follows the section: a pre-chorus or build changes chords twice as fast as written (urgency), and an intro or breakdown half as fast (space). It applies to the emotion's default progressions; a progression written in a spec keeps its timing unless the section sets `harmonicRhythm`.

**Passing diminished sevenths.** A dim7 is stacked minor thirds, so only three exist. With the style's `dim7` chance, one takes the last beat of a chord before a change of root: whichever of the three has the most notes a semitone below the next chord's notes. That's usually the one on the next root's leading tone (C#dim7 before Dm, F#dim7 before G), and sometimes the common-tone dim7 (Cdim7 before C). A cadence's final V–I is never interrupted.

**Changing key.** `lift` raises the last chorus (section 8). A section's `transpose` moves it by semitones, and its `mode` swaps to the parallel mode (a minor bridge in a major song), with every part following. Borrowed chords (`iv`, `bVI`, `bVII` in major) colour a progression without leaving the key.

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
| distance from the contour target | 1 per degree | gives the phrase its shape |
| distance from the motif's shape, in a motif bar | 2 per degree | keeps the idea recognisable |
| non-chord tone on a strong beat | 5 | strong beats must agree with the harmony |
| non-chord tone on a weak beat not reached by step | 3 | weak-beat dissonance is fine only as a passing or neighbour tone |
| leap beyond a third | 1.2 per degree | singable lines mostly move by step |
| leap beyond a sixth | +6 per degree | big leaps are rare and special |
| leap of a fourth or more not followed by a step back | 3 | gap-fill: a leap creates a gap the ear wants filled |
| the same pitch twice in a row | 0.8 | allowed, but motion is better |
| the same pitch three times in a row | 2.5 | static |
| a phrase ending off its cadence degrees | 12 | phrases must land |
| reaching the highest note so far a third time | 4 | the peak is special: once or twice, at the emotional high point |

A beat is strong if it starts one of the meter's beat groups: beats 1 and 3 in 4/4, beat 1 in 3/4, beats 1 and 4 (of the eighths) in 6/8. Any note of two beats or more also counts as strong.

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

### The motif and its development

A song has one motif: 3–6 notes in a bar, with a rhythm and a shape (steps between its notes). It comes from, in order:

1. the spec's `motif`, a name from `LEITMOTIFS` or degree notation;
2. the first bar of a hand-written chorus (or of any hand-written section);
3. otherwise it's invented: a rhythm cell near the chorus's density, and the shape that scores best against `MOTIF.cost`. Steps beat leaps, there's one or two changes of direction, the peak isn't first, the span stays within five steps, and it ends on 1, 3 or 5. A hash of the title picks among equal scores.

Every motif bar states the motif, transformed by the section's `develop` (first statement, later ones), from `lib/motif.js`:

| Development | Does | Used in |
|---|---|---|
| repeat | the motif again | verses, choruses |
| sequence | the motif a step higher | later statements |
| invert | intervals flipped: up becomes down | bridges, B sections |
| retrograde | the motif backwards | the D of a through-composed song |
| augment | every length doubled, over two bars | bridges, breakdowns |
| diminish | twice as fast, played twice, rising | pre-choruses |
| fragment | the first half, repeated a step lower | intros (a fragment of the hook), post-choruses |

Each statement starts on the motif's own degree in the octave nearest the contour, moved by the smallest step that puts its first note on a chord tone of the chord under it. The rest follow the motif's shape, so the idea adapts to new harmony without losing itself. In a meter whose bar is a different length, the motif keeps its steps and takes the rhythm cell with the closest note count.

**Question and answer.** A phrase ending on a half cadence followed by one ending on a full cadence is call and response within one voice. The `cadences` of each section set this up, and its `endOn` decides the last phrase.

**Repeats vary.** See section 8.

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

A hand-written chorus also becomes the song's motif, so the verses and bridge grow out of the hook.

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
| bossa | bossa nova | rim clicks on the clave (3-3-4-3-3), soft kick on 1 and the "a" of 2 |
| reggae | one drop | nothing on beat 1; kick and rim together on 3; light swing |
| funk | sixteenth-note pocket | sixteenth hats with ghost notes, kick dancing around the one, ghost snares |
| boomBap | lo-fi hip hop | lazy swung kick, fat snare on 2 and 4, room kit |
| habanera | tango | dotted-eighth, sixteenth, two eighths: the habanera rhythm under everything |
| train | country | brushes on every sixteenth, accents on 2 and 4, like wheels on rails |
| synthwave | 80s | four-on-the-floor kick under a gated snare, electronic kit |
| bodhran | celtic 3/4 | a frame drum rolling under the tune, tambourine on 2 |
| none | no drums | — |

Rules:

- **Levels by energy**: below .55 low, below .8 mid, otherwise high. Quiet sections get only kick and hat. The snare backbeat arrives with energy.
- **Fills** replace the last bar of a section when the next section is louder, and always at the end of a pre-chorus. A fill signals that something is about to change.
- **Crash** on beat 1 of every section with energy ≥ .6, to mark the arrival.
- **Swing** is one time warp applied to every part at playback (`swingTime` in `meter.js`), counted from each section's start, never written into the score (a MIDI export applies it, so the file sounds like the song). `swing` runs from 0 (straight) to 1 (full triplet): the second eighth of each pair lands at 0.5 + swing/6 of the pair. `swingSub: 0.25` swings sixteenths instead. Starts and ends both move, and the per-part timing drift sits on top of the shared swing. Compound meters (6/8, 12/8) already move in threes and aren't swung.
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
2. **One focus at a time.** The lead is loudest (+12 velocity, fader −2 dB). The pad sits furthest back (−14, fader −9 dB, and the most reverb).
3. **Contrast timbres.** Pair a breathy lead (flute) with plucked support (harp, piano), and a bowed lead (violin) with a struck one (piano, vibes). Avoid two instruments of the same family in the same register.
4. **Match the instrument to the emotion.** Brass is bold, woodwinds intimate, plucked strings light, bowed strings emotional, synths modern or cold, bells magical, distortion aggressive.
5. **Bass patterns** (`BASS`): roots on strong beats, fifths and octaves for motion, and an **approach note** (A) one step from the next chord's root at the end of the bar, to pull the ear into the change.
6. **Comping patterns** (`COMPING`): sustain (calm), push (anticipating beat 3, pop), pulse (quarters, tension), eighths (rock), offbeat (2 and 4 stabs, bounce or swing), march, waltz (beats 2 and 3), skank (reggae chops on 2 and 4), bubble (reggae organ on every offbeat), bossa (syncopated guitar), funk (sixteenth clav stabs), habanera. Below .5 energy the busy styles (push, pulse, eighths, march) sustain and funk drops to a skank (`COMP_QUIET`). The others keep their rhythm, because in reggae or bossa the rhythm *is* the genre.
7. **Arpeggio patterns** (`ARPS`): up, up-down, Alberti (low–high–mid–high, classical), broken, ostinato (a repeated low note against the others, for tension), sixteenths (synth arpeggiator over two octaves), roll (banjo forward roll), and chip (an 8-bit chord faked by a very fast arpeggio).

### Harmony voices and call and response

The countermelody has four ways to relate to the lead (a section's `counter`):

- **guide** (the default): the third or seventh of each chord, held while the melody moves. This is *oblique* motion.
- **harmony**: *parallel* thirds under the lead, shifted by scale steps (`diatonicShift` in `lib/music-theory.js`) so it stays in key. On a strong beat where the third isn't in the chord, it moves to a fourth or fifth below if that one is (*similar* motion). It's placed in the counter's range, nearest its last note, so it doesn't leap. The song's climax always gets this voice, and so does any section heard a third time.
- **contrary**: moves the other way by as many steps as the melody, snapped to chord tones on strong beats.
- **call and response** (`answer`, the bridge by default): the lead keeps every other two-bar turn and rests through the others. In the gaps, the countermelody answers with the call's rhythm a third lower, in its own register and panned to the other side. Two instruments take turns, as in a conversation.

### Entries, exits, space and texture

- **Entry order.** In the first section, parts come in one at a time in `ENTRY_ORDER` (pad, chords, arpeggio, bass, drums, countermelody), so the listener hears each one arrive. In the outro they leave in reverse, and the final bar (last chord, bass root, crash) stays whole.
- **The breath.** A pre-chorus's last two beats keep only the lead and the drums' fill. A build's last two beats are silent, so the drop lands on everything at once. Taking parts away is as strong as adding them.
- **Texture.** `texture: 'solo'` leaves only the lead (a lone cello in a bridge). `'polyphonic'` brings the countermelody in whatever the fullness.
- **Fullness.** By default the parts that play follow energy. A section's `fullness` overrides that for the arrangement only.

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
- **One clear peak.** The planner picks the climax: the loudest section starting 50–90% of the way through (`CURVE`), usually the last chorus after the bridge. Every other section is kept at least .04 below it. `describe()` (and `just compose`) plots the curve and warns when a song has no dip of .15 or more for contrast. A test checks every song.
- **Energy drives every lever at once**: which parts play, velocity, the drum level and hi-hat subdivision, comping, melody density, and brightness. The pad, arpeggio, chords and countermelody have a low-pass that follows energy, from 2.5 kHz at 0 to fully open at 1, so a quiet verse is darker than the chorus.
- **Repeats get a lift** (`REPEAT_LIFT` = .07 per occurrence), so the second verse is fuller than the first: a part enters, the drums go up a level.
- **Repetition with variation.** A chorus's melody is written once and replayed, because recognition is the point. Each return of a composed melody changes something (`VARIATION`; a hand-written one is played as written every time, though its arrangement still grows): the second time, its last note is approached by step instead of landed on; the third time, also the last phrase up an octave (when it fits) and a harmony voice under it. The climax always gets the harmony voice.
- **Verses vary.** Each verse keeps its motif bars but swaps its answer-bar rhythm, the "change the melody slightly" rule.
- **The last chorus can lift** a key: `lift: true` raises it a whole step, `lift: 1` a semitone. Every part follows, and the outro stays in the new key. This is the "truck driver's gear change": cheap and effective.
- **Contrast before the end.** The bridge drops energy and changes harmony, so the final chorus hits harder by comparison.

### Performance and mix

The score stays on the grid. That's what the falling-notes view draws and what the `.mid` file holds. When a song plays, `perform.js` adds what a player would, and `mix-plan.js` sets up and moves the mix. Both are rules, with a hash where a choice is needed, so a song sounds the same every time. The tables are `EXPRESSION`, `MIX`, `DUCK` and `MOVEMENT` in `composer-data.js`.

- **Velocity is tone as well as volume.** The synth squares velocity for loudness and lowers a low-pass cutoff by up to three octaves for soft notes (`VELOCITY_CUTOFF_CENTS` in `lib/sf2-voice.js`), so a soft note is darker, not just quieter. Section energy already sets velocity, so quiet sections are darker too.
- **Accents** (`DYNAMICS.accent`): the downbeat is loudest, then beat 3, then the other beats, then offbeat eighths, then sixteenths, so busy hi-hats alternate loud and soft.
- **Phrases breathe.** The lead and countermelody swell across each 4-bar phrase, and the last note of each phrase tapers off.
- **Timing drifts a little.** Melodic parts move by up to 5–15 ms either way, and drums and bass stay exactly on the grid to hold the groove.
- **Slides.** Fretless and synth bass, bowed strings, trombone and synth leads sometimes slide into a note a step or small leap from the last one, if it follows closely and isn't on a downbeat. The held voice bends to the new pitch rather than re-attacking, which is what makes a slide sound real.
- **Vibrato arrives late.** Notes of 0.6 s or more on singing instruments (bowed strings, voices, brass, reeds, pipes, synth leads) start straight, and the vibrato fades in from 0.25 s.
- **Channel strips** (`MIX`): each part has a fader in dB, a pan, a low cut (100–150 Hz on everything but bass and drums, to clear the mud) and sends to one shared reverb and one tempo-synced dotted-eighth delay. Lead, bass and drums sit in the centre, and the others spread from −0.45 to +0.4. Drums and bass stay nearly dry, and pads get the most reverb.
- **Ducking** (`DUCK`): on each kick the bass dips 4 dB and the pad 3 dB for 100 ms, which gives a sidechain's clean low end without a compressor.
- **Movement** (`MOVEMENT`): the pad, arpeggio and chords close a low-pass at the start of a build (a pre-chorus, or the last two bars of a section rising into a chorus) and open it across the build. Reverb sends grow in the bridge, in quiet sections and most of all in the outro.
- **Master** (`platform/audio-engine.js`): the mix bus leaves 3 dB of headroom, then a little high-shelf air, a gentle glue compressor and a peak limiter.

## 9. Meter and tempo

### Meters as beat groups

A meter is beat groupings, not just a count (`METERS` in `patterns-data.js`). Lengths are in quarter-note beats:

| Meter | Groups | Feel | Use |
|---|---|---|---|
| 4/4 | 2 + 2 | stable, danceable | almost everything; required for dance styles |
| 2/4 | 2 | brisk, marching | marches, chases; one bar of it extends a phrase |
| 3/4 | 3 | waltz, oom-pah-pah | lullabies, folk, music boxes |
| 6/8 | 1½ + 1½ | lilting, rolling | ballads, jigs, sea shanties; fast 6/8 gallops |
| 12/8 | 1½ × 4 | slow and heavy, triplet swing | slow blues, soul, gospel |
| 5/4 | 3 + 2 | off-kilter, restless | spy themes, puzzles |
| 7/4 | 4 + 3 (`7/4b` 3 + 4, `7/4c` 2 + 3 + 2) | unpredictable, driving | boss fights, dream worlds |
| 7/4cut | two bars of 4/4 minus a beat | abrupt on purpose | |
| 7/8 | 1 + 1 + 1½ | Balkan, prog | |

The groups drive everything. **Accents**: the downbeat is loudest, then each group's start, then the other beats. **Melody**: strong beats are group starts, and meters other than 4/4, 3/4 and 6/8 build rhythm cells from per-group cells (`GROUP_CELLS`) rather than stretching 4/4 ones. **Drums, bass and comping**: a groove is written in one meter. In any other meter `meter-patterns.js` builds its parts from the groups: kick on beat 1, backbeat on each later group's start, hats by level; bass roots on group starts with a fifth and an approach note when busy; offbeat comping between the group starts. Electronic grooves (dance, synthwave) drop the snare in odd meters and keep kick and hats ("house in 7"), so it doesn't matter where the bar loops. Odd meters roll toms over their last beat every second bar, so the turn back to beat 1 sounds meant. `7/4cut` plays the 4/4 groove doubled and truncated.

Pick the meter from the mood, then the genre. Odd meters attract attention, which is great for a boss or a puzzle and tiring for a level heard for twenty minutes.

### Changing meter

A spec's `meter` sets the song's, and a section's `meter` overrides it (a 3/4 bridge, a 7/4 boss phase). A change happens only at a section boundary. The section before ends with a fill that announces it, and the first two bars after it play a plain, accented pattern (`METER_CHANGE`) so the new meter is clear before anything fancy. Returning to the first meter at the end feels like coming home. *The Warden* (game songs) moves from 4/4 into 7/4 for its second phase, through a one-bar 2/4 link.

Similar effects without a meter change, as a section's drum `feel`:

- **half** moves the backbeat to beat 3: half as fast, twice as heavy. Good for breakdowns.
- **double** puts the snare on every beat and sixteenth hats: twice as fast, for a last chorus or an escalation.
- **roll** is a build: kick on every beat, and a snare going from quarters to eighths to sixteenths across the section.
- **Polymeter and polyrhythm** live in the arpeggio: `threes` cycles three notes over eighths, lining up with 4/4 only every three bars, which keeps a loop from going stale; `triplets` plays triplet eighths, three against two.

### Tempo

| bpm | Mood |
|---|---|
| 60–80 | ballads, ambient, sad or reflective scenes |
| 80–100 | hip-hop, lo-fi, relaxed exploration |
| 100–120 | pop, funk, towns and overworlds |
| 120–130 | house, upbeat pop, cheerful action |
| 130–150 | techno, trance, energetic levels |
| 150–180 | drum and bass, punk, chases and bosses |

A score has a **tempo map** (`lib/tempo-map.js`): segments that hold a tempo or ramp evenly to another, converted between beats and seconds for playback, the view and the MIDI file. The planner pushes the tempo up `TEMPO.push` (2 bpm) from the climax on, felt more than noticed, and slows an ending by 15% over its last two bars (a ritardando; `ritardando: false` turns it off). A section's `tempo` sets its own. Loops never slow down.

## 10. Detail passes and styles

Most of what makes a performance feel alive are passes over the score, run in a fixed order so they don't fight. The rhythm pass is part of the score; the rest happen at playback, so the score stays on the grid for the view and the MIDI file.

1. **Rhythm** (`syncopation.js`, scaled by the style's `syncopation`): a phrase's first note pulled a sixteenth into the bar before (an *anticipation*, so it pulls forward); offbeat sixteenths accented in the chords and arpeggio; and, where a dotted-eighth delay of a phrase's last lead note would land, the resting arpeggio plays real notes (*echo rhythms*). On repeats, the arpeggio pattern rotates by a step (*pattern rotation*). The kick and bass stay on the grid, because syncopation needs a clear pulse to push against.
2. **Detail** (`perform.js`): **ghost notes**, quiet (velocity 15–35) and very short, on empty sixteenths beside the snare's backbeat and as a dead note just before a bass note, in sections loud enough to groove. **Run shaping**: in a quick run moving one way, the inner notes are softer than the first and last. **Phrase shaping**: a swell across each phrase and a softer last note. **Scoops**, the +1 trick: on instruments that can bend, a phrase's last note and a section's last chord start a semitone low and slide up over 50–200 ms, every note of a chord together. **Slides** between close notes, and **vibrato** that arrives late on long ones.
3. **Ear candy** (`ear-candy.js`): small details at structural points (section starts and every fourth bar's end), each with a low chance and an 8-bar cooldown: an octave **riser** into a section's first chord, a bright **accent** high above beat 1 of a loud section, a **flourish** of the bar's chord an octave or two up as sixteenths over its last beat with the delay swelling, and a **tape stop** that winds everything down in pitch and speed into a breakdown, bridge or drop. A key change always gets its riser.
4. **Feel**: swing, then per-part timing drift on top.
5. **Mix movement** (`mix-plan.js`, `audio/mixer.js`): the tone filter following energy and sweeping into builds; reverb that grows in bridges and outros and swells across each of the pad's phrases; **delay throws**, where the lead's delay send opens only on the last note of each phrase, so only it echoes; a slowly wobbling (modulated) delay time; and an auto-pan on the arpeggio.

A **style** (`STYLES` in `song-craft-data.js`) sets every pass's intensity with one name. Each emotion has one, and a spec's `style` names another or overrides values:

| Style | swing | dim7 | scoops | ghosts | syncopation | earCandy | stab |
|---|---|---|---|---|---|---|---|
| plain | 0 | 0 | .1 | .25 | .15 | .25 | — |
| jazzy | .7 | .3 | .4 | .5 | .4 | .25 | — |
| funky | 0 | .1 | .2 | .9 | .7 | .3 | 1/32 |
| gentle | 0 | .15 | .3 | 0 | .1 | .2 | — |
| cinematic | 0 | .15 | .2 | .1 | .1 | .45 | — |
| electronic | 0 | 0 | .1 | .2 | .45 | .6 | 1/16 |

`stab` is the longest a comped chord sounds, in beats, so chord stabs groove like percussion. A style's swing applies only when neither the spec, the emotion nor the groove sets one. Comping patterns can mark a hit as a ghost (`chop`: a quiet downstroke on the beat, then the offbeat), and `upbeats` puts stabs on every offbeat eighth. An intro of offbeat chords alone, with the drums muted, makes the ear hear them as the beat until the kick lands on the true one (*Neon Drop*).

Field recordings and other samples aren't part of this synth.

## 11. Adaptive music for games

Game music plays for a long time and has to follow the game. A song can be built for that, and the player has the controls.

- **Loops.** `loop: true` drops the outro. The intro plays once, then everything after it repeats. The last section ends on a half cadence and a fill, so its last bar leads back to the first. Nothing is pre-rendered, so reverb and delay tails carry across the loop point. Each pass round the loop is performed with a different hash, so its ghost notes, scoops, slides, timing and ear candy change while the music stays the same. That's a defence against listener fatigue that only a generator has.
- **Vertical layering.** `setIntensity(x)` (0 calm … 1 everything) fades each part's layer gain over a bar as the intensity crosses its threshold in `LAYERS`: the pad and bass always play, then chords, lead, arpeggio, drums and the countermelody. It sits before the fader, so ducking and mix moves still work.
- **Horizontal resequencing.** `queue(section, 'bar' | 'phrase' | 'section')` carries on from another section (by index, label or type) at the next boundary, rather than cutting in at once. It's quantised on the lookahead scheduler, so the switch lands exactly on the grid.
- **Stingers.** `sting(kind)` plays a short cue on the next beat, in the key and mode of the section playing (`STINGERS`): `pickup`, `levelUp`, `secret`, and `fail`, a diminished seventh falling in minor thirds, the cartoon "uh-oh".
- **Leitmotifs.** A spec's `motif` names a theme from `LEITMOTIFS` (or writes one). *Hero's Road* plays the `hero` motif bold and mixolydian in 4/4; *Hero's Rest* plays the same steps slow, aeolian and in 6/8, where the motif's rhythm adapts to the meter.

In the game: play a song from **Game music**, then use the **Intensity** slider, **♪ Sting** and **Next section** (which waits for the next phrase). From code: `composer.intensity(0.3)`, `composer.sting('pickup')`, `composer.queue('Phase two 1', 'bar')`.

From another feature, through events, with the song in the background and no grid on screen: `music:play { song }`, `music:intensity x`, `music:sting kind`, `music:queue { section, at }` and `music:stop`. The composer answers with `music:status { text }` while loading and `music:started { title, sections, parts }`. The **adaptive music test level** (`src/features/adventure/`) is a worked example. Its zones blend the intensity as you walk, coins, guards, a hidden alcove and the exit fire stingers, and its arena queues The Warden's second phase at the next bar.

**Hearing a change.** `just ab [commit]` renders every song with that commit and with the working tree, offline, and plays them side by side, with peak and loudness for each and a blind mode. Tune the tables by ear, one at a time.

## 12. The song spec: writing a song

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
    names: { A: 'Blues chorus' },   // optional: what to call a section type on screen
    genre: 'Bossa nova',            // optional: shown with the title
    story: 'Rain on the awning…',   // optional: the song's premise, shown in the menu and on screen
    scenes: {                       // optional: one line per section, shown while it plays
        intro: '8:52 p.m.',         // keyed by label ('verse 2', 'blues chorus 1'), type and occurrence ('A 2'), or type
        'chorus 3': 'He takes off his apron and asks the cook to dance.',
    },
    lift: true,                     // last chorus up a whole step (or a number of semitones)
    meter: '4/4',                   // a key of METERS; default from the groove
    style: 'jazzy',                 // a key of STYLES, or { dim7: 0.5, … } over the emotion's style
    motif: 'hero',                  // a LEITMOTIFS name, or degree notation; default: the hand-written chorus, or invented
    loop: false,                    // game loop: no outro, the intro once, the rest repeats
    push: 2,                        // bpm added from the climax on
    ritardando: true,               // slow the ending down
    swingSub: 0.5,                  // swing eighths (0.5) or sixteenths (0.25)
    band: { lead: 73, drums: 40, counter: null },   // GM programs per role; null removes a part
    sections: {
        chorus: {
            progression: 'IV I V vi',               // Roman numerals, ':bars'
            melody: '6:1.5 5:0.5 4 6 | 8:2 5 3',    // degree notation, or false for no melody
            bars: 8, energy: 0.9,                   // length and intensity
            contour: 'arch', register: 3, density: 0.8,   // for a composed melody
            mute: ['drums'],                        // parts to leave out
            endOn: 'tonic',                         // dominant, tonic, plagal, deceptive, or null
            harmonicRhythm: 2,                      // chords twice as fast
            meter: '7/4', feel: 'half', tempo: 140, // a meter, drum feel and tempo of its own
            transpose: 5, mode: 'minor',            // a key and mode of its own
            counter: 'harmony',                     // guide, harmony or contrary
            answer: true,                           // call and response with the countermelody
            texture: 'solo', fullness: 0.3,         // solo or polyphonic; parts as if at this energy
            develop: ['invert', 'augment'],         // how its motif bars develop the motif
            breath: false, entries: false,          // turn the defaults off
        },
    },
}
```

**Where specs go.**

- In the game: add it to `GENRE_SONGS` in `src/features/composer/genre-songs-data.js`, `GAME_SONGS` in `game-songs-data.js` or `SONGS` in `songs-data.js`, and it appears in the Composer menu. The tests check that a hand-written hook puts chord tones on at least 85% of its strong beats, and that every scene names a real section.
- In the browser console, or from a page that embeds the game: `composer.play({ title: 'Test', emotion: 'tender', key: 'A' })`, `composer.play('first-light')`, `composer.stop()`, and `composer.compose(spec)` to get the score without playing it.
- In a link: `index.html#song=first-light`, `#feel=heroic`, or `#spec=` followed by the URI-encoded JSON. Browsers need a click before sound, so the song starts on the first click or key press.
- On the command line: `just compose first-light --melody --midi out.mid` prints the plan (sections, energy, chords, parts) and the melody bar by bar, and writes a Standard MIDI File any DAW can open. Run `just compose path/to/spec.json` for a spec saved as a file.

**What comes out.** `compose(spec)` returns a score: tempo, its `tempoMap` and the `loop`; `sections` with labels, start beats, energy, meter, key and mode, and which is the climax; the `motif`; `chords` with names; and one track per part, each `{ role, name, program, bank, notes: [{ key, beat, beats, vel }] }`. The player schedules those notes on the Web Audio clock through the SoundFont instruments. The view draws each track as its own piano in a grid, with notes falling onto the keys that play them.

## 13. Genre recipes

A genre is mostly a groove, a comping rhythm, a bass pattern and a band. Harmony and melody habits come second. Each recipe below is a full song in `src/features/composer/genre-songs-data.js`; the table gives the settings, and the notes explain the moves that make the genre recognisable.

| Genre | Song | Key / mode | Tempo | Groove · comp · arp | Band (lead / counter / chords / bass) | Harmony |
|---|---|---|---|---|---|---|
| Bossa nova | Café at Closing Time | F major | 128 | bossa · bossa | flute / tenor sax / nylon guitar / acoustic bass, jazz kit | maj7 and m7 throughout; ii–V turnarounds; the borrowed iv7 in the chorus |
| Reggae | Low Tide, High Noon | G major | 76 | reggae · skank | steel drums / harmonica / clean guitar / fingered bass | two chords per four bars; simple diatonic chorus; a dub bridge of drums and bass alone |
| Funk | The Midnight Janitor | E dorian | 104 | funk · funk | synth brass / tenor sax / clav / slap bass | a one-chord vamp (i7–IV7, the dorian IV7); short stabs, legato 0.5 |
| Synthwave | Neon Coastline, 1986 | A minor | 100 | synthwave · pulse · sixteenths | saw lead / synth brass / polysynth / synth bass, sweep pad, square arpeggio | i–VI–III–VII; key lift into a major-chord ending (a sunrise) |
| Lo-fi hip hop | Homework at 2 A.M. | D major | 78 | boomBap · push | vibraphone / flute / e-piano / fingered bass, warm pad, room kit | maj7, m7, m9 and maj9: every chord a little blurry; swing 0.55 |
| Tango | Two Rivals, One Floor | D harmonic minor | 116 | habanera · march | bandoneon / violin / piano / contrabass, no drums | i–iv–V7–i; a circle-of-fifths bridge (iv7–bVII7–IIImaj7–VImaj7–iiø–V7) |
| Country | Mile Marker 500 | G major | 112 | train · offbeat · roll | fiddle / harmonica / steel guitar / acoustic bass, banjo rolls, brushes | three chords (I, IV, V); a semitone key change for the last chorus |
| Celtic | The Selkie's Return | D mixolydian | 104, 3/4 | bodhran · waltz · updown | whistle / fiddle / nylon guitar / cello, harp, choir | I–bVII (mixolydian), the modal v in the bridge |
| Chiptune | Pixel Knight vs. the Lava King | C minor | 152 | rock · eighths · chip | square / saw / (no chords) / synth bass, square arpeggio | the andalusian i–VII–VI–V; a Picardy major ending for "victory" |
| Gospel | Sunday Kitchen Choir | Bb major | 84 | ballad + swing 0.67 · pulse | voice oohs / tenor sax / organ / fingered bass, choir pad | I–iii7–IV–iv; a long 8-chord chorus; the gospel key change |
| Cinematic | The Lighthouse Keeper's Last Night | D minor | 88 | halftime · pulse · ostinato | horns / cello / strings / contrabass, choir, pizzicato ostinato, orchestral kit | i–VI–III–VII; Neapolitan bII–V storm bridge; Picardy dawn ending |
| Blues | Pawnshop Watch Blues | E major | 92 | swing + swing 0.67 · offbeat | jazz guitar / harmonica / honky-tonk piano / walking bass, jazz kit | the twelve-bar I7–IV7–V7 form; b3 and b7 blue notes in the melody |

Moves that carry each genre:

- **Bossa nova**: syncopated guitar that anticipates the bar, soft rim clicks, extended chords, a melody that sits on chord extensions (9ths and 13ths) and lands softly. Never loud.
- **Reggae**: the empty beat 1 (one drop); guitar chops on 2 and 4 only; bass carries the melody of the groove; the melody enters off the beat (`r:0.5` before the first note).
- **Funk**: everything short and syncopated; one chord for a long time; the bass hits the one hard; sixteenth hats with ghost notes. The groove is the song.
- **Synthwave**: four-on-the-floor, gated snare, pulsing eighth-note synth bass in octaves, sixteenth arpeggiator, minor key, big saw lead.
- **Lo-fi hip hop**: swung, lazy drums; jazzy seventh and ninth chords on e-piano; soft dynamics; small melodies with space between them.
- **Tango**: habanera rhythm in the bass; marcato quarter-note chords; harmonic minor with a strong V7; dotted, dramatic melody with sharp pickups (`5:0.75 4:0.25`).
- **Country**: train beat on brushes; boom-chick bass (root and fifth); I–IV–V; fiddle lead, banjo rolls; a semitone key change at the end.
- **Celtic**: 3/4 lilt; mixolydian (I–bVII); tin whistle and fiddle trading the tune; a drone-like pad; melodies that run in steps with quick turns.
- **Chiptune**: square and saw waves only; chords played as very fast arpeggios; fast tempo; busy melody in steady eighths; dramatic minor-key progressions.
- **Gospel**: swung 12/8 feel (ballad groove with swing 0.67); organ chords; call and response between lead and choir; the borrowed iv; a key change before the last chorus.
- **Cinematic**: ostinato strings, horns on the melody, choir pad; slow harmonic rhythm that builds; Neapolitan and modal-mixture chords for drama; a major chord at the end for resolution.
- **Blues**: the twelve-bar form, dominant sevenths on every chord, swung shuffle, walking bass, and blue notes (b3 and b7) bent into a major key.

## 14. Telling a story with a song

A song with a story has a reason for each section. Before writing notes, write one line per section, in the `scenes` field, and let each line decide the music:

| Story beat | Musical answer |
|---|---|
| setting the scene | intro: the groove with no melody; a low energy that leaves room |
| ordinary life | first verse: simple melody, few parts |
| something stirs | pre-chorus: rising contour, a fill, the harmony ends on V |
| the big moment | chorus: the hook, the highest register, every part playing |
| complications | second verse: the same tune, one more part, a little louder (`REPEAT_LIFT`) |
| the turn or crisis | bridge: new chords (bII, bVI, a new mode), drop the drums (`mute`), change the contour |
| triumph | last chorus: key change (`lift`), countermelody, crash |
| aftermath | outro: thin out; end on the tonic, or a major chord in a minor song (a Picardy third) for hope |

Some examples from the song book:

- In **The Lighthouse Keeper's Last Night**, the storm is a Neapolitan bII–V bridge. Dawn is the major I that ends a minor song.
- In **Neon Coastline, 1986**, the getaway climaxes with a key lift, and the sunrise is the major chord that ends the outro.
- In **Pixel Knight vs. the Lava King**, the bridge ("one heart left") drops to .45 energy, and "VICTORY" is C major at the end of a C-minor song.
- In **Low Tide, High Noon**, the dub bridge removes the melody and chords as the tide goes out as far as it can.
- In **Pawnshop Watch Blues**, the guitar solo is a composed section (`C`) with a dense, wavy melody that "talks".

Write the story first, then pick the genre that fits the setting and the emotion that fits the feeling. The scenes appear on screen as the song plays, so the listener follows the story with the music.

## 15. Workflow and checklist

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
- [ ] The song ends on the tonic (or, for a loop, on V leading back to the top).
- [ ] The energy curve has one peak, late, and at least one dip (`just compose` plots it).
- [ ] Repeats change something: a new instrument, a varied last bar, a harmony voice.

## 16. Analysing songs you like

Composers learn by playing songs they love and asking *why* each choice was made. That matters as much as *how*. To add a new emotion, groove or progression to these tables, analyse a reference track on six axes and translate each into spec fields:

| Listen for | Ask | Becomes |
|---|---|---|
| **Melody** | Range? Steps or leaps? Where's the peak? Is there a countermelody, and how do they relate? | `register`, `contour`, `density`, a hand-written `melody`, `counter` |
| **Chords** | Which progression? How often do they change? Borrowed or secondary chords? How do they sit under the melody? | `progression` per section |
| **Rhythm & meter** | Prevailing rhythm? Drum pattern? How do bass and drums lock? | a `GROOVES` entry, a `BASS` pattern, `swing` |
| **Instrumentation & timbre** | Which instruments, in which ranges? What changes through the piece? | `band`, `ARRANGEMENT` thresholds, `mute` |
| **Structure** | What are the sections, and how do the four qualities above evolve through them? | `form`, section `bars` and `energy` |
| **Production** | Effects, panning, sample choice, ear candy | the SoundFont preset (`band`), the strips and moves in `performance-data.js`, the `style`'s ear candy |

Transcribe by hand into degree notation and progressions to learn the patterns, but never ship an exact copy of someone else's melody. Write a new hook that uses the same *moves*.

The person who wrote the notes this guide grew from learned by making up music at the piano and transcribing it into a DAW. The equivalent here: write a spec, compose it, listen, and change one rule at a time. No trick produces a great song on the first try; the process is knowledge plus iteration.

## 17. Reference tables

**General MIDI programs** (0-based) used most, by family: pianos 0–7 · chromatic percussion 8–15 (celesta 8, glockenspiel 9, music box 10, vibraphone 11, marimba 12) · organs 16–23 · guitars 24–31 (nylon 24, steel 25, clean 27, overdrive 29, distortion 30) · basses 32–39 · strings 40–47 (violin 40, viola 41, cello 42, contrabass 43, tremolo 44, pizzicato 45, harp 46, timpani 47) · ensembles 48–55 (strings 48, slow strings 49, choir 52) · brass 56–63 (trumpet 56, trombone 57, tuba 58, horns 60) · reeds 64–71 (sax 64–67, oboe 68, clarinet 71) · pipes 72–79 (piccolo 72, flute 73, pan flute 75, shakuhachi 77) · synth leads 80–87 · synth pads 88–95 (fantasia 88, warm 89, space voice 91) · effects, ethnic and percussive 96–127. The full list of what this library has is `src/audio/soundfont-catalog-data.js`.

**Genre instruments** in this library: honky-tonk piano 3, clav 7, organ 16, accordion 21, harmonica 22, bandoneon 23, jazz guitar 26, slap bass 36, synth bass 38–39, voice oohs 53, synth brass 62, square 80, saw 81, polysynth 90, sweep pad 95, sitar 104, banjo 105, shamisen 106, koto 107, kalimba 108, bagpipe 109, fiddle 110, steel drums 114, taiko 116.

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
