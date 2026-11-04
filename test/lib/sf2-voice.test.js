import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceParams, timecentsToSeconds, centibelsToGain, voiceLevel, modulated, sourceValue, sweepCents } from '../../src/lib/sf2-voice.js';
import { GEN } from '../../src/lib/sf2.js';

const near = (a, b, eps = 1e-6)=> assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

function region(set = {})
{
    const gen = new Int16Array(61);
    gen[GEN.initialFilterFc] = 13500; gen[GEN.scaleTuning] = 100;
    gen[GEN.overridingRootKey] = -1; gen[GEN.keynum] = -1; gen[GEN.velocity] = -1;
    for (const g of [33, 34, 35, 36, 38]) gen[g] = -12000;
    for (const [k, v] of Object.entries(set)) gen[GEN[k]] = v;
    return { gen, mods: [], sample: { start: 100, end: 200, loopStart: 120, loopEnd: 180, sampleRate: 44100, originalPitch: 60, pitchCorrection: 0 } };
}

test('unit conversions', ()=>
{
    near(timecentsToSeconds(0), 1);
    near(timecentsToSeconds(1200), 2);
    assert.equal(timecentsToSeconds(-12000), 0);
    near(centibelsToGain(200), 0.1);
});

test('pitch follows the key, root key and tuning', ()=>
{
    near(voiceParams(region(), 72, 127).playbackRate, 2);
    near(voiceParams(region({ overridingRootKey: 48 }), 60, 127).playbackRate, 2);
    near(voiceParams(region({ coarseTune: -12 }), 60, 127).playbackRate, 0.5);
    near(voiceParams(region({ scaleTuning: 0 }), 84, 127).playbackRate, 1);
});

test('addresses, loop mode, pan and filter', ()=>
{
    const p = voiceParams(region({ startAddrsOffset: 4, endloopAddrsOffset: -2, sampleModes: 3, pan: -250, initialFilterFc: 6900 }), 60, 127);
    assert.deepEqual([p.start, p.end, p.loopStart, p.loopEnd, p.loopMode], [104, 200, 120, 178, 3]);
    near(p.pan, -0.5);
    assert.ok(p.filter && p.filter.hz > 400 && p.filter.hz < 500);
    assert.equal(voiceParams(region(), 60, 127).filter, null);
});

test('velocity and attenuation scale the gain', ()=>
{
    near(voiceParams(region(), 60, 127).gain, 1);
    assert.ok(voiceParams(region(), 60, 64).gain < 0.3);
    assert.ok(voiceParams(region({ initialAttenuation: 200 }), 60, 127).gain < 1);
});

test('envelope level follows delay, attack, hold and decay', async ()=>
{
    const { envelopeLevel } = await import('../../src/lib/sf2-voice.js');
    const env = { delay: 0.1, attack: 0.2, hold: 0.1, decay: 1, sustain: 0.5, release: 0 };
    assert.equal(envelopeLevel(env, 1, 0.05), 0);
    near(envelopeLevel(env, 1, 0.2), 0.5);
    assert.equal(envelopeLevel(env, 1, 0.35), 1);
    near(envelopeLevel(env, 1, 0.4 + 1), 0.5, 1e-4);      // -100 dB of the way to sustain after the decay time
    assert.ok(envelopeLevel(env, 1, 0.6) < 1 && envelopeLevel(env, 1, 0.6) > 0.5);
});

test('softer notes are darker: the cutoff falls with velocity', ()=>
{
    const hz = (v)=> voiceParams(region(), 60, v).filter?.hz ?? Infinity;
    assert.equal(hz(127), Infinity);
    assert.ok(hz(100) > hz(64) && hz(64) > hz(30));
    assert.ok(hz(64) > 4000 && hz(64) < 10000, String(hz(64)));
});

test('a voice’s level follows its envelope until its release begins, even when the release is scheduled ahead', ()=>
{
    const env = { delay: 0, attack: 0, hold: 0, decay: 0, sustain: 1, release: 0.03 };
    const release = { at: 1, level: 0.5, seconds: 0.03 };
    // before a release scheduled for 1 s, the voice is at its envelope's level, never above its peak
    assert.equal(voiceLevel(env, 0.5, 0.8, release), 0.5);
    assert.ok(voiceLevel(env, 0.5, 0.99, release) <= 0.5);
    // after it begins, it decays from the level it started at
    assert.equal(voiceLevel(env, 0.5, 1, release), 0.5);
    assert.ok(voiceLevel(env, 0.5, 1.01, release) < 0.5 * 0.05);
    assert.equal(voiceLevel(env, 0.5, 0.5, null), 0.5);
});

test('a font’s own velocity→cutoff modulator replaces the default one', ()=>
{
    const r = { ...region({ initialFilterFc: 9000 }), mods: [{ src: 0x102, dest: GEN.initialFilterFc, amount: 0, amountSrc: 0 }] };
    near(voiceParams(r, 60, 40).filter.hz, voiceParams(r, 60, 127).filter.hz);
    assert.ok(voiceParams(region({ initialFilterFc: 9000 }), 60, 40).filter.hz < voiceParams(r, 60, 40).filter.hz);
});

test('modulators on velocity and key add to their generators', ()=>
{
    // velocity → mod env to cutoff, positive linear; key → cutoff, bipolar linear (0 at key 63.5)
    const r = { ...region({ initialFilterFc: 7000 }), mods: [
        { src: 0x2, dest: GEN.modEnvToFilterFc, amount: 6000, amountSrc: 0 },
        { src: 0x203, dest: GEN.initialFilterFc, amount: 3200, amountSrc: 0 },
        { src: 0xdb, dest: GEN.pan, amount: 500, amountSrc: 0 },        // a CC: not known at note-on, left out
    ] };
    near(modulated(r, 60, 127)[GEN.modEnvToFilterFc], 6000);
    near(modulated(r, 60, 0)[GEN.modEnvToFilterFc], 0);
    assert.ok(modulated(r, 100, 127)[GEN.initialFilterFc] > 7000 && modulated(r, 20, 127)[GEN.initialFilterFc] < 7000);
    assert.equal(modulated(r, 60, 127)[GEN.pan], 0);
    near(sourceValue(0x502, 60, 127), 0);
    near(sourceValue(0x502, 60, 0), 1);
    assert.equal(sourceValue(0xd02, 60, 100), 0);
});

test('the modulation envelope sweeps the cutoff up and back to its sustain', ()=>
{
    const p = voiceParams(region({ initialFilterFc: 6000, modEnvToFilterFc: 4800, delayModEnv: -12000, holdModEnv: -12000, attackModEnv: 0, decayModEnv: 0, sustainModEnv: 500 }), 60, 127);
    const s = p.filter.sweep;
    near(s.attack, 1); near(s.decay, 1); near(s.sustain, 0.5);
    assert.equal(sweepCents(s, 0), 0);
    near(sweepCents(s, 0.5), 2400);
    near(sweepCents(s, 1), 4800);
    near(sweepCents(s, 1.5), 3600);
    near(sweepCents(s, 3), 2400);
    // a filter swept down from fully open still needs a filter; one that only opens further doesn't
    assert.ok(voiceParams(region({ modEnvToFilterFc: -2400 }), 60, 127).filter);
    assert.equal(voiceParams(region({ modEnvToFilterFc: 2400 }), 60, 127).filter, null);
});
