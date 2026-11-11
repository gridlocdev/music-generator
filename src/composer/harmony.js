// Harmony across a section and between voices: the progression at the section's harmonic rhythm, ended on its
// cadence; chord colour (sevenths, added notes, suspensions) as the genre or the emotion plays it; passing and
// approach chords before chord changes, by the style (diminished sevenths, secondary dominants, ii–V, tritone
// substitutes, borrowed and mediant chords); harmony voices derived from the melody; and call and
// response, where the countermelody answers the lead. Pure.
import { parseProgression, parseChord, chordPitchClasses, diatonicShift, isMinorMode, keyToDegree, alterToChord, unalter, toneStep, degreePitchClass, extendChord, hash } from '../lib/music-theory.js';
import { CADENCES, LEADS_IN, RANGES } from './composer-data.js';
import { CALL_BARS, PASSING } from './song-craft-data.js';
import { chordTimeline, chordAt, mod, strongBeat, velocity } from './meter.js';

/**
 * A section's chords over its bars: its progression, sped up or slowed by its harmonic rhythm, cadence, triads
 * coloured as its genre or emotion plays them, passing chords, and its pedal, one bass degree held under every chord.
 */
export function sectionChords(sec)
{
    const progression = parseProgression(sec.progression, sec.tonic, sec.mode).map(p => ({ ...p, bars: p.bars / sec.harmonicRhythm }));
    let timeline = chordTimeline(progression, sec.bars, sec.beatsPerBar, sec.beat);
    if (sec.endOn) timeline = withCadence(timeline, sec);
    if (PASSING.some(k => sec.style[k] > 0)) timeline = withPassingChords(timeline, sec);
    // after the passing chords, so a borrowed iv or a mediant takes the song's colour too
    if (sec.extend && !sec.power) timeline = withColour(timeline, sec);
    if (sec.pedal != null)
    {
        const bass = degreePitchClass(sec.pedal, sec.tonic, sec.mode);
        timeline = timeline.map(s => ({ ...s, chord: { ...s.chord, bass } }));
    }
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

// a cadence's chord symbols in the section's mode: a modal mode's own, else the genre's, else the emotion's, else
// the default
function cadenceSymbols(sec)
{
    if (!CADENCES[sec.endOn]) throw new Error(`unknown cadence: ${sec.endOn}`);
    const c = { ...CADENCES[sec.endOn], ...sec.feelCadences?.[sec.endOn], ...sec.genre.cadences?.[sec.endOn] };
    return c.modal?.[sec.mode] ?? (isMinorMode(sec.mode) ? c.dark : c.bright);
}

/** the chord a section's cadence ends on */
export const cadenceChord = (sec)=> parseChord(cadenceSymbols(sec).at(-1), sec.tonic, sec.mode);

// The last bar becomes the cadence's chord, unless the progression already ends on it (Imaj7 counts as I, and a
// major I in a minor song, the Picardy third, as i). The chord leading in takes the bar before's second half,
// unless what's there already leads in. A longer cadence (the cadential 6/4, I/5 V7 I) always plays in full: its
// lead-ins share the bar before, or take a bar each in an odd meter (3/4), where halves would fall off the beat.
function withCadence(timeline, sec)
{
    const chords = cadenceSymbols(sec).map(sym => parseChord(sym, sec.tonic, sec.mode));
    const final = chords.at(-1), leads = chords.slice(0, -1);
    const end = sec.beat + sec.beats, bar = sec.beatsPerBar, lastBar = end - bar;
    if (leads.length > 1)
    {
        const each = bar % 2 === 0 ? bar / leads.length : bar;
        const from = lastBar - each * leads.length;
        if (from < sec.beat - 1e-9) return overlay(timeline, lastBar, end, final);
        let out = overlay(timeline, lastBar, end, final);
        leads.forEach((c, i)=> { out = overlay(out, from + i * each, from + (i + 1) * each, c); });
        return out;
    }
    if (timeline.at(-1).chord.root === final.root) return timeline;
    let out = overlay(timeline, lastBar, end, final);
    const before = chordAt(timeline, lastBar - 1e-3);
    if (leads.length && lastBar > sec.beat && !LEADS_IN[sec.endOn].includes(before.degree) && before.root !== leads[0].root)
        out = overlay(out, lastBar - bar / 2, lastBar, leads[0]);
    return out;
}

// A chance roll, 0 to 1: the hash with a final mix (murmur3's), since FNV alone barely moves its top bits when only
// the last characters change, as the beat does from one chord to the next
function roll(...parts)
{
    let h = hash(...parts);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

// The section's colour (`extend`): one way for every plain triad ('ninths'), or a list of { how, chance }, where
// each chord takes the first whose roll comes up, so only some chords are coloured. A suspension never lands on the
// section's last chord or a cadence's inversion (the 6/4), which have to sound as written, and the cadence's chords
// are never suspended; a single way colours
// every chord, the list only some.
function withColour(timeline, sec)
{
    const ways = typeof sec.extend === 'string' ? [{ how: sec.extend, chance: 1 }] : sec.extend;
    return timeline.map((span, i)=>
    {
        if (typeof sec.extend !== 'string' && (i === timeline.length - 1 || span.chord.bass !== undefined)) return span;
        const cadence = sec.endOn && span.beat >= sec.beat + sec.beats - 2 * sec.beatsPerBar;
        for (const [k, w] of ways.entries())
        {
            if (cadence && w.how.startsWith('sus')) continue;
            if (roll(sec.seed, sec.type, sec.n, 'colour', k, span.beat) < (w.chance ?? 1))
                return { ...span, chord: extendChord(span.chord, w.how, sec.tonic, sec.mode) };
        }
        return span;
    });
}

// With the style's chances (PASSING), an approach chord takes the last beat (half a beat in a short chord) before a
// change of root, or a ii–V its last two; never into a cadence's last chord, which keeps its V–I clean
function withPassingChords(timeline, sec)
{
    const weights = PASSING.map(k => sec.style[k] ?? 0);
    const total = weights.reduce((a, b)=> a + b, 0), cap = Math.min(total, 0.9);
    const out = [];
    timeline.forEach((span, i)=>
    {
        const next = timeline[i + 1];
        const r = roll(sec.seed, sec.type, sec.n, 'passing', span.beat);
        const cadence = sec.endOn && i + 2 === timeline.length;
        if (!next || cadence || span.beats < 2 || next.chord.root === span.chord.root || r >= cap) { out.push(span); return; }
        let pick = r * total / cap, k = 0;
        while (k < weights.length - 1 && pick >= weights[k]) pick -= weights[k++];
        let chords = approach(PASSING[k], next.chord, sec);
        const len = span.beats >= 4 ? 1 : 0.5;
        if (chords?.length > 1 && span.beats < 4) chords = chords.slice(-1);
        if (!chords) { out.push(span); return; }
        const from = span.beat + span.beats - len * chords.length;
        out.push({ ...span, beats: span.beats - len * chords.length }, ...chords.map((chord, j)=> ({ chord, beat: from + j * len, beats: len })));
    });
    return out;
}

// flat: the chord is named with flats whatever the key (Bb7 before Am in C, not A#7)
const dominant = (root, step, flat)=> ({ symbol: '7', root: mod(root, 12), tones: [0, 4, 7, 10], degree: 0, step, flat });
const isMajor = (c)=> c.tones.includes(4) && c.tones.includes(7);
const isMinor = (c)=> c.tones.includes(3) && c.tones.includes(7);

/**
 * The chords that lead into `target`, by kind, or null when the kind doesn't suit it:
 *   dim7       a diminished seventh a semitone under it (passingDim7)
 *   secondary  its own dominant seventh (V7/x: A7 before Dm)
 *   twoFive    its ii and V (Em7 A7 before Dm; a half-diminished ii before a minor chord)
 *   tritone    the dominant a semitone above it (Eb7 before Dm), the tritone substitute
 *   sus        its dominant with a suspended 4th (A7sus4 before Dm): modern, floating, unresolved
 *   borrowed   from the parallel key: the minor iv before a major tonic (IV in a minor song), bVI before a major V,
 *              the Neapolitan bII before a minor song's V
 *   mediant    a major chord a major third under or over it (Ab or E before C): the film-score shift
 */
export function approach(kind, target, sec)
{
    const r = target.root, step5 = target.step ? mod(target.step + 3, 7) + 1 : 0;
    const triad = isMajor(target) || isMinor(target);
    switch (kind)
    {
        case 'dim7': return [passingDim7(target)];
        case 'secondary': return triad ? [dominant(r + 7, step5)] : null;
        case 'twoFive':
            if (!triad) return null;
            return [{ symbol: 'm7', root: mod(r + 2, 12), tones: isMinor(target) ? [0, 3, 6, 10] : [0, 3, 7, 10], degree: 0, step: target.step ? mod(target.step, 7) + 1 : 0 },
                dominant(r + 7, step5)];
        case 'tritone': return triad ? [dominant(r + 1, 0, true)] : null;
        case 'sus': return triad ? [{ symbol: '7sus4', root: mod(r + 7, 12), tones: [0, 5, 7, 10], degree: 0, step: step5 }] : null;
        case 'borrowed':
        {
            const minor = isMinorMode(sec.mode);
            if (r === mod(sec.tonic, 12) && triad)
                return [{ symbol: minor ? 'IV' : 'iv', root: mod(sec.tonic + 5, 12), tones: minor ? [0, 4, 7] : [0, 3, 7], degree: 4, step: 4 }];
            if (r === mod(sec.tonic + 7, 12) && isMajor(target))
                return [minor ? { symbol: 'bII', root: mod(sec.tonic + 1, 12), tones: [0, 4, 7], degree: 0, step: 2, flat: true }
                    : { symbol: 'bVI', root: mod(sec.tonic + 8, 12), tones: [0, 4, 7], degree: 0, step: 6, flat: true }];
            return null;
        }
        case 'mediant':
            if (!triad) return null;
        {
            const up = hash(sec.seed, 'mediant', r) % 2;
            return [{ symbol: 'M', root: mod(r + (up ? 4 : -4), 12), tones: [0, 4, 7], degree: 0, step: 0, flat: !up }];
        }
        default: throw new Error(`unknown passing chord: ${kind}`);
    }
}

/**
 * Of the three diminished sevenths, the one with the most notes a semitone below the target chord's notes. It's named
 * from the target's leading tone when it holds it (C#dim7 before Dm, F#dim7 before G), else from a note leading to
 * another of the target's tones, and stands on the scale step below that tone's.
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
    const tones = [0, 3, 6, 9].map(t => (best + t) % 12);
    const led = [...target.tones].sort((a, b)=> (a % 12 === 0 ? -1 : 0) - (b % 12 === 0 ? -1 : 0))
        .find(t => tones.includes(mod(target.root + t - 1, 12)));
    if (led === undefined) return { symbol: 'dim7', root: best, tones: [0, 3, 6, 9], degree: 0, step: 0 };
    // C# is the C of C#dim7 before Dm
    const step = target.step ? mod(target.step - 2 + toneStep(led, target.tones), 7) + 1 : 0;
    return { symbol: 'dim7', root: mod(target.root + led - 1, 12), tones: [0, 3, 6, 9], degree: 0, step };
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
 * A second voice from the melody, in the countermelody's range, note for note. Steps are counted from the scale note
 * an altered melody note stands for, and land on the chord's own accidentals (G# under E major in A minor).
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
    let prev = null, prevNatural = null, prevLead = null;
    for (const n of lead)
    {
        const chord = chordAt(timeline, n.beat);
        const pcs = chordPitchClasses(chord);
        const strong = strongBeat(sec.meter, mod(n.beat - sec.beat, sec.beatsPerBar));
        const from = unalter(n.key, chord, sec.tonic, sec.mode);
        const below = (steps)=> alterToChord(diatonicShift(from, steps, sec.tonic, sec.mode), chord, sec.tonic, sec.mode);
        let key;
        if (how === 'contrary' && prev !== null)
        {
            const steps = keyToDegree(sec.tonic, sec.mode, from) - keyToDegree(sec.tonic, sec.mode, prevLead);
            key = alterToChord(diatonicShift(prevNatural, -steps, sec.tonic, sec.mode), chord, sec.tonic, sec.mode);
            if (strong) key = nearestChordTone(pcs, key);
        }
        else if (how === 'contrary') key = nearestChordTone(pcs, below(-5));
        else
        {
            key = below(-2);
            if (strong && !pcs.includes(mod(key, 12)))
                for (const s of [-3, -4])
                {
                    const k = below(s);
                    if (pcs.includes(mod(k, 12))) { key = k; break; }
                }
        }
        key = place(key, lo, Math.min(hi, n.key - 1), prev);
        out.push({ key, beat: n.beat, beats: n.beats, vel: velocity(sec, 'counter', sec.energy, n.beat - sec.beat) });
        prev = key; prevNatural = unalter(key, chord, sec.tonic, sec.mode); prevLead = from;
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
        const chord = chordAt(timeline, at);
        const pcs = chordPitchClasses(chord);
        const from = unalter(n.key, chordAt(timeline, n.beat), sec.tonic, sec.mode);
        let key = alterToChord(diatonicShift(from, -2, sec.tonic, sec.mode), chord, sec.tonic, sec.mode);
        if (strongBeat(sec.meter, mod(at - sec.beat, sec.beatsPerBar))) key = nearestChordTone(pcs, key);
        key = place(key, lo, hi, prev);
        answers.push({ key, beat: at, beats: Math.min(n.beats, end - at), vel: velocity(sec, 'counter', Math.min(1, sec.energy + 0.1), at - sec.beat) });
        prev = key;
    }
    return { lead: calls, counter: answers };
}
