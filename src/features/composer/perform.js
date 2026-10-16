// A score's performance: what a player adds to the written notes. Timing that breathes (but drums and bass hold
// the groove), phrases that swell and taper off, slides between notes on instruments that can bend, and vibrato
// that arrives late on held notes. Pure and deterministic like compose(): a hash stands in for the dice.
// The score stays on the grid for the view and the MIDI file; only the player uses this.
import { hash } from '../../lib/music-theory.js';
import { EXPRESSION } from './composer-data.js';
import { clamp } from './meter.js';

/**
 * @typedef {import('./compose.js').Note & { glideFrom?: number, held?: boolean,
 *   vibrato?: import('../../audio/soundfont.js').Vibrato }} PerformedNote
 *   glideFrom: slide into this note from that key on the same voice; held: no note-off, the next note glides on from it
 */

/**
 * @param {import('./compose.js').Score} score
 * @returns {PerformedNote[][]}  one list per track, sorted by start
 */
export function perform(score)
{
    const spb = 60 / score.tempo;
    const unit = (...parts)=> hash(score.title, ...parts) / 2 ** 32;    // 0..1, the same every time
    return score.tracks.map(t =>
    {
        const notes = /** @type {PerformedNote[]} */ (t.notes.map(n => ({ ...n })));
        if (EXPRESSION.phrase.roles.includes(t.role)) shapePhrases(notes, score);
        if (EXPRESSION.glide.roles.includes(t.role) && EXPRESSION.glide.programs.includes(t.program) && t.bank < 128) addGlides(notes, score, unit, t.role);
        if (EXPRESSION.vibrato.roles.includes(t.role) && EXPRESSION.vibrato.programs.includes(t.program) && t.bank < 128)
        {
            const v = EXPRESSION.vibrato;
            for (const n of notes)
                if (n.beats * spb >= v.minSeconds)
                    n.vibrato = { rate: v.rate + (unit(t.role, 'vib', n.beat) * 2 - 1) * v.rateSpread, cents: v.cents, delay: v.delay, ramp: v.ramp };
        }
        const drift = (EXPRESSION.jitterMs[t.role] ?? 0) / 1000 / spb;     // in beats
        if (drift)
            for (const n of notes)
            {
                const shift = (unit(t.role, 'time', n.beat, n.key) * 2 - 1) * drift;
                n.beat = Math.max(0, n.beat + shift);
                if (!n.held) n.beats = Math.max(0.05, n.beats - Math.max(0, shift));
            }
        notes.sort((a, b)=> a.beat - b.beat || a.key - b.key);
        return endBeforeRepeats(notes);
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

// a crescendo across each phrase of a section, and a softer last note, so the line breathes like a sung one
function shapePhrases(notes, score)
{
    const { bars, swell, taper } = EXPRESSION.phrase;
    const span = bars * score.beatsPerBar;
    const last = new Map();
    for (const n of notes)
    {
        const s = score.sections.findLast(s => s.beat <= n.beat) ?? score.sections[0];
        const phrase = Math.floor((n.beat - s.beat) / span);
        const at = (n.beat - s.beat - phrase * span) / span;
        n.vel = clamp(Math.round(n.vel + swell * (at - 0.5)), 1, 127);
        const id = `${s.beat}:${phrase}`;
        if (!last.has(id) || last.get(id).beat < n.beat) last.set(id, n);
    }
    for (const n of last.values()) n.vel = clamp(n.vel - taper, 1, 127);
}

// marks notes to slide into from the one before; that one is then held into it rather than released
function addGlides(notes, score, unit, role)
{
    const g = EXPRESSION.glide;
    for (let i = 1; i < notes.length; i++)
    {
        const a = notes[i - 1], b = notes[i];
        const interval = Math.abs(b.key - a.key);
        const gap = b.beat - (a.beat + a.beats);
        const downbeat = Math.abs((b.beat / score.beatsPerBar) % 1) < 1e-9;
        if (interval < 1 || interval > g.maxInterval || gap < -1e-9 || gap > g.maxGapBeats || a.beats < g.minBeats || downbeat) continue;
        if (unit(role, 'glide', b.beat) >= g.chance) continue;
        a.held = true;
        a.beats = b.beat - a.beat;
        b.glideFrom = a.key;
    }
}
