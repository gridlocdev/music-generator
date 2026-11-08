// Where things fall in time: chords over bars, metric accents from a meter's beat groups, swing, and which bar a
// beat is in when sections have meters of their own. Shared by the melody, the parts and the performance.
import { DYNAMICS } from './composer-data.js';

export const STEP = 0.25;       // beats per pattern step (a sixteenth note)
export const mod = (n, m)=> ((n % m) + m) % m;
export const clamp = (v, lo, hi)=> Math.min(hi, Math.max(lo, v));
const near = (a, b)=> Math.abs(a - b) < 1e-9;

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

/** where each of a meter's beat groups starts, in beats from the bar line */
export function groupStarts(meter)
{
    const out = [];
    for (let i = 0, at = 0; i < meter.groups.length; at += meter.groups[i++]) out.push(at);
    return out;
}

/** a meter whose groups split beats (6/8, 12/8, 7/8): its eighths are the pulse, so it isn't swung */
export const compound = (meter)=> meter.groups.some(g => !Number.isInteger(g));

/** downbeat, strong (a group's start), weak (another beat), offbeat (an eighth between) or sixteenth */
export function metricWeight(meter, inBar)
{
    if (inBar < 1e-9) return 'downbeat';
    if (groupStarts(meter).some(g => near(g, inBar))) return 'strong';
    const frac = inBar - Math.floor(inBar);
    if (frac < 1e-9 || frac > 1 - 1e-9) return 'weak';
    return near(frac, 0.5) ? 'offbeat' : 'sixteenth';
}

/** a strong beat for the melody: the downbeat or a group's start */
export function strongBeat(meter, inBar)
{
    const w = metricWeight(meter, inBar);
    return w === 'downbeat' || w === 'strong';
}

// sec: anything with meter, beatsPerBar and dynamics (a section plan)
export function velocity(sec, role, energy, beatInSection)
{
    const accent = DYNAMICS.accent[metricWeight(sec.meter, mod(beatInSection, sec.beatsPerBar))];
    const v = (DYNAMICS.base + energy * DYNAMICS.span + DYNAMICS.role[role] + accent) * (0.6 + 0.6 * sec.dynamics);
    return clamp(Math.round(v), 1, 127);
}

/**
 * Swing as a time warp, applied to every start and end at playback so the whole song shares one feel.
 * The second `sub` of each pair lands at `amount` of the pair: 0.5 is straight, 2/3 a full triplet.
 * @param {number} beat
 * @param {number} amount
 * @param {number} sub  0.5 swings eighths, 0.25 sixteenths
 */
export function swingTime(beat, amount, sub = 0.5)
{
    const pair = sub * 2;
    const base = Math.floor(beat / pair + 1e-9) * pair;
    const frac = (beat - base) / pair;
    const warped = frac < 0.5 ? frac * (amount / 0.5) : amount + (frac - 0.5) * ((1 - amount) / 0.5);
    return base + warped * pair;
}

/** a spec's swing (0 straight … 1 triplet) as a swingTime amount */
export const swingAmount = (swing)=> 0.5 + swing / 6;

/** the section a beat falls in (the first, before it starts) */
export const sectionAt = (sections, beat)=> sections.findLast(s => s.beat <= beat + 1e-9) ?? sections[0];

/**
 * The bar a beat falls in, counting across sections with different meters.
 * @param {{ beat: number, beats: number, beatsPerBar: number }[]} sections
 * @returns {{ bar: number, start: number, beatsPerBar: number, section: number }}  bar counts from 0; start is its first beat
 */
export function barAt(sections, beat)
{
    let bars = 0;
    for (let i = 0; i < sections.length; i++)
    {
        const s = sections[i];
        if (beat < s.beat + s.beats - 1e-9 || i === sections.length - 1)
        {
            const k = Math.max(0, Math.floor((beat - s.beat) / s.beatsPerBar + 1e-9));
            return { bar: bars + k, start: s.beat + k * s.beatsPerBar, beatsPerBar: s.beatsPerBar, section: i };
        }
        bars += Math.round(s.beats / s.beatsPerBar);
    }
    return { bar: 0, start: 0, beatsPerBar: 4, section: 0 };
}

/** every bar line from `from` to `to`, in beats */
export function barLines(sections, from, to)
{
    const out = [];
    for (const s of sections)
        for (let b = s.beat; b < s.beat + s.beats - 1e-9; b += s.beatsPerBar)
        {
            if (b >= to) return out;
            if (b >= from) out.push(b);
        }
    return out;
}
