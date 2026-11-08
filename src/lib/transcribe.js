// Turns a pitch track (pitch-track.js) of a whistled melody into notes in 8ths and triplets, finds its key and writes
// it in the composer's scale-degree notation (features/composer/notation.js), `~` marking notes with vibrato. Pure.
//
// The steps: the take's tuning offset (whistlers sit a steady few cents off); note starts from silences, dips in level
// and changes of pitch; the beat grid that best fits those starts near the tempo given (whistling slower than the song
// is fine: the notation counts beats, not seconds); each beat split in 8ths or triplets, whichever its note starts fit;
// a pitch for each slot from the curve with vibrato averaged out; repeated slots merged into one note unless a start
// falls between them; vibrato measured on each note's own wobble.

import { MODES, degreeToKey, keyToDegree } from './music-theory.js';

const mod = (n, m)=> ((n % m) + m) % m;
const median = (xs)=> { const s = [...xs].sort((a, b)=> a - b); return s.length ? s[s.length >> 1] : NaN; };

/** the take's tuning: the mean of every voiced frame's offset from the nearest semitone, in semitones (−0.5..0.5) */
export function tuningOffset(frames)
{
    let x = 0, y = 0;
    for (const f of frames) if (f.midi !== null) { const a = 2 * Math.PI * f.midi; x += Math.cos(a); y += Math.sin(a); }
    return x || y ? Math.atan2(y, x) / (2 * Math.PI) : 0;
}

/** pitch averaged over `span` seconds of voiced frames around each frame: one vibrato cycle (≈ 1/6 s) cancels it */
export function smoothPitch(frames, span = 1 / 6)
{
    const fps = frames.length > 1 ? 1 / (frames[1].time - frames[0].time) : 100;
    const half = Math.max(1, Math.round(span * fps / 2));
    const out = new Array(frames.length).fill(null);
    let sum = 0, n = 0;
    const add = (i, s)=> { if (i >= 0 && i < frames.length && frames[i].midi !== null) { sum += s * frames[i].midi; n += s; } };
    for (let i = -half; i < half; i++) add(i, 1);
    for (let i = 0; i < frames.length; i++)
    {
        add(i + half, 1);
        add(i - half - 1, -1);
        if (frames[i].midi !== null && n > 0) out[i] = sum / n;
    }
    return out;
}

/**
 * Notes whistled freely, with no beat: each run of frames on one semitone, split where a note starts again, with its
 * start and length in seconds. Glides between notes, shorter than `shortest`, are dropped. For a chord whistled as
 * an arpeggio, where only which notes were heard matters.
 * @returns {{ time: number, seconds: number, key: number }[]}
 */
export function freeNotes(frames, { shortest = 0.08 } = {})
{
    if (!frames.length) return [];
    const offset = tuningOffset(frames), smooth = smoothPitch(frames);
    const starts = noteStarts(frames, { offset, smooth });
    const notes = [];
    let cur = null, next = 0;
    const close = (t)=> { if (cur) { cur.seconds = t - cur.time; notes.push(cur); cur = null; } };
    for (let i = 0; i < frames.length; i++)
    {
        const t = frames[i].time;
        let restart = false;
        while (next < starts.length && starts[next] <= t + 1e-9) { next++; restart = true; }
        const key = smooth[i] === null ? null : Math.round(smooth[i] - offset);
        if (cur && (key !== cur.key || restart)) close(t);
        if (key !== null && !cur) cur = { time: t, key };
    }
    close(frames.at(-1).time + (frames.length > 1 ? frames[1].time - frames[0].time : 0.01));
    return notes.filter(n => n.seconds >= shortest);
}

/**
 * Times (seconds) where a note starts: after a silence, at a dip in level between two louder stretches (a note
 * tongued again), or where the smoothed pitch settles on a new semitone for at least `hold` seconds (legato).
 */
export function noteStarts(frames, { offset = tuningOffset(frames), smooth = smoothPitch(frames), hold = 0.06, gap = 0.03 } = {})
{
    const fps = frames.length > 1 ? 1 / (frames[1].time - frames[0].time) : 100;
    const starts = [];
    const holdN = Math.max(1, Math.round(hold * fps)), gapN = Math.max(1, Math.round(gap * fps)), look = Math.round(0.08 * fps);
    let silent = gapN, run = null, runLen = 0, cur = null;
    for (let i = 0; i < frames.length; i++)
    {
        if (frames[i].midi === null) { silent++; cur = null; run = null; continue; }
        if (silent >= gapN) { starts.push(frames[i].time); cur = Math.round(smooth[i] - offset); run = null; }
        silent = 0;
        const k = Math.round(smooth[i] - offset);
        if (k === cur) { run = null; continue; }
        if (k !== run) { run = k; runLen = 0; }
        if (++runLen >= holdN) { starts.push(frames[i - holdN + 1].time); cur = k; run = null; }
    }
    // dips: a local minimum of level under half the loudest level just before and just after it
    for (let i = look; i < frames.length - look; i++)
    {
        const l = frames[i].level;
        if (frames[i].midi === null && frames[i - 1].midi === null) continue;
        if (!(l <= frames[i - 1].level && l < frames[i + 1].level)) continue;
        let before = 0, after = 0;
        for (let j = i - look; j < i; j++) before = Math.max(before, frames[j].level);
        for (let j = i + 1; j <= i + look; j++) after = Math.max(after, frames[j].level);
        if (l < 0.5 * Math.min(before, after) && !starts.some(t => Math.abs(t - frames[i].time) < 0.05)) starts.push(frames[i].time);
    }
    return starts.sort((a, b)=> a - b);
}

/**
 * The grid (an 8th every `slot` seconds from `origin`) that best fits the note starts, searching ±tempoRange around
 * the tempo given and every phase. Each start costs its squared distance to the nearest grid line, in slots.
 * @returns {{ tempo: number, slot: number, origin: number }} origin is the grid line at or just before the first start
 */
export function fitGrid(starts, tempo, { tempoRange = 0.1, steps = 40 } = {})
{
    if (!starts.length) return { tempo, slot: 30 / tempo, origin: 0 };
    let best = { cost: Infinity, tempo, slot: 30 / tempo, phase: 0 };
    for (let i = tempoRange > 0 ? -20 : 0; i <= (tempoRange > 0 ? 20 : 0); i++)
    {
        const tr = tempoRange * i / 20;
        const t = tempo * (1 + tr), slot = 30 / t;
        for (let p = 0; p < steps; p++)
        {
            const phase = starts[0] + (p / steps - 0.5) * slot;
            let cost = tr * tr * 2;   // a small pull toward the tempo given, so a sparse take doesn't wander
            for (const s of starts) { const x = (s - phase) / slot; const e = x - Math.round(x); cost += e * e; }
            if (cost < best.cost) best = { cost, tempo: t, slot, phase };
        }
    }
    const origin = best.phase + Math.floor((starts[0] - best.phase) / best.slot + 0.5) * best.slot;
    return { tempo: best.tempo, slot: best.slot, origin };
}

/**
 * The grid of a take recorded against a click: the click's tempo exactly, its bar lines as beat 0, and the phase of
 * the notes themselves within half an 8th of the click, so the take's latency (the click reaching the ear, the whistle
 * reaching the recording) and a player who sits behind the beat don't push notes into the next 8th.
 * @param {number[]} starts  note starts, seconds (noteStarts)
 * @param {number} tempo  the click's bpm
 * @param {number} downbeat  seconds into the take of the click's bar line that becomes beat 0
 * @returns {{ tempo: number, slot: number, origin: number }}
 */
export function clickGrid(starts, tempo, downbeat)
{
    const slot = 30 / tempo;
    const x = (fitGrid(starts, tempo, { tempoRange: 0 }).origin - downbeat) / slot;
    return { tempo, slot, origin: downbeat + (x - Math.round(x)) * slot };
}

/**
 * Vibrato on a stretch of raw pitch (semitones, `fps` a second): the strongest periodic wobble at 3.5–9 Hz once the
 * stretch's straight-line trend is taken out. null unless it repeats (autocorrelation ≥ minCorr), lasts 1.5 cycles
 * and swings at least minDepth semitones each way.
 * @returns {{ rate: number, depth: number }|null} rate Hz, depth semitones each way
 */
export function measureVibrato(pitches, fps, { minCorr = 0.4, minDepth = 0.1 } = {})
{
    const n = pitches.length;
    if (n < fps / 3) return null;
    // detrend by a least-squares line
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += pitches[i]; sxx += i * i; sxy += i * pitches[i]; }
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), icpt = (sy - slope * sx) / n;
    const r = pitches.map((p, i)=> p - icpt - slope * i);
    const v0 = r.reduce((s, x)=> s + x * x, 0);
    if (v0 === 0) return null;
    let bestLag = 0, bestC = -1;
    for (let lag = Math.floor(fps / 9); lag <= Math.ceil(fps / 3.5) && lag < n * 0.67; lag++)
    {
        let c = 0;
        for (let i = 0; i + lag < n; i++) c += r[i] * r[i + lag];
        c = c / v0 * n / (n - lag);
        if (c > bestC) { bestC = c; bestLag = lag; }
    }
    const depth = Math.SQRT2 * Math.sqrt(v0 / n);
    if (bestC < minCorr || depth < minDepth || n < 1.5 * bestLag) return null;
    return { rate: fps / bestLag, depth };
}

/**
 * Note starts without the passing semitones of a legato glide: a start in the middle of a sound, on a key between the
 * one before it and the one after, with the next start under `glide` seconds later. They'd ask for a finer split.
 */
export function withoutGlides(starts, frames, smooth, offset, { glide = 0.12 } = {})
{
    const fps = frames.length > 1 ? 1 / (frames[1].time - frames[0].time) : 100;
    const at = (t)=> Math.min(frames.length - 1, Math.max(0, Math.round((t - frames[0].time) * fps)));
    const keyAt = (t)=> { const v = smooth[at(t)]; return v === null ? null : Math.round(v - offset); };
    return starts.filter((t, i)=>
    {
        const next = starts[i + 1];
        if (next === undefined || next - t >= glide) return true;
        const before = keyAt(t - 0.03), here = keyAt(t + 0.02), after = keyAt(next + 0.03);
        if (before === null || here === null || after === null) return true;
        return !((before < here && here < after) || (before > here && here > after));
    });
}

// what a finer split of the beat costs, in squared beats, so a beat is split in three or four only when its notes need it
const DIVISION_COST = { 1: 0, 2: 0, 3: 0.01, 4: 0.012 };

/**
 * How each beat is split: for every beat, the division in `divisions` whose lines lie closest to the note starts in it,
 * a start counting toward the beat it's within an 8th before. Two starts on one line cost a lost note.
 * @param {number[]} pos note starts, in beats from the grid's origin
 * @returns {number[]} a division for each of `beats` beats
 */
export function beatDivisions(pos, beats, divisions = [2, 3])
{
    const byBeat = Array.from({ length: beats }, ()=> []);
    for (const x of pos) { const b = Math.floor(x + 0.125); if (b >= 0 && b < beats) byBeat[b].push(x - b); }
    return byBeat.map(xs =>
    {
        let best = divisions[0], bestCost = Infinity;
        for (const d of divisions)
        {
            let cost = DIVISION_COST[d] ?? 0.012;
            const lines = new Set();
            for (const x of xs)
            {
                const line = Math.round(x * d);
                cost += (x - line / d) ** 2 + (lines.has(line) ? 0.05 : 0);
                lines.add(line);
            }
            if (cost < bestCost - 1e-12) { bestCost = cost; best = d; }
        }
        return best;
    });
}

/**
 * Notes on the grid, each beat split in 8ths or triplets (or 16ths, with 4 in `divisions`) as its note starts need. Each slot takes
 * the median of the smoothed pitch over its voiced frames, and holds a note when `voiced` of it is pitched or a note
 * starts in it (a short staccato note); neighbouring slots on the same key join unless a note start lands between them.
 * @returns {{ notes: { beat: number, beats: number, key: number, cents: number, vibrato: { rate: number, depth: number }|null }[],
 *   tempo: number, offset: number, origin: number }} key in the whistle's own register; beats from the first grid line;
 *   cents how far the note's centre sat from the key once the tuning offset is taken out
 */
export function transcribe(frames, { tempo, voiced = 0.4, starts = null, grid = null, divisions = [2, 3] } = {})
{
    if (!(tempo > 0)) throw new Error('transcribe needs the tempo you whistled at');
    const fps = frames.length > 1 ? 1 / (frames[1].time - frames[0].time) : 100;
    const offset = tuningOffset(frames);
    const smooth = smoothPitch(frames);
    starts ??= noteStarts(frames, { offset, smooth });
    grid ??= fitGrid(starts, tempo);
    const last = frames.findLast(f => f.midi !== null);
    if (!last || !starts.length) return { notes: [], tempo: grid.tempo, offset, origin: grid.origin };
    const beatSec = 2 * grid.slot;
    const beats = Math.max(1, Math.ceil((last.time - grid.origin) / beatSec + 0.25));
    const pos = withoutGlides(starts, frames, smooth, offset).map(t => (t - grid.origin) / beatSec);
    const split = beatDivisions(pos, beats, divisions);
    const at = (t)=> Math.min(frames.length - 1, Math.max(0, Math.round((t - frames[0].time) * fps)));
    const atBeat = (b)=> at(grid.origin + b * beatSec);
    // the slots, in beats, and the one each note start lands on
    const slots = [];
    split.forEach((d, b)=> { for (let k = 0; k < d; k++) slots.push({ beat: b + k / d, beats: 1 / d }); });
    const slotOf = (x)=>
    {
        const b = Math.floor(x + 0.125);
        if (b < 0 || b >= beats) return -1;
        let i = 0;
        for (let j = 0; j < b; j++) i += split[j];
        return i + Math.min(split[b] - 1, Math.max(0, Math.round((x - b) * split[b])));
    };
    const breaks = new Set(pos.map(slotOf));
    const minFrames = Math.max(2, Math.round(0.03 * fps));
    const keys = slots.map((s, i)=>
    {
        const a = atBeat(s.beat), b = atBeat(s.beat + s.beats);
        const ps = [];
        for (let j = a; j < b; j++) if (smooth[j] !== null) ps.push(smooth[j]);
        const enough = ps.length >= voiced * Math.max(1, b - a) || (breaks.has(i) && ps.length >= minFrames);
        return enough ? Math.round(median(ps) - offset) : null;
    });
    const notes = [];
    for (let s = 0; s < slots.length; s++)
    {
        if (keys[s] === null) continue;
        const prev = notes.at(-1);
        if (prev && keys[s - 1] === keys[s] && !breaks.has(s)) { prev.beats += slots[s].beats; continue; }
        notes.push({ beat: slots[s].beat, beats: slots[s].beats, key: keys[s] });
    }
    for (const n of notes)
    {
        n.beat = Math.round(n.beat * 1e9) / 1e9;
        n.beats = Math.round(n.beats * 1e9) / 1e9;
        // the note's own frames, trimmed at both ends so scoops and releases don't read as vibrato
        const a = atBeat(n.beat), b = atBeat(n.beat + n.beats);
        const trim = Math.max(Math.round(0.06 * fps), Math.round((b - a) * 0.1));
        const raw = [];
        for (let i = a + trim; i < b - trim; i++) if (frames[i].midi !== null && Math.abs(frames[i].midi - offset - n.key) < 1.5) raw.push(frames[i].midi - offset);
        n.vibrato = measureVibrato(raw, fps);
        n.cents = raw.length ? Math.round(100 * (raw.reduce((s, x)=> s + x, 0) / raw.length - n.key)) : 0;
    }
    return { notes, tempo: grid.tempo, offset, origin: grid.origin };
}

// Krumhansl–Kessler key profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

function correlate(a, b)
{
    const ma = a.reduce((s, x)=> s + x, 0) / 12, mb = b.reduce((s, x)=> s + x, 0) / 12;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return da && db ? num / Math.sqrt(da * db) : 0;
}

/**
 * The likeliest keys for some notes, best first: each pitch class weighted by its length, with the last note counted
 * double (melodies tend to end at home), against major and minor key profiles.
 * @returns {{ key: string, tonic: number, mode: 'major'|'minor', score: number }[]}
 */
export function guessKeys(notes)
{
    const hist = new Array(12).fill(0);
    notes.forEach((n, i)=> { hist[mod(n.key, 12)] += n.beats * (i === notes.length - 1 ? 2 : 1); });
    const out = [];
    for (let t = 0; t < 12; t++)
    {
        const rot = (p)=> Array.from({ length: 12 }, (_, i)=> p[mod(i - t, 12)]);
        out.push({ key: MAJOR_NAMES[t], tonic: t, mode: 'major', score: correlate(hist, rot(MAJOR_PROFILE)) });
        out.push({ key: MINOR_NAMES[t], tonic: t, mode: 'minor', score: correlate(hist, rot(MINOR_PROFILE)) });
    }
    return out.sort((a, b)=> b.score - a.score);
}

/**
 * A key as a scale degree and accidental in the notation's octave. Between two scale steps it's spelt flat, except
 * a raised 4th, and in minor modes a raised 6th or 7th (the melodic and harmonic minor's leading notes).
 */
export function spellDegree(key, tonic, mode, octave)
{
    const guess = keyToDegree(tonic, mode, key, octave);
    let below = null, above = null;
    for (let d = guess - 2; d <= guess + 2; d++)
    {
        const k = degreeToKey(tonic, mode, d, octave);
        if (k === key) return { degree: d, accidental: 0 };
        if (k < key) below = d;
        else if (above === null) above = d;
    }
    const sharpBy = key - degreeToKey(tonic, mode, below, octave), flatBy = degreeToKey(tonic, mode, above, octave) - key;
    const step = mod(below - 1, 7) + 1, minor = MODES[mode][2] === 3;
    const preferSharp = (step === 4 && MODES[mode][3] === 5) || (minor && (step === 6 || step === 7));
    if (sharpBy < flatBy || (sharpBy === flatBy && preferSharp)) return { degree: below, accidental: sharpBy };
    return { degree: above, accidental: -flatBy };
}

/** a length in beats: one that isn't a whole number of 16ths (a triplet's) as a fraction, `1/3` or `7/6`, so they add up exactly */
function beatText(b)
{
    const twelfths = Math.round(b * 12);
    if (Math.abs(b * 12 - twelfths) < 1e-6 && twelfths % 3 !== 0)
    {
        const gcd = (x, y)=> y ? gcd(y, x % y) : x, g = gcd(twelfths, 12);
        return `${twelfths / g}/${12 / g}`;
    }
    return String(Math.round(b * 1000) / 1000);
}

/**
 * Notes as the composer's melody notation: `degree[~][:beats]`, rests between notes, a `|` at each bar line.
 * The octave is chosen so the degrees sit mostly between 1 and 8 (8 = the tonic above); outside 1–14 a degree is
 * written with ' or , instead.
 * @param {{ beat: number, beats: number, key: number, vibrato?: object|null }[]} notes
 * @param {{ tonic: number, mode: string, beatsPerBar?: number, octave?: number }} key
 */
export function toNotation(notes, { tonic, mode, beatsPerBar = 4, octave = null })
{
    if (!notes.length) return '';
    if (octave === null)
    {
        const mid = median(notes.map(n => n.key));
        let best = Infinity;
        for (let o = 0; o <= 9; o++)
        {
            const dist = Math.abs(keyToDegree(tonic, mode, mid, o) - 4.5);
            if (dist < best) { best = dist; octave = o; }
        }
    }
    const out = [];
    let t = 0;
    const bar = (b)=> { if (b > 0 && Math.abs(b / beatsPerBar - Math.round(b / beatsPerBar)) < 1e-6) out.push('|'); };
    for (const n of notes)
    {
        if (n.beat > t + 1e-6) { bar(t); out.push(`r${n.beat - t === 1 ? '' : ':' + beatText(n.beat - t)}`); t = n.beat; }
        bar(t);
        let { degree, accidental } = spellDegree(n.key, tonic, mode, octave);
        let marks = '';
        while (degree < 1) { degree += 7; marks += ','; }
        while (degree > 14) { degree -= 7; marks += "'"; }
        const acc = accidental < 0 ? 'b'.repeat(-accidental) : '#'.repeat(accidental);
        out.push(`${acc}${degree}${marks}${n.vibrato ? '~' : ''}${n.beats === 1 ? '' : ':' + beatText(n.beats)}`);
        t = n.beat + n.beats;
    }
    return out.join(' ');
}

/** the take's vibrato as one setting: the median rate and depth of the notes that have it, depth in cents */
export function vibratoSummary(notes)
{
    const v = notes.filter(n => n.vibrato).map(n => n.vibrato);
    if (!v.length) return null;
    return { rate: Math.round(median(v.map(x => x.rate)) * 10) / 10, cents: Math.round(median(v.map(x => x.depth)) * 100), notes: v.length };
}
