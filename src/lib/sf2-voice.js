// Turns an SF2 region + key + velocity into the numbers a sampler needs. Pure, like sf2.js.
import { GEN } from './sf2.js';

// SF2 units → plain ones
export const timecentsToSeconds = (tc)=> tc <= -12000 ? 0 : 2 ** (tc / 1200);
export const centibelsToGain = (cb)=> 10 ** (-Math.max(0, cb) / 200);
export const absoluteCentsToHz = (c)=> 8.176 * 2 ** (c / 1200);

// Many SoundFonts are voiced for E-mu hardware, which applied only 40% of initialAttenuation.
// FluidSynth and most players copy that, and many fonts sound far too quiet without it.
const ATTENUATION_SCALE = 0.4;

/**
 * @returns {{ start: number, end: number, loopStart: number, loopEnd: number, loopMode: number,
 *   sampleRate: number, playbackRate: number, gain: number, pan: number,
 *   filter: { hz: number, q: number } | null,
 *   env: { delay: number, attack: number, hold: number, decay: number, sustain: number, release: number },
 *   exclusiveClass: number }}
 *   frames are absolute indexes into sampleData; loopMode 0 = none, 1 = loop, 3 = loop until release
 */
export function voiceParams(region, key, velocity)
{
    const g = region.gen, s = region.sample;
    if (g[GEN.keynum] >= 0) key = g[GEN.keynum];
    if (g[GEN.velocity] >= 0) velocity = g[GEN.velocity];

    const root = g[GEN.overridingRootKey] >= 0 ? g[GEN.overridingRootKey] : s.originalPitch;
    const cents = (key - root) * g[GEN.scaleTuning] + g[GEN.coarseTune] * 100 + g[GEN.fineTune] + s.pitchCorrection;

    const fc = g[GEN.initialFilterFc];
    // keynum-to-hold/decay scale those times per key away from middle C
    const keyScale = (base, perKey)=> timecentsToSeconds(base + perKey * (60 - key));

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
        filter: fc < 13500 ? { hz: absoluteCentsToHz(fc), q: Math.max(0, g[GEN.initialFilterQ] / 10) } : null,
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
