// Draws a take: semitone lanes (the key's notes lighter, its tonic brightest), the beat grid from the click, the raw
// pitch the mic heard as a trace, the transcribed notes as blocks over it, and the chords in a strip above: whistled
// ones solid, ones guessed from the melody faint. While a melody is recorded it scrolls with the playhead, the note
// being whistled drawn faintly at it until it's firmed up behind. A stretch dragged out for a chord is highlighted.
// Everything is in screen pixels.
import { vec2, rgb, drawRect, drawTextScreen, mainCanvasSize } from '../../platform/engine.js';
import { MODES } from '../../lib/music-theory.js';
import { noteName } from '../../lib/notes.js';
import { VIEW } from './sketchpad-data.js';

const LANE = rgb(1, 1, 1, 0.025), IN_KEY = rgb(1, 1, 1, 0.07), TONIC = rgb(1, 0.78, 0.4, 0.16);
const BEAT = rgb(1, 1, 1, 0.07), BAR = rgb(1, 1, 1, 0.22), DOWNBEAT = rgb(1, 0.78, 0.4, 0.5);
const TRACE = [0.55, 0.85, 1], LABEL = rgb(0.66, 0.64, 0.74), TEXT = rgb(0.93, 0.93, 0.93);
const MELODY = rgb(1, 0.78, 0.4, 0.8), SELECTED = rgb(1, 1, 1);
const CHORD = rgb(0.25, 0.22, 0.34), CHORD_EDGE = rgb(0.5, 0.46, 0.62), CHORD_PICKED = rgb(0.42, 0.3, 0.2);
const GUESS_EDGE = rgb(0.32, 0.3, 0.38), GUESS_TEXT = rgb(0.6, 0.58, 0.68), LIVE_NOTE = rgb(1, 0.78, 0.4, 0.3);
const RANGE = rgb(0.55, 0.75, 1, 0.12), RANGE_EDGE = rgb(0.55, 0.75, 1, 0.7), PLAYHEAD = rgb(1, 0.4, 0.4, 0.8);

const rect = (x, y, w, h, color)=> drawRect(vec2(x + w / 2, y + h / 2), vec2(w, h), color, 0, undefined, true);
const text = (s, x, y, size, color, align = 'left')=> drawTextScreen(s, vec2(x, y), size, color, 0, undefined, align);

/**
 * Where everything goes on screen, for drawing and for finding what the mouse is over.
 * @param {{ take: object|null, rec: object|null, top: number }} view  rec: the take being recorded; a chord take
 *   is whistled over the melody take in view, so the view stays on that
 */
export function layout({ take, rec, top })
{
    const W = mainCanvasSize.x, H = mainCanvasSize.y;
    if (rec?.kind !== 'melody') rec = null;
    const shown = rec ?? take;
    const x0 = VIEW.gutter, x1 = W - 12;
    const stripY = top + 8, lanesTop = stripY + VIEW.chordStrip + 6, lanesBottom = H - 16;
    const frames = shown?.frames ?? [];
    const offset = shown?.offset ?? 0;
    let t0, t1;
    if (rec)
    {
        t1 = Math.max(VIEW.liveSeconds, rec.playhead + 0.5);
        t0 = t1 - VIEW.liveSeconds;
    }
    else
    {
        t0 = Math.min(frames[0]?.time ?? 0, shown?.origin ?? 0) - 0.2;
        t1 = Math.max(t0 + 2, (frames.at(-1)?.time ?? 0) + 0.3);
    }
    // the lanes cover what was whistled, with a little room, and never fewer than VIEW.minLanes
    const keys = frames.filter(f => f.midi !== null && f.time >= t0).map(f => f.midi - offset);
    for (const n of shown?.notes ?? []) keys.push(n.key);
    let lo = keys.length ? Math.floor(Math.min(...keys)) - 2 : VIEW.range[0];
    let hi = keys.length ? Math.ceil(Math.max(...keys)) + 2 : VIEW.range[1];
    if (rec) { lo = Math.min(lo, VIEW.range[0]); hi = Math.max(hi, VIEW.range[1]); }
    if (hi - lo + 1 < VIEW.minLanes) { const grow = VIEW.minLanes - (hi - lo + 1); lo -= Math.floor(grow / 2); hi += Math.ceil(grow / 2); }
    const laneH = (lanesBottom - lanesTop) / (hi - lo + 1);
    const pxPerSec = (x1 - x0) / (t1 - t0);
    const beatSec = 60 / (shown?.gridTempo ?? shown?.tempo ?? 60);
    const origin = shown?.gridOrigin ?? shown?.origin ?? 0;
    return {
        x0, x1, stripY, lanesTop, lanesBottom, lo, hi, laneH, t0, t1, offset, origin, beatSec,
        x: (t)=> x0 + (t - t0) * pxPerSec,
        time: (x)=> t0 + (x - x0) / pxPerSec,
        /** the top of a key's lane */
        y: (key)=> lanesBottom - (key - lo + 1) * laneH,
        key: (y)=> lo + Math.floor((lanesBottom - y) / laneH),
        beatX: (beat)=> x0 + (origin + beat * beatSec - t0) * pxPerSec,
        beatAt: (x)=> (t0 + (x - x0) / pxPerSec - origin) / beatSec,
    };
}

/** the index of the note under a screen point, or -1 */
export function noteAt(L, notes, p)
{
    return notes.findIndex(n => p.x >= L.beatX(n.beat) && p.x < L.beatX(n.beat + n.beats) && p.y >= L.y(n.key) && p.y < L.y(n.key) + L.laneH);
}

/** the index of the chord whose box is under a screen point, or -1 */
export function chordAt(L, chords, p)
{
    if (p.y < L.stripY || p.y > L.stripY + VIEW.chordStrip) return -1;
    return chords.findIndex(c => p.x >= L.beatX(c.beat) && p.x < L.beatX(c.beat + c.beats));
}

/**
 * @param {ReturnType<typeof layout>} L
 * @param {{ take: object|null, rec: object|null, key: { tonic: number, mode: string }|null, chords: object[],
 *   selected: number, range: { beat: number, beats: number }|null, beatsPerBar: number, hint: string }} s
 *   chords: { guessed } ones are drawn faint; range: the stretch dragged out for a chord
 */
export function drawSketch(L, { take, rec, key, chords, selected, range, beatsPerBar, hint })
{
    const chordRec = rec?.kind === 'chord' ? rec : null;
    if (chordRec) rec = null;
    const shown = rec ?? take;
    const scale = key ? new Set(MODES[key.mode].map(i => (key.tonic + i) % 12)) : null;
    // lanes
    for (let k = L.lo; k <= L.hi; k++)
    {
        const pc = ((k % 12) + 12) % 12;
        const color = key && pc === key.tonic ? TONIC : scale?.has(pc) ? IN_KEY : LANE;
        rect(L.x0, L.y(k) + 1, L.x1 - L.x0, L.laneH - 1, color);
        if (L.laneH >= 11 || pc === 0 || (key && pc === key.tonic))
            text(noteName(k), L.x0 - 6, L.y(k) + L.laneH / 2, Math.min(12, Math.max(9, L.laneH * 0.8)), key && pc === key.tonic ? TEXT : LABEL, 'right');
    }
    if (!shown) { text(hint, (L.x0 + L.x1) / 2, (L.lanesTop + L.lanesBottom) / 2, 16, LABEL, 'center'); return; }

    // the beat grid: bar lines brighter, beat 0 (the first bar after the count-in) brightest
    const first = Math.ceil((L.t0 - L.origin) / L.beatSec), last = Math.floor((L.t1 - L.origin) / L.beatSec);
    for (let b = first; b <= last; b++)
    {
        const x = L.beatX(b), onBar = ((b % beatsPerBar) + beatsPerBar) % beatsPerBar === 0;
        rect(x, L.lanesTop, 1, L.lanesBottom - L.lanesTop, b === 0 ? DOWNBEAT : onBar ? BAR : BEAT);
        if (onBar && b >= 0) text(String(b / beatsPerBar + 1), x + 3, L.lanesTop + 8, 10, LABEL);
    }

    // the chords above the lanes; one picked from its runners-up is tinted
    for (const c of chords)
    {
        const a = L.beatX(c.beat), b = L.beatX(c.beat + c.beats);
        if (b < L.x0 || a > L.x1) continue;
        rect(a + 1, L.stripY, b - a - 2, VIEW.chordStrip, c.guessed ? GUESS_EDGE : CHORD_EDGE);
        rect(a + 2, L.stripY + 1, b - a - 4, VIEW.chordStrip - 2, c.pick ? CHORD_PICKED : CHORD);
        text(c.symbol, (a + b) / 2, L.stripY + VIEW.chordStrip / 2, 13, c.guessed ? GUESS_TEXT : TEXT, 'center');
    }
    if (range)
    {
        const a = L.beatX(range.beat), b = L.beatX(range.beat + range.beats);
        rect(a, L.stripY, b - a, L.lanesBottom - L.stripY, RANGE);
        rect(a, L.stripY, 2, L.lanesBottom - L.stripY, RANGE_EDGE);
        rect(b - 2, L.stripY, 2, L.lanesBottom - L.stripY, RANGE_EDGE);
    }

    // the notes, then the raw pitch over them so both read
    const notes = shown.notes ?? [];
    notes.forEach((n, i)=>
    {
        const a = L.beatX(n.beat), b = L.beatX(n.beat + n.beats), y = L.y(n.key);
        if (i === selected) rect(a - 1, y - 1, b - a + 1, L.laneH + 2, SELECTED);
        rect(a + 1, y + 1, b - a - 2, L.laneH - 2, MELODY);
    });
    const dot = Math.max(2, Math.min(3, L.laneH / 5));
    for (const f of shown.frames)
    {
        if (f.midi === null || f.time < L.t0) continue;
        rect(L.x(f.time) - dot / 2, L.y(f.midi - L.offset) + L.laneH / 2 - dot / 2, dot, dot, rgb(...TRACE, 0.35 + 0.6 * f.clarity));
    }
    for (const n of notes) if (n.vibrato) text('~', L.beatX(n.beat) + 2, L.y(n.key) - 6, 14, SELECTED);

    // while recording a melody: the playhead, the note being whistled faint up to it, and the count-in
    if (rec)
    {
        const x = L.x(rec.playhead);
        if (rec.live) rect(L.x(rec.live.from), L.y(rec.live.key) + 1, Math.max(2, x - L.x(rec.live.from)), L.laneH - 2, LIVE_NOTE);
        rect(x, L.lanesTop, 2, L.lanesBottom - L.lanesTop, PLAYHEAD);
        liveName(L, rec);
        if (rec.countIn > 0) text(String(rec.countIn), (L.x0 + L.x1) / 2, (L.lanesTop + L.lanesBottom) / 2, 72, rgb(1, 0.78, 0.4, 0.8), 'center');
    }
    // while whistling a chord: the note heard, over the stretch it's for
    if (chordRec)
    {
        liveName(L, chordRec);
        const heard = new Set(chordRec.frames.filter(f => f.midi !== null).map(f => noteName(Math.round(f.midi - chordRec.offset)).replace(/-?\d+$/, '')));
        text(`Whistle the chord, any order, any octave · heard: ${[...heard].join(' ') || '…'}`, (L.x0 + L.x1) / 2, L.lanesBottom - 14, 14, TEXT, 'center');
    }
}

/** the note the mic hears now, and how far off it is */
function liveName(L, rec)
{
    const f = rec.frames.findLast(fr => fr.time > rec.seconds - 0.08 && fr.midi !== null);
    if (!f) return;
    const k = Math.round(f.midi), cents = Math.round(100 * (f.midi - k));
    text(`${noteName(k)} ${cents >= 0 ? '+' : ''}${cents}¢`, L.x1 - 8, L.lanesTop + 22, 22, TEXT, 'right');
}
