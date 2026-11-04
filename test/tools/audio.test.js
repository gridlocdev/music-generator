import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fft, pitchTrack, statesOf, beatFrames } from '../../tools/audio/lead.js';
import { notesOf } from '../../tools/nsf/decode.js';
import { melody, melodyTotals, median, noteName, tally } from '../../tools/music-stats.js';

const RATE = 22050;
const hz = (m)=> 440 * 2 ** ((m - 69) / 12);

// square waves: [midi or null, seconds, level][] per voice, mixed
function render(...voices)
{
    const length = Math.round(Math.max(...voices.map(v => v.reduce((t, [, s])=> t + s, 0))) * RATE);
    const out = new Float32Array(length);
    for (const voice of voices)
    {
        let at = 0;
        for (const [m, secs, level = 0.3] of voice)
        {
            const n = Math.round(secs * RATE);
            if (m !== null) for (let i = 0; i < n; i++) out[at + i] += (((i * hz(m) / RATE) % 1) < 0.5 ? level : -level);
            at += n;
        }
    }
    return out;
}

test('fft: a sine lands in its bin', ()=>
{
    const n = 64, re = Float64Array.from({ length: n }, (_, i)=> Math.cos(2 * Math.PI * 5 * i / n)), im = new Float64Array(n);
    fft(re, im);
    const mags = [...re].map((r, i)=> Math.hypot(r, im[i]));
    assert.ok(Math.abs(mags[5] - n / 2) < 1e-9);
    assert.ok(mags[4] < 1e-9 && mags[6] < 1e-9);
});

test('pitchTrack: follows a square-wave tune over a quieter bass', ()=>
{
    const tune = [72, 74, 76, 77, 79, 77, 76, 74].map(m => [m, 0.25]);
    // the G under the D and the A under the E would make the note an octave under the tune look complete
    const bass = [[48, 1], [43, 1]].map(([m, s])=> [m, s, 0.2]);
    const track = pitchTrack(render(tune, bass), RATE);
    const notes = notesOf(statesOf(track));
    assert.deepEqual(notes.map(n => n.key), [72, 74, 76, 77, 79, 77, 76, 74]);
    assert.ok(notes.every(n => Math.abs(n.frames - 15) <= 2));
});

test('pitchTrack: silence is unpitched, and a repeated note struck twice is two notes', ()=>
{
    const track = pitchTrack(render([[null, 0.5], [69, 0.3], [null, 0.05], [69, 0.3], [null, 0.3]]), RATE);
    assert.equal(track[10].pitch, null);
    assert.ok(Math.abs(track[40].pitch - 69) < 0.2);
    const notes = notesOf(statesOf(track));
    assert.deepEqual(notes.map(n => n.key), [69, 69]);
});

test('beatFrames: clicks at 120 bpm are 30 frames apart', ()=>
{
    const track = Array.from({ length: 600 }, (_, i)=> ({ power: i % 30 === 0 ? 0 : -40 }));
    assert.equal(beatFrames(track, 60), 30);
});

test('music-stats: interval sizes, turns and leaps', ()=>
{
    const notes = [60, 62, 64, 64, 72, 71, 60].map((key, i)=> ({ frame: i * 8, frames: 8, key, vibrato: 0, slide: 0 }));
    const m = melody(notes, 2);
    // +2 +2 0 +8 −1 −11: the leap up a 6th is answered by a step back; the last leap has nothing after it
    assert.deepEqual(m.sizes, { repeat: 1, step: 3, third: 0, '4th–5th': 0, '6th–7th': 2, 'octave+': 0 });
    assert.equal(m.leaps, 1);
    assert.equal(m.recovered, 1);
    assert.deepEqual(m.range, [60, 72]);
    assert.match(melodyTotals([m]), /repeat 17%/);
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(noteName(61), 'C#4');
    assert.deepEqual(tally(['a', 'b', 'a']), [['a', 2], ['b', 1]]);
});
