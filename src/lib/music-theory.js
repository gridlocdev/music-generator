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
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
};

const mod = (n, m)=> ((n % m) + m) % m;

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
const CHORD = /^(b|#)?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(°|o|ø|\+)?(maj7|maj9|add9|sus2|sus4|7|9|6)?$/;

/**
 * A Roman-numeral chord in a key. Case gives the quality (V major, v minor), then ° dim, ø half-dim, + aug,
 * and a suffix 7, maj7, 9, maj9, add9, 6, sus2, sus4. The numeral counts in the song's mode;
 * b/# shift the root (bVII in major is the borrowed flat seven).
 * @returns {{ symbol: string, root: number, tones: number[], degree: number }}
 *   root is a pitch class, tones are semitones above it (root first), degree is the numeral's step 1–7
 */
export function parseChord(symbol, tonic, mode)
{
    const m = CHORD.exec(symbol);
    if (!m) throw new Error(`not a chord: ${symbol}`);
    const [, acc, numeral, quality, ext] = m;
    const degree = NUMERALS.indexOf(numeral.toUpperCase()) + 1;
    const upper = numeral === numeral.toUpperCase();
    const root = mod(tonic + MODES[mode][degree - 1] + (acc === 'b' ? -1 : acc === '#' ? 1 : 0), 12);

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
    return { symbol, root, tones: [...new Set(tones)], degree };
}

/** the chord's pitch classes */
export const chordPitchClasses = (chord)=> chord.tones.map(t => mod(chord.root + t, 12));

/** a chord's name in letters, e.g. 'Am7' for vi7 in C */
export function chordName(chord, flats = false)
{
    const t = new Set(chord.tones.map(x => x % 12));
    const name = pitchName(chord.root, flats);
    const third = t.has(4) ? '' : t.has(3) ? 'm' : '';
    const sus = !t.has(3) && !t.has(4) ? (t.has(5) ? 'sus4' : t.has(2) ? 'sus2' : '5') : '';
    if (t.has(3) && t.has(6)) return name + (t.has(10) ? 'm7b5' : t.has(9) ? 'dim7' : 'dim');
    if (t.has(4) && t.has(8)) return name + 'aug';
    const seventh = t.has(11) ? 'maj7' : t.has(10) ? '7' : t.has(9) ? '6' : '';
    const add = chord.tones.includes(14) ? (seventh ? '' : 'add9') : '';
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
