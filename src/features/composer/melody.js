// The lead line: motif, answer and cadence bars over 4-bar phrases, each pitch picked by scoring every
// candidate degree against MELODY_RULES. Or a melody written by hand in degree notation.
import { degreeToKey, keyToDegree, chordPitchClasses, hash } from '../../lib/music-theory.js';
import { RANGES, MELODY_OCTAVE, RHYTHMS, CONTOURS, MELODY_HOME, MELODY_RULES, CADENCE_DEGREES } from './composer-data.js';
import { chordAt, clamp, mod } from './meter.js';

const noteCount = (cell)=> cell.filter(d => d > 0).length;

/**
 * Writes a section's melody in scale degrees: motif bars, answer bars and cadence bars over 4-bar phrases,
 * each pitch chosen by scoring every degree in range against MELODY_RULES.
 * @returns {{ beat: number, beats: number, degree: number, accidental: number, last?: boolean }[]}
 */
export function writeMelody(sec, cfg, variant)
{
    const { beatsPerBar: bpb, tonic, mode, seed, type, timeline } = sec;
    const rhythms = RHYTHMS[bpb] ?? RHYTHMS[4];
    const want = cfg.density * bpb;
    const ranked = rhythms.cells
        .map((cell, i)=> ({ cell, d: Math.abs(noteCount(cell) - want), h: hash(seed, type, 'cell', i) }))
        .sort((a, b)=> a.d - b.d || a.h - b.h)
        .map(r => r.cell);
    const motif = ranked[0];
    const answer = ranked[1 + variant % 2] ?? ranked[1];
    const continuation = ranked.find(c => noteCount(c) > noteCount(motif)) ?? ranked[2] ?? motif;

    // the rhythm, bar by bar
    const events = [];
    const phrases = Math.max(1, Math.ceil(sec.bars / 4));
    for (let bar = 0; bar < sec.bars; bar++)
    {
        const phrase = Math.floor(bar / 4), pos = bar % 4;
        const lastOfPhrase = pos === 3 || bar === sec.bars - 1;
        const cadence = sec.ending && bar === sec.bars - 1 ? 'final' : cfg.cadences[phrase % cfg.cadences.length];
        const role = lastOfPhrase ? 'cadence' : pos === 0 ? 'motif' : pos === 1 ? 'answer' : phrase % 2 ? 'continuation' : 'motif';
        const cell = role === 'cadence' ? rhythms.cadence[cadence] : role === 'motif' ? motif : role === 'answer' ? answer : continuation;
        let t = bar * bpb;
        cell.forEach((d, i)=>
        {
            if (d > 0) events.push({ beat: t, beats: d, bar, phrase, role, index: i, cadence: lastOfPhrase && i === cell.length - 1 ? cadence : null });
            t += Math.abs(d);
        });
    }
    if (events.length) events.at(-1).last = true;

    const [lowKey, highKey] = RANGES.lead;
    const lowDeg = keyToDegree(tonic, mode, lowKey, MELODY_OCTAVE) + 1;
    const highDeg = keyToDegree(tonic, mode, highKey, MELODY_OCTAVE) - 1;
    const contour = CONTOURS[cfg.contour] ?? CONTOURS.arch;
    const home = MELODY_HOME + cfg.register;
    const R = MELODY_RULES;

    const out = [];
    const motifShape = [];          // degrees of the first motif bar, to repeat its shape later
    let motifStart = null;          // degree offset applied to the current motif repeat
    let prev = null, prev2 = null;
    events.forEach((e, i)=>
    {
        const beatInPhrase = e.beat - e.phrase * 4 * bpb;
        const f = clamp(beatInPhrase / (4 * bpb), 0, 1) * (contour.length - 1);
        const lo = Math.floor(f), frac = f - lo;
        const contourTarget = home + contour[lo] + (contour[Math.min(lo + 1, contour.length - 1)] - contour[lo]) * frac;

        const isMotifRepeat = e.role === 'motif' && (e.bar > 0) && motifShape.length > e.index;
        const chord = chordAt(timeline, sec.beat + e.beat);
        const pcs = chordPitchClasses(chord);
        const inBar = e.beat - e.bar * bpb;
        const strong = Math.abs(inBar - Math.round(inBar)) < 1e-9 && (bpb === 3 ? inBar === 0 : Math.round(inBar) % 2 === 0) || e.beats >= 2;

        if (isMotifRepeat && e.index === 0)
        {
            // repeat the motif, shifted by the smallest step that lands its first note on a chord tone
            motifStart = 0;
            for (const s of [0, 1, -1, 2, -2, 3, -3])
                if (pcs.includes(mod(degreeToKey(tonic, mode, motifShape[0] + s, MELODY_OCTAVE), 12))) { motifStart = s; break; }
        }
        const target = isMotifRepeat ? motifShape[e.index] + motifStart : contourTarget;

        let best = null, bestCost = Infinity;
        for (let d = lowDeg; d <= highDeg; d++)
        {
            const key = degreeToKey(tonic, mode, d, MELODY_OCTAVE);
            const chordTone = pcs.includes(mod(key, 12));
            let c = R.contour * Math.abs(d - target);
            if (strong && !chordTone) c += R.strongNonChord;
            if (!strong && !chordTone && prev !== null && Math.abs(d - prev) > 1) c += R.weakNonChordLeap;
            if (prev !== null)
            {
                const leap = Math.abs(d - prev);
                if (leap > 2) c += R.leap * (leap - 2);
                if (leap > 5) c += R.bigLeap * (leap - 5);
                if (prev2 !== null && Math.abs(prev - prev2) >= 3)
                {
                    const back = Math.sign(prev2 - prev);
                    if (!(Math.sign(d - prev) === back && Math.abs(d - prev) <= 2)) c += R.recover;
                }
                if (d === prev) c += prev === prev2 ? R.repeat : R.repeatOnce;
            }
            if (e.cadence && !CADENCE_DEGREES[e.cadence].includes(mod(d - 1, 7) + 1)) c += R.cadence;
            c += (hash(seed, type, variant, i, d) % 1000) / 1000 * R.tieBreak;
            if (c < bestCost) { best = d; bestCost = c; }
        }
        if (e.bar === 0 && e.role === 'motif') motifShape[e.index] = best;
        out.push({ beat: e.beat, beats: e.beats, degree: best, accidental: 0, last: e.last || !!e.cadence });
        prev2 = prev; prev = best;
    });
    return out;
}

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
    const out = [];
    for (let start = 0; start < total && beats > 0; start += beats)
        for (const n of notes) if (start + n.beat < total) out.push({ ...n, beat: start + n.beat, beats: Math.min(n.beats, total - start - n.beat) });
    if (out.length) out.at(-1).last = true;
    return out;
}
