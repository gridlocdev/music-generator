import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, encodeWavChannels } from '../../src/lib/wav.js';

test('a stereo WAV interleaves its channels; a mono one has one', ()=>
{
    const st = encodeWavChannels([new Float32Array([1, 0]), new Float32Array([-1, 0.5])], 8000);
    const v = new DataView(st.buffer);
    assert.equal(v.getUint16(22, true), 2);
    assert.equal(v.getUint32(40, true), 8);
    assert.deepEqual([0, 1, 2, 3].map(i => v.getInt16(44 + i * 2, true)), [32767, -32767, 0, 16384]);
    assert.equal(new DataView(encodeWav(new Float32Array(3), 8000).buffer).getUint16(22, true), 1);
});
