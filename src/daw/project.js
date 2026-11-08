// A project: tracks of clips of notes, each track with an instrument, a channel strip, MIDI FX and automation, over a
// tempo map, meter changes, markers and a chord track. Every edit is a pure function returning a new project (the old
// one is untouched), so undo is a list of earlier projects. Knows nothing of how a project was made.

/**
 * @typedef {{ beat: number, beats: number, key: number, vel: number, [mark: string]: any }} Note
 *   beat is from the clip's start; extra fields are marks a MIDI FX may read (vibrato, ornament …)
 * @typedef {{ id: string, start: number, beats: number, notes: Note[] }} Clip
 * @typedef {{ beat: number, value: number, curve: 'set' | 'linear' | 'exp' }} Keyframe
 * @typedef {{ volumeDb: number, pan: number, mute: boolean, solo: boolean, lowCut: number,
 *   sends: { reverb: number, delay: number }, autoPan: { rate: number, depth: number } | null,
 *   duck: { from: string, keys: number[], db: number } | null }} Mixer
 *   duck: dip by db on every note of those keys on another track (a kick), like a sidechain
 * @typedef {{ id: string, name: string, color: number[], instrument: { bank: number, program: number }, mixer: Mixer,
 *   fx: { type: string, [param: string]: any }[], automation: { tone?: Keyframe[], reverb?: Keyframe[], delay?: Keyframe[] },
 *   clips: Clip[] }} Track
 * @typedef {{ title: string, length: number, tempoMap: import('../lib/tempo-map.js').TempoSegment[],
 *   meters: import('./meter.js').MeterChange[], key: { tonic: number, mode: string } | null,
 *   markers: { beat: number, name: string, meta?: object }[], loop: { from: number, to: number } | null,
 *   groove: object, chords: { beat: number, beats: number, name: string, tones: number[] }[], tracks: Track[] }} Project
 *   groove: settings a MIDI FX shares across tracks (swing, style); markers' meta is for MIDI FX too
 */

export const TRACK_COLORS = [[1, 0.78, 0.4], [0.45, 0.8, 1], [0.6, 0.85, 0.5], [0.98, 0.55, 0.62], [0.7, 0.62, 1], [1, 0.6, 0.35], [0.85, 0.85, 0.9]];

/** @returns {Mixer} */
const defaultMixer = ()=> ({ volumeDb: -6, pan: 0, mute: false, solo: false, lowCut: 20, sends: { reverb: 0.15, delay: 0 }, autoPan: null, duck: null });

/** @returns {Project} */
export function emptyProject({ title = 'Untitled', bpm = 120, sig = '4/4', bars = 16 } = {})
{
    const bpb = Number(sig.split('/')[0]) * 4 / Number(sig.split('/')[1]);
    return { title, length: bars * bpb, tempoMap: [{ beat: 0, bpm }], meters: [{ beat: 0, sig }], key: null,
        markers: [], loop: null, groove: {}, chords: [], tracks: [] };
}

/** an id not yet used in the project, like 't3' or 'c12' */
export function newId(project, prefix)
{
    const used = new Set(project.tracks.flatMap(t => [t.id, ...t.clips.map(c => c.id)]));
    let n = 1;
    while (used.has(`${prefix}${n}`)) n++;
    return `${prefix}${n}`;
}

/** @returns {Track} */
export function makeTrack(project, { name = 'Instrument', instrument = { bank: 0, program: 0 }, color = null, mixer = {} } = {})
{
    return { id: newId(project, 't'), name, color: color ?? TRACK_COLORS[project.tracks.length % TRACK_COLORS.length],
        instrument, mixer: { ...defaultMixer(), ...mixer }, fx: [], automation: {}, clips: [] };
}

/** a drum kit's bank, by General MIDI convention */
export const isDrums = (track)=> track.instrument.bank >= 128;

/** the track's notes at their place in the project (clip start + beat), sorted; a note starting in a clip plays out its
 * full length, so a chord can ring into the next section */
export function trackNotes(track)
{
    const out = [];
    for (const c of track.clips)
        for (const n of c.notes)
            if (n.beat < c.beats - 1e-9 && n.beat >= -1e-9) out.push({ ...n, beat: c.start + n.beat });
    return out.sort((a, b)=> a.beat - b.beat || a.key - b.key);
}

/** where the project ends: its length, or past it when a clip runs on */
export const projectEnd = (p)=> Math.max(p.length, ...p.tracks.flatMap(t => t.clips.map(c => c.start + c.beats)));

// ── edits ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const patchOf = (x, patch)=> typeof patch === 'function' ? patch(x) : { ...x, ...patch };

/** changes a track: a patch object, or a function from the old track to the new */
export const updateTrack = (p, id, patch)=> ({ ...p, tracks: p.tracks.map(t => t.id === id ? patchOf(t, patch) : t) });

export const setMixer = (p, id, patch)=> updateTrack(p, id, t => ({ ...t, mixer: { ...t.mixer, ...patch } }));

export function addTrack(p, track, index = p.tracks.length)
{
    const tracks = [...p.tracks];
    tracks.splice(index, 0, track);
    return { ...p, tracks };
}

/** removes a track, and any ducking that listened to it */
export const removeTrack = (p, id)=> ({ ...p, tracks: p.tracks.filter(t => t.id !== id)
    .map(t => t.mixer.duck?.from === id ? { ...t, mixer: { ...t.mixer, duck: null } } : t) });

export const addClip = (p, trackId, clip)=> updateTrack(p, trackId, t => ({ ...t, clips: [...t.clips, clip].sort((a, b)=> a.start - b.start) }));

export const updateClip = (p, trackId, clipId, patch)=> updateTrack(p, trackId, t =>
    ({ ...t, clips: t.clips.map(c => c.id === clipId ? patchOf(c, patch) : c).sort((a, b)=> a.start - b.start) }));

export const removeClip = (p, trackId, clipId)=> updateTrack(p, trackId, t => ({ ...t, clips: t.clips.filter(c => c.id !== clipId) }));

export const findClip = (p, trackId, clipId)=> p.tracks.find(t => t.id === trackId)?.clips.find(c => c.id === clipId) ?? null;

/** moves a clip to another start and maybe another track; with copy, leaves the original where it was */
export function moveClip(p, fromTrack, clipId, toTrack, start, copy = false)
{
    const clip = findClip(p, fromTrack, clipId);
    if (!clip) return p;
    const out = copy ? p : removeClip(p, fromTrack, clipId);
    return addClip(out, toTrack, { ...clip, id: copy ? newId(p, 'c') : clip.id, start: Math.max(0, start) });
}

/** cuts the clips under a beat in two there: every track's, or one track's */
export function splitAt(p, beat, trackId = null)
{
    let out = p;
    for (const t of p.tracks)
    {
        if (trackId && t.id !== trackId) continue;
        for (const c of t.clips)
        {
            if (beat <= c.start + 1e-9 || beat >= c.start + c.beats - 1e-9) continue;
            const cut = beat - c.start;
            const left = { ...c, beats: cut, notes: c.notes.filter(n => n.beat < cut - 1e-9).map(n => ({ ...n, beats: Math.min(n.beats, cut - n.beat) })) };
            const right = { id: newId(out, 'c'), start: beat, beats: c.beats - cut,
                notes: c.notes.filter(n => n.beat >= cut - 1e-9).map(n => ({ ...n, beat: n.beat - cut })) };
            out = addClip(updateClip(out, t.id, c.id, left), t.id, right);
        }
    }
    return out;
}

/** a new base tempo: the whole tempo map is scaled, so ramps and changes keep their shape */
export function setTempo(p, bpm)
{
    const k = bpm / p.tempoMap[0].bpm;
    const round = (x)=> Math.round(x * k * 100) / 100;
    return { ...p, tempoMap: p.tempoMap.map(s => ({ ...s, bpm: round(s.bpm), ...(s.to !== undefined ? { to: round(s.to) } : {}) })) };
}

/** the meter from the start, until the first change after it */
export const setMeter = (p, sig)=> ({ ...p, meters: p.meters.map((m, i)=> i === 0 ? { ...m, sig } : m) });

/** loops the playback between two beats, or stops looping with null */
export const setLoop = (p, loop)=> ({ ...p, loop: loop && loop.to > loop.from ? { from: Math.max(0, loop.from), to: loop.to } : null });

/** a marker at a beat; one splitting a section takes that section's meta, so a MIDI FX reads both halves alike */
export function addMarker(p, beat, name)
{
    const before = p.markers.findLast(m => m.beat <= beat);
    if (before?.beat === beat) return p;
    const marker = { beat, name, ...(before?.meta && { meta: before.meta }) };
    return { ...p, markers: [...p.markers, marker].sort((a, b)=> a.beat - b.beat) };
}

export const renameMarker = (p, index, name)=> ({ ...p, markers: p.markers.map((m, i)=> i === index ? { ...m, name } : m) });

export const removeMarker = (p, index)=> ({ ...p, markers: p.markers.filter((_, i)=> i !== index) });

/** the stretch a marker heads: to the next marker, or the project's end */
export function markerRange(p, index)
{
    const m = p.markers[index];
    return m ? { from: m.beat, to: p.markers[index + 1]?.beat ?? projectEnd(p) } : null;
}

/** moves a track up (by < 0) or down the list */
export function moveTrack(p, id, by)
{
    const i = p.tracks.findIndex(t => t.id === id), j = i + by;
    if (i < 0 || j < 0 || j >= p.tracks.length) return p;
    const tracks = [...p.tracks];
    tracks.splice(j, 0, ...tracks.splice(i, 1));
    return { ...p, tracks };
}

/** a copy of a track below it, with new ids for it and its clips */
export function duplicateTrack(p, id)
{
    const i = p.tracks.findIndex(t => t.id === id);
    if (i < 0) return p;
    const t = p.tracks[i];
    let out = addTrack(p, { ...t, id: newId(p, 't'), name: `${t.name} copy`, clips: [], mixer: { ...t.mixer, solo: false } }, i + 1);
    const copyId = out.tracks[i + 1].id;
    for (const c of t.clips) out = addClip(out, copyId, { ...c, id: newId(out, 'c') });
    return out;
}

/** joins clips of a track into one spanning them all, at the first's id */
export function joinClips(p, trackId, clipIds)
{
    const t = p.tracks.find(x => x.id === trackId);
    const clips = t ? t.clips.filter(c => clipIds.includes(c.id)) : [];
    if (clips.length < 2) return p;
    const start = Math.min(...clips.map(c => c.start)), end = Math.max(...clips.map(c => c.start + c.beats));
    const notes = clips.flatMap(c => c.notes.filter(n => n.beat < c.beats).map(n => ({ ...n, beat: n.beat + c.start - start })))
        .sort((a, b)=> a.beat - b.beat || a.key - b.key);
    const first = clips.reduce((a, b)=> b.start < a.start ? b : a);
    return updateTrack(p, trackId, x => ({ ...x, clips: x.clips.filter(c => c === first || !clipIds.includes(c.id))
        .map(c => c === first ? { ...c, start, beats: end - start, notes } : c) }));
}

/** notes moved onto a grid (in beats), all the way or by a strength from 0 to 1, their ends too; none gets shorter than
 * a grid step, or than it was */
export function quantizeNotes(notes, grid, strength = 1)
{
    const on = (b)=> Math.round(b / grid) * grid;
    return notes.map(n =>
    {
        const beat = Math.max(0, n.beat + (on(n.beat) - n.beat) * strength);
        const end = n.beat + n.beats, to = end + (on(end) - end) * strength;
        return { ...n, beat, beats: Math.max(Math.min(n.beats, grid), to - beat) };
    });
}

// ── history ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const DEPTH = 200;

/** @typedef {{ past: Project[], present: Project, future: Project[] }} History */

/** @returns {History} */
export const history = (project)=> ({ past: [], present: project, future: [] });

/** the project after an edit; an edit that changed nothing isn't a step */
export const commit = (h, next)=> next === h.present ? h : { past: [...h.past, h.present].slice(-DEPTH), present: next, future: [] };

export const undo = (h)=> h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1), future: [h.present, ...h.future] } : h;

export const redo = (h)=> h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h;
