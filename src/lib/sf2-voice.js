// Turns an SF2 region + key + velocity into the numbers a sampler needs. Pure, like sf2.js.
import { GEN } from './sf2.js';

// SF2 units → plain ones
export const timecentsToSeconds = (tc)=> tc <= -12000 ? 0 : 2 ** (tc / 1200);
export const centibelsToGain = (cb)=> 10 ** (-Math.max(0, cb) / 200);
export const absoluteCentsToHz = (c)=> 8.176 * 2 ** (c / 1200);

// Many SoundFonts are voiced for E-mu hardware, which applied only 40% of initialAttenuation.
// FluidSynth and most players copy that, and many fonts sound far too quiet without it.
const ATTENUATION_SCALE = 0.4;

// Soft notes are darker as well as quieter, as on a real instrument: the cutoff falls this many cents (three
// octaves) from full velocity to none. SF2's default velocity→cutoff modulator does the same with 2400. A font
// that sets its own velocity→cutoff modulator (even to 0) replaces this one, as the spec's identical default would be.
export const VELOCITY_CUTOFF_CENTS = 3600;
// at or above this the filter is fully open and is left out; the spec's cutoff range is 1500..13500 (20 Hz..20 kHz)
const OPEN_CUTOFF = 13500, MIN_CUTOFF = 1500;

// Modulator sources (SF2.04 §8.2.1): bits 0–6 the controller, 7 a MIDI CC, 8 max→min, 9 bipolar, 10–15 the curve.
// Only the note's own velocity and key are known when a voice starts, so only modulators driven by those (or by no
// controller, a constant) apply; ones on CCs, pressure or the pitch wheel sit at rest and are left out. Velocity →
// attenuation is left out too: the gain's own velocity curve stands in for it.
const SOURCE = { none: 0, velocity: 2, key: 3 };
const VELOCITY_ATTENUATION = 48;

/**
 * @returns {{ start: number, end: number, loopStart: number, loopEnd: number, loopMode: number,
 *   sampleRate: number, playbackRate: number, gain: number, pan: number,
 *   filter: { hz: number, q: number, sweep: { cents: number, delay: number, attack: number, hold: number, decay: number,
 *     sustain: number, release: number } | null } | null,
 *   env: { delay: number, attack: number, hold: number, decay: number, sustain: number, release: number },
 *   exclusiveClass: number }}
 *   frames are absolute indexes into sampleData; loopMode 0 = none, 1 = loop, 3 = loop until release
 */
export function voiceParams(region, key, velocity)
{
    const s = region.sample;
    if (region.gen[GEN.keynum] >= 0) key = region.gen[GEN.keynum];
    if (region.gen[GEN.velocity] >= 0) velocity = region.gen[GEN.velocity];
    const g = modulated(region, key, velocity);

    const root = g[GEN.overridingRootKey] >= 0 ? g[GEN.overridingRootKey] : s.originalPitch;
    const cents = (key - root) * g[GEN.scaleTuning] + g[GEN.coarseTune] * 100 + g[GEN.fineTune] + s.pitchCorrection;

    const fc = Math.max(MIN_CUTOFF, Math.min(OPEN_CUTOFF, g[GEN.initialFilterFc]));
    // keynum-to-hold/decay scale those times per key away from middle C
    const keyScale = (base, perKey)=> timecentsToSeconds(base + perKey * (60 - key));
    // the modulation envelope moves the cutoff by up to `cents`; many fonts start a filter low and open it this way
    const toFc = g[GEN.modEnvToFilterFc];
    const sweep = toFc ? {
        cents: toFc,
        delay: timecentsToSeconds(g[GEN.delayModEnv]),
        attack: timecentsToSeconds(g[GEN.attackModEnv]),
        hold: keyScale(g[GEN.holdModEnv], g[GEN.keynumToModEnvHold]),
        decay: keyScale(g[GEN.decayModEnv], g[GEN.keynumToModEnvDecay]),
        sustain: 1 - Math.max(0, Math.min(1000, g[GEN.sustainModEnv])) / 1000,
        release: timecentsToSeconds(g[GEN.releaseModEnv]),
    } : null;

    return {
        start: s.start + g[GEN.startAddrsOffset] + g[GEN.startAddrsCoarseOffset] * 32768,
        end: s.end + g[GEN.endAddrsOffset] + g[GEN.endAddrsCoarseOffset] * 32768,
        loopStart: s.loopStart + g[GEN.startloopAddrsOffset] + g[GEN.startloopAddrsCoarseOffset] * 32768,
        loopEnd: s.loopEnd + g[GEN.endloopAddrsOffset] + g[GEN.endloopAddrsCoarseOffset] * 32768,
        loopMode: g[GEN.sampleModes] & 3,
        sampleRate: s.sampleRate,
        playbackRate: 2 ** (cents / 1200),
        // velocity curve: SF2's default velocity→attenuation modulator is close to a square law
        gain: centibelsToGain(g[GEN.initialAttenuation] * ATTENUATION_SCALE) * (velocity / 127) ** 2,
        pan: Math.max(-1, Math.min(1, g[GEN.pan] / 500)),
        filter: fc < OPEN_CUTOFF || toFc < 0 ? { hz: absoluteCentsToHz(fc), q: Math.max(0, g[GEN.initialFilterQ] / 10), sweep } : null,
        env: {
            delay: timecentsToSeconds(g[GEN.delayVolEnv]),
            attack: timecentsToSeconds(g[GEN.attackVolEnv]),
            hold: keyScale(g[GEN.holdVolEnv], g[GEN.keynumToVolEnvHold]),
            decay: keyScale(g[GEN.decayVolEnv], g[GEN.keynumToVolEnvDecay]),
            sustain: centibelsToGain(Math.min(1440, g[GEN.sustainVolEnv])),
            release: timecentsToSeconds(g[GEN.releaseVolEnv]),
        },
        exclusiveClass: g[GEN.exclusiveClass],
    };
}

/**
 * The region's generators with its note-time modulators added, plus the default velocity→cutoff one unless the
 * font sets its own.
 * @returns {Float64Array}
 */
export function modulated(region, key, velocity)
{
    const g = Float64Array.from(region.gen);
    const mods = region.mods ?? [];
    const own = mods.some(m => m.dest === GEN.initialFilterFc && (m.src & 0xff) === SOURCE.velocity);
    if (!own) g[GEN.initialFilterFc] -= VELOCITY_CUTOFF_CENTS * (1 - velocity / 127);
    for (const m of mods)
    {
        if (m.dest === VELOCITY_ATTENUATION && (m.src & 0xff) === SOURCE.velocity) continue;
        const a = sourceValue(m.src, key, velocity), b = sourceValue(m.amountSrc, key, velocity);
        if (a === null || b === null || m.dest >= g.length) continue;
        g[m.dest] += m.amount * a * b;
    }
    return g;
}

/**
 * A modulator source's value for this note, -1..1, or null for a source that isn't known at note-on.
 * @param {number} src  the 16-bit source encoding
 */
export function sourceValue(src, key, velocity)
{
    const index = src & 0x7f, cc = src & 0x80;
    if (cc) return null;
    const raw = index === SOURCE.none ? 1 : index === SOURCE.velocity ? velocity / 127 : index === SOURCE.key ? key / 127 : null;
    if (raw === null) return null;
    if (index === SOURCE.none) return 1;
    const x = src & 0x100 ? 1 - raw : raw, curve = (src >> 10) & 0x3f;
    const shape = (v)=> curve === 1 ? concave(v) : curve === 2 ? 1 - concave(1 - v) : curve === 3 ? (v >= 0.5 ? 1 : 0) : v;
    if (!(src & 0x200)) return shape(x);
    // bipolar: the curve runs out from the middle in both directions
    if (curve === 3) return x >= 0.5 ? 1 : -1;
    return x >= 0.5 ? shape(2 * x - 1) : -shape(1 - 2 * x);
}
// the spec's concave curve: slow at first, then steep, like an amplitude in dB
const concave = (x)=> x >= 1 ? 1 : x <= 0 ? 0 : Math.min(1, -20 / 96 * Math.log10((1 - x) ** 2));

/**
 * How far the modulation envelope has moved the cutoff `elapsed` seconds after note-on, in cents: a linear attack to
 * `cents`, hold, then a linear fall to `cents` × sustain over the decay. Matches how soundfont.js schedules it.
 */
export function sweepCents(sweep, elapsed, minAttack = 0)
{
    const t = elapsed - sweep.delay, attack = Math.max(sweep.attack, minAttack);
    if (t <= 0) return 0;
    if (t < attack) return sweep.cents * t / attack;
    const d = t - attack - sweep.hold;
    if (d <= 0) return sweep.cents;
    const p = Math.min(1, d / Math.max(sweep.decay, 0.001));
    return sweep.cents * (1 - p * (1 - sweep.sustain));
}

// SF2 envelope times run from full level to -100 dB; that's this many exponential time constants
export const ENV_TIME_CONSTANTS = 100 / 20 * Math.LN10;

/**
 * Volume envelope level `elapsed` seconds after note-on, matching how soundfont.js schedules it:
 * delay, linear attack to peak, hold, then an exponential approach to peak * sustain.
 * Computed rather than read back from Web Audio, which not every browser reports mid-automation.
 */
export function envelopeLevel(env, peak, elapsed, minAttack = 0)
{
    const attack = Math.max(env.attack, minAttack);
    const t = elapsed - env.delay;
    if (t <= 0) return 0;
    if (t < attack) return peak * t / attack;
    const decayT = t - attack - env.hold;
    if (decayT <= 0) return peak;
    const floor = peak * env.sustain;
    return floor + (peak - floor) * Math.exp(-decayT * ENV_TIME_CONSTANTS / Math.max(env.decay, 0.001));
}

/**
 * A voice's level `elapsed` seconds after note-on, through its release once that has begun.
 * release: { at, level, seconds } (at in seconds after note-on), or null. A release scheduled for later (notes are
 * scheduled ahead) hasn't begun: until then the voice is still in its envelope.
 */
export function voiceLevel(env, peak, elapsed, release, minAttack = 0)
{
    if (!release || elapsed < release.at) return envelopeLevel(env, peak, elapsed, minAttack);
    return release.level * Math.exp(-(elapsed - release.at) * ENV_TIME_CONSTANTS / release.seconds);
}
