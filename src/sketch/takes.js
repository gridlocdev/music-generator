// Whistled takes, read: a melody take's notes off its pitch frames and its key, and the chords over a melody (the
// ones whistled, and ones guessed for the stretches between). Pure apart from mutating the take it is given.
//
// A melody take: { kind: 'melody', samples, rate, frames, tempo, meter, downbeat,
//   notes, origin, gridTempo, offset, key, chords: [{ beat, beats, notes, symbol, others }], guesses }
import { transcribe, tuningOffset, smoothPitch, noteStarts, clickGrid, guessKeys } from '../lib/transcribe.js';
import { guessChords, nameChord } from '../lib/chord-guess.js';
import { pitchClass } from '../lib/music-theory.js';
import { beatsPerBar } from './sketch-spec.js';

const sameKey = (a, b)=> a?.tonic === b?.tonic && a?.mode === b?.mode;
const end = (list)=> Math.max(0, ...list.map(x => x.beat + x.beats));

/** 'Eb major' as a key, or null for 'auto' */
function keyOf(choice)
{
    if (!choice || choice === 'auto') return null;
    const [name, mode] = choice.split(' ');
    return { key: name, tonic: pitchClass(name), mode };
}

/** reads a melody take's notes off its frames, on the click's grid when it had one */
export function analyse(take, keyChoice = 'auto')
{
    const offset = tuningOffset(take.frames), smooth = smoothPitch(take.frames);
    const starts = noteStarts(take.frames, { offset, smooth });
    const grid = take.downbeat === null ? null : clickGrid(starts, take.tempo, take.downbeat);
    const t = transcribe(take.frames, { tempo: take.tempo, starts, grid });
    Object.assign(take, { notes: t.notes, origin: t.origin, gridTempo: t.tempo, offset: t.offset, chords: take.chords ?? [] });
    rekey(take, keyChoice, true);
    return take;
}

/**
 * A melody take's key (the one chosen, else the likeliest from its notes and its chords' notes), the chords whistled
 * over it named in that key, and chords guessed from its notes for the stretches with none. Chords already named
 * keep their pick unless the key changed.
 */
function rekey(take, keyChoice = 'auto', notesChanged = false)
{
    const chordNotes = take.chords.flatMap(c => c.notes.map(n => ({ beat: 0, beats: n.seconds, key: n.key })));
    const heard = [...chordNotes, ...take.notes];
    const key = keyOf(keyChoice) ?? (heard.length ? guessKeys(heard)[0] : null);
    const moved = !sameKey(key, take.key);
    take.key = key;
    if (!key) { take.guesses = []; return; }
    for (const c of take.chords) if (moved || !c.symbol) Object.assign(c, nameChord(c.notes, key), { options: null, pick: 0 });
    if (moved || notesChanged || !take.guesses)
        take.guesses = take.notes.length ? guessChords(take.notes, { tonic: key.tonic, mode: key.mode, beatsPerBar: beatsPerBar(take.meter), melody: true }) : [];
}

/** the chords over a take: whistled ones, and guessed ones ({ guessed: true, src }) cut to fit the stretches between */
export function chordsOf(take)
{
    const whistled = [...take.chords].sort((a, b)=> a.beat - b.beat);
    const gaps = [];
    let at = 0;
    for (const c of whistled) { if (c.beat > at) gaps.push([at, c.beat]); at = Math.max(at, c.beat + c.beats); }
    const last = Math.max(end(take.notes), end(take.guesses ?? []));
    if (last > at) gaps.push([at, last]);
    const guessed = [];
    for (const g of take.guesses ?? [])
        for (const [a, b] of gaps)
        {
            const from = Math.max(a, g.beat), to = Math.min(b, g.beat + g.beats);
            if (to > from) guessed.push({ beat: from, beats: to - from, symbol: g.symbol, guessed: true, src: g });
        }
    return [...whistled, ...guessed].sort((a, b)=> a.beat - b.beat);
}

/** what's left of a chord outside a stretch: nothing, one piece or two */
export function cut(c, a, b)
{
    if (c.beat + c.beats <= a || c.beat >= b) return [c];
    const out = [];
    if (c.beat < a) out.push({ ...c, beats: a - c.beat });
    if (c.beat + c.beats > b) out.push({ ...c, beat: b, beats: c.beat + c.beats - b });
    return out;
}
