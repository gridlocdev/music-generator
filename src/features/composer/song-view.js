// Draws a playing score as a grid of pianos, one per part, with each note falling from above onto the key that plays it.
// Works in screen pixels (top-left origin) by pointing the camera at the canvas: one world unit = one pixel.
import { vec2, rgb, drawRect, drawText, mainCanvasSize, setCameraPos, setCameraScale } from '../../platform/engine.js';
import { isBlackKey, noteName } from '../../lib/notes.js';
import { ROLE_COLORS, VIEW_SECONDS } from './composer-data.js';

const GAP = 10;                 // pixels between panels
const HEADER = 22;              // panel title height
const MAX_NOTE_BEATS = 32;      // longest note; notes that started this long ago are skipped
const ASPECT = 1.5;             // preferred panel width / height
const BG = rgb(0.1, 0.09, 0.15), LANE = rgb(0.06, 0.055, 0.09), GRID = rgb(1, 1, 1, 0.06);
const WHITE_KEY = rgb(0.93, 0.92, 0.9), BLACK_KEY = rgb(0.12, 0.11, 0.16), TEXT = rgb(0.85, 0.83, 0.92), DIM = rgb(0.55, 0.52, 0.65), SCENE = rgb(1, 0.85, 0.6);

let W = 0, H = 0;
const rect = (x, y, w, h, c)=> drawRect(vec2(x + w / 2, H - y - h / 2), vec2(w, h), c);
const text = (s, x, y, size, c, align = 'left')=> drawText(s, vec2(x, H - y - size / 2), size, c, 0, undefined, /** @type {any} */ (align));

/**
 * Per-track layout that doesn't change while the song plays: each part's key range (whole octaves) and colour.
 * @param {import('./compose.js').Score} score
 * @param {string[]} instrumentNames  one per track
 */
export function prepareView(score, instrumentNames)
{
    return score.tracks.map((t, i)=>
    {
        const keys = t.notes.map(n => n.key);
        let lo = Math.floor(Math.min(...keys) / 12) * 12, hi = Math.floor(Math.max(...keys) / 12) * 12 + 11;
        if (hi - lo < 23) hi = lo + 23;     // at least two octaves, so every piano looks like one
        const c = ROLE_COLORS[t.role] ?? [1, 1, 1];
        return {
            track: t, lo, hi, title: `${t.name} · ${instrumentNames[i]}`,
            color: rgb(...c), falling: rgb(c[0], c[1], c[2], 0.85), glow: rgb(c[0], c[1], c[2], 0.25),
        };
    });
}

/**
 * @param {ReturnType<typeof prepareView>} panels
 * @param {import('./compose.js').Score} score
 * @param {number} beat  current position in beats
 * @param {number} top  pixels at the top covered by the control bar
 */
export function drawSong(panels, score, beat, top)
{
    W = mainCanvasSize.x; H = mainCanvasSize.y;
    setCameraScale(1);
    setCameraPos(vec2(W / 2, H / 2));

    const footer = 64;
    const area = { x: GAP, y: top + GAP, w: W - GAP * 2, h: H - top - footer - GAP * 2 };
    const n = panels.length;
    // pick the column count whose panels come closest to the preferred shape
    let cols = 1, bestScore = Infinity;
    for (let c = 1; c <= n; c++)
    {
        const rows = Math.ceil(n / c);
        const s = Math.abs(Math.log(((area.w - GAP * (c - 1)) / c) / ((area.h - GAP * (rows - 1)) / rows) / ASPECT));
        if (s < bestScore) { bestScore = s; cols = c; }
    }
    const rows = Math.ceil(n / cols);
    const pw = (area.w - GAP * (cols - 1)) / cols, ph = (area.h - GAP * (rows - 1)) / rows;
    const window = VIEW_SECONDS * score.tempo / 60;

    panels.forEach((p, i)=>
        drawPanel(p, area.x + (i % cols) * (pw + GAP), area.y + Math.floor(i / cols) * (ph + GAP), pw, ph, beat, window, score.beatsPerBar));
    drawTimeline(score, beat, H - footer, footer);
}

function drawPanel(p, x, y, w, h, beat, window, beatsPerBar)
{
    rect(x, y, w, h, BG);
    text(p.title, x + 8, y + 4, 14, TEXT);

    const kbH = Math.min(80, Math.max(28, h * 0.22));
    const laneY = y + HEADER, laneH = h - HEADER - kbH;
    const kbY = laneY + laneH;
    rect(x, laneY, w, laneH, LANE);

    // key positions across the panel
    let whites = 0;
    for (let k = p.lo; k <= p.hi; k++) if (!isBlackKey(k)) whites++;
    const ww = w / whites;
    const pos = new Map();
    for (let k = p.lo, wx = x; k <= p.hi; k++)
    {
        if (isBlackKey(k)) pos.set(k, { x: wx - ww * 0.3, w: ww * 0.6, black: true });
        else { pos.set(k, { x: wx, w: ww, black: false }); wx += ww; }
    }

    // bar lines scrolling down with the notes
    for (let b = Math.ceil(beat / beatsPerBar) * beatsPerBar; b < beat + window; b += beatsPerBar)
        rect(x, kbY - (b - beat) / window * laneH, w, 1, GRID);

    // falling notes; notes are sorted by start, so skip to the first that could still be visible
    const notes = p.track.notes;
    const active = new Set();
    let i = firstFrom(notes, beat - MAX_NOTE_BEATS);
    for (; i < notes.length && notes[i].beat < beat + window; i++)
    {
        const n = notes[i];
        const end = n.beat + n.beats;
        if (end < beat) continue;
        if (n.beat <= beat) active.add(n.key);
        const k = pos.get(n.key);
        if (!k) continue;
        const bottom = kbY - Math.max(0, n.beat - beat) / window * laneH;
        const topY = Math.max(laneY, kbY - (end - beat) / window * laneH);
        if (bottom - topY < 1) continue;
        const inset = k.w * 0.1;
        rect(k.x + inset, topY, k.w - inset * 2, bottom - topY - 1, n.beat <= beat ? p.color : p.falling);
    }
    if (active.size) rect(x, kbY - 6, w, 6, p.glow);

    // keyboard: white keys, then black keys over them, lit while their note sounds
    for (const pass of [false, true])
        for (const [key, k] of pos)
        {
            if (k.black !== pass) continue;
            const lit = active.has(key);
            const kh = k.black ? kbH * 0.6 : kbH;
            rect(k.x + (k.black ? 0 : 0.5), kbY, k.w - (k.black ? 0 : 1), kh, lit ? p.color : k.black ? BLACK_KEY : WHITE_KEY);
            if (!k.black && key % 12 === 0 && k.w > 9) text(noteName(key), k.x + k.w / 2, kbY + kh - 13, Math.min(11, k.w * 0.8), DIM, 'center');
        }
}

// index of the first note starting at or after beat (binary search)
function firstFrom(notes, beat)
{
    let lo = 0, hi = notes.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (notes[mid].beat < beat) lo = mid + 1; else hi = mid; }
    return lo;
}

// sections along the bottom, shaded by energy, with the playhead, the current section and chord
function drawTimeline(score, beat, y, h)
{
    const x = GAP, w = W - GAP * 2, barY = y + 46, barH = 10;
    for (const s of score.sections)
    {
        const sx = x + s.beat / score.beats * w, sw = s.beats / score.beats * w;
        rect(sx, barY, Math.max(1, sw - 2), barH, rgb(0.3 + s.energy * 0.5, 0.35 + s.energy * 0.3, 0.6, 0.9));
    }
    const at = Math.max(0, Math.min(1, beat / score.beats));
    rect(x + at * w - 1, barY - 4, 3, barH + 8, rgb(1, 1, 1));

    const section = score.sections.findLast(s => s.beat <= beat) ?? score.sections[0];
    const chord = score.chords.findLast(c => c.beat <= beat);
    const bar = Math.max(1, Math.floor(beat / score.beatsPerBar) + 1);
    text(`${score.title}  ·  ${section.label}  ·  ${chord && beat >= 0 ? chord.name : ''}`, x, y + 4, 16, TEXT);
    text(`${score.genre ? `${score.genre} · ` : ''}${score.emotion} · ${score.key} ${score.mode} · ${score.tempo} bpm · bar ${bar}   (Esc stops)`, x + w, y + 4, 13, DIM, 'right');
    // the story so far: this section's scene, or the song's premise when the section has none
    const line = section.scene || score.story;
    if (line) text(line, x, y + 25, 13, SCENE);
}
