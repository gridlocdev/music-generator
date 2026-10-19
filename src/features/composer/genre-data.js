// How each genre plays: its usual groove, comping and style, and the harmonic and melodic language that make it that
// genre rather than a pop song in its clothes. Content only, imports nothing. docs/COMPOSING.md, "Genre profiles".
// A spec's `genre` names one (case and spaces don't matter: 'Bossa nova' is bossa-nova); a genre with no profile
// changes nothing. Every field is optional, and anything the spec sets itself wins.
//
// Defaults, in place of the emotion's: mode, groove, comp, arp, style, swing, legato, form, power
// Harmony:
//   progressions  per section type, in place of the emotion's; a genre that sets its mode brings them, so the chords
//              are written for that mode
//   extend     plays plain triads as sevenths, ninths, dominant (every major chord a dominant 7th) or add9
//   cadences   cadence chords over CADENCES', per cadence { bright, dark }; a modal mode's own cadence still wins
// Accompaniment:
//   voicing    the chord part's voicing: close (the default), shell (3rd and 7th, the root left to the bass) or
//              drop2 (the second voice from the top an octave down: open, orchestral)
// Melody:
//   avoid      scale steps the melody leaves out except in passing, by brightness: { bright: [4, 7] } is the major
//              pentatonic, { dark: [2, 6] } the minor
//   blue       steps the melody may flatten, the blue notes, at MELODY_RULES-style cost `rules.blue`
//   phrases    which 4-bar phrases of a composed section repeat an earlier one: 'aab' is the blues' line, line again
//              (over IV), answer
//   rules      MELODY_RULES weights of its own
export const GENRES = {
    'blues': {
        mode: 'major', groove: 'swing', swing: 0.67, comp: 'offbeat', form: 'blues',
        style: { swing: 0.67, dim7: 0.1, scoops: 0.4, ghosts: 0.5, syncopation: 0.4, earCandy: 0.25, stab: 0 },
        progressions: {
            intro: 'V7 IV7 I7 V7', verse: 'I7 IV7 I7 V7', pre: 'IV7 IV7 V7 V7', chorus: 'IV7 IV7 I7 I7 V7 IV7 I7 V7',
            bridge: 'IV7 IV7 I7 I7', post: 'IV7 I7', outro: 'V7 IV7 I7:2',
        },
        extend: 'dominant', avoid: { bright: [7] }, blue: [3, 7], phrases: 'aab',
        cadences: { tonic: { bright: ['V7', 'I7'] }, dominant: { bright: ['V7'] } },
        rules: { strongNonChord: 3.5, blue: 0.4 },
    },
    'jazz': {
        groove: 'swing', swing: 0.67, comp: 'offbeat', style: 'jazzy',
        extend: 'ninths', voicing: 'shell',
        cadences: { tonic: { bright: ['V7', 'Imaj7'], dark: ['V7', 'i7'] }, dominant: { bright: ['V7'], dark: ['V7'] } },
        rules: { strongNonChord: 3 },           // a 9th or 13th on the beat is colour, not a clash
    },
    'bossa-nova': {
        groove: 'bossa', comp: 'bossa', legato: 0.9,
        extend: 'ninths', voicing: 'shell',
        cadences: { tonic: { bright: ['V7', 'Imaj7'], dark: ['V7', 'i7'] } },
        rules: { strongNonChord: 3.5 },
    },
    'lo-fi-hip-hop': {
        groove: 'boomBap', comp: 'push', arp: 'broken', legato: 0.95, style: { ghosts: 0.4, syncopation: 0.3, dim7: 0 },
        extend: 'ninths',
    },
    'funk': {
        mode: 'dorian', groove: 'funk', comp: 'funk', style: 'funky', legato: 0.5,
        progressions: {
            intro: 'i7:2 IV7:2', verse: 'i7:2 IV7:2', pre: 'VII:2 IV:2', chorus: 'III IV i7 i7',
            bridge: 'ii7:2 v7:2', post: 'IV7 i7', outro: 'i7:3 i7',
        },
        extend: 'dominant', avoid: { bright: [4, 7], dark: [2, 6] },
    },
    'gospel': {
        groove: 'ballad', comp: 'pulse', swing: 0.67, arp: 'broken', legato: 0.95, style: { dim7: 0.35, scoops: 0.4 },
        extend: 'ninths', voicing: 'drop2',
        cadences: { tonic: { bright: ['iv', 'I'] }, plagal: { bright: ['iv', 'I'] } },    // the minor plagal "amen"
    },
    'country': {
        groove: 'train', comp: 'offbeat', arp: 'roll',
        avoid: { bright: [4, 7] },
        cadences: { tonic: { bright: ['V7', 'I'] } },
    },
    'celtic': {
        mode: 'mixolydian', groove: 'bodhran', comp: 'waltz', style: { dim7: 0 },
        progressions: {
            intro: 'I VII I VII', verse: 'I VII IV I', pre: 'IV IV VII VII', chorus: 'IV I VII I',
            bridge: 'v VII I I', post: 'VII I', outro: 'VII I:3',
        },
        avoid: { bright: [4], dark: [6] },      // the gapped hexatonic scales of the old tunes
    },
    'reggae': {
        groove: 'reggae', comp: 'skank', legato: 0.7,
        avoid: { bright: [4, 7], dark: [2, 6] },
    },
    'rock': {
        groove: 'rock', comp: 'eighths', power: true,
        avoid: { bright: [4, 7], dark: [2, 6] },
        cadences: { tonic: { bright: ['bVII', 'I'] } },
    },
    'tango': {
        mode: 'harmonicMinor', groove: 'habanera', comp: 'march', legato: 0.6,
        progressions: {
            intro: 'i iv V7 i', verse: 'i iv V7 i', pre: 'iv iv V7 V7', chorus: 'VI iv V7 i',
            bridge: 'iv7 bVII7 IIImaj7 VImaj7 iiø V7 i i', post: 'iv V7', outro: 'iv V7 i:2',
        },
        cadences: { tonic: { dark: ['V7', 'i'] }, dominant: { dark: ['V7'] } },
    },
    'cinematic': {
        groove: 'halftime', comp: 'pulse', arp: 'ostinato', style: 'cinematic',
        voicing: 'drop2',
    },
    'synthwave': {
        mode: 'minor', groove: 'synthwave', comp: 'pulse', arp: 'sixteenths', style: 'electronic',
        progressions: {
            intro: 'i VI III VII', verse: 'i VI III VII', pre: 'iv VI VII VII', chorus: 'VI VII i i VI VII III V',
            bridge: 'iv i VI V', post: 'VI VII i', outro: 'VI VII I:2',
        },
        extend: 'add9',
    },
    'chiptune': {
        groove: 'rock', comp: 'eighths', arp: 'chip',
    },
    'edm': {
        groove: 'dance', comp: 'upbeats', arp: 'sixteenths', style: 'electronic', form: 'edm',
        extend: 'add9',
    },
};
