// How a song develops over its length: style presets for the detail passes, how repeated sections vary, the shape
// of the energy curve, tempo moves, the motif and the leitmotifs. Content only, imports nothing.
// docs/COMPOSING.md, "Song plan" and "Detail passes", explains them.

// ---- Styles -------------------------------------------------------------------------------------------
// One setting per pass, so one name sets a whole feel. A spec's `style` names one, or gives some of the values
// over the emotion's style.
//   swing        0 straight … 1 triplet, when neither the song, the emotion nor the groove sets one
//   dim7         chance of a passing diminished seventh before a chord change
//   scoops       chance of the +1 slide into a phrase's last note and a section's last chord
//   ghosts       how many ghost notes the drums and bass get
//   syncopation  anticipations, offbeat accents, echo-rhythm notes and rotated arpeggios
//   earCandy     how often the ear-candy layer fires
//   stab         the longest a comped chord sounds, in beats (0: as written); 0.125 is a thirty-second note
export const STYLES = {
    plain:      { swing: 0,   dim7: 0,    scoops: 0.1, ghosts: 0.25, syncopation: 0.15, earCandy: 0.25, stab: 0 },
    jazzy:      { swing: 0.7, dim7: 0.3,  scoops: 0.4, ghosts: 0.5,  syncopation: 0.4,  earCandy: 0.25, stab: 0 },
    funky:      { swing: 0,   dim7: 0.1,  scoops: 0.2, ghosts: 0.9,  syncopation: 0.7,  earCandy: 0.3,  stab: 0.125 },
    gentle:     { swing: 0,   dim7: 0.15, scoops: 0.3, ghosts: 0,    syncopation: 0.1,  earCandy: 0.2,  stab: 0 },
    cinematic:  { swing: 0,   dim7: 0.15, scoops: 0.2, ghosts: 0.1,  syncopation: 0.1,  earCandy: 0.45, stab: 0 },
    electronic: { swing: 0,   dim7: 0,    scoops: 0.1, ghosts: 0.2,  syncopation: 0.45, earCandy: 0.6,  stab: 0.25 },
};

// ---- Repetition with variation ------------------------------------------------------------------------
// What changes each time a section comes back, by how many times it has been heard (the last entry repeats).
// Hand-written melodies are played as written; the arrangement around them still grows.
//   lastBar  the melody's last bar approaches its final note by step instead of landing on it
//   octave   the last phrase of the melody goes up an octave, when that fits the lead's range
//   counter  the countermelody becomes a harmony voice under the lead
// The song's climax always gets the harmony voice too: a final chorus with an added line.
export const VARIATION = [
    {},
    { lastBar: true },
    { lastBar: true, octave: true, counter: 'harmony' },
];

// ---- The energy curve -----------------------------------------------------------------------------------
// The biggest moment comes two-thirds to nine-tenths of the way in. The planner takes the loudest section starting
// inside `window` (fractions of the song) as the climax and keeps every other section at least `margin` below it.
// A dip is a section at least `dip` quieter than the one before; describe() warns when a song has none.
export const CURVE = { window: [0.5, 0.9], margin: 0.04, dip: 0.15 };

// ---- Tempo moves ---------------------------------------------------------------------------------------------
// push: bpm added from the climax on, felt more than noticed. ritardando: an ending slows over its last `bars` to `to` × tempo.
export const TEMPO = { push: 2, ritardando: { bars: 2, to: 0.85 } };

// After a change of meter the drums play a plain, accented pattern for this many bars, so the new meter is clear.
export const METER_CHANGE = { simpleBars: 2 };

// ---- The motif -------------------------------------------------------------------------------------------
// A song's motif is 3–6 notes in one bar; its sections develop it (SECTIONS.develop). When a spec gives neither a motif
// nor a hand-written chorus, it is chosen by scoring every shape of `notes` steps no bigger than `maxStep`:
//   repeat   the same pitch twice         skip   a third        leap   per step beyond a third
//   range    per step of span beyond `range`    flat   no change of direction    zigzag  per change beyond two
//   peakFirst the highest note comes first      unstable  the last note isn't 1, 3 or 5
// starts are the degrees a motif may begin on; a hash of the song picks among equal scores.
export const MOTIF = {
    notes: [3, 6], maxStep: 3, range: 5, starts: [1, 3, 5],
    cost: { repeat: 1, skip: 0.2, leap: 1.2, range: 3, flat: 1.5, zigzag: 1, peakFirst: 1, unstable: 1.5, tieBreak: 0.6 },
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
