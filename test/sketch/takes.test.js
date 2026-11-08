import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, keyOf, chordsOf, addChord, clearChords, cut, barsName, snapRange, pickNext } from '../../src/sketch/takes.js';

// a G major tune over two bars of 4/4: G B D, then G held
const melody = ()=> ({
    kind: 'melody', meter: '4/4', chords: [], guesses: [],
    notes: [{ beat: 0, beats: 1, key: 67 }, { beat: 1, beats: 1, key: 71 }, { beat: 2, beats: 2, key: 74 }, { beat: 4, beats: 4, key: 67 }],
});
// whistled chords, a note at a time: { time, seconds, key }
const arpeggio = (...keys)=> keys.map((key, i)=> ({ time: i, seconds: 1, key }));
const gChord = arpeggio(67, 71, 74), dChord = arpeggio(62, 66, 69);

test('takes: every major and minor key can be chosen, or none for a guess', ()=>
{
    assert.equal(KEYS.length, 24);
    assert.deepEqual(keyOf('Eb major'), { key: 'Eb', tonic: 3, mode: 'major' });
    assert.equal(keyOf('auto'), null);
});

test('takes: cutting a stretch out of a chord leaves nothing, one piece or two', ()=>
{
    const c = { beat: 0, beats: 8, symbol: 'I' };
    assert.deepEqual(cut(c, 8, 12), [c]);
    assert.deepEqual(cut(c, 0, 8), []);
    assert.deepEqual(cut(c, 0, 4), [{ beat: 4, beats: 4, symbol: 'I' }]);
    assert.deepEqual(cut(c, 2, 4), [{ beat: 0, beats: 2, symbol: 'I' }, { beat: 4, beats: 4, symbol: 'I' }]);
});

test('takes: stretches are named in bars and beats', ()=>
{
    assert.equal(barsName({ beat: 4, beats: 4 }, '4/4'), 'bar 2');
    assert.equal(barsName({ beat: 0, beats: 8 }, '4/4'), 'bars 1–2');
    assert.equal(barsName({ beat: 10, beats: 2 }, '4/4'), 'bar 3 beats 3–4');
    assert.equal(barsName({ beat: 2, beats: 4 }, '4/4'), 'bar 1 beat 3 to bar 2 beat 2');
});

test('takes: a dragged stretch snaps out to half bars, whole bars in an odd meter, or beats', ()=>
{
    assert.deepEqual(snapRange(1, 3, '4/4'), { beat: 0, beats: 4 });
    assert.deepEqual(snapRange(5, 0.5, '4/4'), { beat: 0, beats: 6 });
    assert.deepEqual(snapRange(1, 2, '3/4'), { beat: 0, beats: 3 });
    assert.deepEqual(snapRange(1.5, 2.5, '4/4', true), { beat: 1, beats: 2 });
});

test('takes: a whistled chord takes its stretch over, named in the key', ()=>
{
    const take = melody();
    const g = addChord(take, { beat: 0, beats: 8 }, gChord, 'G major');
    assert.equal(take.key.tonic, 7);
    assert.equal(g.symbol, 'I');
    addChord(take, { beat: 4, beats: 4 }, dChord, 'G major');
    assert.deepEqual(take.chords.map(c => [c.beat, c.beats, c.symbol]), [[0, 4, 'I'], [4, 4, 'V']]);
    clearChords(take, { beat: 0, beats: 4 }, 'G major');
    assert.deepEqual(take.chords.map(c => c.symbol), ['V']);
});

test('takes: guessed chords fill only the stretches with no whistled chord', ()=>
{
    const take = melody();
    addChord(take, { beat: 4, beats: 4 }, dChord);
    const all = chordsOf(take);
    assert.ok(all.filter(c => c.guessed).every(c => c.beat + c.beats <= 4));
    assert.ok(all.some(c => !c.guessed && c.beat === 4));
});

test('takes: clicking a chord steps through its readings and round to the first', ()=>
{
    const c = { symbol: 'I', others: [{ symbol: 'vi' }] };
    pickNext(c);
    assert.equal(c.symbol, 'vi');
    pickNext(c);
    assert.equal(c.symbol, 'I');
});
