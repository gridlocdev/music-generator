// What can be done to tracks and clips from the arrangement, the mixer and the menus. Each is one undo step.
import { signal } from '@preact/signals';
import { barAt } from '../daw/meter.js';
import { makeTrack, addTrack, removeTrack, updateTrack, setMixer, moveTrack, duplicateTrack, addClip, updateClip, removeClip,
    findClip, joinClips, splitAt, newId, setLoop, quantizeNotes, humanizeNotes, scaleNotes, reverseNotes } from '../daw/project.js';
import { project, selected, selectedClip, settings, setSettings, picked } from './store.js';
import { edit } from './document.js';
import { askText } from './ask.js';

/** the arrangement's zoom in px per beat, or 0 to fit the project to the window */
export const arrangeZoom = signal(0);
/** the arrangement's px per beat as drawn now, to zoom in and out from */
export const arrangePpb = signal(0);

export const trackOf = (id)=> project.value.tracks.find(t => t.id === id) ?? null;

/** a new track below the others (or below one), selected, with the browser open to pick its instrument */
export function addNewTrack({ instrument = null, after = null } = {})
{
    let id = '';
    edit(p =>
    {
        const t = makeTrack(p, { name: `Track ${p.tracks.length + 1}`, ...(instrument && { instrument }) });
        id = t.id;
        const at = after ? p.tracks.findIndex(x => x.id === after) + 1 : p.tracks.length;
        return addTrack(p, t, at || p.tracks.length);
    });
    selected.value = id;
    if (!instrument) setSettings({ browserTab: 'instruments', browserOpen: true });
    return id;
}

/** puts an instrument on a track */
export const assignPreset = (trackId, { bank, program })=> edit(p => updateTrack(p, trackId, { instrument: { bank, program } }));

/** selects a track and opens the instruments, to pick one for it */
export function chooseInstrument(trackId)
{
    selected.value = trackId;
    setSettings({ browserTab: 'instruments', browserOpen: true });
}

export async function renameTrack(trackId)
{
    const t = trackOf(trackId);
    const name = t && await askText('Track name', t.name, 'Rename');
    if (name) edit(p => updateTrack(p, trackId, { name }));
}

export function deleteTrack(trackId)
{
    const i = project.value.tracks.findIndex(t => t.id === trackId);
    edit(p => removeTrack(p, trackId));
    const tracks = project.value.tracks;
    if (selected.value === trackId) selected.value = tracks[Math.min(i, tracks.length - 1)]?.id ?? null;
    if (selectedClip.value?.track === trackId) selectedClip.value = null;
}

export function duplicateTheTrack(trackId)
{
    edit(p => duplicateTrack(p, trackId));
    const tracks = project.value.tracks;
    selected.value = tracks[tracks.findIndex(t => t.id === trackId) + 1]?.id ?? selected.value;
}

export const moveTrackBy = (trackId, by)=> edit(p => moveTrack(p, trackId, by));
export const setTrackColor = (trackId, color)=> edit(p => updateTrack(p, trackId, { color }));
export const toggleMute = (trackId)=> edit(p => setMixer(p, trackId, { mute: !trackOf(trackId)?.mixer.mute }));
export const toggleSolo = (trackId)=> edit(p => setMixer(p, trackId, { solo: !trackOf(trackId)?.mixer.solo }));
export const setMix = (trackId, patch)=> edit(p => setMixer(p, trackId, patch));

// ── clips ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const NEW_CLIP_BARS = 4;

/** an empty clip of a few bars from the bar a beat is in */
export function newClipAt(trackId, beat)
{
    const meters = project.value.meters, start = barAt(meters, beat).start;
    let id = '';
    edit(p => { id = newId(p, 'c'); return addClip(p, trackId, { id, start, beats: barAt(meters, start).beatsPerBar * NEW_CLIP_BARS, notes: [] }); });
    selected.value = trackId;
    selectedClip.value = { track: trackId, clip: id };
}

export function deleteClip(trackId, clipId)
{
    edit(p => removeClip(p, trackId, clipId));
    if (selectedClip.value?.clip === clipId) selectedClip.value = null;
}

/** splits a track's clips at a beat, or every track's with no track */
export const splitClipsAt = (beat, trackId = null)=> reorder(()=> edit(p => splitAt(p, beat, trackId)));

// an edit that gives notes new clips or indexes: the picks would point at other notes
function reorder(fn) { fn(); picked.value = new Set(); }

/** the clip after this one on its track, which it can join */
export function nextClip(trackId, clipId)
{
    const t = trackOf(trackId), c = t?.clips.find(x => x.id === clipId);
    return c ? t.clips.filter(x => x !== c && x.start >= c.start).sort((a, b)=> a.start - b.start)[0] ?? null : null;
}

export function joinWithNext(trackId, clipId)
{
    const next = nextClip(trackId, clipId);
    if (next) reorder(()=> edit(p => joinClips(p, trackId, [clipId, next.id])));
}

/** a clip's length in bars, from its start */
export function setClipBars(trackId, clipId, bars)
{
    const c = findClip(project.value, trackId, clipId);
    if (c) edit(p => updateClip(p, trackId, clipId, { beats: barAt(p.meters, c.start).beatsPerBar * bars }));
}

export function quantizeClip(trackId, clipId)
{
    reorder(()=> edit(p => updateClip(p, trackId, clipId, c => ({ ...c, notes: quantizeNotes(c.notes, settings.value.grid) }))));
}

export function transposeClip(trackId, clipId, by)
{
    edit(p => updateClip(p, trackId, clipId, c => ({ ...c, notes: c.notes.map(n => ({ ...n, key: Math.max(0, Math.min(127, n.key + by)) })) })));
}

export const toggleClipMute = (trackId, clipId)=> edit(p => updateClip(p, trackId, clipId, c => ({ ...c, mute: !c.mute })));

/** a clip moved later (or earlier) by some beats, not before the start */
export const nudgeClip = (trackId, clipId, by)=> edit(p => updateClip(p, trackId, clipId, c => ({ ...c, start: Math.max(0, c.start + by) })), `nudge ${clipId}`);

export const humanizeClip = (trackId, clipId)=> reorder(()=> edit(p => updateClip(p, trackId, clipId, c => ({ ...c, notes: humanizeNotes(c.notes) }))));

/** a clip played faster (k < 1) or slower (k > 1): its notes and its length scaled */
export const scaleClip = (trackId, clipId, k)=> reorder(()=> edit(p => updateClip(p, trackId, clipId, c => ({ ...c, beats: c.beats * k, notes: scaleNotes(c.notes, k) }))));

export const reverseClip = (trackId, clipId)=> reorder(()=> edit(p => updateClip(p, trackId, clipId, c => ({ ...c, notes: reverseNotes(c.notes, 0, c.beats) }))));

/** loops playback over a stretch, or stops looping with null */
export const loopOver = (range)=> edit(p => setLoop(p, range));

export const clipRange = (trackId, clipId)=>
{
    const c = findClip(project.value, trackId, clipId);
    return c ? { from: c.start, to: c.start + c.beats } : null;
};
