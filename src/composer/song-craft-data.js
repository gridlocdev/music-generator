// How a song develops over its length: style presets for the detail passes, how repeated sections vary, the shape
// of the energy curve, tempo moves, the motif and the leitmotifs. Content only, imports nothing.
// docs/COMPOSING.md, "Song plan" and "Detail passes", explains them.

// ---- Styles -------------------------------------------------------------------------------------------
// One setting per pass, so one name sets a whole feel. A spec's `style` names one, or gives some of the values
// over the emotion's style.
//   swing        0 straight … 1 triplet, when neither the song, the emotion nor the groove sets one
//   dim7, secondary, twoFive, tritone, sus, borrowed, mediant
//                chance of each kind of passing chord before a chord change (PASSING; harmony.js approach() says what
//                each one is); together they are how often a change gets one, at most 90%
//   scoops       chance of the +1 slide into a phrase's last note and a section's last chord
//   ghosts       how many ghost notes the drums and bass get
//   syncopation  anticipations, offbeat accents, echo-rhythm notes and rotated arpeggios
//   earCandy     how often the ear-candy layer fires
//   stab         the longest a comped chord sounds, in beats (0: as written); 0.125 is a thirty-second note
//   rubato       how far the tempo breathes with each phrase: up toward its high point, back into its cadence (TEMPO.rubato)
//   ornaments    chance of a trill, turn, mordent or grace note on a melody note that suits one (ORNAMENTS)
//   swell        times EXPRESSION.phrase.swell: how much louder a phrase grows; above 1 the left hand follows it too
export const PASSING = ['dim7', 'secondary', 'twoFive', 'tritone', 'sus', 'borrowed', 'mediant'];
const NONE = { secondary: 0, twoFive: 0, tritone: 0, sus: 0, borrowed: 0, mediant: 0 };
export const STYLES = {
    // pop: now and then a chord's own dominant, a floating V7sus4, or the minor iv before home
    plain:      { swing: 0,   dim7: 0,    ...NONE, secondary: 0.08, sus: 0.06, borrowed: 0.04,
        scoops: 0.1, ghosts: 0.25, syncopation: 0.15, earCandy: 0.25, stab: 0, rubato: 0, ornaments: 0, swell: 1 },
    // jazz: every target gets its ii–V, its tritone substitute, or a diminished chord climbing into it
    jazzy:      { swing: 0.7, dim7: 0.15, ...NONE, twoFive: 0.2, tritone: 0.12, secondary: 0.08,
        scoops: 0.4, ghosts: 0.5,  syncopation: 0.4,  earCandy: 0.25, stab: 0, rubato: 0, ornaments: 0, swell: 1 },
    // funk: chromatic slides into the chord a semitone above (tritone substitutes)
    funky:      { swing: 0,   dim7: 0.05, ...NONE, tritone: 0.1, secondary: 0.05,
        scoops: 0.2, ghosts: 0.9,  syncopation: 0.7,  earCandy: 0.3,  stab: 0.125, rubato: 0, ornaments: 0, swell: 1 },
    gentle:     { swing: 0,   dim7: 0.08, ...NONE, sus: 0.08, borrowed: 0.08, secondary: 0.05,
        scoops: 0.3, ghosts: 0,    syncopation: 0.1,  earCandy: 0.2,  stab: 0, rubato: 0, ornaments: 0, swell: 1 },
    // film: chromatic mediants (a major chord a third away), the borrowed iv, suspensions
    cinematic:  { swing: 0,   dim7: 0.05, ...NONE, mediant: 0.12, borrowed: 0.08, sus: 0.06,
        scoops: 0.2, ghosts: 0.1,  syncopation: 0.1,  earCandy: 0.45, stab: 0, rubato: 0, ornaments: 0, swell: 1 },
    electronic: { swing: 0,   dim7: 0,    ...NONE, sus: 0.1,
        scoops: 0.1, ghosts: 0.2,  syncopation: 0.45, earCandy: 0.6,  stab: 0.25, rubato: 0, ornaments: 0, swell: 1 },
    // the piano of Mozart (classical) and Chopin (romantic): the tempo breathes with each phrase (TEMPO.rubato), the
    // melody is ornamented (ORNAMENTS), and nothing a band adds: no ghosts, slides or risers
    classical:  { swing: 0,   dim7: 0.06, ...NONE, secondary: 0.14, scoops: 0,   ghosts: 0,    syncopation: 0.05, earCandy: 0,    stab: 0, rubato: 0.35, ornaments: 0.35, swell: 2 },
    romantic:   { swing: 0,   dim7: 0.1,  ...NONE, secondary: 0.1, borrowed: 0.08, mediant: 0.03, scoops: 0,   ghosts: 0,    syncopation: 0.05, earCandy: 0,    stab: 0, rubato: 1,    ornaments: 0.6, swell: 3 },
};

// ---- Repetition with variation ------------------------------------------------------------------------
// What changes each time a section comes back, by how many times it has been heard (the last entry repeats).
// Hand-written melodies are played as written; the arrangement around them still grows.
//   lastBar  the melody's last bar approaches its final note by step instead of landing on it
//   octave   the end of the melody's last phrase goes up an octave, when that fits the lead's range, from the note
//            where the jump up joins the line by VARIATION_LIFT.join degrees or less (else it stays where it is)
//   counter  the countermelody becomes a harmony voice under the lead
// The song's climax always gets the harmony voice too: a final chorus with an added line.
export const VARIATION = [
    {},
    { lastBar: true },
    { lastBar: true, octave: true, counter: 'harmony' },
];
export const VARIATION_LIFT = { join: 5 };

// ---- The energy curve -----------------------------------------------------------------------------------
// The biggest moment comes two-thirds to nine-tenths of the way in. The planner takes the loudest section starting
// inside `window` (fractions of the song) as the climax and keeps every other section at least `margin` below it.
// A dip is a section at least `dip` quieter than the one before; describe() warns when a song has none.
export const CURVE = { window: [0.5, 0.9], margin: 0.04, dip: 0.15 };

// ---- Tempo moves ---------------------------------------------------------------------------------------------
// push: bpm added from the climax on, felt more than noticed. ritardando: an ending slows over its last `bars` to `to` × tempo.
// rubato (a style's 0–1): each 4-bar phrase speeds up by `up` toward the point `peak` of the way through, then slows by
// `down` into its cadence; the next phrase starts back at the tempo, as a pianist breathes before going on
export const TEMPO = { push: 2, ritardando: { bars: 2, to: 0.85 }, rubato: { up: 0.07, down: 0.14, peak: 0.6, bars: 4 } };

// After a change of meter the drums play a plain, accented pattern for this many bars, so the new meter is clear.
// Ornaments (ornaments.js), for a style with `ornaments` above 0. Steps are `fast` beats at a tempo above
// `slowAbove` bpm, else `slow` (a 60 bpm nocturne trills in eighths of a beat). The other figures are the shortest
// note, in beats, each ornament goes on: a trill on the note before a phrase's last (`cadence` times the style's
// chance, taking `trillShare` of the note), a turn on a long note, a mordent on a phrase's first, a grace note before a
// leap up of `leap` semitones. `gap` seconds keep them apart; the notes after an ornament's first are `soften` quieter.
export const ORNAMENTS = { fast: 0.25, slow: 0.125, slowAbove: 90, trill: 1, trillShare: 0.6, cadence: 2, turn: 2, mordent: 1,
    grace: 1, leap: 5, gap: 3, soften: 10 };
export const METER_CHANGE = { simpleBars: 2 };

// ---- The motif -------------------------------------------------------------------------------------------
// A song's motif is 3–6 notes in one bar; its sections develop it (SECTIONS.develop). When a spec gives neither a motif
// nor a hand-written chorus, it is chosen by scoring every shape of `notes` steps no bigger than `maxStep`:
//   repeat   the same pitch twice         skip   a third        leap   per step beyond a third
//   recover  a leap beyond a third not followed by a step back
//   range    per step of span beyond `range`    flat   no change of direction    zigzag  per change beyond two
//   peakFirst the highest note comes first      unstable  the last note isn't 1, 3 or 5
// starts are the degrees a motif may begin on; a hash of the song picks among equal scores.
export const MOTIF = {
    notes: [3, 6], maxStep: 3, range: 5, wide: 3, starts: [1, 3, 5],
    cost: { repeat: 1, skip: 0.2, leap: 1.2, recover: 1.5, range: 3, narrow: 0, flat: 1.5, zigzag: 1, peakFirst: 1, unstable: 1.5, tieBreak: 0.6 },
};

// Leitmotifs: a character's or place's theme, in degree notation, for any song to use as its motif (spec `motif`).
// The same motif comes out heroic in mixolydian 4/4 and mournful in aeolian 6/8; the rhythm adapts to the meter.
export const LEITMOTIFS = {
    hero:    '1:0.5 2:0.5 3 5:1.5 4:0.5',
    village: '3 2:0.5 1:0.5 5,:2',
    shadow:  '1 b2:0.5 1:0.5 5,:1.5 b6,:0.5',
};

// ---- Call and response, syncopation ------------------------------------------------------------------------
// bars each turn of a call-and-response section lasts
export const CALL_BARS = 2;
// anticipate: chance (× syncopation) a phrase's first note comes a sixteenth early; offbeatAccent: velocity added
// to chords and arpeggio on offbeat sixteenths (× syncopation); echo: where a dotted-eighth delay of a phrase's last
// lead note would land, in beats, played by the arpeggio when it's resting, at these fractions of the lead's velocity
export const SYNCOPATION = { anticipate: 0.6, offbeatAccent: 14, echo: [[0.75, 0.5], [1.5, 0.32]] };
