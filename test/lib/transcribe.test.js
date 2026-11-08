import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackPitch } from '../../src/lib/pitch-track.js';
import { transcribe, tuningOffset, measureVibrato, guessKeys, spellDegree, toNotation, vibratoSummary, noteStarts, clickGrid, freeNotes } from '../../src/lib/transcribe.js';
import { parseMelody } from '../../src/features/composer/notation.js';
import { pitchClass } from '../../src/lib/music-theory.js';
import { RATE, whistle, fromNotation } from './whistle-synth.js';

const near = (a, b, eps)=> assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('pitch track: a whistled sine is read to within a few cents', ()=>
{
    const s = whistle([{ beat: 0, beats: 2, key: 83.3 }], { tempo: 60, jitter: 0 });
    const voiced = trackPitch(s, RATE).filter(f => f.midi !== null);
    assert.ok(voiced.length > 150);
    near(voiced[Math.floor(voiced.length / 2)].midi, 83.3, 0.03);
});

test('tuning offset: a take whistled 30 cents sharp is put back on the semitones', ()=>
{
    const frames = [80.3, 82.32, 84.28, 85.31].map(midi => ({ midi }));
    near(tuningOffset(frames), 0.3, 0.02);
});

test('transcribe: the Lanterns chorus whistled sharp, at a slower, rough tempo, comes back exactly', ()=>
{
    const text = '3 5 8 | 7:2 5 | 6 8 10 | 10:2 7 | 8:1.5 6:0.5 4 | 5 3 5 | 9:2 7 | 8:3';
    // whistled at 66 bpm, the player thinks "about 70"; the song itself is 84
    const s = whistle(fromNotation(text, 'Eb', 'major'), { tempo: 66, cents: 28 });
    const t = transcribe(trackPitch(s, RATE), { tempo: 70 });
    near(t.tempo, 66, 1);
    near(t.offset, 0.28, 0.05);
    assert.equal(toNotation(t.notes, { tonic: pitchClass('Eb'), mode: 'major', beatsPerBar: 3 }), text);
});

test('transcribe: repeated notes split where they are tongued, and held ones stay whole', ()=>
{
    const text = '5:0.5 5:0.5 5 3:2 | 1 1 1:2';
    const s = whistle(fromNotation(text, 'C', 'major'), { tempo: 80 });
    const t = transcribe(trackPitch(s, RATE), { tempo: 80 });
    assert.equal(toNotation(t.notes, { tonic: 0, mode: 'major' }), text);
});

test('transcribe: vibrato is marked with ~ on the notes that have it, centred, not split into notes', ()=>
{
    const notes = fromNotation('1 3 5:2 | 4:2 3:2', 'G', 'major');
    notes[2].vibrato = { rate: 6, depth: 0.45 };
    notes[4].vibrato = { rate: 5.5, depth: 0.3 };
    const s = whistle(notes, { tempo: 72, cents: -15 });
    const t = transcribe(trackPitch(s, RATE), { tempo: 72 });
    assert.equal(toNotation(t.notes, { tonic: pitchClass('G'), mode: 'major' }), '1 3 5~:2 | 4:2 3~:2');
    near(t.notes[2].vibrato.rate, 6, 0.5);
    near(t.notes[2].vibrato.depth, 0.45, 0.1);
    near(t.notes[2].cents, 0, 10);
    const v = vibratoSummary(t.notes);
    assert.equal(v.notes, 2);
});

test('vibrato: a straight note, jitter, or a slow drift is not vibrato', ()=>
{
    const fps = 100;
    let s = 3;
    const rand = ()=> (s = (s * 16807) % 2147483647) / 2147483647;
    assert.equal(measureVibrato(Array.from({ length: 80 }, ()=> 72 + (rand() - 0.5) * 0.08), fps), null);
    assert.equal(measureVibrato(Array.from({ length: 80 }, (_, i)=> 72 + i * 0.01), fps), null);
    const wobble = measureVibrato(Array.from({ length: 80 }, (_, i)=> 72 + 0.3 * Math.sin(2 * Math.PI * 6.5 * i / fps)), fps);
    near(wobble.rate, 6.5, 0.4);
    near(wobble.depth, 0.3, 0.03);
});

test('keys: a tune ending at home is heard in its key, major or minor', ()=>
{
    const eb = fromNotation('1 2 3 5 | 6 5 3 2 | 4 3 2 7, | 1:4', 'Eb', 'major');
    assert.deepEqual([guessKeys(eb)[0].key, guessKeys(eb)[0].mode], ['Eb', 'major']);
    const am = fromNotation('1 b3 4 5 | b6 5 4 b3 | 2 #7, 1:2', 'A', 'major');
    assert.deepEqual([guessKeys(am)[0].key, guessKeys(am)[0].mode], ['A', 'minor']);
});

test('spelling: notes between scale steps are flat, except #4 in major and #6/#7 in minor', ()=>
{
    const spell = (key, mode)=> { const { degree, accidental } = spellDegree(60 + key, 0, mode, 4); return `${accidental < 0 ? 'b' : accidental > 0 ? '#' : ''}${degree}`; };
    assert.deepEqual([1, 3, 6, 8, 10].map(k => spell(k, 'major')), ['b2', 'b3', '#4', 'b6', 'b7']);
    assert.deepEqual([9, 11].map(k => spell(k, 'minor')), ['#6', '#7']);
});

test('notation: rests and bar lines, and every transcription reads back through the composer parser', ()=>
{
    const notes = [{ beat: 0.5, beats: 1.5, key: 76 }, { beat: 4, beats: 1, key: 79, vibrato: { rate: 6, depth: 0.3 } }, { beat: 5, beats: 3, key: 84 }];
    const text = toNotation(notes, { tonic: 0, mode: 'major' });
    assert.equal(text, 'r:0.5 3:1.5 r:2 | 5~ 8:3');
    const back = parseMelody(text).notes;
    assert.deepEqual(back.map(n => [n.beat, n.degree, !!n.vibrato]), [[0.5, 3, false], [4, 5, true], [5, 8, false]]);
});

test('transcribe: a legato line with no breaks between notes is split by its pitch changes', ()=>
{
    const text = '1:0.5 2:0.5 3:0.5 4:0.5 5 3 | 2:1.5 7,:0.5 1:2';
    const notes = fromNotation(text, 'D', 'minor').map(n => ({ ...n, gap: 0 }));
    const s = whistle(notes, { tempo: 90, cents: 12 });
    const t = transcribe(trackPitch(s, RATE), { tempo: 88 });
    assert.equal(toNotation(t.notes, { tonic: pitchClass('D'), mode: 'minor' }), text);
});

test('transcribe: triplets come back as thirds of a beat, among straight 8ths, and read back to whole beats', ()=>
{
    const text = '1:1/3 2:1/3 3:1/3 4 5:0.5 4:0.5 3:1/3 2:1/3 1:1/3 | 5:2 r:2/3 3:1/3 1';
    const s = whistle(fromNotation(text, 'Db', 'major'), { tempo: 70 });
    const t = transcribe(trackPitch(s, RATE), { tempo: 70 });
    assert.equal(toNotation(t.notes, { tonic: pitchClass('Db'), mode: 'major' }), text);
    assert.deepEqual(parseMelody(text).notes.map(n => Math.round(n.beat * 1e9) / 1e9).filter(Number.isInteger), [0, 1, 2, 3, 4, 7]);
});

test('transcribe: short staccato notes, much shorter than their 8th, are kept', ()=>
{
    const text = '1:0.5 3:0.5 5:0.5 8:0.5 7:0.5 5:0.5 3 | 2:0.5 4:0.5 6:0.5 5:0.5 1:2';
    // each note sounds for about 0.1 s of its 0.43 s
    const notes = fromNotation(text, 'C', 'major').map(n => ({ ...n, gap: n.beats * 60 / 70 - 0.1 }));
    const t = transcribe(trackPitch(whistle(notes, { tempo: 70 }), RATE), { tempo: 70 });
    assert.deepEqual(t.notes.map(n => n.key), notes.map(n => n.key));
});

test('click grid: a take recorded against a click keeps its bar lines, through latency and a player behind the beat', ()=>
{
    // a bar of count-in at 90 bpm, then the tune, whistled 70 ms late (the click reaching the ear, the whistle the mic)
    const text = '5 3 2 1 | 3:2 1:0.5 6,:0.5 1 | 4 6 8 6 | 7:2 5:2';
    const count = 4 * 60 / 90;
    const notes = fromNotation(text, 'G', 'major').map(n => ({ ...n, beat: n.beat + 4 + 0.07 * 90 / 60 }));
    const frames = trackPitch(whistle(notes, { tempo: 90, lead: 0 }), RATE);
    const grid = clickGrid(noteStarts(frames), 90, count);
    near(grid.origin, count + 0.07, 0.03);
    const t = transcribe(frames, { tempo: 90, grid });
    assert.equal(toNotation(t.notes, { tonic: pitchClass('G'), mode: 'major' }), text);
});

test('free notes: notes whistled with no beat come back in order, glides dropped, repeats split where tongued', ()=>
{
    const s = whistle(fromNotation('1 3:2 5:0.5 5:0.5 8:3', 'D', 'major'), { tempo: 110, cents: -20 });
    const notes = freeNotes(trackPitch(s, RATE));
    assert.deepEqual(notes.map(n => n.key), [74, 78, 81, 81, 86]);
    near(notes[1].seconds, 2 * 60 / 110, 0.12);
    assert.ok(notes.every((n, i)=> i === 0 || n.time >= notes[i - 1].time + notes[i - 1].seconds - 1e-9));
});
