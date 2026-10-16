import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeMidi, varLen } from '../../src/lib/midi-file.js';

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
