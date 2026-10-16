import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    pitchClass, degreeToKey, keyToDegree, parseChord, chordPitchClasses, chordName, parseProgression, voiceChord, hash, MODES,
} from '../../src/lib/music-theory.js';

test('pitch classes', ()=> assert.deepEqual(['C', 'F#', 'Bb', 'B', 'Cb'].map(pitchClass), [0, 6, 10, 11, 11]));

test('scale degrees to keys, past the octave both ways', ()=>
{
    assert.equal(degreeToKey(0, 'major', 1), 60);
    assert.equal(degreeToKey(0, 'major', 8), 72);
    assert.equal(degreeToKey(0, 'major', 0), 59);
    assert.equal(degreeToKey(9, 'minor', 3), 72);     // A minor: C5
    assert.equal(degreeToKey(0, 'major', 3, 4, -1), 63);
});

test('keys back to degrees', ()=>
{
    for (const mode of Object.keys(MODES))
        for (let d = -6; d < 16; d++) assert.equal(keyToDegree(2, mode, degreeToKey(2, mode, d)), d);
});

test('Roman numerals: quality from case and marks', ()=>
{
    assert.deepEqual(chordPitchClasses(parseChord('V7', 0, 'major')), [7, 11, 2, 5]);
    assert.deepEqual(chordPitchClasses(parseChord('vi', 0, 'major')), [9, 0, 4]);
    assert.deepEqual(chordPitchClasses(parseChord('vii°', 0, 'major')), [11, 2, 5]);
    assert.deepEqual(chordPitchClasses(parseChord('bVII', 0, 'major')), [10, 2, 5]);
    assert.deepEqual(chordPitchClasses(parseChord('V', 9, 'minor')), [4, 8, 11]);   // E major in A minor
    assert.deepEqual(chordPitchClasses(parseChord('Isus4', 0, 'major')), [0, 5, 7]);
    assert.throws(()=> parseChord('X', 0, 'major'));
});

test('chord names', ()=>
{
    const name = (s, t = 0, m = 'major')=> chordName(parseChord(s, t, m));
    assert.deepEqual(['I', 'ii', 'V7', 'Imaj7', 'vii°', 'vi7', 'Isus2'].map(s => name(s)), ['C', 'Dm', 'G7', 'Cmaj7', 'Bdim', 'Am7', 'Csus2']);
    assert.equal(chordName(parseChord('bVI', 0, 'major'), true), 'Ab');
});

test('progressions with lengths', ()=>
{
    const p = parseProgression('I | V:2 vi:0.5', 0, 'major');
    assert.deepEqual(p.map(x => [x.chord.symbol, x.bars]), [['I', 1], ['V', 2], ['vi', 0.5]]);
    assert.throws(()=> parseProgression('I:0', 0, 'major'));
});

test('voice leading moves little and stays in range', ()=>
{
    const c = voiceChord([0, 4, 7], null, 52, 74);
    const f = voiceChord([5, 9, 0], c, 52, 74);
    for (const k of [...c, ...f]) assert.ok(k >= 52 && k <= 74);
    const moved = f.reduce((sum, k)=> sum + Math.min(...c.map(p => Math.abs(p - k))), 0);
    assert.ok(moved <= 4, `moved ${moved} semitones`);
    assert.deepEqual(voiceChord([0, 4, 7], null, 52, 74), c, 'same input, same voicing');
});

test('hash is stable', ()=>
{
    assert.equal(hash('a', 1), hash('a', 1));
    assert.notEqual(hash('a', 1), hash('a', 2));
});
