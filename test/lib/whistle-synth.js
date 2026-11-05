// A made-up whistle for the transcription tests: notes as sine waves with breath noise, detune, vibrato and timing
// wobble. Not a test file itself.
import { parseMelody } from '../../src/features/composer/notation.js';
import { degreeToKey, pitchClass } from '../../src/lib/music-theory.js';

export const RATE = 22050;
const hz = (midi)=> 440 * 2 ** ((midi - 69) / 12);

/**
 * A made-up whistle: each note a sine (with a quiet 2nd harmonic and breath noise), detuned by `cents`, notes
 * tongued with a short dip, optional vibrato, and a small timing wobble so the grid has to be found.
 */
export function whistle(notes, { tempo, cents = 0, lead = 0.4, jitter = 0.015, noise = 0.01, seed = 1 })
{
    const spb = 60 / tempo;
    const end = lead + Math.max(...notes.map(n => n.beat + n.beats)) * spb + 0.3;
    const out = new Float32Array(Math.ceil(end * RATE));
    let s = seed, phase = 0;
    const rand = ()=> (s = (s * 16807) % 2147483647) / 2147483647;
    for (const n of notes)
    {
        const t0 = lead + n.beat * spb + (rand() - 0.5) * jitter, t1 = lead + (n.beat + n.beats) * spb - (n.gap ?? 0.04);
        for (let i = Math.floor(t0 * RATE); i < t1 * RATE; i++)
        {
            const t = i / RATE - t0;
            const vib = n.vibrato ? n.vibrato.depth * Math.sin(2 * Math.PI * n.vibrato.rate * t) : 0;
            phase += 2 * Math.PI * hz(n.key + cents / 100 + vib) / RATE;
            const env = Math.min(1, t / 0.02, (t1 - i / RATE) / 0.02);
            out[i] = 0.5 * env * (Math.sin(phase) + 0.05 * Math.sin(2 * phase));
        }
    }
    for (let i = 0; i < out.length; i++) out[i] += noise * (rand() * 2 - 1);
    return out;
}

/** notation → notes in a key, in the whistle register (an octave or two above a lead) */
export function fromNotation(text, key, mode, octave = 5)
{
    return parseMelody(text).notes.map(n => ({ beat: n.beat, beats: n.beats, key: degreeToKey(pitchClass(key), mode, n.degree, octave, n.accidental) }));
}

