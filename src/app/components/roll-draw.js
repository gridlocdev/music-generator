// What the piano roll draws: its lanes with note names in the gutter, the bars, clips, chords, notes (other tracks'
// faintly), velocities and the selection rectangle.
import { MODES } from '../../lib/music-theory.js';
import { noteName } from '../../lib/notes.js';
import { barLines } from '../../daw/meter.js';
import { settings, selectedClip, picked } from '../store.js';
import { held } from '../live.js';
import { noteId, notesOf } from '../notes.js';
import { rgba } from './canvas.js';
import { GUTTER, STRIP, LANE_H, VEL_H, band, geometry } from './roll-view.js';

const FONT = '-apple-system, system-ui, sans-serif';
const C = {
    lane: 'rgba(255,255,255,.025)', inKey: 'rgba(255,255,255,.07)', tonic: 'rgba(255,199,102,.16)', held: 'rgba(127,180,255,.45)',
    beat: 'rgba(255,255,255,.07)', bar: 'rgba(255,255,255,.22)',
    label: '#9898a4', text: '#e6e6ea', selected: '#ffffff', chord: '#403856', chordEdge: '#7f75a0', playhead: '#ff5a5a',
};

function text(g, s, x, y, size, color, align = 'left')
{
    g.font = `${size}px ${FONT}`;
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(s, x, y);
}

/** the key's lanes, with note names in the gutter; keys held on the keyboard light up */
function lanes(g, L, key, w)
{
    const scale = key ? new Set(MODES[key.mode].map(i => (key.tonic + i) % 12)) : null;
    const on = held.value;
    for (let k = L.lo; k <= L.hi; k++)
    {
        const pc = ((k % 12) + 12) % 12, tonic = key && pc === key.tonic;
        g.fillStyle = tonic ? C.tonic : scale?.has(pc) ? C.inKey : C.lane;
        g.fillRect(GUTTER, L.y(k) + 1, w - GUTTER, L.laneH - 1);
        if (on.has(k)) { g.fillStyle = C.held; g.fillRect(0, L.y(k) + 1, GUTTER - 2, L.laneH - 1); }
        if (L.laneH >= 11 || pc === 0 || tonic)
            text(g, noteName(k), GUTTER - 6, L.y(k) + L.laneH / 2, Math.min(12, Math.max(9, L.laneH * 0.8)), tonic ? C.text : C.label, 'right');
    }
}

/** the roll for project p's track on a canvas of w × h */
export function drawRoll(g, w, h, p, track)
{
    const G = geometry(w, h);
    const shown = (w - GUTTER) / G.ppb;
    lanes(g, G.L, p.key, w);
    if (!track) { text(g, 'Select a track to see its notes', w / 2, h / 2, 14, C.label, 'center'); return; }
    g.save();
    g.beginPath(); g.rect(GUTTER, 0, w - GUTTER, h); g.clip();
    const grid = settings.value.grid;
    if (grid * G.ppb >= 8)
        for (let b = Math.ceil(G.from / grid) * grid; b < G.from + shown; b += grid) { g.fillStyle = C.beat; g.fillRect(G.x(b), G.top, 1, G.bottom - G.top); }
    for (const b of barLines(p.meters, Math.max(0, G.from), G.from + shown)) { g.fillStyle = C.bar; g.fillRect(G.x(b), G.top, 1, h - G.top); }
    // outside the clips is shaded; the selected clip's edges are brighter
    let at = Math.max(0, G.from);
    g.fillStyle = 'rgba(0,0,0,.4)';
    for (const c of [...track.clips].sort((a, b)=> a.start - b.start))
    {
        if (c.start > at) g.fillRect(G.x(at), G.top, (c.start - at) * G.ppb, G.bottom - G.top);
        at = Math.max(at, c.start + c.beats);
    }
    g.fillRect(G.x(at), G.top, w, G.bottom - G.top);
    const sel = selectedClip.value;
    for (const c of track.clips)
    {
        const a = G.x(c.start), b = G.x(c.start + c.beats);
        if (b < GUTTER || a > w) continue;
        g.fillStyle = sel?.clip === c.id ? rgba(track.color, 0.9) : rgba(track.color, 0.4);
        g.fillRect(a, G.top, 1, G.bottom - G.top); g.fillRect(b - 1, G.top, 1, G.bottom - G.top);
    }
    // chords
    for (const c of p.chords)
    {
        const a = G.x(c.beat), b = G.x(c.beat + c.beats);
        if (b < GUTTER || a > w) continue;
        g.fillStyle = C.chordEdge; g.fillRect(a + 1, 0, b - a - 2, STRIP);
        g.fillStyle = C.chord; g.fillRect(a + 2, 1, b - a - 4, STRIP - 2);
        if (b - a > 20) text(g, c.name, (a + b) / 2, STRIP / 2, 12, C.text, 'center');
    }
    // the other tracks' notes, faintly, to write against (drum kits' keys are drums, not pitches)
    if (settings.value.ghosts)
        for (const t of p.tracks)
        {
            if (t === track || t.instrument.bank >= 128) continue;
            g.fillStyle = rgba(t.color, 0.16);
            for (const { n, clip, at: b0 } of notesOf(t))
            {
                const a = G.x(b0), b = G.x(b0 + Math.min(n.beats, clip.beats - n.beat)), y = G.L.y(n.key);
                if (b < GUTTER || a > w || y < G.top - 1 || y >= G.bottom) continue;
                g.fillRect(a + 0.5, y + 3, Math.max(2, b - a - 1), LANE_H - 6);
            }
        }
    // notes, and their velocities below
    g.fillStyle = 'rgba(255,255,255,.04)';
    g.fillRect(GUTTER, G.bottom, w, VEL_H);
    const on = picked.value;
    for (const { n, i, clip, at: b0 } of notesOf(track))
    {
        const a = G.x(b0), b = G.x(b0 + Math.min(n.beats, clip.beats - n.beat));
        if (b < GUTTER || a > w) continue;
        const sel = on.has(noteId(clip.id, i)), y = G.L.y(n.key);
        // a note above or below the keys shown has only its velocity drawn
        if (y >= G.top - 1 && y < G.bottom)
        {
            g.fillStyle = rgba(track.color, 0.35 + 0.6 * Math.min(1, (n.vel ?? 90) / 127));
            g.fillRect(a + 0.5, y + 1, Math.max(2, b - a - 1), LANE_H - 2);
            if (sel) { g.strokeStyle = C.selected; g.lineWidth = 1.5; g.strokeRect(a + 0.5, y + 1, Math.max(2, b - a - 1), LANE_H - 2); }
        }
        const vh = (VEL_H - 6) * (n.vel / 127);
        g.fillStyle = sel ? C.selected : rgba(track.color, 0.9);
        g.fillRect(a, h - 2 - vh, 2, vh);
        g.fillRect(a, h - 2 - vh, 6, 2);
    }
    const box = band.value;
    if (box)
    {
        const x0 = G.x(Math.min(box.a.beat, box.b.beat)), x1 = G.x(Math.max(box.a.beat, box.b.beat));
        const y0 = G.L.y(Math.max(box.a.key, box.b.key)), y1 = G.L.y(Math.min(box.a.key, box.b.key)) + LANE_H;
        g.fillStyle = 'rgba(140,190,255,.12)'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
        g.strokeStyle = 'rgba(140,190,255,.8)'; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
    }
    g.restore();
    text(g, 'vel', GUTTER - 6, G.bottom + VEL_H / 2, 10, C.label, 'right');
}
