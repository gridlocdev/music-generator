import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sequence, invert, retrograde, augment, fragment, develop } from '../../src/lib/motif.js';

// do-re-mi-sol: a quarter, a quarter, a half, in a 4-beat bar
const m = { beats: 4, notes: [{ beat: 0, beats: 1, step: 0 }, { beat: 1, beats: 1, step: 1 }, { beat: 2, beats: 1, step: 2 }, { beat: 3, beats: 1, step: 4 }] };
const steps = (x)=> x.notes.map(n => n.step);
const beats = (x)=> x.notes.map(n => n.beat);

test('sequence and inversion move the steps; the rhythm stays', ()=>
{
    assert.deepEqual(steps(sequence(m, 2)), [2, 3, 4, 6]);
    assert.deepEqual(steps(invert(m)), [0, -1, -2, -4]);
    assert.deepEqual(beats(invert(m)), [0, 1, 2, 3]);
});

test('retrograde plays it backwards, keeping where rests fall', ()=>
{
    const r = retrograde({ beats: 4, notes: [{ beat: 0, beats: 1, step: 0 }, { beat: 1, beats: 2, step: 3 }] });
    assert.deepEqual(r.notes.map(n => [n.beat, n.beats, n.step]), [[1, 2, 3], [3, 1, 0]]);
});

test('augmentation doubles every length; diminution plays it twice as fast, twice, a step higher', ()=>
{
    const a = augment(m);
    assert.equal(a.beats, 8);
    assert.deepEqual(beats(a), [0, 2, 4, 6]);
    const d = develop(m, 'diminish');
    assert.equal(d.beats, 4);
    assert.deepEqual(beats(d), [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    assert.deepEqual(steps(d), [0, 1, 2, 4, 1, 2, 3, 5]);
});

test('fragmentation repeats the first half, a step lower each time', ()=>
{
    const f = fragment(m);
    assert.deepEqual(beats(f), [0, 1, 2, 3]);
    assert.deepEqual(steps(f), [0, 1, -1, 0]);
    assert.throws(()=> develop(m, 'shuffle'));
    assert.deepEqual(m.notes[0], { beat: 0, beats: 1, step: 0 }, 'the motif given is unchanged');
});
