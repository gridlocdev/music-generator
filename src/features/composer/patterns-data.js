// Drum grooves and the bass, comping and arpeggio patterns the composer plays chords with. Content only, imports nothing.
// docs/COMPOSING.md, "Rhythm and grooves", explains them.

// ---- Grooves (drums) -----------------------------------------------------------------------------
// Steps are sixteenth notes. X accent, x normal, o ghost, . rest. Levels by energy: low < 0.55 ≤ mid < 0.8 ≤ high.
// fill replaces the last bar before a section that is louder than the current one.
export const DRUM_KEYS = {
    kick: 36, stick: 37, snare: 38, clap: 39, hat: 42, pedal: 44, open: 46, tomLow: 45, tomMid: 47, tomHi: 50,
    crash: 49, ride: 51, tamb: 54,
};
export const GROOVES = {
    pop: {
        beats: 4, kit: 0,
        low:  { kick: 'X.......X.......', hat: 'x...x...x...x...' },
        mid:  { kick: 'X.....x.X.......', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
        high: { kick: 'X.....x.X.x.....', snare: '....X.......X...', hat: 'x.xxx.x.x.xxx.x.', tamb: '....x.......x...' },
        fill: { kick: 'X.......X.......', snare: '....X...X.x.o...', tomHi: '...........xX...', tomMid: '.............xX.', tomLow: '..............xX' },
    },
    ballad: {
        beats: 4, kit: 0,
        low:  { kick: 'X.........X.....', stick: '........x.......' },
        mid:  { kick: 'X.........X.....', snare: '........X.......', hat: 'x...x...x...x...' },
        high: { kick: 'X.....x...X.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
        fill: { kick: 'X.........X.....', snare: '........x.x.xxXX', tomLow: '..............x.' },
    },
    rock: {
        beats: 4, kit: 16,
        low:  { kick: 'X.......X.......', hat: 'x.x.x.x.x.x.x.x.' },
        mid:  { kick: 'X.......X.X.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
        high: { kick: 'X.X.....X.X.....', snare: '....X.......X...', open: 'x.x.x.x.x.x.x.x.' },
        fill: { kick: 'X.......X.......', snare: '....X...xxxx....', tomHi: '............xx..', tomLow: '..............XX' },
    },
    dance: {
        beats: 4, kit: 26,
        low:  { kick: 'X...X...X...X...' },
        mid:  { kick: 'X...X...X...X...', clap: '....X.......X...', open: '..x...x...x...x.' },
        high: { kick: 'X...X...X...X...', clap: '....X.......X...', open: '..X...X...X...X.', hat: 'xxoxxxoxxxoxxxox' },
        fill: { kick: 'X...X...X...X...', snare: 'x.x.x.x.xxxxXXXX' },
    },
    march: {
        beats: 4, kit: 48,
        low:  { kick: 'X.......X.......', snare: '....o.......o...' },
        mid:  { kick: 'X...X...X...X...', snare: 'x.oox.o.x.oox.o.' },
        high: { kick: 'X...X...X...X...', snare: 'X.ooX.ooX.ooX.oo', ride: 'x...x...x...x...' },
        fill: { kick: 'X.......X.......', snare: 'X.ooX.ooxxxxXXXX', tomLow: '............X...' },
    },
    swing: {
        beats: 4, kit: 32, swing: 0.6,
        low:  { ride: 'x...x.x.x...x.x.', pedal: '....x.......x...' },
        mid:  { ride: 'x...x.x.x...x.x.', pedal: '....x.......x...', kick: 'o...o...o...o...' },
        high: { ride: 'X...x.x.X...x.x.', pedal: '....x.......x...', kick: 'o...o...o...o...', snare: '......o.......o.' },
        fill: { ride: 'x...............', snare: '..o.x.o.x.x.X.X.', kick: 'X...........X...' },
    },
    bounce: {
        beats: 4, kit: 0, swing: 0.5,
        low:  { kick: 'X.......X.......', hat: '..x...x...x...x.' },
        mid:  { kick: 'X.......X.......', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
        high: { kick: 'X.....x.X.......', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', tamb: '..x...x...x...x.' },
        fill: { kick: 'X.......X.......', snare: '....X...x.x.x.x.', tomHi: '........x.......', tomLow: '............x.x.' },
    },
    halftime: {
        beats: 4, kit: 0,
        low:  { tomLow: 'X.......X..x....' },
        mid:  { kick: 'X.........X.....', snare: '........X.......', tomLow: '......x.......x.' },
        high: { kick: 'X.x.......X.x...', snare: '........X.......', hat: 'x.x.x.x.x.x.x.x.', tomLow: '......x.......x.' },
        fill: { kick: 'X.........X.....', snare: '........X.x.xxxx', tomLow: '....x.x.........' },
    },
    waltz: {
        beats: 3, kit: 40,
        low:  { kick: 'X...........', hat: '....x...x...' },
        mid:  { kick: 'X...........', snare: '....o...o...', hat: 'x...x...x...' },
        high: { kick: 'X.....x.....', snare: '....X...X...', hat: 'x.x.x.x.x.x.' },
        fill: { kick: 'X...........', snare: '....x.x.xxXX' },
    },
    none: { beats: 4, kit: 0 },
};

// ---- Bass, comping and arpeggio patterns ---------------------------------------------------------
// bass hits: [step, tone, length in steps]. Tones: R root, 3 third, 5 fifth, 8 octave,
// A approach (a step into the next chord's root). low energy plays `low`, otherwise `high`.
export const BASS = {
    pop:      { low: [[0, 'R', 8], [8, 'R', 8]], high: [[0, 'R', 6], [6, 'R', 2], [8, '5', 4], [12, 'R', 2], [14, 'A', 2]] },
    ballad:   { low: [[0, 'R', 16]], high: [[0, 'R', 8], [8, '5', 6], [14, 'A', 2]] },
    rock:     { low: [[0, 'R', 8], [8, 'R', 8]], high: [[0, 'R', 2], [2, 'R', 2], [4, 'R', 2], [6, 'R', 2], [8, 'R', 2], [10, 'R', 2], [12, 'R', 2], [14, 'A', 2]] },
    dance:    { low: [[0, 'R', 4], [8, 'R', 4]], high: [[0, 'R', 2], [2, '8', 2], [6, '8', 2], [8, 'R', 2], [10, '8', 2], [14, '8', 2]] },
    march:    { low: [[0, 'R', 8], [8, '5', 8]], high: [[0, 'R', 4], [4, '5', 4], [8, 'R', 4], [12, '5', 4]] },
    swing:    { low: [[0, 'R', 8], [8, '5', 8]], high: [[0, 'R', 4], [4, '3', 4], [8, '5', 4], [12, 'A', 4]] },
    bounce:   { low: [[0, 'R', 8], [8, '5', 8]], high: [[0, 'R', 4], [6, '5', 2], [8, '8', 4], [12, '5', 2], [14, 'A', 2]] },
    halftime: { low: [[0, 'R', 16]], high: [[0, 'R', 2], [2, 'R', 2], [4, 'R', 2], [6, 'R', 2], [8, 'R', 2], [10, 'R', 2], [12, 'R', 2], [14, 'R', 2]] },
    waltz:    { low: [[0, 'R', 12]], high: [[0, 'R', 4], [4, '5', 4], [8, '5', 4]] },
    none:     { low: [[0, 'R', 16]], high: [[0, 'R', 8], [8, '5', 8]] },
};

// chord hits: [step, length in steps], for one 4/4 bar (3/4 patterns are 12 steps).
// Below 0.5 energy every comp style sustains the chord.
export const COMPING = {
    sustain: [[0, 16]],
    push:    [[0, 6], [6, 2], [8, 6], [14, 2]],
    pulse:   [[0, 2], [4, 2], [8, 2], [12, 2]],
    eighths: [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
    offbeat: [[4, 2], [12, 2]],
    march:   [[0, 3], [4, 3], [8, 3], [12, 3]],
    waltz:   [[4, 3], [8, 3]],
};

// arpeggio: indexes into the chord's notes (low to high, plus the octave above), and note length in steps
export const ARPS = {
    up:       { order: [0, 1, 2, 3], step: 2 },
    updown:   { order: [0, 1, 2, 3, 2, 1], step: 2 },
    alberti:  { order: [0, 2, 1, 2], step: 2 },
    broken:   { order: [0, 2, 3, 1], step: 2 },
    ostinato: { order: [0, 0, 1, 0, 2, 0, 1, 0], step: 1 },
};
