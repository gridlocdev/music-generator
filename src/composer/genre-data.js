// How each genre plays: its usual groove, comping and style, and the harmonic and melodic language that make it that
// genre rather than a pop song in its clothes. Content only, imports nothing. docs/COMPOSING.md, "Genre profiles".
// A spec's `genre` names one (case and spaces don't matter: 'Bossa nova' is bossa-nova); a genre with no profile
// changes nothing. Every field is optional, and anything the spec sets itself wins.
//
// Defaults, in place of the emotion's: mode, groove, comp, arp, style, swing, legato, form, power, tempo, sound ('chip':
//              the chip instruments of audio/chip-instruments-data.js in place of General MIDI ones)
//   band       instruments over the emotion's, as a spec's band: a program per part, null leaves the part out
//   arrange    ARRANGEMENT thresholds of its own: { arp: 0 } has the arpeggio (a piano's left hand) play throughout
// Harmony:
//   progressions  per section type, in place of the emotion's; a genre that sets its mode brings them, so the chords
//              are written for that mode; one that doesn't splits them { bright, dark } (a side left out plays the
//              emotion's). A list is several, and each song picks one by its seed, so a genre's songs differ
//   extend     (false: plain triads, whatever the emotion's colour) plays plain triads as sevenths, ninths, dominant (every major chord a dominant 7th), add9, sixths,
//              sus2 or sus4; or a list of { how, chance }, each chord taking the first that comes up
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
//   span       how far the contours reach, as a multiple of CONTOURS' heights: 1.75 takes an arch up an octave
//   motif      MOTIF.cost weights of its own, for the motif it invents
//   offbeat    how much nearer the section's density a rhythm cell with an offbeat entry counts, in notes
export const GENRES = {
    'blues': {
        mode: 'major', groove: 'swing', swing: 0.67, comp: 'offbeat', form: 'blues',
        style: { swing: 0.67, dim7: 0.1, secondary: 0, twoFive: 0, tritone: 0, sus: 0, borrowed: 0, mediant: 0, scoops: 0.4, ghosts: 0.5, syncopation: 0.4, earCandy: 0.25, stab: 0 },
        progressions: {
            intro: ['V7 IV7 I7 V7', 'I7 #iv° I7/5 V7'], verse: ['I7 IV7 I7 V7', 'I7 IV7 I7 I7'], pre: 'IV7 IV7 V7 V7',
            chorus: ['IV7 IV7 I7 I7 V7 IV7 I7 V7', 'IV7 #iv° I7 VI7 ii7 V7 I7 V7'],
            bridge: ['IV7 IV7 I7 I7', 'IV7 #iv° I7/5 VI7'], post: 'IV7 I7', outro: ['V7 IV7 I7:2', 'ii7 V7 I7:2'],
        },
        extend: 'dominant', avoid: { bright: [7] }, blue: [3, 7], phrases: 'aab',
        cadences: { tonic: { bright: ['V7', 'I7'] }, dominant: { bright: ['V7'] } },
        rules: { strongNonChord: 3.5, blue: 0.4 },
    },
    'jazz': {
        groove: 'swing', swing: 0.67, comp: 'offbeat', style: 'jazzy',
        // ii–V–I and turnarounds, rhythm changes' I–vi–ii–V, the IV to #iv° walk-up, the minor iiø–V–i
        progressions: {
            bright: {
                intro: ['ii7 V7 Imaj7 VI7', 'iii7 VI7 ii7 V7'], A: ['Imaj7 VI7 ii7 V7', 'Imaj7 V7/ii ii7 V7'],
                verse: ['Imaj7 VI7 ii7 V7', 'Imaj7 ii7/IV V7/IV IVmaj7'], pre: ['ii7 V7 iii7 VI7', 'IVmaj7 #iv° Imaj7/5 VI7'],
                B: ['II7:2 V7:2', 'iii7 VI7 ii7 V7'], chorus: ['IVmaj7 #iv° iii7 VI7 ii7 V7 Imaj7 Imaj7', 'iii7 VI7 ii7 V7 Imaj7 IV7 iii7 VI7'],
                bridge: ['III7:2 VI7:2 II7:2 V7:2', 'ii7/IV V7/IV IVmaj7 IVmaj7'], post: 'ii7 V7', C: 'III7 VI7 II7 V7',
                outro: ['ii7 V7 Imaj7:2', 'iii7 VI7 ii7 V7 Imaj7:2'],
            },
            dark: {
                intro: ['iiø V7 i7 i7', 'i7 VImaj7 iiø V7'], A: ['i7 iv7 iiø V7', 'i7 i7 iv7 VII7'],
                verse: ['i7 iv7 iiø V7', 'i7 VImaj7 iiø V7'], pre: 'iv7 VII7 IIImaj7 VImaj7',
                chorus: ['iv7 VII7 IIImaj7 VImaj7 iiø V7 i7 i7', 'i7 iv7 VII7 IIImaj7 VImaj7 iiø V7 i7'],
                B: ['iv7 VII7 IIImaj7 VImaj7', 'VImaj7:2 V7:2'], bridge: ['iv7 iv7 iiø V7', 'IIImaj7 VImaj7 iiø V7'],
                post: 'iiø V7', C: 'VImaj7 iiø V7 i7', outro: 'iiø V7 i7:2',
            },
        },
        extend: 'ninths', voicing: 'shell',
        cadences: { tonic: { bright: ['V7', 'Imaj7'], dark: ['V7', 'i7'] }, dominant: { bright: ['V7'], dark: ['V7'] } },
        rules: { strongNonChord: 3 },           // a 9th or 13th on the beat is colour, not a clash
    },
    'bossa-nova': {
        groove: 'bossa', comp: 'bossa', legato: 0.9,
        // slow-moving major sevenths, the II7 a step up, the chord a half step down to slide back home
        progressions: {
            bright: {
                intro: ['Imaj7:2 II7:2', 'Imaj7 bIImaj7'], verse: ['Imaj7:2 II7:2 ii7 bII7 Imaj7:2', 'Imaj7 VI7 ii7 V7'],
                pre: ['ii7 V7 iii7 VI7', 'IVmaj7 iv7 iii7 VI7'], chorus: ['IVmaj7:2 iv7 bVII7 iii7 VI7 ii7 V7', 'ii7 V7 Imaj7 VI7 ii7 bII7 Imaj7 Imaj7'],
                bridge: ['bIIImaj7:2 bVImaj7:2', 'iv7:2 bVII7:2'], post: 'ii7 bII7', outro: ['ii7 bII7 Imaj7:2', 'IVmaj7 iv7 Imaj7:2'],
            },
            dark: {
                intro: 'i7 iv7', verse: ['i7:2 iv7:2 iiø V7 i7:2', 'i7 IVmaj7/3 iiø V7'], pre: 'VImaj7 iiø V7 V7',
                chorus: ['iv7 VII7 IIImaj7 VImaj7 iiø V7 i7 i7', 'VImaj7 V7 i7 i7'], bridge: ['IIImaj7:2 VImaj7:2', 'iv7 VII7 IIImaj7 IIImaj7'],
                post: 'iiø V7', outro: 'iiø bII7 i7:2',
            },
        },
        extend: 'ninths', voicing: 'shell',
        cadences: { tonic: { bright: ['V7', 'Imaj7'], dark: ['V7', 'i7'] } },
        rules: { strongNonChord: 3.5 },
    },
    'lo-fi-hip-hop': {
        groove: 'boomBap', comp: 'push', arp: 'broken', legato: 0.95, style: { ghosts: 0.4, syncopation: 0.3, dim7: 0 },
        // two- and four-chord loops of sevenths that never quite land: IVmaj7 to iii7, a ii–V that goes nowhere
        progressions: {
            bright: {
                intro: ['IVmaj7 iii7', 'ii7 V7'], verse: ['IVmaj7 iii7 ii7 Imaj7', 'ii7 V7 Imaj7 vi7', 'Imaj7 iii7 IVmaj7 iv7'],
                pre: 'ii7 iii7 IVmaj7 V7sus4', chorus: ['IVmaj7 III7 vi7 Imaj7', 'ii7 V7 iii7 vi7', 'IVmaj7 iv7 iii7 VI7'],
                bridge: ['bVImaj7 bVII7 Imaj7 Imaj7', 'vi7 iii7 IVmaj7 IVmaj7'], post: 'IVmaj7 iii7', outro: 'IVmaj7 iv7 Imaj7:2',
            },
            dark: {
                intro: ['i7 iv7', 'VImaj7 v7'], verse: ['i7 iv7 VImaj7 v7', 'i9 VImaj7 iiø V7', 'i7 VII IIImaj7 VImaj7'],
                pre: 'iv7 v7 VImaj7 VII', chorus: ['VImaj7 v7 i7 iv7', 'iv7 VII7 IIImaj7 VImaj7'],
                bridge: 'IIImaj7 VImaj7 iv7 V7', post: 'iv7 v7', outro: 'iv7 v7 i7:2',
            },
        },
        cadences: { tonic: { bright: ['iv7', 'Imaj7'], dark: ['v7', 'i7'] } },
    },
    'funk': {
        mode: 'dorian', groove: 'funk', comp: 'funk', style: 'funky', legato: 0.5,
        progressions: {
            intro: ['i7:2 IV7:2', 'i7:4'], verse: ['i7:2 IV7:2', 'i7:3 IV7', 'i7 i7 VII7 IV7'], pre: ['VII:2 IV:2', 'IV7:2 v7:2'],
            chorus: ['III IV i7 i7', 'IV7:2 i7:2', 'VII IV7 i7 i7'], bridge: ['ii7:2 v7:2', 'IV7 IV7 VII7 VII7'],
            post: 'IV7 i7', outro: 'i7:3 i7',
        },
        extend: 'dominant', avoid: { bright: [4, 7], dark: [2, 6] },
        cadences: { tonic: { dark: ['IV7', 'i7'] }, dominant: { dark: ['IV7'] } },
    },
    'gospel': {
        groove: 'ballad', comp: 'pulse', swing: 0.67, arp: 'broken', legato: 0.95, style: { dim7: 0.35, scoops: 0.4 },
        // walk-ups in the bass (I, I/3, IV, #iv°), secondary dominants into every chord, and the 'amen' iv
        progressions: {
            bright: {
                intro: ['IV iv I I', 'I I/3 IV #iv°'], verse: ['I I/3 IV #iv° I/5 VI7 ii7 V7', 'I V/7 vi I/5 IV I/3 ii7 V7'],
                pre: ['IV #iv° I/5 VI7', 'ii7 iii7 IV V7sus4'], chorus: ['IV V/IV IV iv I VI7 ii7 V7', 'I III7 vi I7 IV #iv° I/5 V7'],
                bridge: ['vi7 V/vi vi7 I7', 'IV IV/5 iii7 vi7'], post: 'IV iv', outro: ['IV iv I:2', 'IV #iv° I/5 V7sus4 I:2'],
            },
            dark: {
                intro: 'iv7 i7', verse: ['i7 iv7 VII7 IIImaj7', 'i7 i7/3 iv7 V7'], pre: 'VImaj7 iiø V7sus4 V7',
                chorus: ['iv7 V7 i7 VI7 iiø V7 i7 i7', 'VI VII i7 i7'], bridge: 'iv7 VII7 IIImaj7 VImaj7', post: 'iv7 V7', outro: 'iv7 V7 i7:2',
            },
        },
        extend: 'ninths', voicing: 'drop2',
        cadences: { tonic: { bright: ['iv', 'I'] }, plagal: { bright: ['iv', 'I'] } },    // the minor plagal "amen"
    },
    'country': {
        groove: 'train', comp: 'offbeat', arp: 'roll',
        // three chords and the truth: I, IV, V, the II7 that pushes to V, the I7 that pushes to IV
        progressions: {
            bright: {
                intro: ['I IV I V', 'V7 V7 I I'], verse: ['I I IV I I I V V', 'I I7 IV IV I V I I', 'I IV I V'],
                pre: ['IV IV I I', 'II7 II7 V V'], chorus: ['IV I V I', 'I I7 IV IV I V I I', 'IV IV I vi II7 II7 V V'],
                bridge: ['vi IV I V', 'IV IV I I7 II7 II7 V V'], post: 'IV I', outro: ['IV V I:2', 'II7 V7 I:2'],
            },
        },
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
        cadences: { dominant: { bright: ['v'] } },
    },
    'reggae': {
        groove: 'reggae', comp: 'skank', legato: 0.7,
        // a two-chord vamp a bar each: I–IV, I–V, i–iv, i–VII
        progressions: {
            bright: {
                intro: ['I:2 IV:2', 'I V'], verse: ['I IV I IV', 'I V I V', 'I vi IV V'], pre: 'IV IV V V',
                chorus: ['IV V I vi', 'I IV V IV', 'IV I V I'], bridge: ['ii V ii V', 'vi vi IV IV'], post: 'IV V', outro: 'IV V I:2',
            },
            dark: {
                intro: 'i:2 iv:2', verse: ['i iv i iv', 'i VII i VII', 'i i VI VII'], pre: 'iv iv v v',
                chorus: ['VI VII i i', 'i iv VII III'], bridge: ['iv v iv v', 'VI III VII VII'], post: 'iv v', outro: 'iv v i:2',
            },
        },
        cadences: { tonic: { bright: ['IV', 'I'], dark: ['v', 'i'] } },
        avoid: { bright: [4, 7], dark: [2, 6] },
    },
    'rock': {
        groove: 'rock', comp: 'eighths', power: true,
        // riffs on borrowed chords: bVII and bVI in a major key, the bIII–IV climb, the i–bVI–bVII run
        progressions: {
            bright: {
                intro: ['I bVII IV I', 'I:2 bVII IV'], verse: ['I bVII IV I', 'I IV bVII IV', 'I bIII IV I'],
                pre: ['IV IV bVI bVII', 'vi IV V V'], chorus: ['I V bVII IV', 'IV I bVII I', 'bVI bVII I I'],
                bridge: ['bVI bVII I I', 'vi bVII IV V'], post: 'bVII IV', outro: ['bVI bVII I:2', 'IV bVII I:2'],
            },
            dark: {
                intro: ['i VI VII i', 'i i VII VII'], verse: ['i VI VII i', 'i III VII IV', 'i iv VII i'],
                pre: ['iv iv VI VII', 'VI VI V V'], chorus: ['i VI III VII', 'VI VII i i', 'i VII VI V'],
                bridge: ['iv VI VII VII', 'VI III iv V'], post: 'VI VII', outro: 'VI VII i:2',
            },
        },
        avoid: { bright: [4, 7], dark: [2, 6] },
        cadences: { tonic: { bright: ['bVII', 'I'], dark: ['VI', 'VII', 'i'] }, dominant: { bright: ['bVII'] } },
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
        // chromatic mediants (I–bVI, i–III–bII), the minor iv in a major key, chords held over a pedal
        progressions: {
            bright: {
                intro: ['I:2 bVI:2', 'Isus2:2 IV/1:2'], verse: ['I bVI IV I', 'I iii IV iv', 'I V/7 vi IV'],
                pre: ['IV iv bVI bVII', 'vi IV bVII V'], chorus: ['I V vi bVI bVII I IV V', 'IV I/3 bVI bVII I bIII IV V'],
                bridge: ['bVI bIII bVII IV', 'vi III vi IV'], post: 'bVI I', outro: ['IV iv I:2', 'bVI bVII I:2'],
            },
            dark: {
                intro: ['i:2 VI:2', 'i:2 III:2'], verse: ['i VI III VII', 'i III bII i', 'i iv VI V'],
                pre: ['iv VI VII V', 'VI III iv V'], chorus: ['VI III VII i iv VI V V', 'i VI III VII VI iv V V'],
                bridge: ['VI III bII V', 'iv IV/4 VI V'], post: 'VI V', outro: ['iv V i:2', 'VI VII I:2'],
            },
        },
        cadences: { tonic: { bright: ['bVI', 'bVII', 'I'], dark: ['iv', 'V', 'i'] }, deceptive: { bright: ['V', 'bVI'] } },
        voicing: 'drop2',
    },
    'synthwave': {
        mode: 'minor', groove: 'synthwave', comp: 'pulse', arp: 'sixteenths', style: 'electronic',
        progressions: {
            intro: ['i VI III VII', 'i:2 VI:2'], verse: ['i VI III VII', 'i III VII VI', 'VI III VII i'], pre: ['iv VI VII VII', 'VI VI VII VII'],
            chorus: ['VI VII i i VI VII III V', 'i VI III VII', 'VI III VII i'],
            bridge: ['iv i VI V', 'III VII iv iv'], post: 'VI VII i', outro: ['VI VII I:2', 'iv VII i:2'],
        },
        cadences: { tonic: { dark: ['VI', 'VII', 'i'] } },
        extend: 'add9',
    },
    'chiptune': {
        groove: 'rock', comp: 'eighths', arp: 'tracker', sound: 'chip',
        // the consoles' own moves: bVI–bVII–I fanfares, chromatic mediants, the minor iv, secondary dominants
        progressions: {
            bright: {
                intro: ['I bVI bVII I', 'I V/7 vi IV'], verse: ['I vi IV V', 'I iii IV iv', 'I bVII IV I'],
                pre: ['IV V iii vi', 'ii V/V V V'], chorus: ['IV V iii vi ii V I I', 'I bVI bVII I', 'IV V I vi bVI bVII I I'],
                bridge: ['bVI bVII bVI bVII', 'vi iii IV V/V'], post: 'IV V', outro: ['bVI bVII I:2', 'IV iv I:2'],
            },
            dark: {
                intro: ['i VI VII i', 'i III'], verse: ['i VI VII i', 'i iv VII III', 'i bII i bII'],
                pre: ['VI VII V V', 'iv iv V V'], chorus: ['i VI III VII', 'VI VII i i iv V i i', 'i VI iv V'],
                bridge: ['VI iv VII III', 'bII bII V V'], post: 'VI VII', outro: ['VI VII i:2', 'iv V i:2'],
            },
        },
        cadences: { tonic: { bright: ['bVI', 'bVII', 'I'], dark: ['VI', 'VII', 'i'] } },
    },
    // the hook climbs to a held high note an octave over the verse, enters off the beat, and leaps where pop steps
    'disco': {
        mode: 'dorian', groove: 'dance', comp: 'chop', arp: 'sixteenths', style: 'funky', legato: 0.6,
        // dorian minor-seventh vamps that swing up to IV7, and the climbing ii7–III–IV7 string line
        progressions: {
            intro: ['i7 IV7', 'i7:2 v7:2'], verse: ['i7 IV7 i7 IV7', 'i7 v7 IV7 IV7', 'i7 i7 III IV7'],
            pre: ['III IV v7 IV7', 'VII III IV IV'], chorus: ['i7 IV7 v7 VII', 'III IV i7 VII', 'IV7 v7 i7 i7'],
            bridge: ['ii7 III IV7 IV7', 'VII:2 IV7:2'], post: 'IV7 i7', outro: 'IV7 VII i7:2',
        },
        cadences: { tonic: { dark: ['VII', 'IV7', 'i7'] }, dominant: { dark: ['IV7'] } },
        span: 1.75, offbeat: 1,
        motif: { repeat: 0.3, skip: 0, leap: 0.4, recover: 0.8, narrow: 1.5, peakFirst: 1.5 },
        rules: { contour: 1.5, skip: 0.3, leap: 0.6, recover: 4, turn: 0.6 },
    },
    // solo piano, Mozart to Chopin: the left hand (a HAND pattern of ARPS) under the tune in every section, the
    // tempo breathing (rubato), ornaments, appoggiaturas that sigh onto the chord, and the cadential 6/4 (I/5 V7 I)
    'classical': {
        groove: 'none', comp: 'sustain', arp: 'nocturne', style: 'romantic', legato: 1, form: 'ternary',
        band: { lead: 0, arp: 0, counter: null, chords: null, pad: null, bass: null, drums: null },
        arrange: { arp: 0 },
        extend: false,                          // triads as written, whatever the emotion's colour
        // functional harmony in periods (a phrase to V, its answer from I again), secondary dominants, vii° of V, the
        // Neapolitan bII6 and the cadential 6/4
        progressions: {
            bright: {
                intro: ['I IV V7 I', 'I V/3 I/3 V'], A: ['I IV V7/V V I vi ii7 V7', 'I I7 IV V I IV/5 V7/V V'],
                B: ['vi V/vi vi iii IV V/V V V', 'V7/IV IV vii°/V V'],
                verse: ['I IV V7/V V I vi ii7 V7', 'I V/3 IV V I V/3 vi V'], chorus: ['IV V/V V vi ii V7 I I', 'vi ii V7 I IV vii°/V V I'],
                bridge: ['vi V/vi vi iii IV V/V V V', 'V7/IV IV vii°/V V'], outro: ['IV iv I:2', 'ii V7 I:2'],
            },
            dark: {
                intro: ['i iv V7 i', 'i V/3 i/3 V'], A: ['i iv i/3 V i VI iiø V7', 'i V7/iv iv V i VI bII/3 V7'],
                B: ['III VII7/III III VI iv V7 i i', 'VI bII/3 V7 V'], verse: ['i iv i/3 V i VI iiø V7', 'i VII/3 VI V i iv iiø V'],
                chorus: ['VI iv bII/3 V7 i VI iiø V7', 'iv V7/III III VI iiø V7 i i'], bridge: ['III VII7/III III VI iv V7 i i', 'VI bII/3 V7 V'],
                outro: ['iv bII/3 V7 i:2', 'iiø V7 i:2'],
            },
        },
        cadences: { tonic: { bright: ['I/5', 'V7', 'I'], dark: ['i/5', 'V7', 'i'] }, dominant: { bright: ['V7'], dark: ['V7'] } },
        rules: { strongNonChord: 4, appoggiatura: 3 },
    },
    'edm': {
        groove: 'dance', comp: 'upbeats', arp: 'sixteenths', style: 'electronic', form: 'edm',
        // four-bar loops that never resolve: vi–IV–I–V, the 'epic' i–VI–III–VII, a suspended build
        progressions: {
            bright: {
                intro: ['vi IV I V', 'IV I/3 vi V'], verse: ['vi IV I V', 'IV I/3 vi V'], build: ['IV V vi vi', 'IV:2 Vsus4 V'],
                chorus: ['vi IV I V', 'IV V vi I/3', 'I V vi IV'], breakdown: ['IV:2 vi:2', 'vi:2 IV:2 I:2 V:2'],
                bridge: 'IV V vi vi', outro: 'IV V vi:2',
            },
            dark: {
                intro: ['i VI III VII', 'VI VII i i'], verse: ['i VI III VII', 'VI III VII i'], build: ['VI VII Vsus4 V', 'iv VI VII VII'],
                chorus: ['i VI III VII', 'VI VII i i', 'VI III VII i'], breakdown: ['VI:2 III:2', 'i:2 VI:2'],
                bridge: 'iv VI VII VII', outro: 'VI VII i:2',
            },
        },
        extend: 'add9',
    },
};
