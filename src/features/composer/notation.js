// Melodies written by hand in scale-degree notation, for sections, motifs and stingers. Pure.

/**
 * A melody written out by hand: space-separated tokens `degree[:beats]`. Degrees are scale steps (1 = tonic,
 * 8 = tonic an octave up), with b/# for accidentals and ' or , for an octave up/down; `r` is a rest.
 * Default length 1 beat; '|' is ignored. The line repeats to fill the section.
 */
export function parseMelody(text)
{
    const out = [];
    let t = 0;
    for (const token of text.split(/\s+/).filter(x => x && x !== '|'))
    {
        const m = /^(?:(r)|(b|#)?(-?\d+)('*|,*))(?::([\d.]+))?$/.exec(token);
        if (!m) throw new Error(`bad melody token: ${token}`);
        const beats = m[5] ? Number(m[5]) : 1;
        if (!(beats > 0)) throw new Error(`bad melody length: ${token}`);
        if (!m[1])
        {
            const octaves = m[4].startsWith("'") ? m[4].length : -m[4].length;
            out.push({ beat: t, beats, degree: Number(m[3]) + 7 * octaves, accidental: m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0 });
        }
        t += beats;
    }
    return { notes: out, beats: t };
}

export function notatedMelody(text, total)
{
    const { notes, beats } = parseMelody(text);
    /** @type {{ beat: number, beats: number, degree: number, accidental: number, last?: boolean }[]} */
    const out = [];
    for (let start = 0; start < total && beats > 0; start += beats)
        for (const n of notes) if (start + n.beat < total) out.push({ ...n, beat: start + n.beat, beats: Math.min(n.beats, total - start - n.beat) });
    if (out.length) out.at(-1).last = true;
    return out;
}
