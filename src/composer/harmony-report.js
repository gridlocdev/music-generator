// How a composed song's harmony reads, for the harmony report (tools/harmony-report.mjs) and the test that keeps
// genres apart: each chord as a numeral against its section's key, the share of plain triads, the chord colours it
// uses, the four-chord windows it plays and the chords each section ends on. Pure: reads a score, imports nothing.

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
