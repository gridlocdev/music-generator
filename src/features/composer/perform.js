// A score's performance: what a player adds to the written notes. Passes run in a fixed order so they don't fight:
//   detail  ear candy (ear-candy.js), ghost notes on the snare and bass, softer inner notes in quick runs,
//           phrases that swell and taper, +1 scoops into phrase endings and a section's last chord,
//           slides between notes on instruments that bend, vibrato that arrives late on held notes
//   feel    swing as one time warp over every part, then timing that breathes on top (drums and bass hold the grid)
// Pure and deterministic like compose(): a hash stands in for the dice. `pass` counts the times round a loop, so
// every pass gets its own small details while the written music stays the same.
// The score stays on the grid for the view and the MIDI file; only the player uses this.
import { hash } from '../../lib/music-theory.js';
import { EXPRESSION } from './performance-data.js';
import { DRUM_KEYS } from './patterns-data.js';
import { beatToSeconds, bpmAt } from '../../lib/tempo-map.js';
import { clamp, compound, swingTime, swingAmount, sectionAt as sectionOf } from './meter.js';
import { meterOf } from './meter-patterns.js';
import { planEarCandy } from './ear-candy.js';
import { EAR_CANDY } from './adaptive-data.js';

/**
 * @typedef {import('./compose.js').Note & { grid: number, glideFrom?: number, held?: boolean, ghost?: boolean, candy?: boolean,
 *   vibrato?: import('../../audio/soundfont.js').Vibrato, scoop?: import('../../audio/soundfont.js').Scoop }} PerformedNote
 *   grid: where the note belongs, before anticipation, swing and drift moved it; a loop or a jump to a beat plays the
 *   notes whose grid is at or after it, even those that sound a little before it.
 *   glideFrom: slide into this note from that key on the same voice; held: no note-off, the next note glides on from it
 */

/**
 * @param {import('./compose.js').Score} score
 * @param {number} [pass]  which time round a loop (0 the first)
 * @param {import('./ear-candy.js').Candy[]} [candy]  the pass's ear candy, when the caller has already planned it
 * @returns {PerformedNote[][]}  one list per track, sorted by start
 */
export function perform(score, pass = 0, candy = planEarCandy(score, pass))
{
    const spbAt = (beat)=> 60 / bpmAt(score.tempoMap, beat);     // seconds per beat where a note is
    const unit = (...parts)=> hash(score.title, pass, ...parts) / 2 ** 32;    // 0..1, the same every time
    const style = score.style ?? {};
    const sectionAt = (beat)=> sectionOf(score.sections, beat);
    return score.tracks.map(t =>
    {
        let notes = /** @type {PerformedNote[]} */ (t.notes.map(({ anticipates, ...n })=> ({ ...n, grid: anticipates ?? n.beat })));
        const melodic = t.bank < 128;
        notes = withCandy(notes, t, candy, score);
        if (t.role === 'drums') addSnareGhosts(notes, score, unit, sectionAt, style.ghosts ?? 0);
        if (t.role === 'bass') addBassGhosts(notes, unit, sectionAt, style.ghosts ?? 0);
        notes.sort((a, b)=> a.beat - b.beat || a.key - b.key);
        if (EXPRESSION.run.roles.includes(t.role)) shapeRuns(notes);
        const ends = EXPRESSION.phrase.roles.includes(t.role) ? shapePhrases(notes, sectionAt) : [];
        if (melodic && EXPRESSION.scoop.roles.includes(t.role) && bends(t.program)) addScoops(notes, t.role, ends, score, unit, style.scoops ?? 0);
        if (score.swing) swing(notes, score, sectionAt);
        if (EXPRESSION.glide.roles.includes(t.role) && EXPRESSION.glide.programs.includes(t.program) && melodic) addGlides(notes, sectionAt, unit, t.role);
        if (EXPRESSION.vibrato.roles.includes(t.role) && EXPRESSION.vibrato.programs.includes(t.program) && melodic)
        {
            const v = EXPRESSION.vibrato;
            for (const n of notes)
                if (n.beats * spbAt(n.beat) >= v.minSeconds)
                    n.vibrato = { rate: v.rate + (unit(t.role, 'vib', n.beat) * 2 - 1) * v.rateSpread, cents: v.cents, delay: v.delay, ramp: v.ramp };
        }
        const jitter = (EXPRESSION.jitterMs[t.role] ?? 0) / 1000;      // in seconds
        if (jitter)
            for (const n of notes)
            {
                const shift = (unit(t.role, 'time', n.beat, n.key) * 2 - 1) * jitter / spbAt(n.beat);
                n.beat = Math.max(0, n.beat + shift);
                if (!n.held) n.beats = Math.max(0.05, n.beats - Math.max(0, shift));
            }
        notes.sort((a, b)=> a.beat - b.beat || a.key - b.key);
        return endBeforeRepeats(notes);
    });
}

const bends = (program)=> EXPRESSION.scoop.programs.some(([lo, hi])=> program >= lo && program <= hi);

// the ear candy that's notes: a section's first chord rising an octave into place, a high accent, a flourish of
// the chord above the bar's last beat; and the notes a tape stop swallows
function withCandy(notes, t, candy, score)
{
    const secs = (b)=> beatToSeconds(score.tempoMap, b);
    const out = notes.filter(n => !candy.some(c => c.kind === 'tapeStop' && n.beat < c.beat - 1e-9 && secs(c.beat) - secs(n.beat) <= c.seconds + 1e-9));
    for (const c of candy)
    {
        if (c.kind === 'riser' && c.roles.includes(t.role))
            for (const n of out) if (Math.abs(n.beat - c.beat) < 1e-6) n.scoop = { cents: EAR_CANDY.riser.cents, seconds: EAR_CANDY.riser.seconds };
        if (c.kind === 'accent' && c.role === t.role)
            out.push({ key: c.key, beat: c.beat, grid: c.beat, beats: EAR_CANDY.accent.beats, vel: EAR_CANDY.accent.vel, candy: true });
        if (c.kind === 'flourish' && c.role === t.role)
            c.keys.forEach((key, i)=>
            {
                const beat = c.beat + i * EAR_CANDY.flourish.step;
                out.push({ key, beat, grid: beat, beats: EAR_CANDY.flourish.step, vel: EAR_CANDY.flourish.vel, candy: true });
            });
    }
    return out;
}

// quiet, short snare hits a sixteenth either side of each backbeat, in sections loud enough to groove
function addSnareGhosts(notes, score, unit, sectionAt, amount)
{
    const G = EXPRESSION.ghost;
    if (!amount) return;
    const snare = DRUM_KEYS.snare;
    const taken = new Set(notes.filter(n => n.key === snare).map(n => Math.round(n.beat * 4)));
    for (const n of notes.filter(n => n.key === snare && n.vel >= 60))
        for (const d of [-1, 1])
        {
            const step = Math.round(n.beat * 4) + d, beat = step / 4;
            if (beat < 0 || beat >= score.beats - G.snare.beats || taken.has(step) || sectionAt(beat).energy < G.minEnergy) continue;
            if (unit('ghost', step) >= G.snare.chance * amount) continue;
            taken.add(step);
            const [lo, hi] = G.snare.vel;
            notes.push({ key: snare, beat, grid: beat, beats: G.snare.beats, vel: Math.round(lo + (hi - lo) * unit('gv', step)), ghost: true });
        }
}

// a dead note a sixteenth before a bass note, where the line has a gap
function addBassGhosts(notes, unit, sectionAt, amount)
{
    const G = EXPRESSION.ghost;
    if (!amount) return;
    const sorted = [...notes].sort((a, b)=> a.beat - b.beat);
    sorted.forEach((n, i)=>
    {
        const at = n.beat - 0.25, before = sorted[i - 1];
        if (at < 0 || (before && before.beat + before.beats > at - 1e-9) || sectionAt(n.beat).energy < G.minEnergy) return;
        if (unit('bass-ghost', n.beat) >= G.bass.chance * amount) return;
        const [lo, hi] = G.bass.vel;
        notes.push({ key: n.key, beat: at, grid: at, beats: G.bass.beats, vel: Math.round(lo + (hi - lo) * unit('bgv', n.beat)), ghost: true });
    });
}

// in a quick run of notes all moving one way, the inner notes are softer than the first and the last
function shapeRuns(notes)
{
    const R = EXPRESSION.run;
    let run = [];
    const soften = ()=> { if (run.length >= R.minNotes) for (const n of run.slice(1, -1)) n.vel = clamp(n.vel - R.inner, 1, 127); };
    for (const n of notes)
    {
        const a = run.at(-2), b = run.at(-1);
        const quick = !!b && n.beat - b.beat > 1e-9 && n.beat - b.beat <= R.maxGapBeats + 1e-9 && n.key !== b.key;
        if (quick && (!a || Math.sign(b.key - a.key) === Math.sign(n.key - b.key))) { run.push(n); continue; }
        soften();
        run = quick ? [b, n] : [n];         // a turn starts the next run on the note it turns on
    }
    soften();
}

// a crescendo across each phrase of a section, and a softer last note, so the line breathes like a sung one.
// Returns each phrase's last note.
function shapePhrases(notes, sectionAt)
{
    const { bars, swell, taper } = EXPRESSION.phrase;
    const last = new Map();
    for (const n of notes)
    {
        const s = sectionAt(n.beat);
        const span = bars * s.beatsPerBar;
        const phrase = Math.floor((n.beat - s.beat) / span);
        const at = (n.beat - s.beat - phrase * span) / span;
        n.vel = clamp(Math.round(n.vel + swell * (at - 0.5)), 1, 127);
        const id = `${s.beat}:${phrase}`;
        if (!last.has(id) || last.get(id).beat < n.beat) last.set(id, n);
    }
    for (const n of last.values()) n.vel = clamp(n.vel - taper, 1, 127);
    return [...last.values()];
}

// the +1 trick: start a semitone low and slide up. On the melody's phrase endings; on the chords' last chord of a section.
// The notes of a chord scoop together.
function addScoops(notes, role, ends, score, unit, chance)
{
    if (!chance) return;
    const S = EXPRESSION.scoop;
    const targets = role === 'lead' || role === 'counter' ? ends
        : score.sections.flatMap(s =>
        {
            const c = score.chords.findLast(c => c.beat < s.beat + s.beats - 1e-9 && c.beat >= s.beat);
            return c ? notes.filter(n => Math.abs(n.beat - c.beat) < 1e-6) : [];
        });
    for (const n of targets)
    {
        if (n.glideFrom !== undefined || n.scoop || unit(role, 'scoop', n.beat) >= chance) continue;
        n.scoop = { cents: S.cents, seconds: S.seconds[0] + (S.seconds[1] - S.seconds[0]) * unit('scoop-len', n.beat) };
    }
}

// swing: one warp of time for every part, starts and ends alike, counted from the start of each note's section so a
// section of an odd number of eighths (7/8) can't turn the swing around; compound meters already move in threes
function swing(notes, score, sectionAt)
{
    const amount = swingAmount(score.swing);
    for (const n of notes)
    {
        const s = sectionAt(n.beat);
        if (compound(meterOf(s.meter))) continue;
        const start = s.beat + swingTime(n.beat - s.beat, amount, score.swingSub);
        const end = s.beat + swingTime(n.beat + n.beats - s.beat, amount, score.swingSub);
        n.beat = start;
        n.beats = Math.max(0.05, end - start);
    }
}

/**
 * The score with its swing applied and nothing else, for a file that should sound like the song (a MIDI export).
 * @param {import('./compose.js').Score} score
 * @returns {import('./compose.js').Track[]}
 */
export function swungTracks(score)
{
    if (!score.swing) return score.tracks;
    return score.tracks.map(t =>
    {
        const notes = t.notes.map(n => ({ key: n.key, beat: n.beat, beats: n.beats, vel: n.vel }));
        swing(notes, score, (beat)=> sectionOf(score.sections, beat));
        return { ...t, notes };
    });
}

// a note must end before the same key sounds again (after drifting, or in a fill of overlapping drum hits),
// or its note-off would cut the new note short. Two of the same key at once become one, the louder and longer.
function endBeforeRepeats(notes)
{
    const next = new Map(), merged = new Set();
    for (let i = notes.length - 1; i >= 0; i--)
    {
        const n = notes[i], after = next.get(n.key);
        if (after && !n.held && after.beat - n.beat < 1e-6 && after.glideFrom === undefined)
        {
            after.vel = Math.max(after.vel, n.vel);
            after.beats = Math.max(after.beats, n.beats);
            merged.add(n);
            continue;
        }
        if (after && !n.held && n.beat + n.beats > after.beat) n.beats = Math.max(1e-3, after.beat - n.beat);
        next.set(n.key, n);
    }
    return merged.size ? notes.filter(n => !merged.has(n)) : notes;
}

// marks notes to slide into from the one before; that one is then held into it rather than released
function addGlides(notes, sectionAt, unit, role)
{
    const g = EXPRESSION.glide;
    for (let i = 1; i < notes.length; i++)
    {
        const a = notes[i - 1], b = notes[i];
        const interval = Math.abs(b.key - a.key);
        const gap = b.beat - (a.beat + a.beats);
        const s = sectionAt(b.beat);
        const downbeat = Math.abs(((b.beat - s.beat) / s.beatsPerBar) % 1) < 1e-9;
        if (interval < 1 || interval > g.maxInterval || gap < -1e-9 || gap > g.maxGapBeats || a.beats < g.minBeats || downbeat || b.scoop) continue;
        if (unit(role, 'glide', b.beat) >= g.chance) continue;
        a.held = true;
        a.beats = b.beat - a.beat;
        b.glideFrom = a.key;
    }
}
