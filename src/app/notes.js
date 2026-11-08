// The notes picked in the piano roll, on the selected track, and what can be done to them: delete, transpose, quantize,
// set velocity, make legato, nudge, humanize, change speed, reverse. Each is one undo step.
import { signal } from '@preact/signals';
import { updateClip, quantizeNotes, humanizeNotes, scaleNotes, reverseNotes } from '../daw/project.js';
import { selectedTrack, selectedClip, settings } from './store.js';
import { edit } from './document.js';

/** the piano roll's snap choices: beats, name */
export const GRIDS = [[1, '1/4'], [0.5, '1/8'], [0.25, '1/16'], [1 / 3, '1/8T'], [1 / 6, '1/16T']];

/** selected notes, as 'clipId:index' */
export const picked = signal(/** @type {Set<string>} */ (new Set()));

export const noteId = (clip, i)=> `${clip}:${i}`;

/** a track's notes with where they are: clip, index, and the beat in the project */
export const notesOf = (track)=> track ? track.clips.flatMap(c => c.notes.map((n, i)=> ({ n, i, clip: c, at: c.start + n.beat })).filter(x => x.n.beat < x.clip.beats)) : [];

/** the picked notes on the selected track, where they are */
export const pickedNotes = ()=> notesOf(selectedTrack.value).filter(o => picked.value.has(noteId(o.clip.id, o.i)));

/**
 * Changes notes clip by clip: a map of clip id → (notes)=> notes.
 * @param {string} trackId
 * @param {Map<string, (notes: any[])=> any[]>} changes
 * @param {string|null} [merge]
 */
export function changeNotes(trackId, changes, merge = null)
{
    edit(p =>
    {
        let out = p;
        for (const [clip, fn] of changes) out = updateClip(out, trackId, clip, c => ({ ...c, notes: fn(c.notes) }));
        return out;
    }, merge);
}

/** changes each picked note with fn(note) */
function mapPicked(fn, merge = null)
{
    const t = selectedTrack.value, ids = picked.value;
    if (!t || !ids.size) return false;
    const clips = new Set([...ids].map(id => id.split(':')[0]));
    changeNotes(t.id, new Map([...clips].map(c => [c, (notes)=> notes.map((n, i)=> ids.has(noteId(c, i)) ? fn(n) : n)])), merge);
    return true;
}

export function deletePicked()
{
    const t = selectedTrack.value;
    if (!t || !picked.value.size) return false;
    const byClip = new Map();
    for (const id of picked.value) { const [c, i] = id.split(':'); byClip.set(c, [...(byClip.get(c) ?? []), Number(i)]); }
    changeNotes(t.id, new Map([...byClip].map(([c, list])=> [c, (notes)=> notes.filter((_, i)=> !list.includes(i))])));
    picked.value = new Set();
    return true;
}

export const transposePicked = (by)=> mapPicked(n => ({ ...n, key: Math.max(0, Math.min(127, n.key + by)) }), 'transpose');

export const setVelocity = (vel)=> mapPicked(n => ({ ...n, vel }));

export const quantizePicked = ()=> mapPicked(n => quantizeNotes([n], settings.value.grid)[0]);

/** each picked note held until the next note starts, in its clip */
export function legatoPicked()
{
    const t = selectedTrack.value, ids = picked.value;
    if (!t || !ids.size) return false;
    const clips = new Set([...ids].map(id => id.split(':')[0]));
    changeNotes(t.id, new Map([...clips].map(c => [c, (notes)=> notes.map((n, i)=>
    {
        if (!ids.has(noteId(c, i))) return n;
        const next = Math.min(...notes.filter(m => m.beat > n.beat + 1e-6).map(m => m.beat));
        return Number.isFinite(next) ? { ...n, beats: next - n.beat } : n;
    })])));
    return true;
}

export const clearPicked = ()=> { picked.value = new Set(); };

/** every note of the selected clip, or of the track when no clip of it is selected */
export function pickAll()
{
    const t = selectedTrack.value, sel = selectedClip.value;
    if (!t) return;
    const clips = t.clips.filter(c => sel?.track !== t.id || c.id === sel.clip);
    picked.value = new Set(clips.flatMap(c => c.notes.map((_, i)=> noteId(c.id, i))));
}

/** every note of the track at a key */
export const pickKey = (key)=> { picked.value = new Set(notesOf(selectedTrack.value).filter(o => o.n.key === key).map(o => noteId(o.clip.id, o.i))); };

/** the picked notes moved later (or earlier) by some beats, none before its clip's start */
export const nudgePicked = (by)=> mapPicked(n => ({ ...n, beat: Math.max(0, n.beat + by) }), 'nudge');

/** fn(notes, from, to) on the picked notes of each clip, given the stretch they span in it */
function mapPickedTogether(fn)
{
    const t = selectedTrack.value, ids = picked.value;
    if (!t || !ids.size) return false;
    const clips = new Set([...ids].map(id => id.split(':')[0]));
    changeNotes(t.id, new Map([...clips].map(c => [c, (notes)=>
    {
        const mine = notes.filter((_, i)=> ids.has(noteId(c, i)));
        const from = Math.min(...mine.map(n => n.beat)), to = Math.max(...mine.map(n => n.beat + n.beats));
        const changed = fn(mine, from, to);
        let k = 0;
        // keeps each note at its index, so the picks still point at them
        return notes.map((n, i)=> ids.has(noteId(c, i)) ? changed[k++] : n);
    }])));
    return true;
}

export const humanizePicked = ()=> mapPickedTogether(notes => humanizeNotes(notes));

/** the picked notes faster (k < 1) or slower (k > 1), from the first of them */
export const scalePicked = (k)=> mapPickedTogether((notes, from)=> scaleNotes(notes, k, from));

/** the picked notes backwards, over the stretch they span */
export const reversePicked = ()=> mapPickedTogether((notes, from, to)=> notes.map(n => ({ ...n, beat: from + to - n.beat - n.beats })));
