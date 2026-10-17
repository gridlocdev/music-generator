// How a score is played and mixed: the performance's expression (timing, phrasing, ghost notes, slides, scoops,
// vibrato) and each part's channel strip, ducking and mix movement. Content only, imports nothing.
// docs/COMPOSING.md, "Performance and mix" and "Detail passes", explains them.

// ---- Performance ---------------------------------------------------------------------------------
// What perform() adds to the written notes when a song plays. The score itself stays on the grid.
export const EXPRESSION = {
    // timing drift in milliseconds either way, per part; kick and bass stay tight to hold the groove
    jitterMs: { lead: 12, counter: 10, arp: 5, chords: 8, pad: 15, bass: 0, drums: 0 },
    // each 4-bar phrase of these parts swells by `swell` velocity from start to end, and its last note tapers by `taper`
    phrase: { roles: ['lead', 'counter'], bars: 4, swell: 10, taper: 12 },
    // legato slides on instruments that bend (fretless and synth bass, bowed strings, trombone, synth leads),
    // into a note that follows the last one closely, by a step or small leap, off the downbeat; `chance` of those
    glide: {
        roles: ['lead', 'counter', 'bass'],
        programs: [35, 38, 39, 40, 41, 42, 57, 80, 81, 82, 83, 84, 85, 86, 87],
        maxInterval: 5, maxGapBeats: 0.25, minBeats: 0.5, chance: 0.35, seconds: 0.08,
    },
    // late-arriving vibrato on held notes, for voices that sing: bowed strings, voices, brass, reeds, pipes, synth leads
    // ghost notes: very quiet, very short extra hits on empty sixteenths next to the backbeat (snare), and a dead
    // note just before a bass note; chance is scaled by the style's ghosts
    ghost: { minEnergy: 0.45, snare: { vel: [15, 35], beats: 0.1, chance: 0.5 }, bass: { vel: [18, 30], beats: 0.12, chance: 0.35 } },
    // in a run of three or more quick notes the inner ones are softer than the first and the last
    run: { roles: ['lead', 'counter', 'arp', 'bass'], maxGapBeats: 0.5, minNotes: 3, inner: 10 },
    // the +1 trick: start a semitone low and slide up, on phrase-ending notes and on a section's last chord;
    // chance is the style's scoops. programs: ranges of GM programs that can bend (organs, strings, ensembles, winds, synths)
    scoop: { roles: ['lead', 'counter', 'chords', 'pad'], programs: [[16, 23], [40, 44], [48, 95]], cents: -100, seconds: [0.05, 0.2] },
    vibrato: {
        roles: ['lead', 'counter'],
        programs: [40, 41, 42, 43, 52, 53, 54, 56, 57, 58, 59, 60, 64, 65, 66, 67, 68, 69, 72, 73, 74, 75, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 110],
        minSeconds: 0.6, rate: 5.5, rateSpread: 0.4, cents: 15, delay: 0.25, ramp: 0.35,
    },
};

// ---- Mix -------------------------------------------------------------------------------------------
// Each part's channel strip. volumeDb is the fader; pan −1..1; lowCut a high-pass in Hz, on everything but the kit
// and bass, to keep mud out of the low end; reverb and delay are send levels into the shared buses.
// Lead, bass and drums sit in the centre; the rest spread to the sides. Drums and bass stay dry, pads get the most reverb.
export const MIX = {
    lead:    { volumeDb: -2,  pan: 0,     lowCut: 150, reverb: 0.25, delay: 0.16 },
    counter: { volumeDb: -5,  pan: 0.4,   lowCut: 120, reverb: 0.3,  delay: 0.06 },
    arp:     { volumeDb: -8,  pan: -0.45, lowCut: 150, reverb: 0.3,  delay: 0.1 },
    chords:  { volumeDb: -6,  pan: -0.3,  lowCut: 120, reverb: 0.2,  delay: 0 },
    pad:     { volumeDb: -9,  pan: 0.3,   lowCut: 100, reverb: 0.55, delay: 0 },
    bass:    { volumeDb: -2,  pan: 0,     lowCut: 20,  reverb: 0,    delay: 0 },
    drums:   { volumeDb: -3,  pan: 0,     lowCut: 20,  reverb: 0.08, delay: 0 },
    sting:   { volumeDb: -3,  pan: 0,     lowCut: 150, reverb: 0.35, delay: 0.25 },     // stingers over the song
};
// a slow auto-pan on these parts' strips: rate in Hz, depth in pan units
export const AUTO_PAN = { arp: { rate: 0.11, depth: 0.3 } };
// On every kick, these parts dip by db for `seconds`: the clean, pumping low end of a sidechain, without one.
export const DUCK = { keys: [35, 36], seconds: 0.1, attack: 0.01, db: { bass: 4, pad: 3 } };
// How the mix moves through a song.
//   sweep: the tone filter on these parts closes at the start of a build (a pre-chorus) and opens across it;
//          a section rising into a chorus by `rise` energy or more sweeps over its last `bars` bars instead
//   reverb: every send is scaled up in outros, contrasting sections (bridges) and quiet sections
//   brightness: the tone filter's resting cutoff follows energy, from `low` Hz at 0 to `high` at 1, eased over a bar
//   swell: these parts' reverb sends rise by `amount` across each 4-bar phrase and fall back for the next
//   throw: a delay throw; these parts send `base` × their delay most of the time and `peak` × on a phrase's last note
export const MOVEMENT = {
    sweep: { roles: ['pad', 'arp', 'chords'], closed: 700, open: 20000, rise: 0.2, bars: 2 },
    reverb: { ending: 1.6, contrast: 1.25, quiet: 1.3, quietBelow: 0.4 },
    brightness: { roles: ['pad', 'arp', 'chords', 'counter'], low: 2500, high: 20000 },
    swell: { roles: ['pad'], amount: 1.5, bars: 4 },
    throw: { roles: ['lead'], base: 0.4, peak: 3 },
};
