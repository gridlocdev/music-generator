// How a song's mix is set up and how it moves: each part's channel strip, automation keyframes (filter sweeps
// into builds, more reverb in quiet sections and the outro), and the kick hits the bass and pad duck under.
// Pure, like compose(); song-player.js turns it into Web Audio automation.
import { MIX, DUCK, MOVEMENT, SECTIONS } from './composer-data.js';

/**
 * A keyframe: the value is reached at `beat`. curve: 'set' jumps there, 'linear' / 'exp' ramp from the keyframe before.
 * @typedef {{ beat: number, value: number, curve: 'set' | 'linear' | 'exp' }} Keyframe
 */

/** @param {import('./compose.js').Score} score */
export function planMix(score)
{
    const spb = 60 / score.tempo;
    const kicks = [...new Set((score.tracks.find(t => t.role === 'drums')?.notes ?? [])
        .filter(n => DUCK.keys.includes(n.key)).map(n => n.beat))].sort((a, b)=> a - b);
    // a dip has to come back up before the next one starts
    const ducks = [];
    for (const b of kicks) if (!ducks.length || (b - ducks.at(-1)) * spb >= DUCK.seconds) ducks.push(b);
    const reverb = reverbScale(score);
    const sweep = sweepFrames(score);
    /** @type {Keyframe[]} */
    const open = [{ beat: 0, value: MOVEMENT.sweep.open, curve: 'set' }];
    return {
        ducks,
        tracks: score.tracks.map(t =>
        {
            const strip = MIX[t.role] ?? MIX.chords;
            return {
                strip,
                duck: ducks.length ? DUCK.db[t.role] ?? 0 : 0,
                /** @type {{ tone: Keyframe[], reverb: Keyframe[] }} */
                frames: {
                    tone: MOVEMENT.sweep.roles.includes(t.role) ? sweep : open,
                    reverb: reverb.map(f => ({ ...f, value: f.value * strip.reverb })),
                },
            };
        }),
    };
}

// the low-pass closes at the start of each build and opens across it
/** @returns {Keyframe[]} */
function sweepFrames(score)
{
    const { closed, open, rise, bars } = MOVEMENT.sweep;
    /** @type {Keyframe[]} */
    const frames = [{ beat: 0, value: open, curve: 'set' }];
    score.sections.forEach((s, i)=>
    {
        const next = score.sections[i + 1];
        const from = SECTIONS[s.type]?.build ? s.beat
            : next?.type === 'chorus' && next.energy - s.energy >= rise ? Math.max(s.beat, s.beat + s.beats - bars * score.beatsPerBar)
            : null;
        if (from === null) return;
        const to = s.beat + s.beats;
        frames.push(
            { beat: from, value: open, curve: 'set' },
            { beat: Math.min(to, from + 1), value: closed, curve: 'exp' },
            { beat: to, value: open, curve: 'exp' });
    });
    return frames;
}

// a multiplier for every reverb send, eased in over the first bar of each section
/** @returns {Keyframe[]} */
function reverbScale(score)
{
    const r = MOVEMENT.reverb;
    const scale = (s, i)=> SECTIONS[s.type]?.ending && i === score.sections.length - 1 ? r.ending
        : SECTIONS[s.type]?.contrast ? r.contrast
        : s.energy < r.quietBelow ? r.quiet : 1;
    /** @type {Keyframe[]} */
    const frames = [{ beat: 0, value: scale(score.sections[0], 0), curve: 'set' }];
    score.sections.forEach((s, i)=>
    {
        const prev = frames.at(-1).value, v = scale(s, i);
        if (i === 0 || v === prev) return;
        frames.push({ beat: s.beat, value: prev, curve: 'set' }, { beat: s.beat + Math.min(score.beatsPerBar, s.beats), value: v, curve: 'linear' });
    });
    return frames;
}

/**
 * a keyframed value at a beat, interpolated the way Web Audio ramps it
 * @param {Keyframe[]} frames
 * @param {number} beat
 */
export function valueAt(frames, beat)
{
    const i = frames.findLastIndex(f => f.beat <= beat);
    if (i < 0) return frames[0].value;
    const a = frames[i], b = frames[i + 1];
    if (!b || b.curve === 'set' || b.beat <= a.beat) return a.value;
    const p = (beat - a.beat) / (b.beat - a.beat);
    return b.curve === 'exp' ? a.value * (b.value / a.value) ** p : a.value + (b.value - a.value) * p;
}
