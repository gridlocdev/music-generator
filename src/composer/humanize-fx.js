// The Humanize MIDI FX: plays a project's tracks the way perform.js plays a composed score, with ear candy, ghost
// notes, swing, scoops, glides, vibrato and timing that breathes, a little differently on each pass round a loop.
// It reads each track's role from its FX settings, the sections from the markers' meta, and swing and style from the
// project's groove, so a song made by the composer plays as composed, and a track added by hand can join in.
import { trackNotes } from '../daw/project.js';
import { beatsPerBar, meterAt } from '../daw/meter.js';
import { perform } from './perform.js';
import { planEarCandy } from './ear-candy.js';
import { EAR_CANDY } from './ear-candy-data.js';
import { ROLES } from './composer-data.js';

export const HUMANIZE = 'humanize';
export const HUMANIZE_ROLES = [...ROLES, 'echo'];

/** the score shape perform() reads, rebuilt from a project and the tracks that have the FX */
export function scoreOf(project)
{
    const g = project.groove ?? {};
    const sig = (beat)=> meterAt(project.meters, beat).sig;
    const sectionsFrom = project.markers.length ? project.markers : [{ beat: 0, name: 'Song', meta: {} }];
    const sections = sectionsFrom.map((m, i)=>
    {
        const end = sectionsFrom[i + 1]?.beat ?? project.length;
        return { type: 'verse', energy: 0.5, scene: '', climax: false, meter: sig(m.beat), tonic: project.key?.tonic ?? 0, mode: project.key?.mode ?? 'major',
            ...m.meta, label: m.name, beat: m.beat, beats: end - m.beat, beatsPerBar: beatsPerBar(sig(m.beat)) };
    });
    const tracks = project.tracks.flatMap(t =>
    {
        const fx = t.fx.findLast(f => f.type === HUMANIZE);
        if (!fx) return [];
        const notes = trackNotes(t).map(({ early, ...n })=> ({ ...n, ...(early !== undefined && { anticipates: n.beat + early }) }));
        return [{ id: t.id, role: fx.role ?? 'lead', name: t.name, bank: t.instrument.bank, program: t.instrument.program, notes }];
    });
    return { title: g.salt ?? project.title, tempoMap: project.tempoMap, sections, tracks, chords: project.chords ?? [], beats: project.length, loop: project.loop,
        swing: g.swing ?? 0, swingSub: g.swingSub ?? 0.5, style: g.style ?? {}, seed: g.seed ?? project.title, sound: g.sound ?? 'gm' };
}

/** @type {import('../daw/fx.js').FxType} */
export const humanizeFx = {
    name: 'Humanize',
    perform(project, pass)
    {
        const score = scoreOf(project);
        const candy = planEarCandy(score, pass);
        const played = perform(score, pass, candy);
        const idOf = (role)=> score.tracks.find(t => t.role === role)?.id;
        const events = candy.flatMap(c =>
            c.kind === 'tapeStop' ? [{ kind: 'tapeStop', beat: c.beat, seconds: c.seconds, rate: EAR_CANDY.tapeStop.rate }]
            : c.kind === 'flourish' && idOf(c.role) ? [{ kind: 'sendSwell', track: idOf(c.role), beat: c.beat, beats: c.beats, send: EAR_CANDY.flourish.send }]
            : []);
        return { notes: new Map(score.tracks.map((t, i)=> [t.id, played[i]])), events };
    },
};
