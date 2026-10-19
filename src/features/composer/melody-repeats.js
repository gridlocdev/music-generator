// A melody heard again: varied by how many times it has come back, and phrases repeated within a section as the genre
// patterns them ('aab'). Pure.
import { degreeToKey, keyToDegree, chordPitchClasses } from '../../lib/music-theory.js';
import { RANGES, MELODY_OCTAVE } from './composer-data.js';
import { chordAt, mod } from './meter.js';
import { keyUnder } from './melody.js';

/**
 * A phrase whose letter came earlier in the pattern ('aab') plays that phrase again, degree for degree, over its own
 * chords: a note the old chord altered takes the new chord's accidental (G# over E7 is G over A7 in E, the blue
 * third), a blue note stays blue. Only whole 4-bar phrases repeat, and never into a section's closing cadence.
 */
export function repeatPhrases(notes, sec, timeline, pattern = sec.genre.phrases)
{
    if (!pattern) return notes;
    const span = 4 * sec.beatsPerBar, phrases = Math.floor(sec.bars / 4);
    const closing = sec.endOn || sec.ending ? Math.floor((sec.bars - 1) / 4) : Infinity;
    const alteration = (n, beat)=> keyUnder(sec, chordAt(timeline, sec.beat + beat), n.degree) - degreeToKey(sec.tonic, sec.mode, n.degree, MELODY_OCTAVE);
    const inPhrase = (n, p)=> n.beat >= p * span - 1e-9 && n.beat < (p + 1) * span - 1e-9;
    let out = notes;
    for (let p = 1; p < Math.min(phrases, pattern.length); p++)
    {
        const q = pattern.indexOf(pattern[p]);
        if (q === p || p === closing) continue;
        const shift = (p - q) * span;
        const copy = out.filter(n => inPhrase(n, q)).map(n => ({
            ...n, beat: n.beat + shift, accidental: n.accidental === alteration(n, n.beat) ? alteration(n, n.beat + shift) : n.accidental,
        }));
        out = [...out.filter(n => !inPhrase(n, p)), ...copy].sort((a, b)=> a.beat - b.beat);
    }
    return out;
}

/**
 * A repeat of a section's melody, varied by how many times it has been heard (sec.vary, from VARIATION): the last
 * phrase up an octave when that fits the lead's range, and the last note approached by step from a chord tone above
 * (or below) instead of landing on it at once.
 */
export function varyMelody(theme, sec, timeline)
{
    const out = theme.map(m => ({ ...m }));
    const { tonic, mode, beatsPerBar: bpb } = sec;
    if (sec.vary.octave)
    {
        const from = Math.floor((sec.bars - 1) / 4) * 4 * bpb;
        const part = out.filter(m => m.beat >= from);
        const top = keyToDegree(tonic, mode, RANGES.lead[1], MELODY_OCTAVE);
        if (part.length && Math.max(...part.map(m => m.degree)) + 7 <= top) for (const m of part) m.degree += 7;
    }
    const last = out.at(-1);
    if (sec.vary.lastBar && last && last.beats >= 2)
    {
        const chord = chordAt(timeline, sec.beat + last.beat);
        const pcs = chordPitchClasses(chord);
        const accidental = (d)=> keyUnder(sec, chord, d) - degreeToKey(tonic, mode, d, MELODY_OCTAVE);
        const fits = (d)=> pcs.includes(mod(keyUnder(sec, chord, d), 12));
        const dir = fits(last.degree + 2) ? 1 : fits(last.degree - 2) ? -1 : 0;
        if (dir)
        {
            const q = last.beats / 4;
            out.splice(-1, 1,
                { ...last, beats: q, degree: last.degree + 2 * dir, accidental: accidental(last.degree + 2 * dir), last: false },
                { ...last, beat: last.beat + q, beats: q, degree: last.degree + dir, accidental: accidental(last.degree + dir), last: false },
                { ...last, beat: last.beat + 2 * q, beats: last.beats - 2 * q });
        }
    }
    return out;
}
