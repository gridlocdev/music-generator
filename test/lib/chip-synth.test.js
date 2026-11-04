import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChipFont, harmonics, waveZones, lfsrNoise, drumSample, CHIP_RATE } from '../../src/lib/chip-synth.js';
import { regionsFor } from '../../src/lib/sf2.js';
import { voiceParams } from '../../src/lib/sf2-voice.js';
import { CHIP_BANK, CHIP_KIT_BANK, CHIP_INSTRUMENTS, CHIP_KITS, CHIP_ROLES } from '../../src/audio/chip-instruments-data.js';

const near = (a, b, eps)=> assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const font = buildChipFont({ bank: CHIP_BANK, kitBank: CHIP_KIT_BANK, instruments: CHIP_INSTRUMENTS, kits: CHIP_KITS });

test('chip waves: a square has only odd harmonics at 4/(nπ); a 25% pulse loses every fourth', ()=>
{
    const square = harmonics({ shape: 'pulse', duty: 0.5 }, 0.5);
    const amp = (s, n)=> Math.hypot(s.cos[n], s.sin[n]);
    near(amp(square, 1), 4 / Math.PI, 0.01);
    near(amp(square, 3), 4 / (3 * Math.PI), 0.01);
    assert.ok(amp(square, 2) < 0.01);
    const pulse = harmonics({ shape: 'pulse', duty: 0.25 }, 0.25);
    assert.ok(amp(pulse, 4) < 0.01 && amp(pulse, 2) > 0.3);
});

test('chip waves: high zones keep fewer harmonics, so the top notes stay clean', ()=>
{
    const zones = waveZones({ shape: 'saw' });
    assert.equal(zones.length, 7);
    // the top zone (up to key 127, 12.5 kHz) can only hold the fundamental: a sine
    const top = zones.at(-1), peak = Math.max(...top), rms = Math.sqrt(top.reduce((s, v)=> s + v * v, 0) / top.length);
    near(peak / rms, Math.SQRT2, 0.01);
    // `soft` takes out the top end: less energy, same fundamental
    const soft = waveZones({ shape: 'saw' }, 1)[0], raw = zones[0];
    const energy = (z)=> z.reduce((s, v)=> s + v * v, 0);
    assert.ok(Math.abs(energy(soft) - energy(raw)) / energy(raw) < 0.01, 'both normalised');
    assert.ok(Math.max(...soft) < Math.max(...raw), 'a softer saw has a lower peak for its level');
});

test('chip font: every instrument plays every key at the right pitch', ()=>
{
    for (const ins of CHIP_INSTRUMENTS)
    {
        const preset = font.presets.find(p => p.bank === CHIP_BANK && p.program === ins.program);
        for (const key of [21, 48, 69, 108])
        {
            const regions = regionsFor(preset, key, 100);
            assert.equal(regions.length, (ins.layers ?? [{}]).length, `${ins.name} key ${key}`);
            const main = regions.find(r => r.gen[51] === 0);    // the layer at pitch (coarseTune 0)
            const p = voiceParams(main, key, 100);
            const played = p.sampleRate * p.playbackRate / 512;
            near(1200 * Math.log2(played / (440 * 2 ** ((key - 69) / 12))), main.gen[52], 0.5);
            assert.equal(p.loopMode, 1);
        }
    }
});

test('chip font: the NES voices skip the velocity tone; the kits are one-shots with choked hats', ()=>
{
    const nes = font.presets.find(p => p.bank === CHIP_BANK && p.program === 86);
    assert.equal(voiceParams(nes.regions[2], 69, 30).filter, null);
    const kit = font.presets.find(p => p.bank === CHIP_KIT_BANK && p.program === 0);
    const hat = voiceParams(regionsFor(kit, 42, 100)[0], 42, 100), open = voiceParams(regionsFor(kit, 46, 100)[0], 46, 100);
    assert.equal(hat.playbackRate, 1);
    assert.equal(hat.loopMode, 0);
    assert.ok(hat.exclusiveClass > 0 && hat.exclusiveClass === open.exclusiveClass);
    for (const k of [36, 38, 42, 46, 49]) assert.equal(regionsFor(kit, k, 100).length, 1, `key ${k}`);
});

test('chip drums: LFSR noise repeats every 93 steps in short mode; hits peak at 0.8', ()=>
{
    const short = lfsrNoise(400, 1, 1, 1, true);
    assert.deepEqual([...short.slice(0, 93)], [...short.slice(93, 186)]);
    const long = lfsrNoise(400, 1, 1, 1);
    assert.notDeepEqual([...long.slice(0, 93)], [...long.slice(93, 186)]);
    const kick = drumSample({ tone: { from: 150, to: 50, decay: 0.3 } });
    assert.equal(kick.length, Math.ceil(0.3 * CHIP_RATE));
    near(Math.max(...kick.map(Math.abs)), 0.8, 1e-6);
});

test('chip data: every role has a chip instrument', ()=>
{
    for (const [role, program] of Object.entries(CHIP_ROLES))
        assert.ok((role === 'drums' ? CHIP_KITS : CHIP_INSTRUMENTS).some(i => i.program === program), role);
    assert.equal(new Set(CHIP_INSTRUMENTS.map(i => i.program)).size, CHIP_INSTRUMENTS.length, 'programs are unique');
});
