// Bars in a project: its meter changes are a list of { beat, sig } sorted by beat, each holding until the next. A beat
// is a quarter note, so 6/8 has 3 beats a bar and 7/4 has 7. Pure.

/** @typedef {{ beat: number, sig: string }} MeterChange  sig: '4/4', '6/8', '7/4' … */

/** beats in a bar of a time signature like '6/8' */
export function beatsPerBar(sig)
{
    const [n, d] = String(sig).split('/').map(Number);
    return n > 0 && d > 0 ? n * 4 / d : 4;
}

/** the meter change in force at a beat (the first, before it) */
export const meterAt = (meters, beat)=> meters.findLast(m => m.beat <= beat + 1e-9) ?? meters[0];

/**
 * The bar a beat falls in, counting across meter changes.
 * @param {MeterChange[]} meters
 * @returns {{ bar: number, start: number, beatsPerBar: number }}  bar counts from 0; start is its first beat
 */
export function barAt(meters, beat)
{
    let bars = 0;
    for (let i = 0; i < meters.length; i++)
    {
        const m = meters[i], bpb = beatsPerBar(m.sig), end = meters[i + 1]?.beat ?? Infinity;
        if (beat < end - 1e-9 || i === meters.length - 1)
        {
            const k = Math.max(0, Math.floor((beat - m.beat) / bpb + 1e-9));
            return { bar: bars + k, start: m.beat + k * bpb, beatsPerBar: bpb };
        }
        bars += Math.round((end - m.beat) / bpb);
    }
    return { bar: 0, start: 0, beatsPerBar: 4 };
}

/** every bar line from `from` to `to`, in beats */
export function barLines(meters, from, to)
{
    const out = [];
    meters.forEach((m, i)=>
    {
        const bpb = beatsPerBar(m.sig), end = Math.min(to, meters[i + 1]?.beat ?? Infinity);
        for (let b = m.beat; b < end - 1e-9; b += bpb) if (b >= from) out.push(b);
    });
    return out;
}

/** the nearest grid line to a beat, `grid` beats apart, counted from the bar it's in */
export function snap(meters, beat, grid)
{
    const { start } = barAt(meters, Math.max(0, beat));
    return Math.max(0, start + Math.round((beat - start) / grid) * grid);
}
