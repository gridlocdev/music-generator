// Where things fall in time: chords over bars, metric accents, swing. Shared by the melody and the parts.
import { DYNAMICS } from './composer-data.js';

export const STEP = 0.25;       // beats per pattern step (a sixteenth note)
export const mod = (n, m)=> ((n % m) + m) % m;
export const clamp = (v, lo, hi)=> Math.min(hi, Math.max(lo, v));

// lays the progression over the section's bars, repeating it as needed and cutting it at the end
export function chordTimeline(progression, bars, beatsPerBar, start)
{
    const total = bars * beatsPerBar, out = [];
    for (let b = 0, i = 0; b < total - 1e-9; i++)
    {
        const { chord, bars: len } = progression[i % progression.length];
        const beats = Math.min(len * beatsPerBar, total - b);
        out.push({ chord, beat: start + b, beats });
        b += beats;
    }
    return out;
}

export const chordAt = (timeline, beat)=> (timeline.findLast(c => c.beat <= beat + 1e-9) ?? timeline[0]).chord;

export function velocity(song, role, energy, beatInSection)
{
    const inBar = mod(beatInSection, song.beatsPerBar);
    const a = DYNAMICS.accent;
    const frac = inBar - Math.floor(inBar);
    const accent = inBar < 1e-9 ? a.downbeat
        : Math.abs(frac - 0.5) < 1e-9 ? a.offbeat
        : frac > 1e-9 && frac < 1 - 1e-9 ? a.sixteenth
        : song.beatsPerBar === 4 && Math.round(inBar) === 2 ? a.strong : a.weak;
    const v = (DYNAMICS.base + energy * DYNAMICS.span + DYNAMICS.role[role] + accent) * (0.6 + 0.6 * song.dynamics);
    return clamp(Math.round(v), 1, 127);
}

// swung eighths: the offbeat eighth moves late by up to a triplet sixth of a beat
export function applySwing(note, swing)
{
    const shift = (b)=>
    {
        const frac = b - Math.floor(b);
        return Math.abs(frac - 0.5) < 1e-6 ? b + swing / 6 : b;
    };
    const end = shift(note.beat + note.beats);
    note.beat = shift(note.beat);
    note.beats = Math.max(0.05, end - note.beat);
}
