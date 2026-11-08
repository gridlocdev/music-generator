import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordsOf, cut } from '../../src/sketch/takes.js';

// a G major tune over two bars of 4/4: G B D, then G held
const melody = ()=> ({
    kind: 'melody', meter: '4/4', chords: [], guesses: [],
    notes: [{ beat: 0, beats: 1, key: 67 }, { beat: 1, beats: 1, key: 71 }, { beat: 2, beats: 2, key: 74 }, { beat: 4, beats: 4, key: 67 }],
});

test('takes: cutting a stretch out of a chord leaves nothing, one piece or two', ()=>
{
    const c = { beat: 0, beats: 8, symbol: 'I' };
    assert.deepEqual(cut(c, 8, 12), [c]);
    assert.deepEqual(cut(c, 0, 8), []);
    assert.deepEqual(cut(c, 0, 4), [{ beat: 4, beats: 4, symbol: 'I' }]);
    assert.deepEqual(cut(c, 2, 4), [{ beat: 0, beats: 2, symbol: 'I' }, { beat: 4, beats: 4, symbol: 'I' }]);
});

test('takes: guessed chords fill only the stretches with no whistled chord', ()=>
{
    const take = melody();
    take.chords = [{ beat: 4, beats: 4, symbol: 'V' }];
    take.guesses = [{ beat: 0, beats: 8, symbol: 'I' }];
    const all = chordsOf(take);
    assert.ok(all.filter(c => c.guessed).every(c => c.beat + c.beats <= 4));
    assert.ok(all.some(c => !c.guessed && c.beat === 4));
});
