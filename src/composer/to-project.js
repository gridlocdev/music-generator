// A composed score as a project: a clip per section on each part's track, the sections as markers, the chords on the
// chord track, the mix (each part's channel strip, its automation and the ducking under the kick) baked in from
// mix-plan.js, and the Humanize MIDI FX on every track so it's played as the composer means it. Pure.
import { emptyProject } from '../daw/project.js';
import { planMix } from './mix-plan.js';
import { DUCK, AUTO_PAN } from './performance-data.js';
import { ROLE_COLORS } from './composer-data.js';
import { METERS } from './patterns-data.js';

// what a section's marker keeps for the Humanize FX and the mix: everything but where it is
const SECTION_META = ['type', 'energy', 'scene', 'climax', 'meter', 'tonic', 'mode'];

/** @param {import('./compose.js').Score} score */
export function toProject(score)
{
    const plan = planMix(score);
    const id = (i)=> `t${i + 1}`;
    const drums = score.tracks.findIndex(t => t.role === 'drums');
    const sig = (s)=> (METERS[s.meter]?.sig ?? [s.beatsPerBar, 4]).join('/');
    const meters = [];
    for (const s of score.sections) if (!meters.length || meters.at(-1).sig !== sig(s)) meters.push({ beat: s.beat, sig: sig(s) });
    let clipId = 0;
    const tracks = score.tracks.map((t, i)=>
    {
        const { strip, duck, frames } = plan.tracks[i];
        const clips = [];
        for (const s of score.sections)
        {
            const notes = t.notes.filter(n => n.beat >= s.beat - 1e-9 && n.beat < s.beat + s.beats - 1e-9)
                .map(({ anticipates, ...n })=> ({ ...n, beat: n.beat - s.beat, ...(anticipates !== undefined && { early: anticipates - n.beat }) }));
            if (notes.length) clips.push({ id: `c${++clipId}`, start: s.beat, beats: s.beats, notes });
        }
        return {
            id: id(i), name: t.name, color: ROLE_COLORS[t.role] ?? ROLE_COLORS.lead, instrument: { bank: t.bank, program: t.program },
            mixer: { volumeDb: strip.volumeDb, pan: strip.pan, mute: false, solo: false, lowCut: strip.lowCut,
                sends: { reverb: strip.reverb, delay: strip.delay }, autoPan: AUTO_PAN[t.role] ?? null,
                duck: duck && drums >= 0 ? { from: id(drums), keys: DUCK.keys, db: duck } : null },
            fx: [{ type: 'humanize', role: t.role }],
            automation: { tone: frames.tone, reverb: frames.reverb, ...(frames.delay && { delay: frames.delay }) },
            clips,
        };
    });
    const first = score.sections[0];
    return {
        ...emptyProject({ title: score.title }),
        length: score.beats,
        tempoMap: score.tempoMap,
        meters,
        key: { tonic: first.tonic, mode: first.mode },
        markers: score.sections.map(s => ({ beat: s.beat, name: s.label, meta: Object.fromEntries(SECTION_META.map(k => [k, s[k]])) })),
        loop: score.loop,
        groove: { swing: score.swing, swingSub: score.swingSub, style: score.style, seed: score.seed, sound: score.sound, salt: score.title },
        chords: score.chords,
        tracks,
    };
}
