import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as MT from '../../src/lib/music-theory.js';
import {
    pitchClass, degreeToKey, keyToDegree, parseChord, chordPitchClasses, chordName, parseProgression, hash, MODES,
    alterToChord, unalter, bassOf, extendChord,
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

test('slash chords put a scale degree in the bass: inversions, pedals, and with a secondary chord', ()=>
{
    const name = (s, t = 0, m = 'major')=> chordName(parseChord(s, t, m));
    assert.deepEqual(['I/3', 'I/5', 'V/7', 'IV/1', 'V7/4', 'vii°/2'].map(s => name(s)), ['C/E', 'C/G', 'G/B', 'F/C', 'G7/F', 'Bdim/D']);
    assert.equal(chordName(parseChord('I/b7', 0, 'major'), true), 'C/Bb');   // accidentals count from the mode, as in a melody
    assert.equal(name('V7/V/#4'), 'D7/F#');                          // D7 over F#: V7/V in first inversion
    assert.equal(bassOf(parseChord('I', 0, 'major')), 0);
    assert.equal(bassOf(parseChord('I/3', 0, 'major')), 4);
    assert.deepEqual(chordPitchClasses(parseChord('IV/1', 0, 'major')), [5, 9, 0]);   // the pedal isn't a chord tone
    assert.throws(()=> parseChord('I/8', 0, 'major'));
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

test('triads played as a genre plays them: the key\'s sevenths, ninths, dominants, add9', ()=>
{
    const ext = (sym, how, tonic = 0, mode = 'major')=> chordName(extendChord(parseChord(sym, tonic, mode), how, tonic, mode));
    assert.deepEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°', 'II'].map(s => ext(s, 'sevenths')), ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5', 'D7']);
    assert.deepEqual(['I', 'iii', 'V'].map(s => ext(s, 'ninths')), ['Cmaj9', 'Em7', 'G9']);     // no b9 on iii
    assert.deepEqual(['I', 'IV', 'ii'].map(s => ext(s, 'dominant')), ['C7', 'F7', 'Dm7']);
    assert.equal(ext('vii°', 'sevenths', 9, 'harmonicMinor'), 'G#dim7');
    assert.deepEqual(['V7', 'Isus4', 'I'].map(s => ext(s, s === 'I' ? 'add9' : 'sevenths')), ['G7', 'Csus4', 'Cadd9']);
});
