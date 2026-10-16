// The accompaniment: chords, pad, arpeggio, countermelody, bass and drums, written from the chord timeline.
import { chordPitchClasses, voiceChord, degreeToKey, keyToDegree } from '../../lib/music-theory.js';
import { RANGES } from './composer-data.js';
import { DRUM_KEYS, BASS, COMPING } from './patterns-data.js';
import { STEP, mod, clamp, chordAt, velocity } from './meter.js';

// pitch classes to voice: power chords are root and fifth; big chords drop the fifth to stay at four notes
function voicingClasses(chord, power)
{
    const pcs = chordPitchClasses(chord);
    if (power) return [pcs[0], mod(chord.root + 7, 12)];
    return pcs.length > 4 ? pcs.filter((_, i)=> i !== 2) : pcs;
}

export function writeChords(sec, track, memory)
{
    const [lo, hi] = RANGES.chords;
    const stepsPerBar = sec.beatsPerBar * 4;
    const style = sec.ending ? 'sustain' : sec.energy < 0.5 ? 'sustain' : sec.comp;
    const hits = (COMPING[style] ?? COMPING.sustain).filter(([s])=> s < stepsPerBar);
    for (const span of sec.timeline)
    {
        let v = voiceChord(voicingClasses(span.chord, sec.power), memory.chords, lo, hi);
        if (sec.power) v = [...v, v[0] + 12];
        memory.chords = v;
        const end = span.beat + span.beats;
        for (let bar = Math.floor((span.beat - sec.beat) / sec.beatsPerBar); bar < sec.bars; bar++)
        {
            const barStart = sec.beat + bar * sec.beatsPerBar;
            if (barStart >= end) break;
            for (const [step, len] of hits)
            {
                const t = barStart + step * STEP;
                if (t < span.beat - 1e-9 || t >= end - 1e-9) continue;
                const beats = Math.min(len * STEP, end - t, (stepsPerBar - step) * STEP) * (style === 'sustain' ? 1 : sec.legato);
                for (const key of v) track.notes.push({ key, beat: t, beats, vel: velocity(sec, 'chords', sec.energy, t - sec.beat) });
            }
        }
    }
}

export function writePad(sec, track, memory)
{
    const [lo, hi] = RANGES.pad;
    for (const span of sec.timeline)
    {
        const v = memory.pad = voiceChord(voicingClasses(span.chord, false), memory.pad, lo, hi);
        for (const key of v) track.notes.push({ key, beat: span.beat, beats: span.beats, vel: velocity(sec, 'pad', sec.energy, 0) });
    }
}

export function writeArp(sec, track, memory)
{
    const [lo, hi] = RANGES.arp;
    const { order, step } = sec.arp;
    const len = step * STEP;
    const total = sec.bars * sec.beatsPerBar;
    let current = null, notes = [];
    for (let i = 0; i * len < total - 1e-9; i++)
    {
        const t = sec.beat + i * len;
        const chord = chordAt(sec.timeline, t);
        if (chord !== current)
        {
            current = chord;
            const v = memory.arp = voiceChord(voicingClasses(chord, false), memory.arp, lo, hi - 12);
            notes = [...v, v[0] + 12];
        }
        const key = notes[order[i % order.length] % notes.length];
        track.notes.push({ key, beat: t, beats: len * sec.legato, vel: velocity(sec, 'arp', sec.energy, t - sec.beat) });
    }
}

// guide tones: the third (or seventh) of each chord, held, moving as little as possible
export function writeCounter(sec, track, memory)
{
    const [lo, hi] = RANGES.counter;
    for (const span of sec.timeline)
    {
        const c = span.chord;
        const wanted = [c.tones[1], c.tones[3], c.tones[2]].filter(x => x !== undefined).map(x => mod(c.root + x, 12));
        let best = null, bestCost = Infinity;
        wanted.forEach((pc, rank)=>
        {
            for (let k = lo + mod(pc - lo, 12); k <= hi; k += 12)
            {
                const cost = (memory.counter === null ? Math.abs(k - (lo + hi) / 2) : Math.abs(k - memory.counter)) + rank * 2;
                if (cost < bestCost) { best = k; bestCost = cost; }
            }
        });
        memory.counter = best;
        // split long chords into one note per bar, so the line keeps speaking
        for (let t = span.beat; t < span.beat + span.beats - 1e-9; t += sec.beatsPerBar)
        {
            const beats = Math.min(sec.beatsPerBar, span.beat + span.beats - t);
            track.notes.push({ key: best, beat: t, beats, vel: velocity(sec, 'counter', sec.energy, t - sec.beat) });
        }
    }
}

export function writeBass(sec, track, memory, finalRoot)
{
    const [lo, hi] = RANGES.bass;
    const steps = sec.beatsPerBar * 4;
    const patterns = BASS[sec.grooveName] ?? BASS.pop;
    const pattern = (sec.energy < 0.6 ? patterns.low : patterns.high).filter(([s])=> s < steps);
    const place = (pc, near)=>
    {
        let best = lo, bestCost = Infinity;
        for (let k = lo + mod(pc - lo, 12); k <= hi; k += 12)
        {
            const cost = Math.abs(k - near) + 0.3 * Math.abs(k - 38);
            if (cost < bestCost) { best = k; bestCost = cost; }
        }
        return best;
    };
    for (let bar = 0; bar < sec.bars; bar++)
    {
        const barStart = sec.beat + bar * sec.beatsPerBar;
        if (sec.ending && bar === sec.bars - 1)
        {
            const root = place(chordAt(sec.timeline, barStart).root, memory.bass);
            track.notes.push({ key: root, beat: barStart, beats: sec.beatsPerBar, vel: velocity(sec, 'bass', sec.energy, 0) });
            break;
        }
        for (const [step, tone, len] of pattern)
        {
            const t = barStart + step * STEP;
            const chord = chordAt(sec.timeline, t);
            const root = place(chord.root, memory.bass);
            let key = root;
            if (tone === '3') key = root + (chord.tones[1] ?? 4);
            else if (tone === '5') key = root + 7 <= hi ? root + 7 : root - 5;
            else if (tone === '8') key = root + 12 <= hi ? root + 12 : root;
            else if (tone === 'A')
            {
                const nextT = barStart + sec.beatsPerBar;
                const next = nextT < sec.beat + sec.bars * sec.beatsPerBar ? chordAt(sec.timeline, nextT) : null;
                const target = place(next ? next.root : finalRoot ?? chord.root, root);
                key = target === root ? root + 7 : target + (target > root ? -1 : 1) * (inScaleStep(sec, target, target > root ? -1 : 1));
            }
            while (key > hi) key -= 12;
            while (key < lo) key += 12;
            if (tone === 'R') memory.bass = key;
            track.notes.push({ key, beat: t, beats: len * STEP * sec.legato, vel: velocity(sec, 'bass', sec.energy, t - sec.beat) });
        }
    }
}

// semitones from a key to the scale step next to it, in direction dir (−1 below, +1 above)
function inScaleStep(sec, key, dir)
{
    const deg = keyToDegree(sec.tonic, sec.mode, key, 2);
    return Math.abs(degreeToKey(sec.tonic, sec.mode, deg + dir, 2) - key) || 1;
}

const HIT = { X: 1, x: 0.8, o: 0.45 };
const RINGS = new Set(['crash', 'open', 'ride']);

export function writeDrums(sec, track)
{
    const g = sec.groove;
    const steps = sec.beatsPerBar * 4;
    const level = sec.energy < 0.55 ? 'low' : sec.energy < 0.8 ? 'mid' : 'high';
    const vel = (t, f)=> clamp(Math.round(velocity(sec, 'drums', sec.energy, t - sec.beat) * f), 1, 127);
    for (let bar = 0; bar < sec.bars; bar++)
    {
        const barStart = sec.beat + bar * sec.beatsPerBar;
        if (sec.ending && bar === sec.bars - 1)
        {
            for (const v of ['kick', 'crash']) track.notes.push({ key: DRUM_KEYS[v], beat: barStart, beats: sec.beatsPerBar, vel: vel(barStart, 1) });
            break;
        }
        const pattern = sec.fill && bar === sec.bars - 1 ? g.fill : g[level];
        if (!pattern) continue;
        if (bar === 0 && sec.energy >= 0.6) track.notes.push({ key: DRUM_KEYS.crash, beat: barStart, beats: 2, vel: vel(barStart, 1) });
        for (const [voice, hits] of Object.entries(pattern))
            for (let s = 0; s < Math.min(steps, hits.length); s++)
            {
                const f = HIT[hits[s]];
                if (!f) continue;
                const t = barStart + s * STEP;
                track.notes.push({ key: DRUM_KEYS[voice], beat: t, beats: RINGS.has(voice) ? 1 : 0.5, vel: vel(t, f) });
            }
    }
}
