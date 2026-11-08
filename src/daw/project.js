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
export const defaultMixer = ()=> ({ volumeDb: -6, pan: 0, mute: false, solo: false, lowCut: 20, sends: { reverb: 0.15, delay: 0 }, autoPan: null, duck: null });

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

export const setTitle = (p, title)=> ({ ...p, title });

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

export const setLength = (p, length)=> ({ ...p, length: Math.max(1, length) });

// ── history ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const DEPTH = 200;

/** @typedef {{ past: Project[], present: Project, future: Project[] }} History */

/** @returns {History} */
export const history = (project)=> ({ past: [], present: project, future: [] });

/** the project after an edit; an edit that changed nothing isn't a step */
export const commit = (h, next)=> next === h.present ? h : { past: [...h.past, h.present].slice(-DEPTH), present: next, future: [] };

export const undo = (h)=> h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1), future: [h.present, ...h.future] } : h;

export const redo = (h)=> h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h;
