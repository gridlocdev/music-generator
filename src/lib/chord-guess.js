// Names the chords of a whistled arpeggio take and finds where they change, as a progression the composer reads
// ('I V/7 vi:2 IV'). Only each chord's identity is kept; the composer voices it to fit the song. Pure.
//
// Each stretch of notes is scored against a vocabulary of chords in the key: weighted notes inside the chord count
// for it, notes outside against, unheard chord tones cost a little (so a 7th chord needs its 7th), and chords outside
// the key start behind. The changes are found together with the chords, by dynamic programming over beats: a change
// costs something, less on a bar line or half bar, and less between bar lines where the arpeggio starts over (a jump
// back down; an arpeggio going up and down jumps too, so on a bar line it counts for nothing);
// common moves (down a fifth, to the tonic) cost less. The first note of a stretch, when it's also the lowest and is
// the chord's third or seventh, puts that degree in the bass: 3-5-8 is I/3. A fifth isn't taken: whistlers often start
// an arpeggio on it for range, and I/5 is a cadential six-four to the composer.

import { MODES, parseChord, chordPitchClasses, keyToDegree, degreeToKey } from './music-theory.js';

const mod = (n, m)=> ((n % m) + m) % m;

export const CHORD_GUESS = {
    inside: 1, outside: 1.3,            // per weighted beat of a note in or out of the chord
    missing: 0.35, rootHeard: 0.4,      // per chord tone never heard (less with fewer than 3 notes); the root heard at all
    weight: { bar: 1.5, beat: 1.2, off: 1 },       // a note starting on a bar line, on a beat, between beats
    prior: { triad: 0, seventh: 0.8, borrowed: 0.7, secondary: 0.8 },   // a 7th chord must beat two triads that share its notes
    change: { bar: 0.5, half: 0.9, beat: 1.8, restart: 0.8 },   // what a change costs where; a restart takes some off, never below a bar line's
    move: { fifthDown: 0.3, toTonic: 0.15 },        // common moves cost less
    endOnTonic: 0.6,                    // a take ends at home: a held last note is the tonic chord, not one it also fits
    startOnTonic: 0.4,                  // and usually starts there: between relative keys, the one whose I comes first
    // harmonising a tune: triads only (a tune's passing notes would make every chord a 7th), passing notes are normal,
    // a chord's tones needn't all be heard and its root least of all (G and Bb under a tune are I as often as iii),
    // and a change between bar lines must earn its place
    melody: { outside: 0.6, missing: 0.1, rootHeard: 0, half: 2 },
    keysTried: 4,                       // chordKey reads the take in the likeliest few keys
    maxBars: 4,                         // the longest one chord is searched for
};

/** the chords a take is tried against, by key: [symbol, kind] */
export function chordVocabulary(mode)
{
    const minor = MODES[mode][2] === 3;
    const list = minor
        ? [['i', 'triad'], ['ii°', 'triad'], ['III', 'triad'], ['iv', 'triad'], ['v', 'triad'], ['VI', 'triad'], ['VII', 'triad'],
            ['V', 'triad'], ['i7', 'seventh'], ['iv7', 'seventh'], ['V7', 'seventh'], ['VImaj7', 'seventh'], ['IIImaj7', 'seventh'], ['iiø', 'seventh'],
            ['IV', 'borrowed'], ['vii°', 'borrowed'], ['bII', 'borrowed'], ['I', 'borrowed'],
            ['V/V', 'secondary'], ['V7/iv', 'secondary']]
        : [['I', 'triad'], ['ii', 'triad'], ['iii', 'triad'], ['IV', 'triad'], ['V', 'triad'], ['vi', 'triad'], ['vii°', 'triad'],
            ['Imaj7', 'seventh'], ['ii7', 'seventh'], ['iii7', 'seventh'], ['IVmaj7', 'seventh'], ['V7', 'seventh'], ['vi7', 'seventh'], ['viiø', 'seventh'],
            ['iv', 'borrowed'], ['bVII', 'borrowed'], ['bVI', 'borrowed'], ['bIII', 'borrowed'], ['V7sus4', 'borrowed'],
            ['V/V', 'secondary'], ['V/vi', 'secondary'], ['V/ii', 'secondary'], ['V7/IV', 'secondary']];
    return list;
}

/** a pitch class as a bass degree for a slash chord ('3', 'b7'), or null when it isn't one a degree can name */
function bassDegree(pc, tonic, mode)
{
    const key = 60 + mod(pc - tonic, 12) + tonic;
    const d = keyToDegree(tonic, mode, key, 4);
    const off = key - degreeToKey(tonic, mode, d, 4);
    const step = mod(d - 1, 7) + 1;
    if (off === 0) return String(step);
    if (Math.abs(off) === 1) return `${off < 0 ? 'b' : '#'}${step}`;
    return null;
}

/**
 * How well one chord explains some notes. Notes are cut to the window [from, to) in beats.
 * @param {{ beat: number, beats: number, key: number }[]} notes
 * @returns {{ score: number, bass: string|null }} bass: the slash degree the arpeggio starts on, when it should be
 */
export function scoreChord(chord, notes, from, to, { tonic, mode, beatsPerBar = 4, kind = 'triad', melody = false })
{
    const C = CHORD_GUESS, outside = melody ? C.melody.outside : C.outside, missing = melody ? C.melody.missing : C.missing;
    const pcs = chordPitchClasses(chord);
    const heard = new Set();
    let score = -C.prior[kind], first = null, lowest = Infinity;
    for (const n of notes)
    {
        const a = Math.max(n.beat, from), b = Math.min(n.beat + n.beats, to);
        if (b <= a) continue;
        const onBar = Math.abs(n.beat / beatsPerBar - Math.round(n.beat / beatsPerBar)) < 1e-6;
        const onBeat = Math.abs(n.beat - Math.round(n.beat)) < 1e-6;
        const w = (b - a) * (n.beat >= from ? (onBar ? C.weight.bar : onBeat ? C.weight.beat : C.weight.off) : C.weight.off);
        const pc = mod(n.key, 12);
        if (pcs.includes(pc)) { score += C.inside * w; heard.add(pc); }
        else score -= outside * w;
        if (n.beat >= from && first === null) first = n;
        lowest = Math.min(lowest, n.key);
    }
    // unheard tones count fully once the stretch has three different notes; a held note alone can't sound a chord
    const distinct = new Set(notes.filter(n => Math.min(n.beat + n.beats, to) > Math.max(n.beat, from)).map(n => mod(n.key, 12))).size;
    score -= missing * pcs.filter(pc => !heard.has(pc)).length * Math.min(1, distinct / 3);
    if (heard.has(chord.root)) score += melody ? C.melody.rootHeard : C.rootHeard;
    let bass = null;
    const above = first ? mod(first.key - chord.root, 12) : -1;
    if (first && first.key === lowest && [3, 4, 10, 11].includes(above) && pcs.includes(mod(first.key, 12)))
        bass = bassDegree(mod(first.key, 12), tonic, mode);
    return { score, bass };
}

/** what moving from one chord to the next costs, beyond the change itself: common moves less */
function moveCost(a, b, tonic)
{
    if (!a) return 0;
    let c = 0;
    if (mod(a.root - b.root, 12) === 7) c -= CHORD_GUESS.move.fifthDown;
    if (b.root === tonic) c -= CHORD_GUESS.move.toTonic;
    return c;
}

/**
 * The chords of an arpeggio take and where they change.
 * @param {{ beat: number, beats: number, key: number }[]} notes  from transcribe(), beat 0 on a bar line
 * @param {{ tonic: number, mode: string, beatsPerBar?: number, melody?: boolean }} key  melody: harmonise a tune
 *   instead: no slash basses (its first note isn't a bass), and chords change only on bar lines and half bars
 * @returns {{ beat: number, beats: number, symbol: string, score: number,
 *   others: { symbol: string, score: number }[] }[] & { total?: number }} others: the runners-up for the same
 *   stretch, best first; total: the whole reading's score, to compare keys
 */
export function guessChords(notes, { tonic, mode, beatsPerBar = 4, melody = false })
{
    if (!notes.length) return [];
    const C = CHORD_GUESS;
    // the DP steps in beats, or half beats when a bar ends between beats (5/8, 7/8); indexes count steps
    const step = Number.isInteger(beatsPerBar) ? 1 : 0.5;
    const end = Math.round(Math.ceil(Math.max(...notes.map(n => n.beat + n.beats)) / beatsPerBar - 1e-6) * beatsPerBar / step);
    const vocab = chordVocabulary(mode).filter(([symbol, kind])=> !melody || (kind === 'triad' || kind === 'borrowed') && !/\d/.test(symbol))
        .map(([symbol, kind])=> ({ symbol, kind, chord: parseChord(symbol, tonic, mode) }));
    const maxLen = Math.round(C.maxBars * beatsPerBar / step);
    // a restart: a note starting on this beat that jumps down a 4th or more from the note before it
    const restart = new Set();
    for (let i = 1; i < notes.length; i++) if (notes[i].key <= notes[i - 1].key - 5) restart.add(Math.round(notes[i].beat * 2) / 2);
    const changeCost = (b)=>
    {
        const base = b % beatsPerBar === 0 ? C.change.bar : (2 * b) % beatsPerBar === 0 ? (melody ? C.melody.half : C.change.half) : C.change.beat;
        return Math.max(C.change.bar, base - (restart.has(b) ? C.change.restart : 0));
    };
    // best[b][v]: the best total score of beats 0..b with chord v ending at b
    const best = Array.from({ length: end + 1 }, ()=> new Array(vocab.length).fill(-Infinity));
    const from = Array.from({ length: end + 1 }, ()=> new Array(vocab.length).fill(null));
    const scores = new Map();
    const scoreOf = (v, a, b)=>
    {
        const id = `${v},${a},${b}`;
        if (!scores.has(id)) scores.set(id, scoreChord(vocab[v].chord, notes, a * step, b * step, { tonic, mode, beatsPerBar, kind: vocab[v].kind, melody }));
        return scores.get(id);
    };
    // where a chord may change: any beat in an arpeggio take, the bar lines and half bars (of an even meter) under a tune
    const every = melody ? (beatsPerBar % 2 ? beatsPerBar : beatsPerBar / 2) : 1;
    const may = (b)=> b === end || (b * step) % every === 0 || (b * step) % beatsPerBar === 0;
    for (let b = 1; b <= end; b++)
        for (let a = Math.max(0, b - maxLen); a < b; a++)
        {
            if (!may(a) || !may(b)) continue;
            for (let v = 0; v < vocab.length; v++)
            {
                const s = scoreOf(v, a, b).score;
                if (a === 0)
                {
                    const first = s + (vocab[v].chord.root === tonic ? C.startOnTonic : 0);
                    if (first > best[b][v]) { best[b][v] = first; from[b][v] = { a, u: -1 }; }
                    continue;
                }
                for (let u = 0; u < vocab.length; u++)
                {
                    if (u === v || best[a][u] === -Infinity) continue;
                    const total = best[a][u] + s - changeCost(a * step) - moveCost(vocab[u].chord, vocab[v].chord, tonic);
                    if (total > best[b][v]) { best[b][v] = total; from[b][v] = { a, u }; }
                }
            }
        }
    const final = best[end].map((s, i)=> s + (vocab[i].chord.root === tonic ? C.endOnTonic : 0));
    let v = final.indexOf(Math.max(...final));
    /** @type {ReturnType<typeof guessChords>} */
    const out = [];
    out.total = final[v];
    for (let b = end; b > 0;)
    {
        const { a, u } = from[b][v];
        const { bass } = scoreOf(v, a, b);
        const ranked = vocab.map((c, i)=> ({ symbol: c.symbol, score: scoreOf(i, a, b).score })).sort((x, y)=> y.score - x.score);
        const symbol = vocab[v].symbol + (bass && !melody && !vocab[v].symbol.includes('/') ? `/${bass}` : '');
        out.unshift({ beat: a * step, beats: (b - a) * step, symbol, score: scoreOf(v, a, b).score, others: ranked.filter(r => r.symbol !== vocab[v].symbol).slice(0, 3) });
        b = a; v = u;
    }
    return out;
}

/**
 * The key and chords of an arpeggio take together: the likeliest few keys from the notes alone (guessKeys), each
 * read for chords, and the best reading kept. A take that outlines I vi IV V is no more G major than E minor by its
 * notes; its chords, starting on G, say which.
 * @param {{ key: string, tonic: number, mode: string }[]} keys  guessKeys(notes), best first
 * @returns {{ key: { key: string, tonic: number, mode: string }, chords: ReturnType<typeof guessChords> }}
 */
export function chordKey(notes, keys, beatsPerBar = 4)
{
    let best = null;
    for (const key of keys.slice(0, CHORD_GUESS.keysTried))
    {
        const chords = guessChords(notes, { tonic: key.tonic, mode: key.mode, beatsPerBar });
        if (!best || chords.total > best.chords.total) best = { key, chords };
    }
    return best;
}

/**
 * The chord of an arpeggio whistled freely over a stretch of a tune chosen beforehand: no beat, so the notes count
 * by how long each was held, the stretch is one chord, and its first note sets a slash bass by scoreChord's rule.
 * @param {{ time: number, seconds: number, key: number }[]} notes  from freeNotes()
 * @returns {{ symbol: string, score: number, others: { symbol: string, score: number }[] }|null} others: runners-up
 */
export function nameChord(notes, { tonic, mode })
{
    if (!notes.length) return null;
    // laid out by seconds; an endless bar weighs every note the same, since none falls on a beat
    const laid = notes.map(n => ({ beat: n.time, beats: n.seconds, key: n.key }));
    const from = Math.min(...laid.map(n => n.beat)), to = Math.max(...laid.map(n => n.beat + n.beats));
    const ranked = chordVocabulary(mode).map(([symbol, kind])=>
    {
        const { score, bass } = scoreChord(parseChord(symbol, tonic, mode), laid, from, to, { tonic, mode, beatsPerBar: Infinity, kind });
        return { symbol, score, bass };
    }).sort((a, b)=> b.score - a.score);
    const [best, ...rest] = ranked;
    return {
        symbol: best.symbol + (best.bass && !best.symbol.includes('/') ? `/${best.bass}` : ''),
        score: best.score,
        others: rest.slice(0, 3).map(({ symbol, score })=> ({ symbol, score })),
    };
}

const barsText = (bars)=> String(Math.round(bars * 1000) / 1000);

/** chords as a progression: lengths in bars after ':', 1 left out */
export function toProgression(chords, beatsPerBar = 4)
{
    const out = [];
    for (const c of chords)
    {
        const bars = c.beats / beatsPerBar;
        out.push(`${c.symbol}${bars === 1 ? '' : ':' + barsText(bars)}`);
    }
    return out.join(' ');
}
