// Ornaments on a melody, as a classical pianist plays them, written into the score so the view and the MIDI file show
// them: a trill on the long note before a phrase's last, a turn on a long note, a mordent on a phrase's first long
// note, and a grace note before a leap up. Each is a chance of the style's `ornaments`, hashed so a song plays the same
// every time, and ORNAMENTS.gap seconds apart, so they decorate the line rather than bury it. A note outside the scale
// (a borrowed b6) is left plain: its neighbours aren't the scale's. Pure.
import { diatonicShift, hash, MODES } from '../lib/music-theory.js';
import { ORNAMENTS } from './song-craft-data.js';

/**
 * @param {{ key: number, beat: number, beats: number, vel: number }[]} lead  a section's melody, in order
 * @param {{ tonic: number, mode: string, seed: string, type: string, n: number, style: { ornaments: number } }} sec
 * @param {number} bpm  the tempo where the section starts: a slow tempo plays its ornaments in shorter steps
 */
export function ornament(lead, sec, bpm)
{
    const chance = sec.style.ornaments ?? 0;
    if (chance <= 0) return lead;
    const O = ORNAMENTS, step = bpm > O.slowAbove ? O.fast : O.slow;
    const near = (key, steps)=> diatonicShift(key, steps, sec.tonic, sec.mode);
    const soft = (vel)=> Math.max(1, vel - O.soften);
    const roll = (what, n)=> hash(sec.seed, sec.type, sec.n, 'ornament', what, n.beat) / 2 ** 32;
    // a note ends a phrase when a rest of half a beat or more, or the section's end, follows it
    const endsPhrase = (i)=> !lead[i + 1] || lead[i + 1].beat - (lead[i].beat + lead[i].beats) >= 0.5 - 1e-9;
    const startsPhrase = (i)=> i === 0 || endsPhrase(i - 1);
    const out = [];
    let last = -Infinity;
    lead.forEach((n, i)=>
    {
        const free = (n.beat - last) * 60 / bpm >= O.gap && MODES[sec.mode].includes(((n.key - sec.tonic) % 12 + 12) % 12);
        // the notes an ornament plays at the start of n, then n itself for what's left
        const run = (keys)=> keys.map((key, j)=> ({ key, beat: n.beat + j * step, beats: step, vel: j ? soft(n.vel) : n.vel, ornament: true }));
        let notes = null;
        if (free && n.beats >= O.trill && i + 1 < lead.length && endsPhrase(i + 1) && roll('trill', n) < Math.min(1, chance * O.cadence))
        {
            // from the note above, alternating for most of the note, then the note itself held to the end
            const count = 2 * Math.max(1, Math.floor(n.beats * O.trillShare / step / 2));
            notes = run(Array.from({ length: count }, (_, j)=> j % 2 ? n.key : near(n.key, 1)));
        }
        else if (free && n.beats >= O.turn && !endsPhrase(i) && roll('turn', n) < chance)
            notes = run([near(n.key, 1), n.key, near(n.key, -1)]);
        else if (free && n.beats >= O.mordent && startsPhrase(i) && roll('mordent', n) < chance)
            notes = run([n.key, near(n.key, -1)]);
        else if (free && n.beats >= O.grace && i > 0 && n.key - lead[i - 1].key >= O.leap && roll('grace', n) < chance)
            notes = run([near(n.key, -1)]);
        if (!notes) { out.push(n); return; }
        const used = notes.length * step;
        out.push(...notes, { ...n, beat: n.beat + used, beats: n.beats - used, vel: soft(n.vel) });
        last = n.beat;
    });
    return out;
}
