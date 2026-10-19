import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as MT from '../../src/lib/music-theory.js';
import {
    pitchClass, degreeToKey, keyToDegree, parseChord, chordPitchClasses, chordName, parseProgression, voiceChord, hash, MODES,
    alterToChord, unalter,
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

test('a diminished vii stands on the leading tone in every mode; a plain VII counts in the mode', ()=>
{
    assert.deepEqual(chordPitchClasses(parseChord('vii°7', 9, 'minor')), [8, 11, 2, 5]);    // G#dim7 in A minor
    assert.deepEqual(chordPitchClasses(parseChord('viiø7', 2, 'dorian')), [1, 4, 7, 11]);   // C#m7b5 in D dorian
    assert.deepEqual(chordPitchClasses(parseChord('VII', 9, 'minor')), [7, 11, 2]);         // G major
});

test('secondary chords: X/Y is X in the major key of Y', ()=>
{
    assert.deepEqual(chordPitchClasses(parseChord('V7/vi', 0, 'major')), [4, 8, 11, 2]);    // E7
    assert.deepEqual(chordPitchClasses(parseChord('vii°7/V', 0, 'major')), [6, 9, 0, 3]);   // F#dim7
    assert.deepEqual(chordPitchClasses(parseChord('V/V', 9, 'minor')), [11, 3, 6]);         // B major in A minor
    assert.deepEqual(parseProgression('I V7/V:0.5 V', 0, 'major').map(p => p.bars), [1, 0.5, 1]);
});

test('a scale note moves onto the chord\'s own version of its step, and only that step', ()=>
{
    const at = (sym, key, tonic, mode)=> alterToChord(key, parseChord(sym, tonic, mode), tonic, mode);
    assert.equal(at('V', 67, 9, 'minor'), 68);       // G to G# under E major in A minor
    assert.equal(at('iv', 69, 0, 'major'), 68);      // A to Ab under Fm in C
    assert.equal(at('iv', 67, 0, 'major'), 67);      // G stays: Fm's ninth
    assert.equal(at('bVII', 71, 0, 'major'), 70);    // B to Bb
    assert.equal(at('V7/V', 65, 0, 'major'), 66);    // F to F# under D7
    assert.equal(at('i', 60, 9, 'minor'), 60);       // a diatonic chord changes nothing
    assert.equal(at('I', 60, 9, 'minor'), 61);       // the Picardy third
    assert.equal(unalter(68, parseChord('V', 9, 'minor'), 9, 'minor'), 67);
    assert.equal(unalter(69, parseChord('V', 9, 'minor'), 9, 'minor'), 69);
});

test('chord names', ()=>
{
    const name = (s, t = 0, m = 'major')=> chordName(parseChord(s, t, m));
    assert.deepEqual(['I', 'ii', 'V7', 'Imaj7', 'vii°', 'vi7', 'Isus2'].map(s => name(s)), ['C', 'Dm', 'G7', 'Cmaj7', 'Bdim', 'Am7', 'Csus2']);
    assert.equal(chordName(parseChord('bVI', 0, 'major'), true), 'Ab');
    assert.deepEqual(['V7sus4', 'V9sus4', 'V9', 'Imaj9', 'ii9'].map(s => name(s)), ['G7sus4', 'G9sus4', 'G9', 'Cmaj9', 'Dm9']);
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

test('a flat or sharp numeral counts from the major scale, in any mode', ()=>
{
    assert.equal(parseChord('bVII', 0, 'mixolydian').root, 10);
    assert.equal(parseChord('VII', 0, 'mixolydian').root, 10);
    assert.equal(parseChord('bVI', 0, 'minor').root, 8);
    assert.equal(parseChord('bII', 4, 'harmonicMinor').root, 5);
    assert.equal(parseChord('#iv°', 0, 'major').root, 6);
});

test('diatonic shifts stay in the key: thirds and sixths above and below, past the octave', ()=>
{
    const { diatonicShift } = MT;
    assert.equal(diatonicShift(64, 2, 0, 'major'), 67);         // E → G, a minor third in C major
    assert.equal(diatonicShift(60, 2, 0, 'major'), 64);         // C → E, a major third
    assert.equal(diatonicShift(60, 5, 0, 'major'), 69);         // C → A, a sixth
    assert.equal(diatonicShift(60, -2, 0, 'major'), 57);        // C → A below
    assert.equal(diatonicShift(71, 2, 0, 'major'), 74);         // B → D, across the octave
    assert.equal(diatonicShift(69, 2, 9, 'minor'), 72);         // A minor: A → C
    assert.equal(diatonicShift(61, 2, 0, 'major'), 64);         // C#, not in the scale: a minor third
    assert.equal(MT.isMinorMode('dorian'), true);
    assert.equal(MT.isMinorMode('lydian'), false);
});
