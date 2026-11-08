// The piano roll for the selected track: every clip's notes, the chords above, velocity below and the playhead.
//
// Click empty space in a clip to draw a note (outside a clip, a bar's clip is made for it) and drag to set its
// length; drag a note to move it, its right edge to resize it; Shift-click adds to the selection; Delete removes,
// ↑ ↓ transpose (Shift: an octave), Cmd+A selects the clip's notes. Drag in the velocity strip to set velocity.
// Right-click a note or the background for more. Everything snaps to the grid picked in the toolbar; hold Alt to place freely. The wheel scrolls (Shift: across),
// Cmd/Ctrl + wheel zooms.
import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { barLines, barAt, meterAt } from '../../daw/meter.js';
import { findClip, addClip, newId } from '../../daw/project.js';
import { project, selected, selectedClip, selectedTrack, beat, playing, settings, setSettings } from '../store.js';
import { edit } from '../document.js';
import { seek } from '../player.js';
import { press, release } from '../live.js';
import { focus } from '../focus.js';
import { picked, noteId, notesOf, changeNotes, GRIDS } from '../notes.js';
import { newFromMelody } from '../recording.js';
import { noteMenu, rollMenu } from '../context-menus.js';
import { useCanvas, rgba } from './canvas.js';
import { GUTTER, STRIP, C, text, lanes } from './roll-draw.js';

const PPB = [4, 400];
const LANE_H = 12;
const VEL_H = 44;
const EDGE = 5;                 // px at a note's right edge that resize it
const NEW_VEL = 90;

/** what's shown: from beat, px per beat, and the key at the bottom */
const view = signal({ from: 0, ppb: 40, low: 48 });
/** the view's geometry for a canvas of w × h */
function geometry(w, h)
{
    const { from, ppb, low } = view.value;
    const top = STRIP + 4, bottom = h - VEL_H;
    const rows = Math.ceil((bottom - top) / LANE_H);
    const L = { lo: low, hi: low + rows - 1, laneH: LANE_H, y: (k)=> bottom - (k - low + 1) * LANE_H };
    return {
        L, top, bottom, w, h, from, ppb,
        x: (b)=> GUTTER + (b - from) * ppb,
        beatAt: (x)=> from + (x - GUTTER) / ppb,
        keyAt: (y)=> low + Math.floor((bottom - y) / LANE_H),
    };
}

/** the beat snapped to the grid, unless Alt */
const snap = (b, e)=> e.altKey ? b : Math.round(b / settings.value.grid) * settings.value.grid;

function Toolbar()
{
    const t = selectedTrack.value, sel = selectedClip.value;
    const clip = sel && findClip(project.value, sel.track, sel.clip);
    return (
        <div class="toolbar">
            <label>Snap
                <select value={String(settings.value.grid)} onChange={(e)=> setSettings({ grid: Number(e.currentTarget.value) })}>
                    {GRIDS.map(([g, name])=> <option value={String(g)}>{name}</option>)}
                </select>
            </label>
            <span class="sep" />
            <span>{t ? `${t.name}${clip ? ` · clip at bar ${barAt(project.value.meters, clip.start).bar + 1}` : ''}` : 'Select a track'}</span>
            <span class="sep" />
            <label title="A click while recording, after the count-in"><input type="checkbox" checked={settings.value.click}
                onChange={(e)=> setSettings({ click: e.currentTarget.checked })} /> Click</label>
            <button disabled={!clip?.notes.length} onClick={newFromMelody} title="A new project composed round the selected clip's melody and the chords over it">New from melody</button>
        </div>
    );
}

function Roll()
{
    const p = project.value;
    const track = selectedTrack.value;
    // a new track: the view moves to its notes
    useEffect(()=>
    {
        const keys = track ? track.clips.flatMap(c => c.notes.map(n => n.key)) : [];
        const mid = keys.length ? Math.round((Math.min(...keys) + Math.max(...keys)) / 2) : 66;
        view.value = { ...view.value, low: mid - 12 };
        picked.value = new Set();
    }, [track?.id]);

    const ref = useCanvas((g, w, h)=>
    {
        const G = geometry(w, h);
        const now = beat.value, shown = (w - GUTTER) / G.ppb;
        // while playing, the view turns the page when the playhead reaches its edge
        if (playing.value && (now < G.from || now > G.from + shown)) queueMicrotask(()=> { view.value = { ...view.value, from: now }; });
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
        g.fillStyle = C.playhead;
        g.fillRect(G.x(now), 0, 1, h);
        g.restore();
        text(g, 'vel', GUTTER - 6, G.bottom + VEL_H / 2, 10, C.label, 'right');
    });

    const wheel = (e)=>
    {
        e.preventDefault();
        const v = view.value;
        if (e.metaKey || e.ctrlKey)
        {
            const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left - GUTTER, at = v.from + x / v.ppb;
            const ppb = Math.max(PPB[0], Math.min(PPB[1], v.ppb * Math.exp(-e.deltaY * 0.004)));
            view.value = { ...v, ppb, from: Math.max(0, at - x / ppb) };
        }
        else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))
            view.value = { ...v, from: Math.max(0, v.from + (e.deltaX || e.deltaY) / v.ppb) };
        else view.value = { ...v, low: Math.max(0, Math.min(115, v.low - Math.round(e.deltaY / 12))) };
    };

    const down = (e)=>
    {
        if (e.button !== 0 || !track) return;
        focus.value = 'roll';
        const el = e.currentTarget, r = el.getBoundingClientRect();
        const G = geometry(r.width, r.height);
        const px = e.clientX - r.left, py = e.clientY - r.top;
        if (px < GUTTER) return;
        if (py < STRIP + 4) { seek(G.beatAt(px)); return; }
        el.setPointerCapture(e.pointerId);
        const all = notesOf(track);

        // the velocity strip: drag across notes to set how hard each is played
        if (py >= G.bottom)
        {
            const setVel = (m)=>
            {
                const x = m.clientX - r.left, vel = Math.round(Math.max(1, Math.min(127, (r.bottom - 2 - m.clientY) / (VEL_H - 6) * 127)));
                const near = all.filter(o => Math.abs(G.x(o.at) - x) <= 4 && (!picked.value.size || picked.value.has(noteId(o.clip.id, o.i))));
                if (!near.length) return;
                const ids = new Set(near.map(o => noteId(o.clip.id, o.i)));
                changeNotes(track.id, new Map([...new Set(near.map(o => o.clip.id))].map(c => [c, (notes)=> notes.map((n, i)=> ids.has(noteId(c, i)) ? { ...n, vel } : n)])), 'velocity');
            };
            setVel(e);
            const up = ()=> { el.removeEventListener('pointermove', setVel); el.removeEventListener('pointerup', up); };
            el.addEventListener('pointermove', setVel);
            el.addEventListener('pointerup', up);
            return;
        }

        const b = G.beatAt(px), key = G.keyAt(py);
        const hit = all.findLast(o => o.n.key === key && b >= o.at && b < o.at + o.n.beats);
        let mode, grabbed;
        if (hit)
        {
            const id = noteId(hit.clip.id, hit.i);
            if (e.shiftKey) { const s = new Set(picked.value); s.has(id) ? s.delete(id) : s.add(id); picked.value = s; return; }
            if (!picked.value.has(id)) picked.value = new Set([id]);
            selectedClip.value = { track: track.id, clip: hit.clip.id };
            mode = G.x(hit.at + hit.n.beats) - px <= EDGE ? 'resize' : 'move';
            grabbed = hit;
            press(hit.n.key);
        }
        else
        {
            // a new note, in the clip under it or a new bar's clip
            let clip = track.clips.findLast(c => b >= c.start && b < c.start + c.beats);
            const start = Math.max(0, snap(b - (e.altKey ? 0 : settings.value.grid / 2), e));
            if (!clip)
            {
                const bar = barAt(p.meters, b);
                clip = { id: newId(p, 'c'), start: bar.start, beats: bar.beatsPerBar, notes: [] };
                const made = clip;
                edit(q => addClip(q, track.id, made));
            }
            const note = { beat: Math.max(0, start - clip.start), beats: settings.value.grid, key, vel: NEW_VEL };
            const index = clip.notes.length;
            changeNotes(track.id, new Map([[clip.id, (notes)=> [...notes, note]]]));
            selectedClip.value = { track: track.id, clip: clip.id };
            picked.value = new Set([noteId(clip.id, index)]);
            grabbed = { n: note, i: index, clip, at: clip.start + note.beat };
            mode = 'resize';
            press(key);
        }
        // what the picked notes were at the start of the drag, to move or resize from
        const startTrack = selectedTrack.value;
        const before = new Map(notesOf(startTrack).filter(o => picked.value.has(noteId(o.clip.id, o.i))).map(o => [noteId(o.clip.id, o.i), o]));
        let sounding = grabbed.n.key;
        const move = (m)=>
        {
            const db = G.beatAt(m.clientX - r.left) - b, dk = G.keyAt(m.clientY - r.top) - key;
            const changes = new Map();
            for (const [id, o] of before)
            {
                const [c, i] = [o.clip.id, o.i];
                const fn = changes.get(c) ?? ((notes)=> notes);
                changes.set(c, (notes)=> fn(notes).map((n, k)=>
                {
                    if (k !== i) return n;
                    if (mode === 'resize')
                    {
                        const end = m.altKey ? o.at + o.n.beats + db : Math.round((o.at + o.n.beats + db) / settings.value.grid) * settings.value.grid;
                        return { ...n, beats: Math.max(m.altKey ? 0.02 : settings.value.grid, end - o.at) };
                    }
                    const shift = m.altKey ? db : Math.round(db / settings.value.grid) * settings.value.grid;
                    return { ...n, beat: Math.max(0, Math.min(o.clip.beats - 0.01, o.n.beat + shift)), key: Math.max(0, Math.min(127, o.n.key + dk)) };
                }));
            }
            changeNotes(track.id, changes, `drag-${e.timeStamp}`);
            const now = grabbed.n.key + (mode === 'move' ? dk : 0);
            if (now !== sounding) { release(sounding); press(now); sounding = now; }
        };
        const up = ()=> { release(sounding); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
    };

    const hover = (e)=>
    {
        if (!track || e.buttons) return;
        const r = e.currentTarget.getBoundingClientRect(), G = geometry(r.width, r.height);
        const px = e.clientX - r.left, py = e.clientY - r.top;
        const b = G.beatAt(px), key = G.keyAt(py);
        const hit = py > STRIP + 4 && py < G.bottom && notesOf(track).findLast(o => o.n.key === key && b >= o.at && b < o.at + o.n.beats);
        e.currentTarget.style.cursor = py >= G.bottom ? 'ns-resize' : hit ? (G.x(hit.at + hit.n.beats) - px <= EDGE ? 'ew-resize' : 'grab') : px > GUTTER && py > STRIP + 4 ? 'crosshair' : '';
    };

    // right-click a note for what can be done to the picked notes (it's picked, if it wasn't), or the background
    const menu = (e)=>
    {
        e.preventDefault();
        if (!track) return;
        const r = e.currentTarget.getBoundingClientRect(), G = geometry(r.width, r.height);
        const px = e.clientX - r.left, py = e.clientY - r.top, b = G.beatAt(px), key = G.keyAt(py);
        const hit = py > STRIP + 4 && py < G.bottom && notesOf(track).findLast(o => o.n.key === key && b >= o.at && b < o.at + o.n.beats);
        if (!hit) { rollMenu(track.id, Math.max(0, b)); return; }
        const id = noteId(hit.clip.id, hit.i);
        if (!picked.value.has(id)) picked.value = new Set([id]);
        selectedClip.value = { track: track.id, clip: hit.clip.id };
        noteMenu();
    };

    return <div class="roll" onWheel={wheel} onPointerDown={down} onPointerMove={hover} onContextMenu={menu}><canvas ref={ref} /></div>;
}

export function PianoRoll()
{
    selected.value;
    return (
        <>
            <Toolbar />
            <Roll />
        </>
    );
}
