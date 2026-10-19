// Keys, modes, scale degrees, Roman-numeral chords and voice leading, as MIDI numbers. Pure.
// The rules behind these choices are in docs/COMPOSING.md.

const PITCH_CLASSES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// semitones above the tonic of each scale step
export const MODES = {
    major:         [0, 2, 4, 5, 7, 9, 11],
    minor:         [0, 2, 3, 5, 7, 8, 10],
    dorian:        [0, 2, 3, 5, 7, 9, 10],
    phrygian:      [0, 1, 3, 5, 7, 8, 10],
    lydian:        [0, 2, 4, 6, 7, 9, 11],
    mixolydian:    [0, 2, 4, 5, 7, 9, 10],
    locrian:       [0, 1, 3, 5, 6, 8, 10],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
    melodicMinor:  [0, 2, 3, 5, 7, 9, 11],
};
MODES.ionian = MODES.major;
MODES.aeolian = MODES.minor;

const mod = (n, m)=> ((n % m) + m) % m;

/** true for modes with a minor third: minor, dorian, phrygian, locrian, harmonic and melodic minor */
export const isMinorMode = (mode)=> MODES[mode][2] === 3;

/**
 * Moves a key by scale steps, not semitones, so a harmony stays in the key: +2 is a third above, +5 a sixth,
 * −2 a third below. A key outside the scale (a chromatic passing note) moves by a minor third instead.
 */
export function diatonicShift(key, steps, tonic, mode)
{
    const scale = MODES[mode];
    const rel = key - tonic;
    const deg = scale.indexOf(mod(rel, 12));
    if (deg < 0) return key + (steps > 0 ? 3 : steps < 0 ? -3 : 0);
    const d = deg + steps;
    return tonic + (Math.floor(rel / 12) + Math.floor(d / 7)) * 12 + scale[mod(d, 7)];
}

/** 'C' → 0, 'F#' → 6, 'Bb' → 10 */
export function pitchClass(name)
{
    const m = /^([A-G])(#|b)?$/.exec(name);
    if (!m) throw new Error(`not a key: ${name}`);
    return mod(PITCH_CLASSES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0), 12);
}

/** a pitch class's name, spelled with flats in flat keys */
export const pitchName = (pc, flats = false)=> (flats ? FLAT_NAMES : SHARP_NAMES)[mod(pc, 12)];

/**
 * MIDI key of a scale degree. Degrees count from 1 and keep going past 7 (8 = the tonic an octave up, 0 = the 7th below).
 * octave 4 puts degree 1 between C4 (60) and B4.
 */
export function degreeToKey(tonic, mode, degree, octave = 4, accidental = 0)
{
    const steps = MODES[mode];
    const d = degree - 1;
    return (octave + 1) * 12 + tonic + steps[mod(d, 7)] + 12 * Math.floor(d / 7) + accidental;
}

/** the scale degree (1-based, unbounded) whose key is nearest to a MIDI key; ties go down */
export function keyToDegree(tonic, mode, key, octave = 4)
{
    let best = 1, bestDist = Infinity;
    const guess = Math.round((key - degreeToKey(tonic, mode, 1, octave)) / 12 * 7) + 1;
    for (let d = guess - 3; d <= guess + 3; d++)
    {
        const dist = Math.abs(degreeToKey(tonic, mode, d, octave) - key);
        if (dist < bestDist || (dist === bestDist && d < best)) { best = d; bestDist = dist; }
    }
    return best;
}

export const inScale = (tonic, mode, key)=> MODES[mode].includes(mod(key - tonic, 12));

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const CHORD = /^(b|#)?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(°|o|ø|\+)?(maj7|maj9|add9|7sus4|9sus4|sus2|sus4|7|9|6)?$/;

/**
 * A Roman-numeral chord in a key. Case gives the quality (V major, v minor), then ° dim, ø half-dim, + aug,
 * and a suffix 7, maj7, 9, maj9, add9, 6, sus2, sus4, 7sus4, 9sus4. A plain numeral counts in the song's mode (VII
 * in minor is the flat seven), except a diminished vii, which is built on the leading tone in every mode; with b or #
 * it counts from the major scale, as usual: bVII is a whole step below the tonic in any mode, bVI and bIII are
 * borrowed from the parallel minor, bII is the Neapolitan. `X/Y` is chord X in the major key of chord Y's root, the
 * secondary dominants and leading-tone chords: V7/vi, vii°7/V.
 * @returns {{ symbol: string, root: number, tones: number[], degree: number, step: number }}
 *   root is a pitch class, tones are semitones above it (root first), degree is the numeral's step 1–7 (0 for X/Y),
 *   step is the scale step the root stands on (the G of G# in A minor), 0 when unknown
 */
export function parseChord(symbol, tonic, mode)
{
    const slash = symbol.indexOf('/');
    if (slash >= 0)
    {
        const target = parseChord(symbol.slice(slash + 1), tonic, mode);
        const inner = parseChord(symbol.slice(0, slash), target.root, 'major');
        return { ...inner, symbol, degree: 0, step: target.step && mod(target.step + inner.step - 2, 7) + 1 };
    }
    const m = CHORD.exec(symbol);
    if (!m) throw new Error(`not a chord: ${symbol}`);
    const [, acc, numeral, quality, ext] = m;
    const degree = NUMERALS.indexOf(numeral.toUpperCase()) + 1;
    const upper = numeral === numeral.toUpperCase();
    const leadingTone = !acc && degree === 7 && (quality === '°' || quality === 'o' || quality === 'ø');
    const root = mod(tonic + (acc ? MODES.major[degree - 1] + (acc === 'b' ? -1 : 1) : leadingTone ? 11 : MODES[mode][degree - 1]), 12);

    let tones = quality === '°' || quality === 'o' ? [0, 3, 6]
        : quality === 'ø' ? [0, 3, 6, 10]
        : quality === '+' ? [0, 4, 8]
        : upper ? [0, 4, 7] : [0, 3, 7];
    const dim = quality === '°' || quality === 'o';
    if (ext === '7') tones = [...tones, dim ? 9 : 10];
    else if (ext === '9') tones = [...tones, 10, 14];
    else if (ext === 'maj7') tones = [...tones, 11];
    else if (ext === 'maj9') tones = [...tones, 11, 14];
    else if (ext === 'add9') tones = [...tones, 14];
    else if (ext === '6') tones = [...tones, 9];
    else if (ext === 'sus2') tones = [0, 2, ...tones.slice(2)];
    else if (ext === 'sus4') tones = [0, 5, ...tones.slice(2)];
    else if (ext === '7sus4') tones = [0, 5, ...tones.slice(2), 10];
    else if (ext === '9sus4') tones = [0, 5, ...tones.slice(2), 10, 14];
    return { symbol, root, tones: [...new Set(tones)], degree, step: degree };
}

/** the chord's pitch classes */
export const chordPitchClasses = (chord)=> chord.tones.map(t => mod(chord.root + t, 12));

/**
 * The scale steps above its root a chord tone stands on: 3 and 4 semitones are a third, 6 a diminished fifth, 9 a
 * diminished seventh in a diminished chord and a sixth otherwise, 14 a ninth.
 */
export function toneStep(t, tones)
{
    if (t === 9) return tones.includes(6) && !tones.includes(7) ? 6 : 5;
    return [0, 1, 1, 2, 2, 3, 4, 4, 4, 5, 6, 6][t % 12];
}

/**
 * A scale key moved onto the chord's own version of its step, so a line follows a chord from outside the mode:
 * G to G# under E major in A minor, A to Ab under the borrowed iv in C, B to Bb under bVII. A step the chord doesn't
 * use keeps its scale note (G stays G under Fm in C: a ninth, not a clash). Chord tones and chromatic keys stay.
 * @param {ReturnType<typeof parseChord>} chord
 */
export function alterToChord(key, chord, tonic, mode)
{
    if (!chord.step || !inScale(tonic, mode, key)) return key;
    const pc = mod(key, 12);
    if (chordPitchClasses(chord).includes(pc)) return key;
    for (const t of chord.tones)
    {
        const natural = mod(tonic + MODES[mode][mod(chord.step - 1 + toneStep(t, chord.tones), 7)], 12);
        if (natural === pc) return key + mod(chord.root + t - pc + 6, 12) - 6;
    }
    return key;
}

/** the scale key a chord's altered tone stands for, undoing alterToChord: G for G# under E major in A minor */
export function unalter(key, chord, tonic, mode)
{
    if (inScale(tonic, mode, key)) return key;
    for (const d of [-1, 1, -2, 2]) if (alterToChord(key + d, chord, tonic, mode) === key) return key + d;
    return key;
}

/** a chord's name in letters, e.g. 'Am7' for vi7 in C */
export function chordName(chord, flats = false)
{
    const t = new Set(chord.tones.map(x => x % 12));
    const name = pitchName(chord.root, flats);
    const third = t.has(4) ? '' : t.has(3) ? 'm' : '';
    const sus = !t.has(3) && !t.has(4) ? (t.has(5) ? 'sus4' : t.has(2) ? 'sus2' : '5') : '';
    if (t.has(3) && t.has(6)) return name + (t.has(10) ? 'm7b5' : t.has(9) ? 'dim7' : 'dim');
    if (t.has(4) && t.has(8)) return name + 'aug';
    const ninth = chord.tones.includes(14);
    const seventh = t.has(11) ? (ninth ? 'maj9' : 'maj7') : t.has(10) ? (ninth ? '9' : '7') : t.has(9) ? '6' : '';
    const add = ninth && !seventh ? 'add9' : '';
    return name + third + seventh + sus + add;
}

/**
 * 'I V vi IV' or 'i:2 VI III VII:0.5 v7:0.5' → chords with lengths in bars (default 1). '|' is ignored.
 * @returns {{ chord: ReturnType<typeof parseChord>, bars: number }[]}
 */
export function parseProgression(text, tonic, mode)
{
    return text.split(/\s+/).filter(t => t && t !== '|').map(token =>
    {
        const [sym, len] = token.split(':');
        const bars = len === undefined ? 1 : Number(len);
        if (!(bars > 0)) throw new Error(`bad chord length: ${token}`);
        return { chord: parseChord(sym, tonic, mode), bars };
    });
}

/**
 * Voices a chord inside [low, high]: one key per pitch class, chosen to move least from the previous voicing
 * (or, with none, to sit near the middle of the range) and to stay compact. Deterministic.
 * @param {number[]} pcs  pitch classes to voice
 * @param {number[] | null} prev  previous voicing, low to high
 * @returns {number[]} keys, low to high
 */
export function voiceChord(pcs, prev, low, high)
{
    const options = pcs.map(pc =>
    {
        const keys = [];
        for (let k = low + mod(pc - low, 12); k <= high; k += 12) keys.push(k);
        return keys;
    });
    if (options.some(o => !o.length)) throw new Error(`range ${low}–${high} can't hold the chord`);

    let best = null, bestCost = Infinity;
    const pick = (i, chosen)=>
    {
        if (i === options.length)
        {
            const v = [...chosen].sort((a, b)=> a - b);
            const c = voicingCost(v, prev, low, high);
            if (c < bestCost || (c === bestCost && v.join() < best.join())) { best = v; bestCost = c; }
            return;
        }
        for (const k of options[i]) { chosen.push(k); pick(i + 1, chosen); chosen.pop(); }
    };
    pick(0, []);
    return /** @type {number[]} */ (best);
}

function voicingCost(v, prev, low, high)
{
    const span = v.at(-1) - v[0];
    let cost = Math.max(0, span - 12) * 2;          // keep it within an octave or so
    for (let i = 1; i < v.length; i++) if (v[i] - v[i - 1] < 2) cost += 3;   // seconds in a close voicing are muddy
    if (!prev?.length)
    {
        const mean = v.reduce((a, b)=> a + b, 0) / v.length;
        return cost + Math.abs(mean - (low + high) / 2);
    }
    // each voice moves to the nearest note of the new chord
    for (const k of v) cost += Math.min(...prev.map(p => Math.abs(p - k)));
    for (const p of prev) cost += Math.min(...v.map(k => Math.abs(p - k))) * 0.5;
    return cost;
}

/** a stable 32-bit hash of any strings/numbers (FNV-1a), for choices that must be the same every time */
export function hash(...parts)
{
    let h = 0x811c9dc5;
    for (const ch of parts.join('\u0001'))
    {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
}
