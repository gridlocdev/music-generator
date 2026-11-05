import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav } from '../../src/lib/wav.js';

test('wav: a mono 16-bit file with a correct header, samples clipped to ±1', ()=>
{
    const bytes = encodeWav(new Float32Array([0, 0.5, -1, 2]), 22050);
    const v = new DataView(bytes.buffer);
    const tag = (at)=> String.fromCharCode(...bytes.subarray(at, at + 4));
    assert.deepEqual([tag(0), tag(8), tag(12), tag(36)], ['RIFF', 'WAVE', 'fmt ', 'data']);
    assert.equal(bytes.length, 44 + 8);
    assert.deepEqual([v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true), v.getUint32(40, true)], [1, 22050, 16, 8]);
    assert.deepEqual([0, 1, 2, 3].map(i => v.getInt16(44 + 2 * i, true)), [0, 16384, -32767, 32767]);
});
