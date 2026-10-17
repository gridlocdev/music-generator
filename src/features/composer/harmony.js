// Harmony across a section and between voices: the progression at the section's harmonic rhythm, ended on its
// cadence; passing diminished sevenths before chord changes; harmony voices derived from the melody; and call and
// response, where the countermelody answers the lead. Pure.
import { parseProgression, parseChord, chordPitchClasses, diatonicShift, isMinorMode, keyToDegree, hash } from '../../lib/music-theory.js';
import { CADENCES, LEADS_IN, RANGES } from './composer-data.js';
import { CALL_BARS } from './song-craft-data.js';
import { chordTimeline, chordAt, mod, strongBeat, velocity } from './meter.js';

/** a section's chords over its bars: its progression, sped up or slowed by its harmonic rhythm, cadence, passing chords */
export function sectionChords(sec)
{
    const progression = parseProgression(sec.progression, sec.tonic, sec.mode).map(p => ({ ...p, bars: p.bars / sec.harmonicRhythm }));
    let timeline = chordTimeline(progression, sec.bars, sec.beatsPerBar, sec.beat);
    if (sec.endOn) timeline = withCadence(timeline, sec);
    if (sec.style.dim7 > 0) timeline = withPassingChords(timeline, sec);
    return timeline;
}

// the timeline with [from, to) taken over by one chord
function overlay(timeline, from, to, chord)
{
    const out = [];
    for (const s of timeline)
    {
        const a = s.beat, b = s.beat + s.beats;
        if (a < from - 1e-9) out.push({ ...s, beats: Math.min(b, from) - a });
        if (b > to + 1e-9) out.push({ chord: s.chord, beat: Math.max(a, to), beats: b - Math.max(a, to) });
    }
    out.push({ chord, beat: from, beats: to - from });
    return out.sort((x, y)=> x.beat - y.beat);
}

/** the chord a section's cadence ends on */
export function cadenceChord(sec)
{
    const c = CADENCES[sec.endOn];
    if (!c) throw new Error(`unknown cadence: ${sec.endOn}`);
    return parseChord((isMinorMode(sec.mode) ? c.dark : c.bright).at(-1), sec.tonic, sec.mode);
}

// The last bar becomes the cadence's chord, unless the progression already ends on it (Imaj7 counts as I, and a
// major I in a minor song, the Picardy third, as i). The chord leading in takes the bar before's second half,
// unless what's there already leads in.
function withCadence(timeline, sec)
{
    const c = CADENCES[sec.endOn];
    if (!c) throw new Error(`unknown cadence: ${sec.endOn}`);
    const chords = (isMinorMode(sec.mode) ? c.dark : c.bright).map(sym => parseChord(sym, sec.tonic, sec.mode));
    const final = chords.at(-1);
    if (timeline.at(-1).chord.root === final.root) return timeline;
    const end = sec.beat + sec.beats, lastBar = end - sec.beatsPerBar;
    let out = overlay(timeline, lastBar, end, final);
    const before = chordAt(timeline, lastBar - 1e-3);
    if (chords.length > 1 && lastBar > sec.beat && !LEADS_IN[sec.endOn].includes(before.degree) && before.root !== chords[0].root)
        out = overlay(out, lastBar - sec.beatsPerBar / 2, lastBar, chords[0]);
    return out;
}

// with the style's dim7 chance, a passing diminished seventh takes the last beat (half a beat in a short chord)
// before a change of root; never into a cadence's last chord, which keeps its V–I clean
function withPassingChords(timeline, sec)
{
    const out = [];
    timeline.forEach((span, i)=>
    {
        const next = timeline[i + 1];
        const roll = hash(sec.seed, sec.type, sec.n, 'dim7', span.beat) / 2 ** 32;
        const cadence = sec.endOn && i + 2 === timeline.length;
        if (!next || cadence || span.beats < 2 || next.chord.root === span.chord.root || roll >= sec.style.dim7) { out.push(span); return; }
        const len = span.beats >= 4 ? 1 : 0.5;
        out.push({ ...span, beats: span.beats - len }, { chord: passingDim7(next.chord), beat: span.beat + span.beats - len, beats: len });
    });
    return out;
}

/**
 * Of the three diminished sevenths, the one with the most notes a semitone below the target chord's notes. It's named
 * from the target's leading tone when it holds it: C#dim7 before Dm, F#dim7 before G.
 */
export function passingDim7(target)
{
    const pcs = chordPitchClasses(target);
    let best = 0, bestScore = -1;
    for (let r = 0; r < 3; r++)
    {
        const tones = [0, 3, 6, 9].map(t => (r + t) % 12);
        const score = tones.filter(t => pcs.includes((t + 1) % 12)).length + (tones.includes(mod(target.root - 1, 12)) ? 0.5 : 0);
        if (score > bestScore) { best = r; bestScore = score; }
    }
    const leading = mod(target.root - 1, 12);
    const root = [0, 3, 6, 9].map(t => (best + t) % 12).includes(leading) ? leading : best;
    return { symbol: 'dim7', root, tones: [0, 3, 6, 9], degree: 0 };
}

// a key moved by octaves into [lo, hi], nearest the previous one so the line moves smoothly
function place(key, lo, hi, near)
{
    let best = null;
    for (let k = key - 36; k <= key + 36; k += 12)
        if (k >= lo && k <= hi && (best === null || Math.abs(k - (near ?? key)) < Math.abs(best - (near ?? key)))) best = k;
    return best ?? Math.min(hi, Math.max(lo, key));
}

function nearestChordTone(pcs, key)
{
    for (const d of [0, -1, 1, -2, 2, -3, 3]) if (pcs.includes(mod(key + d, 12))) return key + d;
    return key;
}

/**
 * A second voice from the melody, in the countermelody's range, note for note.
 *   harmony   parallel thirds below; on a strong beat where the third isn't in the chord, a fourth or fifth below
 *             (similar motion) if that one is
 *   contrary  moves the other way by as many steps as the melody, starting a sixth below, snapped to chord tones on
 *             strong beats
 * @param {{ key: number, beat: number, beats: number }[]} lead
 */
export function harmonyVoice(lead, sec, timeline, how = 'harmony')
{
    const [lo, hi] = RANGES.counter;
    const out = [];
    let prev = null, prevLead = null;
    for (const n of lead)
    {
        const pcs = chordPitchClasses(chordAt(timeline, n.beat));
        const strong = strongBeat(sec.meter, mod(n.beat - sec.beat, sec.beatsPerBar));
        let key;
        if (how === 'contrary' && prev !== null)
        {
            const steps = keyToDegree(sec.tonic, sec.mode, n.key) - keyToDegree(sec.tonic, sec.mode, prevLead);
            key = diatonicShift(prev, -steps, sec.tonic, sec.mode);
            if (strong) key = nearestChordTone(pcs, key);
        }
        else if (how === 'contrary') key = nearestChordTone(pcs, diatonicShift(n.key, -5, sec.tonic, sec.mode));
        else
        {
            key = diatonicShift(n.key, -2, sec.tonic, sec.mode);
            if (strong && !pcs.includes(mod(key, 12)))
                for (const s of [-3, -4])
                {
                    const k = diatonicShift(n.key, s, sec.tonic, sec.mode);
                    if (pcs.includes(mod(k, 12))) { key = k; break; }
                }
        }
        key = place(key, lo, Math.min(hi, n.key - 1), prev);
        out.push({ key, beat: n.beat, beats: n.beats, vel: velocity(sec, 'counter', sec.energy, n.beat - sec.beat) });
        prev = key; prevLead = n.key;
    }
    return out;
}

/**
 * Call and response: the lead keeps every other turn of CALL_BARS bars and rests through the others, where the
 * countermelody answers with the call's rhythm a third lower in its own range, strong beats moved to chord tones.
 * @returns {{ lead: object[], counter: object[] }}
 */
export function callAndResponse(lead, sec, timeline)
{
    const span = CALL_BARS * sec.beatsPerBar, end = sec.beat + sec.beats;
    const turnOf = (beat)=> Math.floor((beat - sec.beat + 1e-9) / span);
    const calls = lead.filter(n => turnOf(n.beat) % 2 === 0)
        .map(n => ({ ...n, beats: Math.min(n.beats, sec.beat + (turnOf(n.beat) + 1) * span - n.beat) }));
    const [lo, hi] = RANGES.counter;
    const answers = [];
    let prev = null;
    for (const n of calls)
    {
        const at = n.beat + span;
        if (at >= end - 1e-9) continue;
        const pcs = chordPitchClasses(chordAt(timeline, at));
        let key = diatonicShift(n.key, -2, sec.tonic, sec.mode);
        if (strongBeat(sec.meter, mod(at - sec.beat, sec.beatsPerBar))) key = nearestChordTone(pcs, key);
        key = place(key, lo, hi, prev);
        answers.push({ key, beat: at, beats: Math.min(n.beats, end - at), vel: velocity(sec, 'counter', Math.min(1, sec.energy + 0.1), at - sec.beat) });
        prev = key;
    }
    return { lead: calls, counter: answers };
}
