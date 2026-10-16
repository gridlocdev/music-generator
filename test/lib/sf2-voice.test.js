import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceParams, timecentsToSeconds, centibelsToGain } from '../../src/lib/sf2-voice.js';
import { GEN } from '../../src/lib/sf2.js';

const near = (a, b, eps = 1e-6)=> assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

function region(set = {})
{
    const gen = new Int16Array(61);
    gen[GEN.initialFilterFc] = 13500; gen[GEN.scaleTuning] = 100;
    gen[GEN.overridingRootKey] = -1; gen[GEN.keynum] = -1; gen[GEN.velocity] = -1;
    for (const g of [33, 34, 35, 36, 38]) gen[g] = -12000;
    for (const [k, v] of Object.entries(set)) gen[GEN[k]] = v;
    return { gen, sample: { start: 100, end: 200, loopStart: 120, loopEnd: 180, sampleRate: 44100, originalPitch: 60, pitchCorrection: 0 } };
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
