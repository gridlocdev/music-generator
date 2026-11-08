// Cut, copy, paste and duplicate, for the selection in the part last clicked: the picked notes in the piano roll, or
// the selected clip in the arrangement. The clipboard is the app's own; it holds a clip, or notes timed from the first.
import { signal } from '@preact/signals';
import { barAt } from '../daw/meter.js';
import { addClip, updateClip, findClip, newId } from '../daw/project.js';
import { project, selected, selectedClip, selectedTrack, beat, settings, picked } from './store.js';
import { edit } from './document.js';
import { focus } from './focus.js';
import { pickedNotes, deletePicked, noteId } from './notes.js';
import { deleteClip } from './tracks.js';

/** { kind: 'clip', clip } or { kind: 'notes', notes, beats } */
export const clipboard = signal(/** @type {any} */ (null));

const noteMode = ()=> focus.value === 'roll' && picked.value.size > 0;

export const canCopy = ()=> noteMode() || (focus.value !== 'roll' && !!selectedClip.value);

function copied()
{
    if (noteMode())
    {
        const list = pickedNotes();
        const first = Math.min(...list.map(o => o.at)), end = Math.max(...list.map(o => o.at + o.n.beats));
        return { kind: 'notes', notes: list.map(o => ({ ...o.n, beat: o.at - first })), beats: end - first };
    }
    const sel = selectedClip.value, clip = sel && findClip(project.value, sel.track, sel.clip);
    return clip ? { kind: 'clip', clip } : null;
}

export function copy()
{
    const c = copied();
    if (c) clipboard.value = c;
    return !!c;
}

export function cut()
{
    if (!copy()) return false;
    if (clipboard.value.kind === 'notes') return deletePicked();
    const sel = selectedClip.value;
    deleteClip(sel.track, sel.clip);
    return true;
}

/** the clipboard at a beat (the playhead's, by default) on a track (the selected one) */
export function paste(at = beat.value, trackId = selected.value)
{
    const c = clipboard.value;
    if (!c || !trackId) return false;
    if (c.kind === 'clip') { placeClip(c.clip, trackId, at); return true; }
    placeNotes(c.notes, c.beats, trackId, at);
    return true;
}

export function duplicate()
{
    const c = copied();
    if (!c) return false;
    if (c.kind === 'clip') { placeClip(c.clip, selectedClip.value.track, c.clip.start + c.clip.beats); return true; }
    // the notes again right after themselves, a whole number of grid steps on
    const grid = settings.value.grid, first = Math.min(...pickedNotes().map(o => o.at));
    placeNotes(c.notes, c.beats, selectedTrack.value.id, first + Math.ceil(c.beats / grid - 1e-6) * grid);
    return true;
}

function placeClip(clip, trackId, start)
{
    let id = '';
    edit(p => { id = newId(p, 'c'); return addClip(p, trackId, { ...clip, id, start: Math.max(0, start) }); });
    selected.value = trackId;
    selectedClip.value = { track: trackId, clip: id };
}

/** notes into the clip under their start (grown to hold them), or a new clip of whole bars round them */
function placeNotes(notes, beats, trackId, at)
{
    const p = project.value, t = p.tracks.find(x => x.id === trackId);
    if (!t) return;
    const end = at + beats;
    const clip = t.clips.findLast(c => at >= c.start && at < c.start + c.beats);
    let id = clip?.id ?? '', from = 0;
    edit(q =>
    {
        if (clip)
        {
            from = clip.notes.length;
            return updateClip(q, trackId, clip.id, c => ({ ...c, beats: Math.max(c.beats, end - c.start), notes: [...c.notes, ...notes.map(n => ({ ...n, beat: n.beat + at - c.start }))] }));
        }
        const start = barAt(q.meters, at).start, last = barAt(q.meters, Math.max(at, end - 1e-6));
        id = newId(q, 'c');
        return addClip(q, trackId, { id, start, beats: last.start + last.beatsPerBar - start, notes: notes.map(n => ({ ...n, beat: n.beat + at - start })) });
    });
    selected.value = trackId;
    selectedClip.value = { track: trackId, clip: id };
    focus.value = 'roll';
    picked.value = new Set(notes.map((_, i)=> noteId(id, from + i)));
}
