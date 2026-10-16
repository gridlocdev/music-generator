import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reverbImpulse } from '../../src/lib/impulse.js';

test('a reverb impulse is stereo, seeded and decays to silence', ()=>
{
    const [l, r] = reverbImpulse(8000, { seconds: 1 });
    assert.equal(l.length, 8000);
    assert.notDeepEqual(l, r);
    assert.deepEqual(reverbImpulse(8000, { seconds: 1 })[0], l);
    assert.notDeepEqual(reverbImpulse(8000, { seconds: 1, seed: 2 })[0], l);
    const energy = (a, from, to)=> a.subarray(from, to).reduce((s, x)=> s + x * x, 0);
    assert.ok(energy(l, 0, 800) > 10 * energy(l, 7200, 8000));
    assert.ok(l.every(x => x >= -1 && x <= 1));
});
