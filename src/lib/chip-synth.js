// Chip-style instruments made in code: band-limited pulse, PWM, triangle, saw and sine waves, and drum one-shots
// from LFSR noise and swept tones, built into the same shape parseSf2 returns ({ name, sampleData, samples, presets }),
// so the SoundFont player plays them with its envelopes, filter, vibrato and glides. Pure: definitions in, font out.
//
// A melodic instrument stores one cycle of its wave per key zone (a pulse-width sweep stores a run of cycles), each
// with only the harmonics that stay under TOP_HZ at the zone's highest key: no aliasing, so the high notes don't hiss.
// `soft` rolls the harmonics off further, which is most of the difference between a raw NES square and a modern one.
import { GEN, defaultGenerators } from './sf2.js';

export const CHIP_RATE = 44100;     // drum one-shots are rendered at this rate
const CYCLE = 512;                  // samples in one stored cycle
const ROOT = 36;                    // the key a stored cycle plays at its own rate (its sample rate makes it exact)
const TOP_HZ = 18000;               // no harmonic above this at a zone's highest key
const SPECTRUM = 2048;              // points the wave is sampled at to find its harmonics
const ZONES = [[0, 47], [48, 59], [60, 71], [72, 83], [84, 95], [96, 107], [108, 127]];
const TARGET_RMS = 0.3;             // every instrument's level before its own `level`
const hz = (key)=> 440 * 2 ** ((key - 69) / 12);

/**
 * @typedef {{ shape: 'pulse', duty: number } | { shape: 'pwm', from: number, to: number, frames?: number, cycles?: number }
 *   | { shape: 'triangle' | 'saw', steps?: number } | { shape: 'sine' }} Wave
 *   pulse: duty 0.125, 0.25 or 0.5 are the NES's; pwm: the duty sweeps from → to → from over `frames` steps of
 *   `cycles` cycles each (so the sweep speeds up with pitch, like a key-tracked LFO); steps: quantise to that many
 *   levels (the NES triangle has 16)
 * @typedef {{ program: number, name: string, wave: Wave, soft?: number, level?: number,
 *   layers?: { detune?: number, pan?: number, octave?: number, level?: number }[],
 *   env?: { attack?: number, hold?: number, decay?: number, sustain?: number, release?: number },
 *   filter?: { hz: number, q?: number, sweep?: { octaves: number, attack?: number, decay?: number, sustain?: number, release?: number } },
 *   velocityTone?: boolean }} ChipInstrument
 *   soft: harmonic n is scaled by n^-soft (0 raw, 1 about a triangle's slope on top of the wave's own);
 *   level, layers' level: dB; detune: cents; pan: -1..1; env times in seconds, sustain a gain 0..1;
 *   filter: a low-pass at `hz`, its sweep opening it by `octaves` and settling to sustain × that;
 *   velocityTone false: soft notes aren't darker, only quieter
 * @typedef {{ wave?: 'sine' | 'triangle' | 'square', from: number, to?: number, sweep?: number, decay: number, level?: number }} DrumTone
 *   a pitch falling from `from` Hz towards `to` (time constant `sweep` s); decay: seconds to fall 60 dB
 * @typedef {{ mode?: 'long' | 'short', hz: number, to?: number, decay: number, level?: number, highpass?: number }} DrumNoise
 *   NES-style LFSR noise clocked at `hz` (gliding to `to`); short mode is the metallic 93-step loop
 * @typedef {{ keys: number[], name: string, tone?: DrumTone, noise?: DrumNoise, level?: number, pan?: number, choke?: number }} ChipDrum
 * @typedef {{ program: number, name: string, drums: ChipDrum[] }} ChipKit
 */

/**
 * @param {{ name?: string, bank: number, kitBank: number, instruments: ChipInstrument[], kits: ChipKit[] }} defs
 */
export function buildChipFont({ name = 'Chip', bank, kitBank, instruments, kits })
{
    const chunks = [], samples = [];
    let length = 0;
    const addSample = (data, extra)=>
    {
        const start = length;
        chunks.push(data);
        length += data.length;
        const sample = { name: extra.name, start, end: length, loopStart: start, loopEnd: length, pitchCorrection: 0, type: 1, ...extra };
        samples.push(sample);
        return sample;
    };

    const presets = instruments.map(ins =>
    {
        const zones = waveZones(ins.wave, ins.soft ?? 0);
        const stored = zones.map((data, z)=> addSample(toInt16(data), { name: `${ins.name} ${z}`, sampleRate: Math.round(CYCLE * hz(ROOT)), originalPitch: ROOT }));
        const regions = [];
        for (const layer of ins.layers ?? [{}])
        {
            const shift = 12 * (layer.octave ?? 0);
            ZONES.forEach(([lo, hi], z)=>
            {
                const keyLo = Math.max(0, lo - shift), keyHi = Math.min(127, hi - shift);
                if (keyLo > keyHi) return;
                const gen = melodicGenerators(ins, layer);
                gen[GEN.sampleModes] = 1;
                gen[GEN.overridingRootKey] = ROOT;
                regions.push({ keyLo, keyHi, velLo: 0, velHi: 127, sample: stored[z], gen, mods: velocityMods(ins) });
            });
        }
        return { name: ins.name, bank, program: ins.program, regions };
    });

    for (const kit of kits)
    {
        const regions = [];
        for (const drum of kit.drums)
        {
            const data = drumSample(drum);
            const sample = addSample(toInt16(data), { name: `${kit.name} ${drum.name}`, sampleRate: CHIP_RATE, originalPitch: 60 });
            for (const key of drum.keys)
            {
                const gen = defaultGenerators();
                gen[GEN.overridingRootKey] = key;          // every key plays its sample as recorded
                gen[GEN.initialAttenuation] = attenuation(drum.level ?? 0);
                gen[GEN.pan] = Math.round((drum.pan ?? 0) * 500);
                gen[GEN.exclusiveClass] = drum.choke ?? 0;
                gen[GEN.releaseVolEnv] = timecents(data.length / CHIP_RATE);    // a short note doesn't cut the hit
                regions.push({ keyLo: key, keyHi: key, velLo: 0, velHi: 127, sample, gen, mods: [] });
            }
        }
        presets.push({ name: kit.name, bank: kitBank, program: kit.program, regions });
    }

    const sampleData = new Int16Array(length);
    let at = 0;
    for (const c of chunks) { sampleData.set(c, at); at += c.length; }
    presets.sort((a, b)=> a.bank - b.bank || a.program - b.program);
    return { name, sampleData, samples, presets };
}

// seconds → SF2 timecents; dB (negative = quieter) → centibels of attenuation, before the player's 0.4 scaling
const timecents = (s)=> s > 0 ? Math.round(1200 * Math.log2(s)) : -12000;
const attenuation = (db)=> Math.max(0, Math.round(-db * 10 / 0.4));

function melodicGenerators(ins, layer)
{
    const gen = defaultGenerators();
    const env = ins.env ?? {};
    gen[GEN.fineTune] = Math.round(layer.detune ?? 0);
    gen[GEN.coarseTune] = 12 * (layer.octave ?? 0);
    gen[GEN.pan] = Math.round((layer.pan ?? 0) * 500);
    gen[GEN.initialAttenuation] = attenuation((ins.level ?? 0) + (layer.level ?? 0));
    gen[GEN.attackVolEnv] = timecents(env.attack ?? 0.003);
    gen[GEN.holdVolEnv] = timecents(env.hold ?? 0);
    gen[GEN.decayVolEnv] = timecents(env.decay ?? 0.3);
    const sustain = env.sustain ?? 1;
    gen[GEN.sustainVolEnv] = sustain <= 0 ? 1440 : Math.min(1440, Math.round(-200 * Math.log10(sustain)));
    gen[GEN.releaseVolEnv] = timecents(env.release ?? 0.05);
    if (ins.filter)
    {
        gen[GEN.initialFilterFc] = Math.round(1200 * Math.log2(ins.filter.hz / 8.176));
        gen[GEN.initialFilterQ] = Math.round((ins.filter.q ?? 0) * 10);
        const sweep = ins.filter.sweep;
        if (sweep)
        {
            gen[GEN.modEnvToFilterFc] = Math.round(sweep.octaves * 1200);
            gen[GEN.attackModEnv] = timecents(sweep.attack ?? 0.002);
            gen[GEN.decayModEnv] = timecents(sweep.decay ?? 0.3);
            gen[GEN.sustainModEnv] = Math.round((1 - (sweep.sustain ?? 0)) * 1000);
            gen[GEN.releaseModEnv] = timecents(sweep.release ?? env.release ?? 0.05);
        }
    }
    return gen;
}

// a velocity→cutoff modulator of 0 replaces the player's default one, so soft notes keep their brightness
const velocityMods = (ins)=> ins.velocityTone === false ? [{ src: 2, dest: GEN.initialFilterFc, amount: 0, amountSrc: 0 }] : [];

/** the wave's value at phase 0..1, before band-limiting */
function waveAt(wave, phase, duty)
{
    const quantise = (v)=> wave.steps ? Math.round((v + 1) / 2 * (wave.steps - 1)) / (wave.steps - 1) * 2 - 1 : v;
    switch (wave.shape)
    {
        case 'pulse': case 'pwm': return phase < duty ? 1 : -1;
        case 'triangle': return quantise(phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase);
        case 'saw': return quantise(1 - 2 * phase);
        case 'sine': return Math.sin(2 * Math.PI * phase);
        default: throw new Error(`unknown chip wave: ${wave.shape}`);
    }
}

// the most harmonics any zone keeps: the lowest zone's
const MAX_HARMONIC = Math.min(CYCLE / 2 - 1, Math.floor(TOP_HZ / hz(ZONES[0][1])));

/** harmonics 1..MAX_HARMONIC of one cycle: cosine and sine amplitudes */
export function harmonics(wave, duty = 0)
{
    const n = MAX_HARMONIC, cos = new Float64Array(n + 1), sin = new Float64Array(n + 1);
    const points = Float64Array.from({ length: SPECTRUM }, (_, i)=> waveAt(wave, (i + 0.5) / SPECTRUM, duty));
    for (let h = 1; h <= n; h++)
    {
        let a = 0, b = 0;
        for (let i = 0; i < SPECTRUM; i++)
        {
            const ang = 2 * Math.PI * h * (i + 0.5) / SPECTRUM;
            a += points[i] * Math.cos(ang);
            b += points[i] * Math.sin(ang);
        }
        cos[h] = 2 * a / SPECTRUM;
        sin[h] = 2 * b / SPECTRUM;
    }
    return { cos, sin };
}

// instruments often share a wave (and a pulse-width sweep shares its duties), so each spectrum is found once
const spectra = new Map();
function spectrumOf(wave, duty)
{
    const id = `${wave.shape}:${wave.steps ?? 0}:${duty}`;
    if (!spectra.has(id)) spectra.set(id, harmonics(wave, duty));
    return spectra.get(id);
}

/** one Float32Array per zone: a cycle (or a pulse-width sweep of cycles) holding the harmonics that zone can play */
export function waveZones(wave, soft = 0)
{
    const duties = wave.shape === 'pwm' ? sweepDuties(wave) : [wave.shape === 'pulse' ? wave.duty : 0];
    const cycles = wave.shape === 'pwm' ? (wave.cycles ?? 6) : 1;
    const spectra = duties.map(d => spectrumOf(wave, d));
    const table = Float64Array.from({ length: CYCLE }, (_, i)=> Math.cos(2 * Math.PI * i / CYCLE));
    const sinAt = (i)=> table[(i + CYCLE * 3 / 4) % CYCLE];        // sin(x) = cos(x − π/2)
    const zones = ZONES.map(([, hi])=>
    {
        const top = Math.max(1, Math.min(MAX_HARMONIC, Math.floor(TOP_HZ / hz(hi))));
        const out = new Float32Array(CYCLE * cycles * duties.length);
        spectra.forEach(({ cos, sin }, f)=>
        {
            const one = new Float32Array(CYCLE);
            for (let h = 1; h <= top; h++)
            {
                const g = h ** -soft, a = cos[h] * g, b = sin[h] * g;
                if (!a && !b) continue;
                for (let i = 0; i < CYCLE; i++) { const k = (h * i) % CYCLE; one[i] += a * table[k] + b * sinAt(k); }
            }
            for (let c = 0; c < cycles; c++) out.set(one, (f * cycles + c) * CYCLE);
        });
        return out;
    });
    // one scale for every zone, from the fullest (lowest) one, so the level holds across the keyboard
    const rms = Math.sqrt(zones[0].reduce((s, v)=> s + v * v, 0) / zones[0].length) || 1;
    for (const z of zones) for (let i = 0; i < z.length; i++) z[i] *= TARGET_RMS / rms;
    return zones;
}

// the duty for each step of a pulse-width sweep: from → to → from, eased so it turns smoothly at both ends
const sweepDuties = ({ from, to, frames = 24 })=> Array.from({ length: frames }, (_, f)=> from + (to - from) * (0.5 - 0.5 * Math.cos(2 * Math.PI * f / frames)));

/** NES-style noise: a 15-bit LFSR clocked at `hz` (gliding to `to`), output ±1 */
export function lfsrNoise(length, rate, hz, to = hz, short = false)
{
    const out = new Float32Array(length);
    let reg = 1, acc = 0, v = 1;
    for (let i = 0; i < length; i++)
    {
        acc += hz * (to / hz) ** (i / length) / rate;
        while (acc >= 1)
        {
            acc -= 1;
            const bit = (reg ^ (reg >> (short ? 6 : 1))) & 1;
            reg = (reg >> 1) | (bit << 14);
            v = reg & 1 ? -1 : 1;
        }
        out[i] = v;
    }
    return out;
}

/** a drum hit rendered at CHIP_RATE, peaking at 0.8 */
export function drumSample({ tone, noise })
{
    const fade = (decay)=> (t)=> Math.exp(-t * 6.91 / decay);      // 60 dB over `decay`
    const seconds = Math.max(tone?.decay ?? 0, noise?.decay ?? 0, 0.01);
    const n = Math.ceil(seconds * CHIP_RATE), out = new Float32Array(n);
    if (tone)
    {
        const to = tone.to ?? tone.from, amp = fade(tone.decay), level = tone.level ?? 1;
        let phase = 0;
        for (let i = 0; i < n; i++)
        {
            const t = i / CHIP_RATE;
            phase = (phase + (to + (tone.from - to) * Math.exp(-t / (tone.sweep ?? 0.03))) / CHIP_RATE) % 1;
            const w = tone.wave === 'triangle' ? (phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase) : tone.wave === 'square' ? (phase < 0.5 ? 1 : -1) : Math.sin(2 * Math.PI * phase);
            out[i] += w * amp(t) * level;
        }
    }
    if (noise)
    {
        const raw = lfsrNoise(n, CHIP_RATE, noise.hz, noise.to ?? noise.hz, noise.mode === 'short');
        const amp = fade(noise.decay), level = noise.level ?? 1;
        // a one-pole high-pass takes the thump out of hats and cymbals
        const k = noise.highpass ? Math.exp(-2 * Math.PI * noise.highpass / CHIP_RATE) : 0;
        let lastIn = 0, lastOut = 0;
        for (let i = 0; i < n; i++)
        {
            let x = raw[i];
            if (k) { lastOut = k * (lastOut + x - lastIn); lastIn = x; x = lastOut; }
            out[i] += x * amp(i / CHIP_RATE) * level;
        }
    }
    // a millisecond's fade-in, so the hit doesn't click
    for (let i = 0; i < Math.min(n, 44); i++) out[i] *= i / 44;
    const peak = out.reduce((m, v)=> Math.max(m, Math.abs(v)), 0) || 1;
    for (let i = 0; i < n; i++) out[i] *= 0.8 / peak;
    return out;
}

const toInt16 = (data)=> Int16Array.from(data, v => Math.max(-32768, Math.min(32767, Math.round(v * 32767))));
