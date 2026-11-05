import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessChords, toProgression, chordVocabulary } from '../../src/lib/chord-guess.js';
import { trackPitch } from '../../src/lib/pitch-track.js';
import { transcribe, guessKeys } from '../../src/lib/transcribe.js';
import { parseChord, pitchClass } from '../../src/lib/music-theory.js';
import { RATE, whistle, fromNotation } from './whistle-synth.js';

const chords = (text, key, mode, beatsPerBar = 4)=>
    toProgression(guessChords(fromNotation(text, key, mode), { tonic: pitchClass(key), mode, beatsPerBar }), beatsPerBar);

test('chords: every chord in the vocabulary parses in its mode', ()=>
{
    for (const mode of ['major', 'minor', 'dorian', 'mixolydian'])
        for (const [symbol] of chordVocabulary(mode)) assert.doesNotThrow(()=> parseChord(symbol, 0, mode), `${symbol} in ${mode}`);
});

test('chords: one arpeggio a bar is one chord a bar', ()=>
{
    assert.equal(chords('1 3 5 8 | 6, 1 3 6 | 4 6 8 6 | 5 7 9 7', 'C', 'major'), 'I vi IV V');
});

test('chords: the changes are found, held chords stay whole and quick ones split the bar', ()=>
{
    assert.equal(chords('1 3 5 8 | 5 3 5 3 | 4 6 5 7 | 8 5 3 1', 'C', 'major'), 'I:2 IV:0.5 V:0.5 I');
});

test('chords: an arpeggio that starts on the third is an inversion; a 7th whistled is a 7th chord', ()=>
{
    assert.equal(chords('1 3 5 8 | 7, 2 5 7 | 6, 1 3 6 | 5, 7, 2 4', 'G', 'major'), 'I V/7 vi V7');
    // starting on the fifth is just the chord: whistlers start there for range
    assert.equal(chords('5, 1 3 5 | 4 6 8 6', 'G', 'major'), 'I IV');
});

test('chords: minor keys, with the raised 7th making a major V', ()=>
{
    assert.equal(chords('1 3 5 8 | 4 6 8 6 | 5 #7 9 #7 | 8 5 3 1', 'A', 'minor'), 'i iv V i');
});

test('chords: each chord comes with its runners-up', ()=>
{
    const out = guessChords(fromNotation('1 3 5 3 | 6, 1 3 1', 'C', 'major'), { tonic: 0, mode: 'major' });
    assert.equal(out.length, 2);
    assert.equal(out[0].others.length, 3);
    assert.ok(out[0].others.every(o => o.score <= out[0].score));
});

test('chords: a whistled waltz arpeggio take, from audio to progression', ()=>
{
    // Lanterns on the Lake's chorus chords, one arpeggio a bar in 3/4, whistled sharp and a little loose
    const text = '1 3 5 | 7, 2 5 | 6, 1 3 | 3 5 7 | 4 6 8 | 3 5 8 | 5, 7, 4 | 1 3 5';
    const s = whistle(fromNotation(text, 'Eb', 'major'), { tempo: 100, cents: 20 });
    const t = transcribe(trackPitch(s, RATE), { tempo: 96 });
    const key = guessKeys(t.notes)[0];
    assert.deepEqual([key.key, key.mode], ['Eb', 'major']);
    assert.equal(toProgression(guessChords(t.notes, { tonic: key.tonic, mode: key.mode, beatsPerBar: 3 }), 3), 'I V/7 vi iii IV I/3 V7 I');
});
