// A motif and the classic ways to develop it. Pure.
// A motif is a few notes over a fixed length: each note's start and length in beats and its height in scale steps
// above (or below) the motif's first note. Transformations return new motifs and never change the one given.

/** @typedef {{ beat: number, beats: number, step: number }} MotifNote
 *  @typedef {{ notes: MotifNote[], beats: number }} Motif */

const map = (m, fn)=> ({ beats: m.beats, notes: m.notes.map(fn) });

/** the same notes again, `by` scale steps higher (negative: lower) */
export const sequence = (m, by = 1)=> map(m, n => ({ ...n, step: n.step + by }));

/** every interval flipped: up becomes down, around the first note */
export const invert = (m)=> map(m, n => ({ ...n, step: 0 - n.step }));

/** the notes backwards, rests and all */
export function retrograde(m)
{
    return { beats: m.beats, notes: m.notes.map(n => ({ ...n, beat: m.beats - n.beat - n.beats })).reverse() };
}

/** every length times f: augmentation for f > 1, diminution for f < 1 */
export function augment(m, f = 2)
{
    return { beats: m.beats * f, notes: m.notes.map(n => ({ ...n, beat: n.beat * f, beats: n.beats * f })) };
}

/** the notes in the first `beats` of the motif, then those again a step lower, filling its length */
export function fragment(m, beats = m.beats / 2)
{
    const part = m.notes.filter(n => n.beat < beats - 1e-9).map(n => ({ ...n, beats: Math.min(n.beats, beats - n.beat) }));
    if (!part.length) return m;
    const notes = [];
    for (let t = 0, k = 0; t < m.beats - 1e-9; t += beats, k++)
        for (const n of part) if (t + n.beat < m.beats - 1e-9) notes.push({ ...n, beat: t + n.beat, beats: Math.min(n.beats, m.beats - t - n.beat), step: n.step - k });
    return { beats: m.beats, notes };
}

/** two motifs one after the other */
export function join(a, b)
{
    return { beats: a.beats + b.beats, notes: [...a.notes, ...b.notes.map(n => ({ ...n, beat: n.beat + a.beats }))] };
}

/**
 * A development by name. Every one keeps the motif's length except augment, which doubles it:
 *   repeat · sequence (a step up) · invert · retrograde · augment · diminish (twice as fast, played twice, rising) · fragment
 * @param {Motif} m
 * @param {string} how
 */
export function develop(m, how)
{
    switch (how)
    {
    case 'repeat': return m;
    case 'sequence': return sequence(m, 1);
    case 'invert': return invert(m);
    case 'retrograde': return retrograde(m);
    case 'augment': return augment(m, 2);
    case 'diminish': { const half = augment(m, 0.5); return join(half, sequence(half, 1)); }
    case 'fragment': return fragment(m);
    default: throw new Error(`unknown motif development: ${how}`);
    }
}
