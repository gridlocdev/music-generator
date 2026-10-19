import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceChord, shellClasses, dropTwo } from '../../src/lib/voicing.js';
import { parseChord } from '../../src/lib/music-theory.js';

test('voice leading moves little and stays in range', ()=>
{
    const c = voiceChord([0, 4, 7], null, 52, 74);
    const f = voiceChord([5, 9, 0], c, 52, 74);
    for (const k of [...c, ...f]) assert.ok(k >= 52 && k <= 74);
    const moved = f.reduce((sum, k)=> sum + Math.min(...c.map(p => Math.abs(p - k))), 0);
    assert.ok(moved <= 4, `moved ${moved} semitones`);
    assert.deepEqual(voiceChord([0, 4, 7], null, 52, 74), c, 'same input, same voicing');
});

test('a shell keeps the 3rd and 7th and leaves the root to the bass; drop 2 opens a close voicing', ()=>
{
    assert.deepEqual(shellClasses(parseChord('V7', 0, 'major')), [11, 5]);
    assert.deepEqual(shellClasses(parseChord('Imaj9', 0, 'major')), [4, 11, 2]);
    assert.deepEqual(shellClasses(parseChord('I', 0, 'major')), [4, 7]);
    assert.deepEqual(dropTwo([60, 64, 67, 71], 48), [55, 60, 64, 71]);
    assert.deepEqual(dropTwo([60, 64, 67, 71], 58), [60, 64, 67, 71], 'no room below');
});
