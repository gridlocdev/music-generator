// A project as a Standard MIDI File, to open in another DAW: a track per track with its written notes and General MIDI
// program (drum kits on channel 10), the tempo map's changes and the meters. Ramps become their starting tempo, and
// what MIDI FX add as the project plays isn't in it. And back: a MIDI file read as a new project, or as tracks added to
// one. Pure.
import { writeMidi, readMidi } from '../lib/midi-file.js';
import { barAt } from './meter.js';
import { trackNotes, isDrums, emptyProject, makeTrack, addTrack, newId, projectEnd } from './project.js';

/** @param {import('./project.js').Project} p */
export function projectMidi(p)
{
    let channel = 0;
    const tracks = p.tracks.map(t =>
    {
        const drums = isDrums(t);
        const ch = drums ? 9 : channel++ % 15;
        return { name: t.name, channel: ch < 9 || drums ? ch : ch + 1, program: drums ? 0 : t.instrument.program, notes: trackNotes(t) };
    });
    const meters = p.meters.map(m => { const [num, den] = m.sig.split('/').map(Number); return { beat: m.beat, num, den }; });
    return writeMidi({ title: p.title, tempo: p.tempoMap[0].bpm, beatsPerBar: 4, tempos: p.tempoMap.map(s => ({ beat: s.beat, bpm: s.bpm })), meters, tracks });
}

/**
 * the MIDI file's tracks added to project p from the bar at `at`, one clip each, as General MIDI instruments (channel
 * 10 is the drum kit); the file's tempo and meters are left out, as the project has its own
 * @param {import('./project.js').Project} p
 * @param {Uint8Array|ReturnType<typeof readMidi>} midi
 */
export function addMidiTracks(p, midi, at = 0)
{
    const file = midi instanceof Uint8Array ? readMidi(midi) : midi;
    const start = barAt(p.meters, at).start;
    let q = p;
    for (const t of file.tracks)
    {
        const drums = t.channel === 9;
        const track = makeTrack(q, { name: t.name || (drums ? 'Drums' : `Track ${q.tracks.length + 1}`), instrument: { bank: drums ? 128 : 0, program: drums ? 0 : t.program } });
        q = addTrack(q, track);
        const last = Math.max(...t.notes.map(n => n.beat + n.beats));
        const end = barAt(q.meters, start + last - 1e-6);
        const clip = { id: newId(q, 'c'), start, beats: end.start + end.beatsPerBar - start, notes: t.notes.map(n => ({ ...n })) };
        q = { ...q, tracks: q.tracks.map(x => x.id === track.id ? { ...x, clips: [clip] } : x) };
    }
    return { ...q, length: Math.max(q.length, projectEnd(q)) };
}

/**
 * a new project from a MIDI file: its tempo changes, meters and tracks
 * @param {Uint8Array} bytes
 * @param {string} title for a file that names none
 */
export function midiProject(bytes, title)
{
    const file = readMidi(bytes);
    const round = (bpm)=> Math.round(bpm * 100) / 100;
    const tempos = file.tempos.length ? file.tempos : [{ beat: 0, bpm: 120 }];
    const meters = file.meters.length ? file.meters : [{ beat: 0, num: 4, den: 4 }];
    const p = { ...emptyProject({ title: file.title || title, bars: 1 }),
        tempoMap: [{ beat: 0, bpm: round(tempos[0].bpm) }, ...tempos.filter(t => t.beat > 0).map(t => ({ beat: t.beat, bpm: round(t.bpm) }))],
        meters: [{ beat: 0, sig: `${meters[0].num}/${meters[0].den}` }, ...meters.filter(m => m.beat > 0).map(m => ({ beat: m.beat, sig: `${m.num}/${m.den}` }))] };
    const q = addMidiTracks({ ...p, length: 0 }, file, 0);
    const end = barAt(q.meters, Math.max(0, projectEnd(q) - 1e-6));
    return { ...q, length: end.start + end.beatsPerBar };
}
