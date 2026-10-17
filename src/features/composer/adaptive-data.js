// Game music: which parts play at each gameplay intensity, the stingers that answer game events, and the
// ear-candy layer. Content only, imports nothing. docs/COMPOSING.md, "Adaptive music", explains them.

// Vertical layering: a part plays when the intensity (0 calm … 1 combat) reaches its threshold, fading over LAYER_FADE_BARS.
// Calm keeps the pad and bass; the lead and drums arrive as things heat up.
export const LAYERS = { pad: 0, bass: 0, chords: 0.2, lead: 0.35, arp: 0.45, drums: 0.6, counter: 0.8 };
export const LAYER_FADE_BARS = 1;

// Stingers: short cues for game events, played on the next beat in the key of the section that's playing, on the first
// of `roles` the song has. notes: degree notation in the section's mode; semitones: [above the tonic, beats] pairs.
export const STINGERS = {
    pickup:  { roles: ['arp', 'lead'], vel: 90, notes: '1:0.25 3:0.25 5:0.25 8:0.75' },
    levelUp: { roles: ['lead', 'arp'], vel: 100, notes: "5,:0.25 1:0.25 3:0.25 5:0.5 3:0.25 5:0.25 8:1.5" },
    secret:  { roles: ['arp', 'lead'], vel: 80, notes: '1:0.25 3:0.25 #4:0.25 5:0.25 7:0.25 8:0.25 10:0.25 #11:0.25 12:1.5' },
    // the cartoon "uh-oh": a diminished seventh falling in minor thirds, left unresolved
    fail:    { roles: ['lead', 'chords'], vel: 85, semitones: [[20, 0.25], [17, 0.25], [14, 0.25], [11, 1.5]] },
};

// Ear candy: small details at structural points (the end of every `everyBars` bars, and section starts), each with a
// low chance and a cooldown so it never overdoes anything. chance is scaled by the style's earCandy.
//   riser     a section's first chord slides up an octave into place (detune −1200 → 0), when energy rises by minRise
//   accent    a bright, short note high above beat 1 of a loud section, next to the crash
//   flourish  the bar's chord an octave or two up, as sixteenths over its last beat, with the delay send swelling
//   tapeStop  everything winds down in pitch and speed into a breakdown, bridge or drop
export const EAR_CANDY = {
    everyBars: 4, cooldownBars: 8, chance: 0.6,
    riser:    { roles: ['chords', 'pad'], cents: -1200, seconds: 0.15, minRise: 0.1 },
    accent:   { roles: ['arp', 'lead'], octave: 6, beats: 0.5, vel: 72, minEnergy: 0.6 },
    flourish: { roles: ['arp'], octaves: [1, 2], step: 0.25, vel: 58, send: 0.6 },
    tapeStop: { into: ['breakdown', 'bridge', 'drop'], seconds: 0.6, rate: 0.05 },
};
