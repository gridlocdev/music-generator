// The composer's knowledge as tables: emotions, song forms, section roles, cadences, the arrangement and the melody's
// rules. Content only, imports nothing. Grooves and part patterns are in patterns-data.js, how a song develops in
// song-craft-data.js, its performance and mix in performance-data.js, game music in adaptive-data.js.
// docs/COMPOSING.md explains every table and why its values are what they are.

// ---- Emotion → musical parameters ------------------------------------------------------------
// valence (sad ↔ happy) mostly sets mode and harmony; arousal (calm ↔ excited) sets tempo, density,
// loudness, register and articulation. Band values are General MIDI program numbers (0-based);
// drums is a kit program on bank 128, null for no drums. style names the STYLES preset for the detail passes.
export const EMOTIONS = {
    joyful: {
        valence: 0.9, arousal: 0.8, mode: 'major', key: 'D', tempo: 126, groove: 'pop', form: 'pop',
        style: 'plain', legato: 0.8, dynamics: 0.75, comp: 'push', arp: 'up',
        progressions: {
            intro: 'I IV I V', verse: 'vi IV I V', pre: 'ii IV V:2', chorus: 'I V vi IV',
            post: 'I IV I V', bridge: 'IV V iii vi', outro: 'IV V I:2',
        },
        band: { lead: 61, counter: 73, arp: 11, chords: 0, pad: 48, bass: 33, drums: 0 },
        contour: { verse: 'wave', chorus: 'arch' },
    },
    hopeful: {
        valence: 0.7, arousal: 0.55, mode: 'major', key: 'G', tempo: 100, groove: 'pop', form: 'pop',
        style: 'plain', legato: 0.9, dynamics: 0.65, comp: 'push', arp: 'updown',
        progressions: {
            intro: 'Isus4 I Isus4 I', verse: 'I V vi IV', pre: 'IV V iii vi', chorus: 'IV I V vi',
            post: 'IV I', bridge: 'vi V IV V', outro: 'IV I:3',
        },
        band: { lead: 73, counter: 40, arp: 46, chords: 0, pad: 49, bass: 33, drums: 0 },
        contour: { verse: 'rise', chorus: 'arch', bridge: 'valley' },
    },
    tender: {
        valence: 0.6, arousal: 0.2, mode: 'major', key: 'F', tempo: 76, groove: 'waltz', form: 'ballad',
        style: 'gentle', legato: 1, dynamics: 0.4, comp: 'waltz', arp: 'broken',
        progressions: {
            intro: 'Imaj7 IVmaj7', verse: 'Imaj7 vi7 ii7 V7', pre: 'IVmaj7 iii7 vi7 V', chorus: 'IVmaj7 V iii7 vi7 ii7 V7 Imaj7 Imaj7',
            post: 'IVmaj7 Imaj7', bridge: 'vi7 iii7 IVmaj7 V', outro: 'IVmaj7 Imaj7:2',
        },
        band: { lead: 40, counter: 42, arp: 46, chords: 0, pad: 89, bass: 32, drums: 40 },
        contour: { verse: 'arch', chorus: 'arch' },
    },
    nostalgic: {
        valence: 0.4, arousal: 0.4, mode: 'major', key: 'Eb', tempo: 86, groove: 'ballad', form: 'pop',
        style: 'gentle', legato: 0.95, dynamics: 0.55, comp: 'sustain', arp: 'broken',
        progressions: {
            intro: 'I iii IV iv', verse: 'I iii IV iv', pre: 'vi V IV V', chorus: 'I V vi iii IV I IV V',
            post: 'IV iv I', bridge: 'bVI bVII I I', outro: 'IV iv I:2',
        },
        band: { lead: 10, counter: 73, arp: 24, chords: 4, pad: 89, bass: 33, drums: 8 },
        contour: { verse: 'fall', chorus: 'arch' },
    },
    melancholy: {
        valence: 0.15, arousal: 0.3, mode: 'minor', key: 'A', tempo: 72, groove: 'ballad', form: 'pop',
        style: 'cinematic', legato: 1, dynamics: 0.45, comp: 'sustain', arp: 'updown',
        progressions: {
            intro: 'i VI', verse: 'i VI III VII', pre: 'iv VI VII VII', chorus: 'VI VII i i VI VII III V',
            post: 'VI VII i', bridge: 'iv i VI V', outro: 'iv V i:2',
        },
        band: { lead: 68, counter: 42, arp: 46, chords: 0, pad: 49, bass: 32, drums: 8 },
        contour: { verse: 'fall', chorus: 'arch', bridge: 'rise' },
    },
    mysterious: {
        valence: 0.4, arousal: 0.35, mode: 'dorian', key: 'D', tempo: 88, groove: 'halftime', form: 'pop',
        style: 'cinematic', legato: 0.9, dynamics: 0.5, comp: 'sustain', arp: 'alberti',
        progressions: {
            intro: 'isus2 IV', verse: 'i IV i IV', pre: 'III IV v v', chorus: 'i III IV i',
            post: 'IV i', bridge: 'v VII i i', outro: 'IV i:3',
        },
        band: { lead: 77, counter: 11, arp: 8, chords: 88, pad: 91, bass: 35, drums: 0 },
        contour: { verse: 'valley', chorus: 'wave' },
    },
    tense: {
        valence: 0.15, arousal: 0.85, mode: 'harmonicMinor', key: 'C', tempo: 132, groove: 'halftime', form: 'pop',
        style: 'cinematic', legato: 0.7, dynamics: 0.75, comp: 'pulse', arp: 'ostinato',
        progressions: {
            intro: 'i i', verse: 'i i iv i', pre: 'VI VI V V', chorus: 'i VI iv V',
            post: 'i V', bridge: 'bII bII V V', outro: 'iv V i:2',
        },
        band: { lead: 60, counter: 41, arp: 45, chords: 48, pad: 50, bass: 43, drums: 48 },
        contour: { verse: 'plateau', chorus: 'rise' },
    },
    heroic: {
        valence: 0.75, arousal: 0.85, mode: 'major', key: 'Bb', tempo: 116, groove: 'march', form: 'pop',
        style: 'cinematic', legato: 0.85, dynamics: 0.8, comp: 'march', arp: 'up',
        progressions: {
            intro: 'I bVII IV I', verse: 'I bVII IV I', pre: 'vi IV V V', chorus: 'I V vi IV I bVII IV V',
            post: 'I bVII', bridge: 'vi iii IV V', outro: 'bVI bVII I:2',
        },
        band: { lead: 56, counter: 60, arp: 46, chords: 48, pad: 52, bass: 43, drums: 48 },
        contour: { verse: 'rise', chorus: 'arch' },
    },
    serene: {
        valence: 0.65, arousal: 0.1, mode: 'lydian', key: 'E', tempo: 66, groove: 'none', form: 'AABA',
        style: 'gentle', legato: 1, dynamics: 0.35, comp: 'sustain', arp: 'updown',
        progressions: {
            intro: 'Imaj7 II', A: 'Imaj7 II Imaj7 II', B: 'vi7 II Imaj7 V', verse: 'Imaj7 II Imaj7 II',
            chorus: 'vi7 II Imaj7 Imaj7', bridge: 'iii vi II II', outro: 'II Imaj7:3',
        },
        band: { lead: 75, counter: 73, arp: 46, chords: 4, pad: 89, bass: 32, drums: null },
        contour: { A: 'arch', B: 'valley' },
    },
    angry: {
        valence: 0.1, arousal: 0.95, mode: 'minor', key: 'E', tempo: 144, groove: 'rock', form: 'pop',
        style: 'plain', legato: 0.75, dynamics: 0.9, comp: 'eighths', arp: 'ostinato', power: true,
        progressions: {
            intro: 'i i VI VII', verse: 'i i VI VII', pre: 'iv iv V V', chorus: 'i VI III VII',
            post: 'i VII', bridge: 'iv iv VI V', outro: 'VI VII i:2',
        },
        band: { lead: 30, counter: 29, arp: 81, chords: 30, pad: 50, bass: 34, drums: 16 },
        contour: { verse: 'plateau', chorus: 'rise' },
    },
    playful: {
        valence: 0.85, arousal: 0.65, mode: 'major', key: 'C', tempo: 112, groove: 'bounce', form: 'ABAC',
        style: 'jazzy', legato: 0.55, dynamics: 0.6, comp: 'offbeat', arp: 'alberti', swing: 0.6,
        progressions: {
            intro: 'I vi ii V7', A: 'I vi ii V7', B: 'IV V7 iii vi ii7 V7 I I', C: 'III7 vi II7 V7',
            verse: 'I vi ii V7', chorus: 'IV V7 iii vi ii7 V7 I I', bridge: 'III7 vi II7 V7', outro: 'ii7 V7 I:2',
        },
        band: { lead: 12, counter: 71, arp: 45, chords: 0, pad: 48, bass: 32, drums: 0 },
        contour: { A: 'wave', B: 'arch', C: 'rise' },
    },
};

// ---- Song forms --------------------------------------------------------------------------------
// From "Anatomy of a song": letter forms name sections by role. Section names refer to SECTIONS below.
export const FORMS = {
    pop:     ['intro', 'verse', 'pre', 'chorus', 'verse', 'pre', 'chorus', 'bridge', 'chorus', 'outro'],
    ballad:  ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
    AAA:     ['intro', 'chorus', 'chorus', 'chorus', 'outro'],
    ABAB:    ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
    ABCABC:  ['intro', 'verse', 'pre', 'chorus', 'verse', 'pre', 'chorus', 'outro'],
    AABA:    ['intro', 'A', 'A', 'B', 'A', 'outro'],
    ABAC:    ['intro', 'A', 'B', 'A', 'C', 'outro'],
    ABCDE:   ['A', 'B', 'C', 'D', 'E'],
    BABA:    ['chorus', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
    verseChorus: ['intro', 'verse', 'pre', 'chorus', 'verse', 'pre', 'chorus', 'bridge', 'chorus', 'chorus', 'outro'],
    edm:     ['intro', 'build', 'drop', 'breakdown', 'build', 'drop', 'outro'],
    blues:   ['intro', 'blues', 'blues', 'blues', 'outro'],
};

// ---- Section roles -----------------------------------------------------------------------------
// Each section has a job, and these are its parameters; the passes that write the song read them.
// energy 0..1 drives loudness, the drum level, comping and (unless fullness is given) which parts play (ARRANGEMENT).
// melody: null = instrumental.
//   register  scale degrees above the emotion's home pitch; choruses sit higher than verses
//   density   melody notes per beat
//   contour   default shape (CONTOURS); the emotion can override per section
//   cadences  how each 4-bar phrase ends: 'half' (on 2/5, asks a question) or 'full' (on 1, answers it);
//             the last phrase follows endOn instead, when the section has one
//   from      the fraction of the section that passes before the melody enters: an intro's late fragment of the hook
// develop        how the song's motif is transformed in the section's motif bars (lib/motif.js): first statement, later ones
// endOn          the cadence the chords end on (CADENCES): dominant (a question), tonic (a full stop), plagal, deceptive
// harmonicRhythm chords change this many times as fast as written: 2 is urgent, 0.5 spacious. Default progressions only.
// fullness       0..1, in place of energy, for which parts play: a breakdown feels big but has few parts
// mute           parts left out by default
// breath         the last `beats` before the next section keep only the `keep` parts: space that makes the next one hit
// answer         the counter answers the lead in call and response (CALL_BARS each), and the lead rests while it does
// feel           the drums: 'half' (snare on 3), 'double' (snare every beat, sixteenth hats), 'roll' (a snare build)
// entries, exits parts come in one at a time across the section (an intro), or leave in reverse order (an outro)
// meter          a meter of its own (METERS); progressionFrom: the emotion's progression to borrow when it has none for this type
// build, contrast, ending: read by the mix (sweeps, reverb) and the arrangement
export const SECTIONS = {
    intro:  { name: 'Intro', bars: 4, energy: 0.3, harmonicRhythm: 0.5, entries: true,
              melody: { register: 0, density: 0.6, contour: 'arch', cadences: ['half'], from: 0.5 }, develop: ['fragment'] },
    verse:  { name: 'Verse', bars: 8, energy: 0.5,
              melody: { register: 0, density: 0.9, contour: 'wave', cadences: ['half', 'full'] }, develop: ['repeat', 'sequence'] },
    pre:    { name: 'Pre-chorus', bars: 4, energy: 0.65, build: true, endOn: 'dominant', harmonicRhythm: 2, breath: { beats: 2, keep: ['lead', 'drums'] },
              melody: { register: 2, density: 1.25, contour: 'rise', cadences: ['half'] }, develop: ['diminish', 'sequence'] },
    chorus: { name: 'Chorus', bars: 8, energy: 0.9, endOn: 'tonic',
              melody: { register: 3, density: 0.8, contour: 'arch', cadences: ['half', 'full'] }, develop: ['repeat', 'sequence'] },
    post:   { name: 'Post-chorus', bars: 4, energy: 0.7,
              melody: { register: 4, density: 1.5, contour: 'fall', cadences: ['full'] }, develop: ['fragment'] },
    bridge: { name: 'Bridge', bars: 8, energy: 0.7, contrast: true, endOn: 'dominant', answer: true,
              melody: { register: 1, density: 0.7, contour: 'valley', cadences: ['half', 'half'] }, develop: ['invert', 'augment'] },
    outro:  { name: 'Outro', bars: 4, energy: 0.3, melody: null, ending: true, endOn: 'tonic', exits: true },
    A:      { bars: 8, energy: 0.6, endOn: 'tonic',
              melody: { register: 1, density: 0.9, contour: 'arch', cadences: ['half', 'full'] }, develop: ['repeat', 'sequence'] },
    B:      { bars: 8, energy: 0.75, contrast: true, endOn: 'dominant',
              melody: { register: 2, density: 0.75, contour: 'valley', cadences: ['half', 'half'] }, develop: ['invert', 'sequence'] },
    C:      { bars: 8, energy: 0.8,
              melody: { register: 3, density: 1, contour: 'rise', cadences: ['half', 'full'] }, develop: ['sequence', 'diminish'] },
    D:      { bars: 8, energy: 0.7, contrast: true,
              melody: { register: 1, density: 1.1, contour: 'wave', cadences: ['half', 'full'] }, develop: ['retrograde', 'invert'] },
    E:      { bars: 8, energy: 0.9, endOn: 'tonic',
              melody: { register: 4, density: 0.8, contour: 'arch', cadences: ['half', 'full'] }, develop: ['repeat', 'sequence'] },
    // electronic: the build tightens a snare roll and drops out for two beats, then everything lands on the drop's beat 1
    build:  { name: 'Build', bars: 8, energy: 0.6, melody: null, build: true, endOn: 'dominant', harmonicRhythm: 2, feel: 'roll',
              breath: { beats: 2, keep: [] }, progressionFrom: 'pre' },
    drop:   { name: 'Drop', bars: 16, energy: 0.95, endOn: 'tonic', progressionFrom: 'chorus',
              melody: { register: 2, density: 0.9, contour: 'arch', cadences: ['half', 'full'] }, develop: ['repeat', 'sequence'] },
    breakdown: { name: 'Breakdown', bars: 8, energy: 0.4, fullness: 0.2, mute: ['drums', 'bass'], harmonicRhythm: 0.5, contrast: true,
              progressionFrom: 'bridge', melody: { register: 1, density: 0.5, contour: 'valley', cadences: ['half'] }, develop: ['augment'] },
    // a 12-bar blues chorus: the I–IV–V cycle, three 4-bar lines; the last bar turns around to V
    blues:  { name: 'Blues chorus', bars: 12, energy: 0.6, progression: 'I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7',
              melody: { register: 1, density: 0.8, contour: 'wave', cadences: ['half', 'half', 'half'] }, develop: ['repeat', 'sequence'] },
    // one bar of 2/4 that delays what comes next: a phrase length broken on purpose
    link:   { name: 'Link', bars: 1, energy: 0.6, meter: '2/4', melody: null, endOn: 'dominant', progressionFrom: 'pre' },
};

// Each repeat of a section gets a little more energy, so verse 2 is fuller than verse 1.
export const REPEAT_LIFT = 0.07;

// ---- Arrangement: which parts play at which energy --------------------------------------------
// A part plays when the section's energy reaches its threshold. Melody parts follow the section instead.
export const ARRANGEMENT = { pad: 0, chords: 0.25, bass: 0.35, drums: 0.4, arp: 0.6, counter: 0.8 };
// track order top-left → bottom-right on screen, and in exported files
export const ROLES = ['lead', 'counter', 'arp', 'chords', 'pad', 'bass', 'drums'];
export const ROLE_NAMES = { lead: 'Melody', counter: 'Countermelody', arp: 'Arpeggio', chords: 'Chords', pad: 'Pad', bass: 'Bass', drums: 'Drums' };

// the order parts come in across an intro (and leave across an outro, in reverse), so each one is heard arriving
export const ENTRY_ORDER = ['pad', 'chords', 'arp', 'bass', 'drums', 'counter'];

// MIDI key ranges each part writes in
export const RANGES = {
    lead: [60, 86], counter: [53, 79], arp: [57, 88], chords: [52, 74], pad: [48, 76], bass: [28, 52],
};
// where the melody's degree 1 sits, as an octave number (4 → between C4 and B4)
export const MELODY_OCTAVE = 4;

// velocity = base + energy * span + per-role offset + metric accent, scaled by the emotion's dynamics
export const DYNAMICS = {
    base: 48, span: 52,
    role: { lead: 12, counter: -6, arp: -12, chords: -4, pad: -14, bass: 4, drums: 0 },
    accent: { downbeat: 10, strong: 5, weak: 0, offbeat: -6, sixteenth: -12 },   // so busy hats alternate loud and soft
};

// ---- Melody -------------------------------------------------------------------------------------
// Rhythm cells, one bar each, in beats. Negative = rest. Chosen by how close their note count is to
// the section's density, so the same density always picks the same cells. Keyed by meter; any other meter
// builds its cells from GROUP_CELLS, one per beat group.
export const RHYTHMS = {
    '4/4': {
        cells: [
            [4], [2, 2], [3, 1], [-1, 1, 2], [2, 1, 1], [1, 1, 2], [1.5, 0.5, 2], [1, 1, 1, 1],
            [-0.5, 0.5, 1, 2], [1, 0.5, 0.5, 2], [0.5, 0.5, 1, 1, 1], [1.5, 0.5, 1, 1],
            [0.5, 1, 0.5, 2], [-1, 0.5, 0.5, 1, 1], [0.5, 0.5, 0.5, 0.5, 1, 1], [1, 0.5, 0.5, 1, 1],
            [0.5, 1, 0.5, 1, 1], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1],
        ],
        cadence: { half: [2, 2], full: [4], final: [4] },
    },
    '3/4': {
        cells: [
            [3], [2, 1], [1, 2], [-1, 1, 1], [1, 1, 1], [1.5, 0.5, 1], [0.5, 0.5, 1, 1], [1, 0.5, 0.5, 1],
            [0.5, 0.5, 0.5, 0.5, 1],
        ],
        cadence: { half: [2, 1], full: [3], final: [3] },
    },
    // two lilting groups of three eighths: long-short, and the long note on each group's start
    '6/8': {
        cells: [
            [3], [1.5, 1.5], [1, 0.5, 1.5], [1.5, 1, 0.5], [1, 0.5, 1, 0.5], [0.5, 0.5, 0.5, 1.5],
            [-0.5, 0.5, 0.5, 1.5], [1, 0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        ],
        cadence: { half: [1.5, 1.5], full: [3], final: [3] },
    },
};

// Contours: target height in scale degrees across a 4-bar phrase, sampled at 5 points.
export const CONTOURS = {
    arch:    [0, 2, 4, 3, 0],
    rise:    [0, 1, 2, 3, 4],
    fall:    [4, 3, 2, 1, 0],
    wave:    [0, 2, 0, 2, 0],
    valley:  [3, 1, 0, 1, 2],
    plateau: [0, 2, 2, 2, 1],
};
// home pitch of the melody: the scale degree contours count up from
export const MELODY_HOME = 3;

// Costs for choosing each melody note. Every candidate degree in range is scored and the cheapest wins;
// a hash of the position only breaks exact ties, so the result is fixed for a given song.
export const MELODY_RULES = {
    contour: 1,             // per degree away from the contour target
    motif: 2,               // per degree away from the motif's shape, in a motif bar
    strongNonChord: 5,      // a non-chord tone on a strong beat
    weakNonChordLeap: 3,    // a non-chord tone on a weak beat that isn't reached by step (not a passing/neighbour tone)
    leap: 1.2,              // per degree of a leap beyond a third
    bigLeap: 6,             // per degree beyond a sixth
    recover: 3,             // a leap of a fourth or more not followed by a step back the other way
    repeatOnce: 0.8,        // the same pitch twice in a row (fine, but movement is better)
    repeat: 2.5,            // the same pitch a third time in a row
    cadence: 12,            // a phrase ending away from its cadence degrees
    tieBreak: 0.01,         // scale of the hashed tie-break
};
export const CADENCE_DEGREES = { half: [2, 5], full: [1], final: [1], deceptive: [1, 3] };
// a melody leaping to the section's highest note again costs this, after it has been there twice: the peak is special
export const PEAK_RULE = { times: 2, cost: 4 };

// ---- Harmony at the scale of a section --------------------------------------------------------------
// The cadences a section's chords can end on. The last symbol is the last bar's chord; any before it take the second
// half of the bar before, unless the chord there already leads in. bright: modes with a major third, dark: minor.
export const CADENCES = {
    dominant:  { bright: ['V'], dark: ['V'], melody: 'half' },                     // a question mark
    tonic:     { bright: ['V', 'I'], dark: ['V', 'i'], melody: 'full' },           // a full stop: authentic
    plagal:    { bright: ['IV', 'I'], dark: ['iv', 'i'], melody: 'full' },         // a soft "amen"
    deceptive: { bright: ['V', 'vi'], dark: ['V', 'VI'], melody: 'deceptive' },    // resolution expected, a minor chord instead
};
// degrees of chords that already lead into a cadence's last chord, so nothing needs inserting before it
export const LEADS_IN = { tonic: [4, 5, 7], plagal: [4], deceptive: [5], dominant: [] };

// ---- On screen ------------------------------------------------------------------------------------
// one colour per part (rgb 0..1), and how many seconds of notes are visible above each keyboard
export const ROLE_COLORS = {
    lead: [1, 0.78, 0.4], counter: [0.98, 0.55, 0.62], arp: [0.6, 0.85, 0.5], chords: [0.45, 0.8, 1],
    pad: [0.7, 0.62, 1], bass: [1, 0.6, 0.35], drums: [0.85, 0.85, 0.9],
};
export const VIEW_SECONDS = 3;
