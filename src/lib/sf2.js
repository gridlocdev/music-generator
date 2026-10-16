// SoundFont 2 (.sf2) parser. Pure: takes an ArrayBuffer, returns presets resolved to playable regions.
// No engine, no DOM, no Web Audio, so it runs under node --test and in tools/.
//
// parseSf2(buffer) → {
//   name,                               INFO/INAM
//   sampleData: Int16Array,             all 16-bit sample frames (sdta/smpl)
//   samples: [{ name, start, end, loopStart, loopEnd, sampleRate, originalPitch, pitchCorrection, type }],
//   presets: [{ name, bank, program, regions: [region] }],   sorted by bank, program
// }
// A region is one sample played over a key/velocity range:
//   { keyLo, keyHi, velLo, velHi, sample, gen: Int16Array(61) }  where gen holds final generator values
//   (instrument value + preset offset), indexed by GEN ids below.

export const GEN = {
    startAddrsOffset: 0, endAddrsOffset: 1, startloopAddrsOffset: 2, endloopAddrsOffset: 3,
    startAddrsCoarseOffset: 4, initialFilterFc: 8, initialFilterQ: 9, endAddrsCoarseOffset: 12,
    pan: 17, delayVolEnv: 33, attackVolEnv: 34, holdVolEnv: 35, decayVolEnv: 36, sustainVolEnv: 37,
    releaseVolEnv: 38, keynumToVolEnvHold: 39, keynumToVolEnvDecay: 40, instrument: 41, keyRange: 43,
    velRange: 44, startloopAddrsCoarseOffset: 45, keynum: 46, velocity: 47, initialAttenuation: 48,
    endloopAddrsCoarseOffset: 50, coarseTune: 51, fineTune: 52, sampleID: 53, sampleModes: 54,
    scaleTuning: 56, exclusiveClass: 57, overridingRootKey: 58,
};
const GEN_COUNT = 61;

// spec defaults (SF2.04 §8.1.3); everything not listed defaults to 0
const DEFAULTS = new Int16Array(GEN_COUNT);
DEFAULTS[GEN.initialFilterFc] = 13500;
for (const g of [21, 23, 25, 26, 27, 28, 30, 33, 34, 35, 36, 38]) DEFAULTS[g] = -12000;   // envelope/LFO times
DEFAULTS[GEN.scaleTuning] = 100;
DEFAULTS[GEN.overridingRootKey] = -1;
DEFAULTS[GEN.keynum] = -1;
DEFAULTS[GEN.velocity] = -1;

// generators a preset zone may not set, or that don't add (ranges are intersected separately)
const NOT_ADDITIVE = new Set([0, 1, 2, 3, 4, 12, 41, 43, 44, 45, 46, 47, 50, 53, 54, 57, 58]);

export function parseSf2(buffer)
{
    const view = new DataView(buffer);
    const tag = (o)=> String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
    if (tag(0) !== 'RIFF' || tag(8) !== 'sfbk') throw new Error('not a SoundFont 2 file');

    // collect the sub-chunks of each top-level LIST (INFO, sdta, pdta) by id
    const chunks = {};
    for (let o = 12; o + 8 <= view.byteLength;)
    {
        const size = view.getUint32(o + 4, true);
        if (tag(o) === 'LIST')
        {
            for (let c = o + 12, end = o + 8 + size; c + 8 <= end;)
            {
                const csize = view.getUint32(c + 4, true);
                chunks[tag(c)] = { offset: c + 8, size: csize };
                c += 8 + csize + (csize & 1);
            }
        }
        o += 8 + size + (size & 1);
    }
    for (const id of ['smpl', 'phdr', 'pbag', 'pgen', 'inst', 'ibag', 'igen', 'shdr'])
        if (!chunks[id]) throw new Error(`SoundFont is missing its ${id} chunk`);

    const text = (o, n)=>
    {
        let s = '';
        for (let i = 0; i < n; i++) { const c = view.getUint8(o + i); if (!c) break; s += String.fromCharCode(c); }
        return s.trim();
    };
    // fixed-size records; the last one in each list is a terminator that only bounds the one before it
    const records = (id, size, read)=>
    {
        const { offset, size: total } = chunks[id];
        const out = [];
        for (let i = 0; i < total / size; i++) out.push(read(offset + i * size));
        return out;
    };

    const smpl = chunks.smpl;
    // Int16Array needs an even byte offset; RIFF word alignment gives one, but copy if a file breaks the rule
    const sampleData = smpl.offset % 2 === 0
        ? new Int16Array(buffer, smpl.offset, smpl.size >> 1)
        : new Int16Array(buffer.slice(smpl.offset, smpl.offset + (smpl.size & ~1)));

    const phdr = records('phdr', 38, o => ({ name: text(o, 20), program: view.getUint16(o + 20, true), bank: view.getUint16(o + 22, true), bag: view.getUint16(o + 24, true) }));
    const bag = (o)=> view.getUint16(o, true);
    const gen = (o)=> ({ op: view.getUint16(o, true), amount: view.getInt16(o + 2, true), lo: view.getUint8(o + 2), hi: view.getUint8(o + 3) });
    const pbag = records('pbag', 4, bag);
    const pgen = records('pgen', 4, gen);
    const inst = records('inst', 22, o => ({ name: text(o, 20), bag: view.getUint16(o + 20, true) }));
    const ibag = records('ibag', 4, bag);
    const igen = records('igen', 4, gen);
    const samples = records('shdr', 46, o => ({
        name: text(o, 20),
        start: view.getUint32(o + 20, true),
        end: view.getUint32(o + 24, true),
        loopStart: view.getUint32(o + 28, true),
        loopEnd: view.getUint32(o + 32, true),
        sampleRate: view.getUint32(o + 36, true),
        originalPitch: view.getUint8(o + 40),
        pitchCorrection: view.getInt8(o + 41),
        type: view.getUint16(o + 44, true),
    })).slice(0, -1);

    // zones of one preset or instrument: [{ gens: Map(op → gen), key?: [lo, hi], vel?: [lo, hi] }]
    const zones = (bags, gens, from, to)=>
    {
        const out = [];
        for (let b = from; b < to; b++)
        {
            const z = { gens: new Map(), key: null, vel: null };
            for (let g = bags[b]; g < bags[b + 1]; g++)
            {
                const { op, amount, lo, hi } = gens[g];
                if (op === GEN.keyRange) z.key = [lo, hi];
                else if (op === GEN.velRange) z.vel = [lo, hi];
                else z.gens.set(op, amount);
            }
            out.push(z);
        }
        return out;
    };
    // a first zone without its terminal generator (instrument / sampleID) is the global zone
    const splitGlobal = (list, terminal)=>
        list.length && !list[0].gens.has(terminal) ? { global: list[0], local: list.slice(1) } : { global: null, local: list };

    const instruments = inst.slice(0, -1).map((ins, i)=> splitGlobal(zones(ibag, igen, ins.bag, inst[i + 1].bag), GEN.sampleID));

    const presets = phdr.slice(0, -1).map((p, i)=>
    {
        const { global: pGlobal, local: pZones } = splitGlobal(zones(pbag, pgen, p.bag, phdr[i + 1].bag), GEN.instrument);
        const regions = [];
        for (const pz of pZones)
        {
            const ins = instruments[pz.gens.get(GEN.instrument)];
            if (!ins) continue;
            for (const iz of ins.local)
            {
                const sample = samples[iz.gens.get(GEN.sampleID)];
                if (!sample) continue;
                // a local zone's range overrides its global zone's; preset and instrument ranges intersect
                const [ikLo, ikHi] = range(iz, ins.global, 'key'), [pkLo, pkHi] = range(pz, pGlobal, 'key');
                const [ivLo, ivHi] = range(iz, ins.global, 'vel'), [pvLo, pvHi] = range(pz, pGlobal, 'vel');
                const keyLo = Math.max(ikLo, pkLo), keyHi = Math.min(ikHi, pkHi);
                const velLo = Math.max(ivLo, pvLo), velHi = Math.min(ivHi, pvHi);
                if (keyLo > keyHi || velLo > velHi) continue;

                const g = Int16Array.from(DEFAULTS);
                for (const [op, v] of ins.global?.gens ?? []) g[op] = v;
                for (const [op, v] of iz.gens) g[op] = v;
                const offsets = new Map(pGlobal?.gens);
                for (const [op, v] of pz.gens) offsets.set(op, v);
                for (const [op, v] of offsets) if (!NOT_ADDITIVE.has(op) && op < GEN_COUNT) g[op] = clamp16(g[op] + v);
                regions.push({ keyLo, keyHi, velLo, velHi, sample, gen: g });
            }
        }
        return { name: p.name, bank: p.bank, program: p.program, regions };
    }).sort((a, b)=> a.bank - b.bank || a.program - b.program);

    const name = chunks.INAM ? text(chunks.INAM.offset, chunks.INAM.size) : '';
    return { name, sampleData, samples, presets };
}

// a zone's key or velocity range: its own if set, else its global zone's, else everything
const range = (z, global, k)=> z[k] ?? global?.[k] ?? [0, 127];
const clamp16 = (v)=> Math.max(-32768, Math.min(32767, v));

// the regions of a preset that sound for this key and velocity
export function regionsFor(preset, key, velocity)
{
    return preset.regions.filter(r => key >= r.keyLo && key <= r.keyHi && velocity >= r.velLo && velocity <= r.velHi);
}
