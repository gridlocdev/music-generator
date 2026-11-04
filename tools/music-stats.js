// How a lead line moves, measured the same way for every source (NSF register dumps, recorded audio), so the reports
// can be compared. Notes are { frame, frames, key, vibrato, slide } at 60 frames a second. Pure.

export const pct = (n, d)=> d ? `${Math.round(n / d * 100)}%` : '—';
export const median = (xs)=> { const s = [...xs].sort((a, b)=> a - b); return s.length ? s[s.length >> 1] : null; };
const NAMES = 'C C# D D# E F F# G G# A A# B'.split(' ');
export const noteName = (k)=> k === null ? '—' : `${NAMES[k % 12]}${Math.floor(k / 12) - 1}`;
export const tally = (xs)=> { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b)=> b[1] - a[1]); };

// interval sizes in semitones
export const SIZES = ['repeat', 'step', 'third', '4th–5th', '6th–7th', 'octave+'];
const size = (d)=> { const a = Math.abs(d); return a === 0 ? 'repeat' : a <= 2 ? 'step' : a <= 4 ? 'third' : a <= 7 ? '4th–5th' : a < 12 ? '6th–7th' : 'octave+'; };

/**
 * How the lead moves, note to note, ignoring rests longer than four bars.
 * @param {{ frame: number, frames: number, key: number, vibrato: number, slide: number }[]} notes
 * @param {number | null} row  frames per row (a 16th, usually), for note lengths
 */
export function melody(notes, row)
{
    const intervals = [];
    for (let i = 1; i < notes.length; i++) if (notes[i].frame - (notes[i - 1].frame + notes[i - 1].frames) < 16 * (row ?? 8)) intervals.push(notes[i].key - notes[i - 1].key);
    const sizes = Object.fromEntries(SIZES.map(k => [k, intervals.filter(d => size(d) === k).length]));
    const moves = intervals.filter(d => d !== 0);
    let turns = 0, leaps = 0, recovered = 0;
    for (let i = 1; i < moves.length; i++) if (Math.sign(moves[i]) !== Math.sign(moves[i - 1])) turns++;
    for (let i = 0; i < moves.length - 1; i++) if (Math.abs(moves[i]) >= 5) { leaps++; if (Math.sign(moves[i + 1]) !== Math.sign(moves[i]) && Math.abs(moves[i + 1]) <= 2) recovered++; }
    const lengths = tally(notes.map(n => row ? Math.round(n.frames / row) : n.frames)).slice(0, 5);
    const long = notes.filter(n => n.frames >= 24);
    return {
        intervals: intervals.length, sizes, turns: turns / Math.max(1, moves.length - 1), leaps, recovered,
        range: [Math.min(...notes.map(n => n.key)), Math.max(...notes.map(n => n.key))],
        lengths, vibrato: long.length ? { notes: long.length, share: long.filter(n => n.vibrato >= 15).length / long.length, cents: median(long.map(n => n.vibrato)) } : null,
        slides: notes.filter(n => Math.abs(n.slide) >= 0.5).length,
    };
}

/** the report's two lines for one song's lead */
export function melodyLines(name, m)
{
    const sizes = Object.entries(m.sizes).map(([k, n])=> `${k} ${pct(n, m.intervals)}`).join(', ');
    return `  lead ${name}: ${sizes}; turns ${pct(m.turns, 1)}; leaps ≥4th ${m.leaps}, ${pct(m.recovered, m.leaps)} answered by a step back\n`
        + `    lengths in rows ${m.lengths.map(([l, n])=> `${l}:${n}`).join(' ')}; vibrato on ${m.vibrato ? `${pct(m.vibrato.share, 1)} of ${m.vibrato.notes} long notes (median ${m.vibrato.cents}¢)` : '—'}; slides ${m.slides}`;
}

/** totals over several songs' leads: pooled, and the median song (so one odd song can't swing it) */
export function melodyTotals(ms)
{
    const total = ms.reduce((n, m)=> n + m.intervals, 0);
    const pooled = SIZES.map(k => `${k} ${pct(ms.reduce((n, m)=> n + m.sizes[k], 0), total)}`).join(', ');
    const songs = ms.filter(m => m.intervals >= 20);
    const typical = SIZES.map(k => `${k} ${pct(median(songs.map(m => m.sizes[k] / m.intervals)), 1)}`).join(', ');
    const leaps = ms.reduce((n, m)=> n + m.leaps, 0), rec = ms.reduce((n, m)=> n + m.recovered, 0);
    return `  lead intervals, all notes: ${pooled}\n  lead intervals, median song: ${typical}\n`
        + `  turns ${pct(median(songs.map(m => m.turns)), 1)} (median song); leaps answered by a step back ${pct(rec, leaps)}`;
}
