// The chip instruments: waves, envelopes and filters that lib/chip-synth.js builds into a SoundFont in memory, so
// they play like any other preset (the keyboard lists them under "Bank 64"). Change or add one here to customise the
// chiptune sound; the fields are documented in chip-synth.js. Imports nothing.
//
// Programs keep their General MIDI family (80–87 leads, 38–39 synth bass, 46 a plucked arpeggio, 88–95 pads), so the
// composer's rules for that family (vibrato, slides, scoops) still apply. The "NES" ones are raw: no detune, no
// filter, no softening. The rest are the modern take: the same waves with their top end rounded off, two detuned
// layers for width, and gentler envelopes, so they sit in a mix without grating.

export const CHIP_URL = 'chip:';    // stands in for a .sf2 file's url
export const CHIP_BANK = 64;        // melodic chip instruments
export const CHIP_KIT_BANK = 192;   // chip drum kits (≥ 128, so they're played as kits)

// the chip instrument a part plays when its band's program has no chip version (spec `sound: 'chip'`)
export const CHIP_ROLES = { lead: 80, counter: 82, arp: 46, chords: 83, pad: 90, bass: 38, drums: 0 };

const WIDE = [{ detune: -5, pan: -0.2 }, { detune: 5, pan: 0.2 }];

export const CHIP_INSTRUMENTS = [
    { program: 80, name: 'Chip Pulse Lead', wave: { shape: 'pulse', duty: 0.25 }, soft: 0.35, layers: WIDE, level: -2,
        env: { attack: 0.004, decay: 0.4, sustain: 0.75, release: 0.08 }, filter: { hz: 7000 } },
    { program: 81, name: 'Chip Saw Lead', wave: { shape: 'saw' }, soft: 0.5, layers: WIDE, level: -2,
        env: { attack: 0.006, decay: 0.5, sustain: 0.7, release: 0.1 }, filter: { hz: 5000, q: 2 } },
    { program: 82, name: 'Chip Thin Pulse', wave: { shape: 'pulse', duty: 0.125 }, soft: 0.4, layers: WIDE, level: -3,
        env: { attack: 0.004, decay: 0.3, sustain: 0.6, release: 0.08 }, filter: { hz: 6500 } },
    { program: 83, name: 'Chip Hollow Square', wave: { shape: 'pulse', duty: 0.5 }, soft: 0.6, layers: WIDE, level: -3,
        env: { attack: 0.008, decay: 0.6, sustain: 0.7, release: 0.12 }, filter: { hz: 3500 } },
    { program: 84, name: 'Chip PWM Lead', wave: { shape: 'pwm', from: 0.12, to: 0.5 }, soft: 0.4, layers: WIDE, level: -2,
        env: { attack: 0.005, decay: 0.5, sustain: 0.8, release: 0.1 }, filter: { hz: 6000 } },
    { program: 85, name: 'Chip Soft Triangle', wave: { shape: 'triangle' }, soft: 0.2, level: 0,
        env: { attack: 0.01, decay: 0.5, sustain: 0.85, release: 0.12 } },
    { program: 86, name: 'NES Pulse 25%', wave: { shape: 'pulse', duty: 0.25 }, level: -5, velocityTone: false,
        env: { attack: 0.001, decay: 0.5, sustain: 0.8, release: 0.02 } },
    { program: 87, name: 'NES Pulse 50%', wave: { shape: 'pulse', duty: 0.5 }, level: -5, velocityTone: false,
        env: { attack: 0.001, decay: 0.5, sustain: 0.8, release: 0.02 } },
    { program: 38, name: 'NES Triangle Bass', wave: { shape: 'triangle', steps: 16 }, level: -3, velocityTone: false,
        env: { attack: 0.002, sustain: 1, release: 0.03 } },
    { program: 39, name: 'Chip Pulse Bass', wave: { shape: 'pulse', duty: 0.5 }, soft: 0.3, level: -2,
        layers: [{}, { octave: -1, level: -8 }],
        env: { attack: 0.003, decay: 0.25, sustain: 0.6, release: 0.06 }, filter: { hz: 900, q: 3, sweep: { octaves: 2, decay: 0.15, sustain: 0.2 } } },
    { program: 46, name: 'Chip Pluck', wave: { shape: 'pulse', duty: 0.25 }, soft: 0.45, layers: WIDE, level: -2,
        env: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.15 }, filter: { hz: 1500, q: 2, sweep: { octaves: 2.5, decay: 0.2, sustain: 0.1 } } },
    { program: 90, name: 'Chip PWM Pad', wave: { shape: 'pwm', from: 0.2, to: 0.5, cycles: 4 }, soft: 0.7, level: -4,
        layers: [{ detune: -9, pan: -0.4 }, { detune: 9, pan: 0.4 }, { octave: 1, level: -10 }],
        env: { attack: 0.35, decay: 1, sustain: 0.8, release: 0.6 }, filter: { hz: 2500 } },
];

// GM drum keys: 35/36 kick, 37 stick, 38/40 snare, 39 clap, 42/44/46 hats, 41–50 toms, 49/57 crash, 51/59 ride, 54 tambourine
const toms = (keys, hzs, wave)=> keys.map((k, i)=> ({ keys: [k], name: `tom ${k}`, tone: { wave, from: hzs[i] * 1.8, to: hzs[i], sweep: 0.05, decay: 0.35 } }));

export const CHIP_KITS = [
    { program: 0, name: 'Chip Kit', drums: [
        { keys: [35, 36], name: 'kick', tone: { from: 170, to: 48, sweep: 0.035, decay: 0.4 }, noise: { hz: 8000, decay: 0.015, level: 0.3 } },
        { keys: [38, 40], name: 'snare', tone: { wave: 'triangle', from: 260, to: 180, sweep: 0.02, decay: 0.12, level: 0.6 },
            noise: { hz: 30000, decay: 0.22, highpass: 800 } },
        { keys: [37], name: 'stick', tone: { wave: 'triangle', from: 900, decay: 0.03 }, level: -6 },
        { keys: [39], name: 'clap', noise: { hz: 20000, decay: 0.18, highpass: 1200 }, level: -2 },
        { keys: [42], name: 'closed hat', noise: { hz: 44100, decay: 0.05, highpass: 7000 }, choke: 1, level: -6 },
        { keys: [44], name: 'pedal hat', noise: { hz: 44100, decay: 0.08, highpass: 6000 }, choke: 1, level: -8 },
        { keys: [46], name: 'open hat', noise: { hz: 44100, decay: 0.35, highpass: 6000 }, choke: 1, level: -6 },
        { keys: [49, 52, 55, 57], name: 'crash', noise: { hz: 40000, decay: 1.4, highpass: 3000 }, level: -6 },
        { keys: [51, 53, 59], name: 'ride', noise: { mode: 'short', hz: 90000, decay: 0.8, highpass: 4000 }, level: -10 },
        { keys: [54], name: 'tambourine', noise: { mode: 'short', hz: 120000, decay: 0.12, highpass: 6000 }, level: -8 },
        ...toms([41, 43, 45, 47, 48, 50], [70, 85, 100, 120, 140, 165], 'sine'),
    ] },
    // all noise and triangle, as the 2A03 had it: the kick is the triangle dropping, the rest is the noise channel
    { program: 1, name: 'NES Kit', drums: [
        { keys: [35, 36], name: 'kick', tone: { wave: 'triangle', from: 220, to: 55, sweep: 0.03, decay: 0.15 }, noise: { hz: 2000, decay: 0.04, level: 0.4 } },
        { keys: [38, 40], name: 'snare', noise: { hz: 9000, to: 5000, decay: 0.18 } },
        { keys: [37], name: 'stick', noise: { mode: 'short', hz: 20000, decay: 0.03 }, level: -6 },
        { keys: [39], name: 'clap', noise: { hz: 12000, decay: 0.12 }, level: -3 },
        { keys: [42], name: 'closed hat', noise: { hz: 110000, decay: 0.04 }, choke: 1, level: -8 },
        { keys: [44], name: 'pedal hat', noise: { hz: 110000, decay: 0.06 }, choke: 1, level: -10 },
        { keys: [46], name: 'open hat', noise: { hz: 110000, decay: 0.3 }, choke: 1, level: -8 },
        { keys: [49, 52, 55, 57], name: 'crash', noise: { hz: 60000, decay: 1 }, level: -8 },
        { keys: [51, 53, 59], name: 'ride', noise: { mode: 'short', hz: 110000, decay: 0.6 }, level: -12 },
        { keys: [54], name: 'tambourine', noise: { mode: 'short', hz: 160000, decay: 0.1 }, level: -10 },
        ...toms([41, 43, 45, 47, 48, 50], [80, 100, 120, 145, 170, 200], 'triangle'),
    ] },
];
