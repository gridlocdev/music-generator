// Whistled takes, read and edited: a melody take's notes off its pitch frames, its key, the chords whistled over
// stretches of it and the chords guessed for the rest. Pure apart from mutating the take it is given.
//
// A melody take: { kind: 'melody', n, source, samples, rate, frames, tempo, meter, downbeat,
//   notes, origin, gridTempo, offset, key, chords: [{ beat, beats, notes, symbol, others, options?, pick? }], guesses }
// A chord take: { kind: 'chord', n, source, samples, rate, frames, notes, tempo, meter, range, key }
import { transcribe, tuningOffset, smoothPitch, noteStarts, clickGrid, guessKeys } from '../lib/transcribe.js';
import { guessChords, nameChord } from '../lib/chord-guess.js';
import { pitchClass } from '../lib/music-theory.js';
import { beatsPerBar, sketchSection } from './sketch-spec.js';

const MAJOR = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
/** every key a sketch can be forced into, as 'Eb major' */
export const KEYS = [...MAJOR.map(k => `${k} major`), ...MINOR.map(k => `${k} minor`)];

const sameKey = (a, b)=> a?.tonic === b?.tonic && a?.mode === b?.mode;
const end = (list)=> Math.max(0, ...list.map(x => x.beat + x.beats));

/** 'Eb major' as a key, or null for 'auto' */
export function keyOf(choice)
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
export function rekey(take, keyChoice = 'auto', notesChanged = false)
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

/** what a melody take makes: its key, meter, chords and section, or null before it has a key */
export function sketchOf(take)
{
    if (!take?.key) return null;
    const chords = chordsOf(take);
    const section = sketchSection({ key: take.key, meter: take.meter, melody: take.notes, chords });
    return { key: take.key, meter: take.meter, chords, section };
}

/** a chord whistled for a stretch of a melody take: it takes the stretch over from any chord whistled there before */
export function addChord(take, range, notes, keyChoice = 'auto')
{
    const a = range.beat, b = range.beat + range.beats;
    take.chords = take.chords.flatMap(c => cut(c, a, b));
    const chord = { beat: a, beats: range.beats, notes };
    take.chords.push(chord);
    rekey(take, keyChoice);
    return chord;
}

/** forgets the chords whistled over a stretch */
export function clearChords(take, range, keyChoice = 'auto')
{
    take.chords = take.chords.flatMap(c => cut(c, range.beat, range.beat + range.beats));
    rekey(take, keyChoice, true);
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

/** 'bar 2', 'bars 1–2', 'bar 3 beats 3–4', 'bar 1 beat 3 to bar 2 beat 4' */
export function barsName({ beat, beats }, meter)
{
    const bpb = beatsPerBar(meter), lastBeat = beat + beats - 1;
    const first = Math.floor(beat / bpb) + 1, last = Math.floor(lastBeat / bpb) + 1;
    if (beat % bpb === 0 && beats % bpb === 0) return first === last ? `bar ${first}` : `bars ${first}–${last}`;
    const at = (b)=> b % bpb + 1;
    if (first === last) return `bar ${first} beat${beats > 1 ? `s ${at(beat)}–${at(lastBeat)}` : ` ${at(beat)}`}`;
    return `bar ${first} beat ${at(beat)} to bar ${last} beat ${at(lastBeat)}`;
}

/** a stretch from one beat to another, snapped out to half bars (bars in an odd meter), or to beats when `fine` */
export function snapRange(a, b, meter, fine = false)
{
    const bpb = beatsPerBar(meter);
    const unit = fine ? 1 : bpb % 2 ? bpb : bpb / 2;
    const from = Math.max(0, Math.floor(Math.min(a, b) / unit) * unit);
    const to = Math.max(from + unit, Math.ceil(Math.max(a, b) / unit) * unit);
    return { beat: from, beats: to - from };
}

/** a chord box clicked: the next of its runners-up, and round to the first reading */
export function pickNext(shown)
{
    const c = shown.src ?? shown;
    c.options ??= [c.symbol, ...(c.others ?? []).map(o => o.symbol)];
    c.pick = ((c.pick ?? 0) + 1) % c.options.length;
    c.symbol = c.options[c.pick];
}
