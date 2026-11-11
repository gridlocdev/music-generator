// How a composed song's harmony reads, for the harmony report (tools/harmony-report.mjs) and the test that keeps
// genres apart: each chord as a numeral against its section's key, the share of plain triads, the chord colours it
// uses, the four-chord windows it plays and the chords each section ends on; and the lead's melodic fingerprint
// (pace, steps against leaps, syncopation, range, notes outside the key), which keeps genres' tunes apart. Pure: reads
// a score.
import { inScale } from '../lib/music-theory.js';

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NUMERAL = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];

/** a chord name's root pitch class and its quality ('' for a major triad): 'Bbm7/F' → { root: 10, quality: 'm7' } */
export function readChordName(name)
{
    const m = name.match(/^([A-G])([#b]?)([^/]*)/);
    if (!m) throw new Error(`not a chord name: ${name}`);
    return { root: (LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12, quality: m[3] };
}

// a numeral with its quality, minor and diminished in lower case: ii7, viiø, bVImaj7
const named = (c)=> /^(m(?!aj)|dim)/.test(c.quality) ? c.numeral.toLowerCase() + c.quality.replace(/^m(?!aj)/, '') : c.numeral + c.quality;

/** the score's chords as numerals in their section's key, with what kind of chord each is */
export function numerals(score)
{
    return score.chords.map((c)=>
    {
        const sec = score.sections.findLast(s => s.beat <= c.beat + 1e-9);
        const { root, quality } = readChordName(c.name);
        return { beat: c.beat, numeral: NUMERAL[(root - sec.tonic + 120) % 12], quality, section: sec };
    });
}

/**
 * A song's harmonic fingerprint:
 *   chords     how many
 *   triads     the share that are plain major or minor triads
 *   qualities  { quality: count }, '' for major
 *   windows    the set of four-numeral windows it plays (roots only), what makes progressions sound alike
 *   endings    the last two chords of each section, as numerals
 */
export function harmonyStats(score)
{
    const all = numerals(score);
    const qualities = {};
    for (const c of all) qualities[c.quality] = (qualities[c.quality] ?? 0) + 1;
    const triads = all.filter(c => c.quality === '' || c.quality === 'm').length / Math.max(1, all.length);
    const windows = new Set();
    for (let i = 0; i + 4 <= all.length; i++) windows.add(all.slice(i, i + 4).map(c => c.numeral).join(' '));
    const endings = score.sections.map((s)=>
    {
        const inSec = all.filter(c => c.beat >= s.beat - 1e-9 && c.beat < s.beat + s.beats - 1e-9);
        return inSec.slice(-2).map(named).join(' ');
    });
    return { chords: all.length, triads, qualities, windows, endings };
}

/** how alike two sets are, 0 to 1 (Jaccard: shared over all) */
export function overlap(a, b)
{
    let shared = 0;
    for (const x of a) if (b.has(x)) shared++;
    const all = a.size + b.size - shared;
    return all ? shared / all : 0;
}

/**
 * The lead's fingerprint, each a share or a size, so two songs' tunes can be compared:
 *   pace      notes per beat while it plays (from its first note to its last)
 *   steps     intervals of a tone or less      leaps   of a fourth or more      repeats  the same pitch again
 *   offbeat   notes that start off the beat    length  the mean note, in beats  range    semitones, low 5% to high 5%
 *   outside   notes outside the section's scale: blue notes, chromatic passing notes, a secondary chord's leading tone
 */
export function melodyStats(score)
{
    const lead = score.tracks.find(t => t.role === 'lead');
    // one note per onset, the top one: a harmonised lead is still one line
    const byBeat = new Map();
    for (const n of lead?.notes ?? []) if (!byBeat.has(n.beat) || byBeat.get(n.beat).key < n.key) byBeat.set(n.beat, n);
    const notes = [...byBeat.values()].sort((a, b)=> a.beat - b.beat);
    if (notes.length < 2) return { pace: 0, steps: 0, leaps: 0, repeats: 0, offbeat: 0, length: 0, range: 0, outside: 0 };
    const moves = notes.slice(1).map((n, i)=> Math.abs(n.key - notes[i].key));
    const share = (f)=> moves.filter(f).length / moves.length;
    const keys = notes.map(n => n.key).sort((a, b)=> a - b);
    const at = (q)=> keys[Math.min(keys.length - 1, Math.floor(q * keys.length))];
    return {
        pace: notes.length / Math.max(1, notes.at(-1).beat + notes.at(-1).beats - notes[0].beat),
        steps: share(m => m > 0 && m <= 2), leaps: share(m => m >= 5), repeats: share(m => m === 0),
        offbeat: notes.filter(n => Math.abs(n.beat - Math.round(n.beat)) > 1e-3).length / notes.length,
        length: notes.reduce((t, n)=> t + n.beats, 0) / notes.length,
        range: at(0.95) - at(0.05),
        outside: notes.filter((n)=>
        {
            const sec = score.sections.findLast(s => s.beat <= n.beat + 1e-9) ?? score.sections[0];
            return !inScale(sec.tonic, sec.mode, n.key);
        }).length / notes.length,
    };
}

// how much each feature counts in the distance: shares as they are, pace and length per beat, range per octave
const WEIGHT = { pace: 1, steps: 1, leaps: 1, repeats: 1, offbeat: 1, length: 1, range: 1 / 12, outside: 1 };

/** how far apart two melodic fingerprints are: 0 the same, about 0.3 clearly different tunes */
export function melodyDistance(a, b)
{
    return Math.sqrt(Object.entries(WEIGHT).reduce((t, [k, w])=> t + ((a[k] - b[k]) * w) ** 2, 0));
}
