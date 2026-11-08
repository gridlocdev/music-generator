// A project as a Standard MIDI File, to open in another DAW: a track per track with its written notes and General MIDI
// program (drum kits on channel 10), the tempo map's changes and the meters. Ramps become their starting tempo, and
// what MIDI FX add as the project plays isn't in it. Pure.
import { writeMidi } from '../lib/midi-file.js';
import { trackNotes, isDrums } from './project.js';

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
