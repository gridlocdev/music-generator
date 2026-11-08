import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessChords, toProgression, chordVocabulary, chordKey, nameChord } from '../../src/lib/chord-guess.js';
import { trackPitch } from '../../src/lib/pitch-track.js';
import { transcribe, guessKeys, freeNotes } from '../../src/lib/transcribe.js';
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

test('chords: 8th-note arpeggios up and down, a borrowed iv, and a held maj7 with its 7th in every bar', ()=>
{
    const e = (s)=> s.split(' ').map(d => `${d}:0.5`).join(' ');
    assert.equal(chords(`${e('1 3 5 8 5 3 1 3')} | ${e('6, 1 3 6 3 1 6, 1')} | ${e('2 4 6 9 6 4 2 4')} | ${e('5, 7, 2 5 2 7, 5, 7,')}`, 'D', 'major'), 'I vi ii V');
    assert.equal(chords('1 3 5 3 | 4 b6 8 b6 | 1:4', 'F', 'major'), 'I iv I');
    assert.equal(chords('1 3 5 7 | 3 5 7 8 | 4 6 8 6 | 5 7 9 7', 'C', 'major'), 'Imaj7:2 IV V');
});

test('chords: the chords settle the key when the notes alone could be either of two relative keys', ()=>
{
    const e = (s)=> s.split(' ').map(d => `${d}:0.5`).join(' ');
    const notes = fromNotation(`${e('1 3 5 8 5 3 1 3')} | ${e('6, 1 3 6 3 1 6, 1')} | ${e('4 6 8 6 4 6 8 6')} | ${e('5, 7, 2 5 2 7, 5, 7,')}`, 'G', 'major');
    const { key, chords } = chordKey(notes, guessKeys(notes));
    assert.deepEqual([key.key, key.mode, toProgression(chords)], ['G', 'major', 'I vi IV V']);
});

test('chords: a tune is harmonised a chord a bar or half bar, with no slash basses from its first note', ()=>
{
    const harmonise = (text, key, mode, beatsPerBar = 4)=>
        toProgression(guessChords(fromNotation(text, key, mode), { tonic: pitchClass(key), mode, beatsPerBar, melody: true }), beatsPerBar);
    assert.equal(harmonise('1 2 3 5 | 3:2 1:2', 'C', 'major'), 'I:2');
    // passing notes (the 2s of bar 1) don't pull a chord in, and a bar of one repeated note takes the chord that leads home
    assert.equal(harmonise('3 2 1 2 | 3 3 3:2 | 2 2 2:2 | 3 5 5:2 | 3 2 1 2 | 3 3 3 3 | 2 2 3 2 | 1:4', 'C', 'major'), 'I:2 V I:3 V I');
});

test('chords: a chord whistled freely for a stretch is named from how long each note was held', ()=>
{
    // no beat to it: a loose arpeggio at an unrelated tempo, notes of uneven length
    const whistled = (text, key, mode, tempo = 133)=> freeNotes(trackPitch(whistle(fromNotation(text, key, mode), { tempo, cents: 15 }), RATE));
    const name = (text, key = 'C', mode = 'major')=> nameChord(whistled(text, key, mode), { tonic: pitchClass(key), mode }).symbol;
    assert.equal(name('1 3:1.5 5:0.5 8 5'), 'I');
    assert.equal(name('6, 1 3:2 6'), 'vi');
    assert.equal(name('3 5 8:2'), 'I/3');               // the lowest note first, on the third: an inversion
    assert.equal(name('5, 1:2 3 5'), 'I');              // on the fifth: just the chord
    assert.equal(name('5, 7, 2 4:2'), 'V7');
    assert.equal(name('1 3 5 8', 'A', 'minor'), 'i');
    const read = nameChord(whistled('4 6 8 6', 'C', 'major'), { tonic: 0, mode: 'major' });
    assert.equal(read.symbol, 'IV');
    assert.equal(read.others.length, 3);
    assert.equal(nameChord([], { tonic: 0, mode: 'major' }), null);
});

test('chords: a bar of 7/8 or 5/8 ends between beats, and the chords still tile the take', ()=>
{
    for (const bpb of [3.5, 2.5])
        for (const melody of [false, true])
        {
            // C E G under the first bar, F A C under the second
            const notes = [[0, 60], [1, 64], [2, 67], [bpb, 65], [bpb + 1, 69], [bpb + 2, 72]].map(([beat, key])=> ({ beat, beats: 0.5, key }));
            const chords = guessChords(notes, { tonic: 0, mode: 'major', beatsPerBar: bpb, melody });
            assert.equal(chords[0].beat, 0);
            assert.equal(chords.at(-1).beat + chords.at(-1).beats, 2 * bpb);
            for (let i = 1; i < chords.length; i++) assert.equal(chords[i].beat, chords[i - 1].beat + chords[i - 1].beats);
        }
});
