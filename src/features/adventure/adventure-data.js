// The adaptive-music test level: a corridor walked left to right, through zones that raise the music's intensity, with
// coins, guards, a hidden alcove and an arena that switches the song to its second phase. Content only, imports nothing.
// World units; y is up, the corridor runs from y −5 to 5.

export const SONG = 'the-warden';
export const LEVEL = { length: 160, half: 5 };
export const PLAYER = { radius: 0.6, speed: 9, start: 3 };

// The music follows the zone: its intensity, blended over BLEND units either side of each boundary so the parts arrive
// as you approach rather than at a line. Entering a zone with a queue switches the song at the next bar.
export const BLEND = 6;
export const ZONES = [
    { name: 'Gatehouse', from: 0, intensity: 0.1, floor: [0.16, 0.17, 0.2] },
    { name: 'Torchlit hall', from: 35, intensity: 0.4, floor: [0.22, 0.17, 0.12] },
    { name: 'Guard room', from: 75, intensity: 0.65, floor: [0.2, 0.12, 0.13] },
    { name: 'The Warden’s arena', from: 115, intensity: 1, floor: [0.27, 0.08, 0.1], queue: { section: 'Phase two 1', at: 'bar' } },
];

// stingers for what happens: a coin, a guard's touch, the hidden alcove, the way out
export const STINGS = { coin: 'pickup', hit: 'fail', secret: 'secret', exit: 'levelUp' };

export const COINS = [
    [12, 2], [20, -3], [27, 0], [42, 3], [57, -2], [68, 1], [84, -4], [97, 3], [108, -1], [124, 2], [136, -3], [148, 0],
];

// guards pace up and down: y = range · sin(2π · rate · t + phase)
export const GUARDS = [
    { x: 82, range: 4, rate: 0.35, phase: 0 },
    { x: 93, range: 4, rate: 0.45, phase: 1.5 },
    { x: 104, range: 4, rate: 0.4, phase: 3 },
    { x: 130, range: 4.2, rate: 0.55, phase: 0.7 },
    { x: 143, range: 4.2, rate: 0.6, phase: 2.4 },
];
export const GUARD = { radius: 0.8, knockback: 6, safeSeconds: 1.5 };

// an alcove off the hall's north wall; reaching its back wall finds the secret
export const ALCOVE = { from: 50, to: 54, depth: 4 };

// walking past here ends the level; the scene closes this long after
export const EXIT = { x: 157, closeSeconds: 4 };
