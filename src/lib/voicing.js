// Chord voicings: which keys play a chord's pitch classes, moving little from the chord before. Pure.

const mod = (n, m)=> ((n % m) + m) % m;

/**
 * Voices a chord inside [low, high]: one key per pitch class, chosen to move least from the previous voicing
 * (or, with none, to sit near the middle of the range) and to stay compact. Deterministic.
 * @param {number[]} pcs  pitch classes to voice
 * @param {number[] | null} prev  previous voicing, low to high
 * @returns {number[]} keys, low to high
 */
export function voiceChord(pcs, prev, low, high)
{
    const options = pcs.map(pc =>
    {
        const keys = [];
        for (let k = low + mod(pc - low, 12); k <= high; k += 12) keys.push(k);
        return keys;
    });
    if (options.some(o => !o.length)) throw new Error(`range ${low}–${high} can't hold the chord`);

    let best = null, bestCost = Infinity;
    const pick = (i, chosen)=>
    {
        if (i === options.length)
        {
            const v = [...chosen].sort((a, b)=> a - b);
            const c = voicingCost(v, prev, low, high);
            if (c < bestCost || (c === bestCost && v.join() < best.join())) { best = v; bestCost = c; }
            return;
        }
        for (const k of options[i]) { chosen.push(k); pick(i + 1, chosen); chosen.pop(); }
    };
    pick(0, []);
    return /** @type {number[]} */ (best);
}

function voicingCost(v, prev, low, high)
{
    const span = v.at(-1) - v[0];
    let cost = Math.max(0, span - 12) * 2;          // keep it within an octave or so
    for (let i = 1; i < v.length; i++) if (v[i] - v[i - 1] < 2) cost += 3;   // seconds in a close voicing are muddy
    if (!prev?.length)
    {
        const mean = v.reduce((a, b)=> a + b, 0) / v.length;
        return cost + Math.abs(mean - (low + high) / 2);
    }
    // each voice moves to the nearest note of the new chord
    for (const k of v) cost += Math.min(...prev.map(p => Math.abs(p - k)));
    for (const p of prev) cost += Math.min(...v.map(k => Math.abs(p - k))) * 0.5;
    return cost;
}

/** the pitch classes of a shell voicing: the 3rd and 7th (and any 9th), leaving the root to the bass; a triad's 3rd and 5th */
/** @param {{ root: number, tones: number[] }} chord */
export function shellClasses(chord)
{
    const pcs = chord.tones.filter((t, i)=> i > 0 && (chord.tones.length < 4 || i !== 2)).map(t => mod(chord.root + t, 12));
    return [...new Set(pcs)];
}

/** a close voicing opened up: the second voice from the top dropped an octave, when it stays at or above `low` */
export function dropTwo(voicing, low)
{
    if (voicing.length < 3) return voicing;
    const v = [...voicing], k = v.splice(v.length - 2, 1)[0] - 12;
    return k >= low ? [k, ...v].sort((a, b)=> a - b) : voicing;
}
