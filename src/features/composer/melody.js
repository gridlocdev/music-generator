// The lead line. A song has one motif, 3–6 notes in a bar; each section develops it (repeated, sequenced, inverted,
// played backwards, slowed, sped up, fragmented) in its motif bars, and answers it with answer, continuation and
// cadence bars over 4-bar phrases. Every pitch is picked by scoring each candidate degree against MELODY_RULES, and
// takes the chord's accidental where the chord alters its step. Or a melody written by hand in degree notation.
import { degreeToKey, keyToDegree, chordPitchClasses, alterToChord, bassOf, hash } from '../../lib/music-theory.js';
import { develop } from '../../lib/motif.js';
import { RANGES, MELODY_OCTAVE, CONTOURS, MELODY_HOME, MELODY_RULES, CADENCE_DEGREES, CADENCES, PEAK_RULE } from './composer-data.js';
import { MOTIF, LEITMOTIFS } from './song-craft-data.js';
import { chordAt, clamp, mod, strongBeat } from './meter.js';
import { rhythmsFor } from './meter-patterns.js';

const noteCount = (cell)=> cell.filter(d => d > 0).length;

// a degree's key under a chord: the scale note, or the chord's version of it (G# under E major in A minor)
function keyUnder(sec, chord, d)
{
    return alterToChord(degreeToKey(sec.tonic, sec.mode, d, MELODY_OCTAVE), chord, sec.tonic, sec.mode);
}

/**
 * @typedef {{ beats: number, start: number, notes: import('../../lib/motif.js').MotifNote[] }} SongMotif
 *   start: the scale degree of its first note; notes' steps count from there
 */

/**
 * The song's motif: the spec's (a LEITMOTIFS name or degree notation), else the first bar of its hand-written chorus
 * (or of any hand-written section), else the best-scoring shape over a rhythm cell chosen for the chorus.
 * @returns {SongMotif}
 */
export function songMotif(spec, plan)
{
    const sections = plan.sections;
    const home = sections.find(s => s.type === 'chorus') ?? sections.find(s => s.base.melody) ?? sections[0];
    const written = Object.entries(spec.sections ?? {}).filter(([, s])=> typeof s.melody === 'string');
    const chorus = written.find(([t])=> t === 'chorus') ?? written[0];
    if (spec.motif || chorus)
    {
        const text = spec.motif ? LEITMOTIFS[spec.motif] ?? spec.motif : chorus[1].melody;
        const { notes, beats } = parseMelody(text);
        const bar = spec.motif ? beats : sections.find(s => s.type === chorus[0])?.beatsPerBar ?? home.beatsPerBar;
        const first = notes.filter(n => n.beat < bar - 1e-9).slice(0, MOTIF.notes[1]);
        if (first.length >= 2)
            return { beats: bar, start: first[0].degree, notes: first.map(n => ({ beat: n.beat, beats: Math.min(n.beats, bar - n.beat), step: n.degree - first[0].degree })) };
    }
    return inventMotif(home, plan.song.seed);
}

// every shape of the cell's note count, scored by MOTIF.cost; a hash picks among equals
function inventMotif(sec, seed)
{
    const { cells } = rhythmsFor(sec.meter);
    const [minN, maxN] = MOTIF.notes;
    const want = clamp(Math.round((sec.base.melody?.density ?? 0.8) * sec.beatsPerBar), minN, maxN);
    const cell = cells.filter(c => noteCount(c) >= minN && noteCount(c) <= maxN)
        .map((c, i)=> ({ c, d: Math.abs(noteCount(c) - want), h: hash(seed, 'motif-cell', i) }))
        .sort((a, b)=> a.d - b.d || a.h - b.h)[0]?.c ?? Array(sec.beatsPerBar).fill(1);
    const count = noteCount(cell);
    const start = MOTIF.starts[hash(seed, 'motif-start') % MOTIF.starts.length];
    const C = MOTIF.cost;
    let best = [0], bestCost = Infinity;
    const shape = [0];
    const score = ()=>
    {
        let c = 0, changes = 0, dir = 0;
        for (let i = 1; i < shape.length; i++)
        {
            const s = shape[i] - shape[i - 1], size = Math.abs(s);
            c += size === 0 ? C.repeat : size === 2 ? C.skip : size > 2 ? C.leap * (size - 2) : 0;
            if (s && dir && Math.sign(s) !== dir) changes++;
            if (s) dir = Math.sign(s);
        }
        const top = Math.max(...shape), span = top - Math.min(...shape);
        if (span > MOTIF.range) c += C.range * (span - MOTIF.range);
        c += changes === 0 ? C.flat : changes > 2 ? C.zigzag * (changes - 2) : 0;
        if (shape.indexOf(top) === 0) c += C.peakFirst;
        if (![1, 3, 5].includes(mod(start + shape.at(-1) - 1, 7) + 1)) c += C.unstable;
        return c + (hash(seed, 'motif', shape.join()) % 1000) / 1000 * C.tieBreak;
    };
    const visit = ()=>
    {
        if (shape.length === count) { const c = score(); if (c < bestCost) { bestCost = c; best = [...shape]; } return; }
        for (let s = -MOTIF.maxStep; s <= MOTIF.maxStep; s++) { shape.push(shape.at(-1) + s); visit(); shape.pop(); }
    };
    visit();
    const notes = [];
    let t = 0;
    for (const d of cell)
    {
        if (d > 0) notes.push({ beat: t, beats: d, step: best[notes.length] });
        t += Math.abs(d);
    }
    return { beats: sec.beatsPerBar, start, notes };
}

// The motif in a meter whose bar is a different length: the same steps in order, on the meter's rhythm cell with the
// closest note count. A leitmotif keeps its shape across 4/4, 6/8 and 7/4.
function fitMotif(motif, sec)
{
    if (Math.abs(motif.beats - sec.beatsPerBar) < 1e-9) return motif;
    const cell = rhythmsFor(sec.meter).cells
        .map((c, i)=> ({ c, d: Math.abs(noteCount(c) - motif.notes.length), h: hash(sec.seed, 'fit', i) }))
        .sort((a, b)=> a.d - b.d || a.h - b.h)[0].c;
    const notes = [];
    let t = 0;
    for (const d of cell)
    {
        if (d > 0) notes.push({ beat: t, beats: d, step: motif.notes[Math.min(notes.length, motif.notes.length - 1)].step });
        t += Math.abs(d);
    }
    return { ...motif, beats: sec.beatsPerBar, notes };
}

/**
 * Writes a section's melody in scale degrees: the motif, developed, in motif bars; answer, continuation and cadence
 * bars around it over 4-bar phrases; each pitch chosen by scoring every degree in range against MELODY_RULES, with
 * the accidental that fits the chord under it.
 * @param {SongMotif} motif
 * @returns {{ beat: number, beats: number, degree: number, accidental: number, last?: boolean }[]}
 */
export function writeMelody(sec, cfg, variant, motif, timeline)
{
    const { beatsPerBar: bpb, tonic, mode, seed, type, meter } = sec;
    const rhythms = rhythmsFor(meter);
    const want = cfg.density * bpb;
    const ranked = rhythms.cells
        .map((cell, i)=> ({ cell, d: Math.abs(noteCount(cell) - want), h: hash(seed, type, 'cell', i) }))
        .sort((a, b)=> a.d - b.d || a.h - b.h)
        .map(r => r.cell);
    const answer = ranked[1 + variant % 2] ?? ranked[1] ?? ranked[0];
    const continuation = ranked.find(c => noteCount(c) > noteCount(ranked[0])) ?? ranked[2] ?? ranked[0];
    const fitted = fitMotif(motif, sec);
    const develops = sec.over.develop ?? sec.base.develop ?? ['repeat', 'sequence'];
    const finalCadence = sec.endOn ? CADENCES[sec.endOn].melody : null;
    const lastPhrase = Math.floor((sec.bars - 1) / 4);

    // the rhythm, bar by bar
    const events = [];
    const covered = new Set();
    let statement = 0;
    for (let bar = Math.floor((cfg.from ?? 0) * sec.bars); bar < sec.bars; bar++)
    {
        if (covered.has(bar)) continue;
        const phrase = Math.floor(bar / 4), pos = bar % 4;
        const lastOfPhrase = pos === 3 || bar === sec.bars - 1;
        const cadence = sec.ending && bar === sec.bars - 1 ? 'final'
            : phrase === lastPhrase && finalCadence ? finalCadence
            : cfg.cadences[phrase % cfg.cadences.length];
        const role = lastOfPhrase ? 'cadence' : pos === 0 ? 'motif' : pos === 1 ? 'answer' : phrase % 2 ? 'continuation' : 'motif';
        const t0 = bar * bpb;
        if (role === 'motif')
        {
            let m = develop(fitted, develops[Math.min(statement, develops.length - 1)]);
            const spans = Math.round(m.beats / bpb);
            // a statement longer than a bar (augmented) needs the bars after it, short of the phrase's cadence
            if (spans > 1 && (pos + spans - 1 >= 3 || bar + spans - 1 >= sec.bars - 1)) m = fitted;
            for (let b = 1; b < Math.round(m.beats / bpb); b++) covered.add(bar + b);
            m.notes.forEach((n, i)=> events.push({ beat: t0 + n.beat, beats: n.beats, phrase, role, step: n.step, first: i === 0 }));
            statement++;
            continue;
        }
        const cell = role === 'cadence' ? rhythms.cadence[cadence] ?? rhythms.cadence.full : role === 'answer' ? answer : continuation;
        let t = t0;
        cell.forEach((d, i)=>
        {
            if (d > 0) events.push({ beat: t, beats: d, phrase, role, cadence: lastOfPhrase && i === cell.length - 1 ? cadence : null });
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
    let base = 0;                   // the degree the current motif statement is built on
    let prev = null, prev2 = null, peak = -Infinity, peakTimes = 0, prevKey = null, prevBass = null;
    events.forEach((e, i)=>
    {
        const beatInPhrase = e.beat - e.phrase * 4 * bpb;
        const f = clamp(beatInPhrase / (4 * bpb), 0, 1) * (contour.length - 1);
        const lo = Math.floor(f), frac = f - lo;
        const contourTarget = home + contour[lo] + (contour[Math.min(lo + 1, contour.length - 1)] - contour[lo]) * frac;

        const chord = chordAt(timeline, sec.beat + e.beat);
        const pcs = chordPitchClasses(chord);
        const isChordTone = (d)=> pcs.includes(mod(keyUnder(sec, chord, d), 12));
        const strong = strongBeat(meter, mod(e.beat, bpb)) || e.beats >= 2;
        if (e.role === 'motif' && e.first)
        {
            // a statement starts on the motif's own degree in the octave nearest the contour, moved by the smallest
            // step that puts its first note on a chord tone
            const b = fitted.start + 7 * Math.round((contourTarget - fitted.start - e.step) / 7);
            base = b;
            for (const s of [0, 1, -1, 2, -2, 3, -3]) if (isChordTone(b + s + e.step)) { base = b + s; break; }
        }
        const motifNote = e.role === 'motif';
        const target = motifNote ? base + e.step : contourTarget;

        let best = null, bestCost = Infinity;
        for (let d = lowDeg; d <= highDeg; d++)
        {
            const chordTone = isChordTone(d);
            let c = (motifNote ? R.motif : R.contour) * Math.abs(d - target);
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
            // a fifth or octave above the bass again, over a new bass note, moves in parallel
            if (prevKey !== null && bassOf(chord) !== prevBass)
            {
                const k = keyUnder(sec, chord, d), now = mod(k - bassOf(chord), 12);
                if (k !== prevKey && (now === 0 || now === 7) && now === mod(prevKey - prevBass, 12)) c += R.parallel;
            }
            if (d === peak && peakTimes >= PEAK_RULE.times) c += PEAK_RULE.cost;
            if (e.cadence && !CADENCE_DEGREES[e.cadence].includes(mod(d - 1, 7) + 1)) c += R.cadence;
            c += (hash(seed, type, variant, i, d) % 1000) / 1000 * R.tieBreak;
            if (c < bestCost) { best = d; bestCost = c; }
        }
        if (best > peak) { peak = best; peakTimes = 1; }
        else if (best === peak) peakTimes++;
        const key = keyUnder(sec, chord, best);
        out.push({ beat: e.beat, beats: e.beats, degree: best, accidental: key - degreeToKey(tonic, mode, best, MELODY_OCTAVE), last: e.last || !!e.cadence });
        prev2 = prev; prev = best; prevKey = key; prevBass = bassOf(chord);
    });
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
