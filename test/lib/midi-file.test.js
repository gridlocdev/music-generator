import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeMidi, readMidi, varLen } from '../../src/lib/midi-file.js';

test('variable-length numbers', ()=>
{
    assert.deepEqual(varLen(0), [0]);
    assert.deepEqual(varLen(127), [127]);
    assert.deepEqual(varLen(128), [0x81, 0]);
    assert.deepEqual(varLen(0x3fff), [0xff, 0x7f]);
});

test('a format 1 file with a conductor track and one track per part', ()=>
{
    const bytes = writeMidi({ tempo: 120, beatsPerBar: 4, tracks: [
        { name: 'a', channel: 0, program: 0, notes: [{ key: 60, beat: 0, beats: 1, vel: 100 }, { key: 60, beat: 1, beats: 1, vel: 100 }] },
        { name: 'b', channel: 9, program: 0, notes: [] },
    ] });
    const s = String.fromCharCode(...bytes.slice(0, 4));
    assert.equal(s, 'MThd');
    assert.equal(bytes[9], 1);              // format 1
    assert.equal(bytes[11], 3);             // conductor + 2 tracks
    assert.equal((bytes[12] << 8) | bytes[13], 480);
    const tracks = [...String.fromCharCode(...bytes).matchAll(/MTrk/g)].length;
    assert.equal(tracks, 3);
});

test('a written file reads back the same', ()=>
{
    const song = { title: 'Round', tempo: 100, beatsPerBar: 3,
        tempos: [{ beat: 0, bpm: 100 }, { beat: 12, bpm: 80 }], meters: [{ beat: 0, num: 3, den: 4 }, { beat: 12, num: 6, den: 8 }],
        tracks: [
            { name: 'Lead', channel: 0, program: 73, notes: [{ key: 72, beat: 0, beats: 1.5, vel: 90 }, { key: 72, beat: 1.5, beats: 0.5, vel: 60 }, { key: 76, beat: 2, beats: 4, vel: 100 }] },
            { name: 'Kit', channel: 9, program: 0, notes: [{ key: 36, beat: 0, beats: 0.25, vel: 110 }, { key: 38, beat: 1, beats: 0.25, vel: 100 }] },
        ] };
    const back = readMidi(writeMidi(song));
    assert.equal(back.title, 'Round');
    assert.deepEqual(back.tempos, song.tempos);
    assert.deepEqual(back.meters, song.meters);
    assert.deepEqual(back.tracks, song.tracks);
});

test('a format 0 file: channels split into tracks, running status, note-on at velocity 0 as note-off', ()=>
{
    const bytes = new Uint8Array([
        ...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96],
        ...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 30],
        0, 0xc0, 40,                    // violin on channel 1
        0, 0x90, 60, 100,               // C on
        48, 64, 80,                     // running status: E on, half a beat in
        48, 60, 0,                      // C off (velocity 0)
        0, 0x99, 36, 120,               // a kick on channel 10
        96, 0x89, 36, 0,                // kick off
        0, 0x80, 64, 0,                 // E off
        0, 0xff, 0x2f, 0,
    ]);
    const m = readMidi(bytes);
    assert.deepEqual(m.tempos, []);
    assert.equal(m.tracks.length, 2);
    assert.deepEqual(m.tracks[0], { name: '', channel: 0, program: 40, notes: [{ key: 60, beat: 0, beats: 1, vel: 100 }, { key: 64, beat: 0.5, beats: 1.5, vel: 80 }] });
    assert.deepEqual(m.tracks[1], { name: '', channel: 9, program: 0, notes: [{ key: 36, beat: 1, beats: 1, vel: 120 }] });
});

test('not a MIDI file', ()=> assert.throws(()=> readMidi(new Uint8Array([1, 2, 3])), /not a MIDI file/));
