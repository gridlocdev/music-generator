// MIDI FX: code that changes a track's notes as they play, a little differently on each pass round a loop. A type is
// registered once (the app registers them, so this layer needs none of their code); a track lists the types it uses
// in track.fx. One type runs once per pass for the whole project, so it can share a plan across its tracks.
import { trackNotes } from './project.js';

/**
 * A played note: grid is where it belongs on the grid (a loop or a seek plays the notes whose grid is at or after
 * it, even those that sound a little early); glideFrom slides into it from that key; held means no note-off, as the
 * next note glides on from it; mono cuts whatever else its track is sounding; program plays it on another program
 * of the track's bank; the rest are the synth's pitch moves (vibrato, scoops, bends, arp).
 * @typedef {import('./project.js').Note & { grid: number, glideFrom?: number, held?: boolean, mono?: boolean, program?: number }} PlayedNote
 * @typedef {{ kind: 'tapeStop', beat: number, seconds: number, rate: number }
 *   | { kind: 'sendSwell', track: string, beat: number, beats: number, send: number }} FxEvent
 *   tapeStop: every track winds down in pitch and speed into the beat; sendSwell: a track's delay send opens across a stretch
 * @typedef {{ name: string, perform: (project: import('./project.js').Project, pass: number)=>
 *   { notes: Map<string, PlayedNote[]>, events: FxEvent[] } }} FxType
 */

/** @type {Map<string, FxType>} */
const types = new Map();

/** @param {string} type  @param {FxType} impl */
export const registerFx = (type, impl)=> { types.set(type, impl); };

/** a track's notes as written, ready to play */
const plainNotes = (track)=> trackNotes(track).map(n => ({ ...n, grid: n.beat }));

/**
 * Every track's notes for one pass, through its FX, and the FX's events.
 * @returns {{ tracks: PlayedNote[][], events: FxEvent[] }}  tracks in the project's order, each sorted by beat
 */
export function performProject(project, pass)
{
    const used = new Set(project.tracks.flatMap(t => t.fx.map(f => f.type)).filter(type => types.has(type)));
    const results = new Map([...used].map(type => [type, types.get(type).perform(project, pass)]));
    const tracks = project.tracks.map(t =>
    {
        const fx = t.fx.findLast(f => results.get(f.type)?.notes.has(t.id));
        return fx ? results.get(fx.type).notes.get(t.id) : plainNotes(t);
    });
    return { tracks, events: [...results.values()].flatMap(r => r.events) };
}
