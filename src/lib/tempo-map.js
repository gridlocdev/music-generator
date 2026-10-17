// A song's tempo over time, and conversion between beats and seconds through it. Pure.
// A map is a list of segments sorted by beat. Each holds `bpm` from its beat to the next segment's, or ramps
// evenly (in beats) to `to` by then, which is how a ritardando or a push into a chorus is written.
// The last segment holds its tempo forever.

/** @typedef {{ beat: number, bpm: number, to?: number }} TempoSegment */

// seconds to cover `beats` from a segment's start, with the tempo ramping from a to c over `span` beats
function segmentSeconds(a, c, span, beats)
{
    const k = span > 0 ? (c - a) / span : 0;
    return Math.abs(k) < 1e-9 ? beats * 60 / a : 60 / k * Math.log((a + k * beats) / a);
}

function segmentBeats(a, c, span, seconds)
{
    const k = span > 0 ? (c - a) / span : 0;
    return Math.abs(k) < 1e-9 ? seconds * a / 60 : a * (Math.exp(k * seconds / 60) - 1) / k;
}

const spanOf = (map, i)=> (map[i + 1]?.beat ?? Infinity) - map[i].beat;
const endBpm = (seg, span)=> span === Infinity ? seg.bpm : seg.to ?? seg.bpm;

/**
 * seconds from beat 0 to `beat`; before beat 0 it runs at the first segment's tempo
 * @param {TempoSegment[]} map
 * @param {number} beat
 */
export function beatToSeconds(map, beat)
{
    if (beat <= 0) return beat * 60 / map[0].bpm;
    let s = 0;
    for (let i = 0; i < map.length; i++)
    {
        const seg = map[i], span = spanOf(map, i);
        const into = Math.min(beat, seg.beat + span) - seg.beat;
        s += segmentSeconds(seg.bpm, endBpm(seg, span), span, into);
        if (beat <= seg.beat + span) break;
    }
    return s;
}

/**
 * the beat reached `seconds` after beat 0
 * @param {TempoSegment[]} map
 * @param {number} seconds
 */
export function secondsToBeat(map, seconds)
{
    if (seconds <= 0) return seconds * map[0].bpm / 60;
    let left = seconds;
    for (let i = 0; i < map.length; i++)
    {
        const seg = map[i], span = spanOf(map, i), c = endBpm(seg, span);
        const whole = span === Infinity ? Infinity : segmentSeconds(seg.bpm, c, span, span);
        if (left <= whole) return seg.beat + segmentBeats(seg.bpm, c, span, left);
        left -= whole;
    }
    return map.at(-1).beat;
}

/** the tempo at a beat */
export function bpmAt(map, beat)
{
    const i = Math.max(0, map.findLastIndex(s => s.beat <= beat));
    const seg = map[i], span = spanOf(map, i);
    return span === Infinity ? seg.bpm : seg.bpm + (endBpm(seg, span) - seg.bpm) * (beat - seg.beat) / span;
}

/**
 * The map as tempo changes on whole beats, for formats that only hold steps (a MIDI file): one change per
 * beat through a ramp, and one at each constant segment.
 * @returns {{ beat: number, bpm: number }[]}
 */
export function tempoSteps(map)
{
    const out = [];
    map.forEach((seg, i)=>
    {
        const span = spanOf(map, i);
        if (span === Infinity || seg.to === undefined || seg.to === seg.bpm) { out.push({ beat: seg.beat, bpm: seg.bpm }); return; }
        for (let b = 0; b < span; b++) out.push({ beat: seg.beat + b, bpm: bpmAt(map, seg.beat + b + 0.5) });
    });
    return out.filter((s, i)=> i === 0 || Math.abs(s.bpm - out[i - 1].bpm) > 1e-6);
}
