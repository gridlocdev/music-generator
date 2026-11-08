// What a pointer does on the piano roll: draw, move and resize notes, pick them, set velocities, scroll and zoom, and
// the right-click menus.
import { barAt } from '../../daw/meter.js';
import { addClip, newId } from '../../daw/project.js';
import { selectedClip, selectedTrack, settings, picked } from '../store.js';
import { edit } from '../document.js';
import { seek } from '../player.js';
import { press, release } from '../live.js';
import { focus } from '../focus.js';
import { noteId, notesOf, changeNotes } from '../notes.js';
import { noteMenu, rollMenu } from '../context-menus.js';
import { GUTTER, STRIP, PPB, VEL_H, EDGE, band, view, geometry, snap } from './roll-view.js';

const NEW_VEL = 90;

/** the wheel scrolls (Shift: across); Cmd/Ctrl + wheel zooms around the pointer */
export function wheel(e)
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
}

/** a press on the roll of project p's track: seek, set velocities, pick, move or resize notes, or draw one */
export function down(e, p, track)
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
        const up = ()=> { el.removeEventListener('pointermove', setVel); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
        el.addEventListener('pointermove', setVel);
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
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
    else if (e.shiftKey)
    {
        // Shift-drag on empty space picks every note the rectangle touches, added to what was picked
        const was = picked.value, a = { beat: b, key };
        const drag = (m)=>
        {
            const c = { beat: G.beatAt(m.clientX - r.left), key: G.keyAt(m.clientY - r.top) };
            band.value = { a, b: c };
            const [b0, b1] = [Math.min(a.beat, c.beat), Math.max(a.beat, c.beat)], [k0, k1] = [Math.min(a.key, c.key), Math.max(a.key, c.key)];
            picked.value = new Set([...was, ...all.filter(o => o.n.key >= k0 && o.n.key <= k1 && o.at < b1 && o.at + o.n.beats > b0).map(o => noteId(o.clip.id, o.i))]);
        };
        const done = ()=> { band.value = null; el.removeEventListener('pointermove', drag); el.removeEventListener('pointerup', done); el.removeEventListener('pointercancel', done); };
        el.addEventListener('pointermove', drag);
        el.addEventListener('pointerup', done); el.addEventListener('pointercancel', done);
        return;
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
    const up = ()=> { release(sounding); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}

/** the cursor for what a press would do here */
export function hover(e, track)
{
    if (!track || e.buttons) return;
    const r = e.currentTarget.getBoundingClientRect(), G = geometry(r.width, r.height);
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const b = G.beatAt(px), key = G.keyAt(py);
    const hit = py > STRIP + 4 && py < G.bottom && notesOf(track).findLast(o => o.n.key === key && b >= o.at && b < o.at + o.n.beats);
    e.currentTarget.style.cursor = py >= G.bottom ? 'ns-resize' : hit ? (G.x(hit.at + hit.n.beats) - px <= EDGE ? 'ew-resize' : 'grab') : px > GUTTER && py > STRIP + 4 ? 'crosshair' : '';
}

// right-click a note for what can be done to the picked notes (it's picked, if it wasn't), or the background
export function menu(e, track)
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
}
