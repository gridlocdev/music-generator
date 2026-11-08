// Ear candy: small details at structural points (the end of every `everyBars` bars, and section starts), each with a
// low chance and a cooldown so it never overdoes anything. chance is scaled by the style's earCandy. Content only.
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
