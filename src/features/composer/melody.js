// The lead line. A song has one motif, 3–6 notes in a bar; each section develops it (repeated, sequenced, inverted,
// played backwards, slowed, sped up, fragmented) in its motif bars, and answers it with answer, continuation and
// cadence bars over 4-bar phrases, the second phrase of a period starting as the first did. The pitches are found
// together by a beam search scoring each candidate degree against MELODY_RULES, and each takes the chord's
// accidental where the chord alters its step. The genre leaves out its scale's gaps, flattens its blue
// notes (genre-data.js). Repeats are melody-repeats.js; a melody written by hand is read by notation.js.
import { degreeToKey, keyToDegree, chordPitchClasses, alterToChord, bassOf, inScale, isMinorMode, hash } from '../../lib/music-theory.js';
import { develop } from '../../lib/motif.js';
import { parseMelody } from './notation.js';
import { RANGES, MELODY_OCTAVE, CONTOURS, MELODY_HOME, MELODY_RULES, MELODY_SEARCH, CADENCE_DEGREES, CADENCES, PEAK_RULE } from './composer-data.js';
import { MOTIF, LEITMOTIFS } from './song-craft-data.js';
import { chordAt, clamp, mod, strongBeat, metricWeight } from './meter.js';
import { rhythmsFor } from './meter-patterns.js';

const noteCount = (cell)=> cell.filter(d => d > 0).length;
// whether a cell has a note starting off the beat; a genre that syncopates (GENRES offbeat) counts those cells nearer
const offbeat = (cell)=> { let t = 0; return cell.some(d => { const off = d > 0 && mod(t, 1) > 1e-9; t += Math.abs(d); return off; }); };

/** a degree's key under a chord: the scale note, or the chord's version of it (G# under E major in A minor) */
export function keyUnder(sec, chord, d)
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
    const want = clamp(Math.round((sec.over.density ?? sec.base.melody?.density ?? 0.8) * sec.beatsPerBar), minN, maxN);
    const cell = cells.filter(c => noteCount(c) >= minN && noteCount(c) <= maxN)
        .map((c, i)=> ({ c, d: Math.abs(noteCount(c) - want) - (offbeat(c) ? sec.genre.offbeat ?? 0 : 0), h: hash(seed, 'motif-cell', i) }))
        .sort((a, b)=> a.d - b.d || a.h - b.h)[0]?.c ?? Array(sec.beatsPerBar).fill(1);
    const count = noteCount(cell);
    const start = MOTIF.starts[hash(seed, 'motif-start') % MOTIF.starts.length];
    const C = { ...MOTIF.cost, ...sec.genre.motif };
    let best = [0], bestCost = Infinity;
    const shape = [0];
    const score = ()=>
    {
        let c = 0, changes = 0, dir = 0;
        for (let i = 1; i < shape.length; i++)
        {
            const s = shape[i] - shape[i - 1], size = Math.abs(s);
            c += size === 0 ? C.repeat : size === 2 ? C.skip : size > 2 ? C.leap * (size - 2) : 0;
            const before = i > 1 ? shape[i - 1] - shape[i - 2] : 0;
            if (Math.abs(before) > 2 && !(Math.sign(s) === -Math.sign(before) && size <= 2)) c += C.recover;
            if (s && dir && Math.sign(s) !== dir) changes++;
            if (s) dir = Math.sign(s);
        }
        const top = Math.max(...shape), span = top - Math.min(...shape);
        if (span > MOTIF.range) c += C.range * (span - MOTIF.range);
        if (span < MOTIF.wide) c += C.narrow * (MOTIF.wide - span);
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
 * bars around it over 4-bar phrases; the pitches chosen together by a search that scores every degree in range
 * against MELODY_RULES, with the accidental that fits the chord under it.
 * @param {SongMotif} motif
 * @param {number | null} before  the MIDI key of the lead's note just before the section, which the line leads on from
 * @returns {{ beat: number, beats: number, degree: number, accidental: number, last?: boolean }[]}
 */
export function writeMelody(sec, cfg, variant, motif, timeline, before = null)
{
    const { beatsPerBar: bpb, tonic, mode, seed, type, meter } = sec;
    const rhythms = rhythmsFor(meter);
    const want = cfg.density * bpb;
    const ranked = rhythms.cells
        .map((cell, i)=> ({ cell, d: Math.abs(noteCount(cell) - want) - (offbeat(cell) ? sec.genre.offbeat ?? 0 : 0), h: hash(seed, type, 'cell', i) }))
        .sort((a, b)=> a.d - b.d || a.h - b.h)
        .map(r => r.cell);
    const answer = ranked[1 + variant % 2] ?? ranked[1] ?? ranked[0];
    const continuation = ranked.find(c => noteCount(c) > noteCount(ranked[0])) ?? ranked[2] ?? ranked[0];
    const fitted = fitMotif(motif, sec);
    const develops = sec.over.develop ?? sec.base.develop ?? ['repeat', 'sequence'];
    const finalCadence = sec.endOn ? CADENCES[sec.endOn].melody : null;
    const lastPhrase = Math.floor((sec.bars - 1) / 4);
    const firstBar = Math.floor((cfg.from ?? 0) * sec.bars);
    const cadenceOf = (phrase)=> phrase === lastPhrase && finalCadence ? finalCadence : cfg.cadences[phrase % cfg.cadences.length];

    // the rhythm, bar by bar
    const events = [];
    const covered = new Set();
    let statement = 0;
    for (let bar = firstBar; bar < sec.bars; bar++)
    {
        if (covered.has(bar)) continue;
        const phrase = Math.floor(bar / 4), pos = bar % 4;
        const lastOfPhrase = pos === 3 || bar === sec.bars - 1;
        const cadence = sec.ending && bar === sec.bars - 1 ? 'final' : cadenceOf(phrase);
        // the parallel period: a phrase that answers a half cadence with a full one starts as the question did, its
        // first two bars note for note (over its own chords), and goes its own way to the cadence
        if (pos === 0 && phrase > 0 && (phrase - 1) * 4 >= firstBar && bar + 3 < sec.bars
            && cadenceOf(phrase - 1) === 'half' && ['full', 'deceptive'].includes(cadenceOf(phrase)))
        {
            const from = (phrase - 1) * 4 * bpb, to = from + 2 * bpb;
            events.forEach((ev, j)=>
            {
                if (ev.beat >= from - 1e-9 && ev.beat < to - 1e-9) events.push({ ...ev, beat: ev.beat + 4 * bpb, phrase, copy: j, first: false });
            });
            covered.add(bar + 1);
            continue;
        }
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
    const contour = (CONTOURS[cfg.contour] ?? CONTOURS.arch).map(h => h * (sec.genre.span ?? 1));
    const home = MELODY_HOME + cfg.register;
    const R = { ...MELODY_RULES, ...sec.genre.rules };
    const avoid = (isMinorMode(mode) ? sec.genre.avoid?.dark : sec.genre.avoid?.bright) ?? [];
    const blue = sec.genre.blue ?? [];
    const stepOf = (d)=> mod(d - 1, 7) + 1;
    // each degree as the chord has it, and flattened when it's a blue note the scale doesn't already flatten
    const candidates = (chord, cadence)=>
    {
        const out = [];
        for (let d = lowDeg; d <= highDeg; d++)
        {
            const key = keyUnder(sec, chord, d), plain = degreeToKey(tonic, mode, d, MELODY_OCTAVE);
            out.push({ d, key });
            if (!cadence && blue.includes(stepOf(d)) && key === plain && !inScale(tonic, mode, plain - 1)) out.push({ d, key: plain - 1, blue: true });
        }
        return out;
    };
    // what moving from one degree to the next costs: a third a little, a leap more, a big leap much more
    const motion = (from, d)=>
    {
        const leap = Math.abs(d - from);
        return (leap === 2 ? R.skip : 0) + (leap > 2 ? R.leap * (leap - 2) : 0) + (leap > 5 ? R.bigLeap * (leap - 5) : 0);
    };

    // A beam search: the MELODY_SEARCH.beam cheapest melodies so far each try every candidate for the next note, and
    // the cheapest of those go on. A line can take a slightly dearer note now to step into its cadence later.
    // Each path carries what the rules look back at: the last two notes, the last move, the peak, the motif's base.
    /** @typedef {{ cost: number, notes: { d: number, key: number, blue?: boolean }[], prev: number | null, prev2: number | null,
     *    prevKey: number | null, prevBass: number | null, lastMove: number, prevChordTone: boolean, peak: number, peakTimes: number, base: number }} Path */
    /** @type {Path[]} */
    const start = before === null ? null : keyToDegree(tonic, mode, before, MELODY_OCTAVE);
    let beam = [{ cost: 0, notes: [], prev: start, prev2: null, prevKey: null, prevBass: null, lastMove: 0, prevChordTone: true, peak: -Infinity, peakTimes: 0, base: 0 }];
    events.forEach((e, i)=>
    {
        const beatInPhrase = e.beat - e.phrase * 4 * bpb;
        const f = clamp(beatInPhrase / (4 * bpb), 0, 1) * (contour.length - 1);
        const lo = Math.floor(f), frac = f - lo;
        // after a section's first phrase, the contour starts where the last one ended and eases into its own shape
        // over the first bar, so a falling contour doesn't jump back up to start again
        const ease = e.phrase * 4 > firstBar ? (contour.at(-1) - contour[0]) * Math.max(0, 1 - f) : 0;
        const contourTarget = home + contour[lo] + (contour[Math.min(lo + 1, contour.length - 1)] - contour[lo]) * frac + ease;

        const chord = chordAt(timeline, sec.beat + e.beat);
        const pcs = chordPitchClasses(chord);
        const bass = bassOf(chord);
        const isChordTone = (d)=> pcs.includes(mod(keyUnder(sec, chord, d), 12));
        const strong = strongBeat(meter, mod(e.beat, bpb)) || e.beats >= 2;
        // what a non-chord tone here costs beyond the strong-beat rule: on a beat, held, or left hanging before a rest
        const after = events[i + 1];
        const nonChord = (strong ? 0 : metricWeight(meter, mod(e.beat, bpb)) === 'weak' ? R.beatNonChord : 0)
            + R.heldNonChord * Math.max(0, e.beats - 0.5)
            + (!after || after.beat - (e.beat + e.beats) >= 0.5 - 1e-9 ? R.hangingNonChord : 0);
        const options = candidates(chord, e.cadence);
        const next = [];
        for (const path of beam)
        {
            const { prev, prev2, prevKey, prevBass, lastMove, prevChordTone, peak, peakTimes } = path;
            let base = path.base;
            if (e.role === 'motif' && e.first)
            {
                // a statement starts on the motif's own degree, in the octave and moved by the step that put its first
                // note on a chord tone near both the contour and the note before it, so it doesn't jump in
                const b = fitted.start + 7 * Math.round((contourTarget - fitted.start - e.step) / 7);
                base = b;
                let baseCost = Infinity;
                for (const o of [0, -7, 7]) for (const s of [0, 1, -1, 2, -2, 3, -3])
                {
                    const first = b + o + s + e.step;
                    if (first < lowDeg || first > highDeg || !isChordTone(first)) continue;
                    const c = R.contour * Math.abs(first - contourTarget) + R.anchor * Math.abs(s) + (prev === null ? 0 : motion(prev, first));
                    if (c < baseCost) { baseCost = c; base = b + o + s; }
                }
            }
            // a copied note (the parallel period) is the degree this path played there, scored only for how it joins
            const source = e.copy === undefined ? null : path.notes[e.copy];
            const motifNote = e.role === 'motif' && !source;
            const target = source ? source.d : motifNote ? base + e.step : contourTarget;
            const pushed = next.length;
            for (const { d, key: k, blue: flat } of options)
            {
                if (source && (d !== source.d || !!flat !== !!source.blue)) continue;
                const chordTone = pcs.includes(mod(k, 12));
                let c = (motifNote ? R.motif : R.contour) * Math.abs(d - target);
                if (flat) c += R.blue;
                if (avoid.includes(stepOf(d)) && !flat) c += R.avoid;
                if (strong && !chordTone) c += R.strongNonChord;
                if (!chordTone) c += nonChord;
                if (!strong && !chordTone && prev !== null && Math.abs(d - prev) > 1) c += R.weakNonChordLeap;
                if (prev !== null)
                {
                    c += motion(prev, d);
                    const move = d - prev;
                    if (move && lastMove && Math.sign(move) !== Math.sign(lastMove) && Math.abs(lastMove) < 3) c += R.turn;
                    if (!prevChordTone && Math.abs(move) !== 1) c += R.resolve;
                    if (prev2 !== null && Math.abs(prev - prev2) >= 3)
                    {
                        const back = Math.sign(prev2 - prev);
                        if (!(Math.sign(d - prev) === back && Math.abs(d - prev) <= 2)) c += R.recover;
                    }
                    if (d === prev) c += prev === prev2 ? R.repeat : R.repeatOnce;
                }
                // a fifth or octave above the bass again, over a new bass note, moves in parallel
                if (prevKey !== null && bass !== prevBass)
                {
                    const now = mod(k - bass, 12);
                    if (k !== prevKey && (now === 0 || now === 7) && now === mod(prevKey - prevBass, 12)) c += R.parallel;
                }
                if (d === peak && peakTimes >= PEAK_RULE.times) c += PEAK_RULE.cost;
                if (e.cadence && !CADENCE_DEGREES[e.cadence].includes(stepOf(d))) c += R.cadence;
                c += (hash(seed, type, variant, i, d, flat ? 'blue' : '') % 1000) / 1000 * R.tieBreak;
                next.push({ path, d, key: k, blue: !!flat, cost: path.cost + c, base });
            }
            // a copied blue note whose new chord leaves no room to flatten it is played plain
            if (source && next.length === pushed)
            {
                const plain = options.find(o => o.d === source.d && !o.blue);
                next.push({ path, d: plain.d, key: plain.key, blue: false, cost: path.cost, base });
            }
        }
        next.sort((a, b)=> a.cost - b.cost);
        // paths that agree on everything the rules look back at are the same from here on: keep the cheapest
        const seen = new Set();
        beam = [];
        for (const n of next)
        {
            const { path } = n;
            const lastMove = path.prev !== null && n.d !== path.prev ? n.d - path.prev : path.lastMove;
            const peak = Math.max(path.peak, n.d), peakTimes = n.d > path.peak ? 1 : n.d === path.peak ? path.peakTimes + 1 : path.peakTimes;
            const id = `${path.notes.slice(-3).map(x => x.d)},${n.d},${n.key},${Math.sign(lastMove)},${peak},${peakTimes},${n.base}`;
            if (seen.has(id)) continue;
            seen.add(id);
            beam.push({
                cost: n.cost, notes: [...path.notes, { d: n.d, key: n.key, blue: n.blue }], prev: n.d, prev2: path.prev,
                prevKey: n.key, prevBass: bass, lastMove, prevChordTone: pcs.includes(mod(n.key, 12)), peak, peakTimes, base: n.base,
            });
            if (beam.length === MELODY_SEARCH.beam) break;
        }
    });
    const best = beam[0].notes;
    return events.map((e, i)=> ({
        beat: e.beat, beats: e.beats, degree: best[i].d, accidental: best[i].key - degreeToKey(tonic, mode, best[i].d, MELODY_OCTAVE), last: e.last || !!e.cadence,
    }));
}
