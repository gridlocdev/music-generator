// A project: tracks of clips of notes, each track with an instrument, a channel strip, MIDI FX and automation, over a
// tempo map, meter changes, markers and a chord track. Every edit is a pure function returning a new project (the old
// one is untouched), so undo is a list of earlier projects. Knows nothing of how a project was made.

/**
 * @typedef {{ beat: number, beats: number, key: number, vel: number, [mark: string]: any }} Note
 *   beat is from the clip's start; extra fields are marks a MIDI FX may read (vibrato, ornament …)
 * @typedef {{ id: string, start: number, beats: number, notes: Note[], mute?: boolean }} Clip
 *   a muted clip is kept but not played
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
        if (!c.mute) for (const n of c.notes)
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
            const right = { ...c, id: newId(out, 'c'), start: beat, beats: c.beats - cut,
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

const sameBeat = (a, b)=> Math.abs(a - b) < 1e-6;

/**
 * a tempo change at a beat, or a new tempo for the one there; a ramp into it from the change before follows it
 * @param {{ ramp?: boolean }} [options]  ramp: from here to the next change (false: hold)
 */
export function setTempoAt(p, beat, bpm, { ramp } = {})
{
    const i = p.tempoMap.findIndex(s => sameBeat(s.beat, beat));
    const old = p.tempoMap[i];
    let seg = { ...(old ?? { beat: Math.max(0, beat) }), bpm };
    if (ramp === false) { const { to, ...held } = seg; seg = held; }
    const list = (old ? p.tempoMap.map(s => s === old ? seg : s) : [...p.tempoMap, seg]).sort((a, b)=> a.beat - b.beat);
    const at = list.indexOf(seg), before = list[at - 1];
    if (old && before?.to !== undefined && Math.abs(before.to - old.bpm) < 1e-6) list[at - 1] = { ...before, to: bpm };
    if (ramp && list[at + 1]) list[at] = { ...seg, to: list[at + 1].bpm };
    return { ...p, tempoMap: list };
}

/** takes out a tempo change after the first; the tempo before it holds on */
export const removeTempoChange = (p, index)=> index > 0 ? { ...p, tempoMap: p.tempoMap.filter((_, i)=> i !== index) } : p;

/** a meter change at a beat (a bar line), or a new meter for the one there */
export function setMeterAt(p, beat, sig)
{
    const i = p.meters.findIndex(m => sameBeat(m.beat, beat));
    const meters = i >= 0 ? p.meters.map((m, k)=> k === i ? { ...m, sig } : m) : [...p.meters, { beat: Math.max(0, beat), sig }].sort((a, b)=> a.beat - b.beat);
    return { ...p, meters };
}

/** takes out a meter change after the first; the meter before it holds on */
export const removeMeterChange = (p, index)=> index > 0 ? { ...p, meters: p.meters.filter((_, i)=> i !== index) } : p;

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

/** notes played a little looser: each moved by up to `timing` beats and its velocity by up to `velocity`, at random
 * (`random` gives 0..1, so a test can pass a fixed sequence) */
export function humanizeNotes(notes, { timing = 0.02, velocity = 8 } = {}, random = Math.random)
{
    const spread = (x)=> (random() * 2 - 1) * x;
    return notes.map(n => ({ ...n, beat: Math.max(0, n.beat + spread(timing)), vel: Math.max(1, Math.min(127, Math.round(n.vel + spread(velocity)))) }));
}

/** notes played faster (k < 1) or slower (k > 1): their starts from `from` and their lengths scaled */
export const scaleNotes = (notes, k, from = 0)=> notes.map(n => ({ ...n, beat: from + (n.beat - from) * k, beats: n.beats * k }));

/** notes backwards over the stretch [from, to): a note ending at `to` starts at `from` */
export const reverseNotes = (notes, from, to)=> notes.map(n => ({ ...n, beat: Math.max(from, from + to - n.beat - n.beats) })).sort((a, b)=> a.beat - b.beat || a.key - b.key);

// ── time ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** chords cut at a beat, where one spans it */
const splitChords = (chords, at)=> chords.flatMap(c => c.beat < at - 1e-9 && c.beat + c.beats > at + 1e-9
    ? [{ ...c, beats: at - c.beat }, { ...c, beat: at, beats: c.beat + c.beats - at }] : [c]);

/** everything in the project at a beat or after it, moved on by `beats` (or back, for a negative): clips, notes,
 * markers, chords, tempo and meter changes, automation and the loop. Nothing at beat 0's tempo or meter moves. */
function shiftFrom(p, at, by)
{
    const move = (b)=> b >= at - 1e-9 ? b + by : b;
    const keepFirst = (list)=> list.map((x, i)=> i === 0 ? x : { ...x, beat: move(x.beat) });
    return {
        ...p,
        length: Math.max(0, p.length + by),
        tempoMap: keepFirst(p.tempoMap),
        meters: keepFirst(p.meters),
        markers: p.markers.map(m => ({ ...m, beat: move(m.beat) })),
        chords: p.chords.map(c => ({ ...c, beat: move(c.beat) })),
        loop: p.loop && { from: move(p.loop.from), to: move(p.loop.to) },
        tracks: p.tracks.map(t => ({
            ...t,
            clips: t.clips.map(c => ({ ...c, start: move(c.start) })),
            automation: Object.fromEntries(Object.entries(t.automation).map(([k, frames])=> [k, frames.map(f => ({ ...f, beat: move(f.beat) }))])),
        })),
    };
}

/** empty time put in at a beat, `beats` long: what was there and after moves on, a clip across it is cut in two */
export function insertTime(p, at, beats)
{
    if (beats <= 0) return p;
    const cut = { ...splitAt(p, at), chords: splitChords(p.chords, at) };
    return shiftFrom(cut, at, beats);
}

/** the time from one beat to another taken out: what was in it goes, what was after moves back */
export function deleteTime(p, from, to)
{
    if (to <= from) return p;
    const len = to - from, inside = (b)=> b >= from - 1e-9 && b < to - 1e-9;
    let q = splitAt(splitAt(p, from), to);
    q = {
        ...q,
        chords: splitChords(splitChords(q.chords, from), to).filter(c => !inside(c.beat)),
        markers: q.markers.filter(m => !inside(m.beat)),
        tempoMap: q.tempoMap.filter((x, i)=> i === 0 || !inside(x.beat)),
        meters: q.meters.filter((x, i)=> i === 0 || !inside(x.beat)),
        // a loop end inside the stretch comes back to its start
        loop: q.loop && { from: inside(q.loop.from) ? to : q.loop.from, to: inside(q.loop.to) ? from + len : q.loop.to },
        tracks: q.tracks.map(t => ({
            ...t,
            clips: t.clips.filter(c => !inside(c.start)),
            automation: Object.fromEntries(Object.entries(t.automation).map(([k, frames])=> [k, frames.filter(f => !inside(f.beat))])),
        })),
    };
    const out = shiftFrom(q, to, -len);
    return { ...out, length: Math.max(0, p.length - Math.max(0, Math.min(p.length, to) - from)), loop: out.loop && out.loop.to - out.loop.from > 1e-9 ? out.loop : null };
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
