import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, encodeWavChannels, normalize, peakOf } from '../../src/lib/wav.js';

test('a stereo WAV interleaves its channels; a mono one has one', ()=>
{
    const st = encodeWavChannels([new Float32Array([1, 0]), new Float32Array([-1, 0.5])], 8000);
    const v = new DataView(st.buffer);
    assert.equal(v.getUint16(22, true), 2);
    assert.equal(v.getUint32(40, true), 8);
    assert.deepEqual([0, 1, 2, 3].map(i => v.getInt16(44 + i * 2, true)), [32767, -32767, 0, 16384]);
    assert.equal(new DataView(encodeWav(new Float32Array(3), 8000).buffer).getUint16(22, true), 1);
});

test('normalizing scales every channel by one gain, to the peak asked for', ()=>
{
    const out = normalize([Float32Array.of(0.25, -0.5), Float32Array.of(0.1, 0)], -6);
    const want = 10 ** (-6 / 20);
    assert.ok(Math.abs(peakOf(out) - want) < 1e-6);
    assert.ok(Math.abs(out[0][0] / out[1][0] - 2.5) < 1e-6, 'the channels keep their balance');
    const quiet = [new Float32Array(4)];
    assert.equal(normalize(quiet), quiet, 'silence stays as it is');
});
