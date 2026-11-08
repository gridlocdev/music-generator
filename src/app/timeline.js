// Tempo and meter over the timeline: the whole song's tempo and opening meter, changes at a bar, and the flags the
// ruler shows for them.
import { barAt, meterAt, beatsPerBar } from '../daw/meter.js';
import { setTempo, setMeter, setTempoAt, removeTempoChange, setMeterAt, removeMeterChange } from '../daw/project.js';
import { bpmAt } from '../lib/tempo-map.js';
import { appMenu } from '../platform/app-menu.js';
import { project, beat } from './store.js';
import { edit } from './document.js';
import { askText } from './ask.js';

const validSig = (v)=> !!v && /^\d{1,2}\/(2|4|8|16)$/.test(v) && beatsPerBar(v) > 0;
const validBpm = (v)=> v >= 20 && v <= 300;
const round = (bpm)=> Math.round(bpm * 10) / 10;
const barName = (b)=> `bar ${barAt(project.value.meters, b).bar + 1}`;

/** the whole tempo map, in proportion */
export async function askTempo()
{
    const now = Math.round(bpmAt(project.value.tempoMap, beat.value));
    const v = Number(await askText('Tempo (bpm): the whole tempo map changes in proportion', String(now), 'Set'));
    if (validBpm(v)) edit(p => setTempo(p, v));
}

/** the meter from the start */
export async function askMeter()
{
    const v = (await askText('Meter (4/4, 6/8, 7/8…)', project.value.meters[0].sig, 'Set'))?.trim();
    if (validSig(v)) edit(p => setMeter(p, v));
}

/** a tempo change at a beat, or a new tempo for the one there */
export async function askTempoChange(at)
{
    const v = Number(await askText(`Tempo from ${barName(at)} (bpm)`, String(round(bpmAt(project.value.tempoMap, at))), 'Set'));
    if (validBpm(v)) edit(p => setTempoAt(p, at, v));
}

/** a meter change at a bar line, or a new meter for the one there */
export async function askMeterChange(at)
{
    const v = (await askText(`Meter from ${barName(at)} (4/4, 6/8, 7/8…)`, meterAt(project.value.meters, at).sig, 'Set'))?.trim();
    if (validSig(v)) edit(p => setMeterAt(p, at, v));
}

/**
 * the ruler's flags: each meter and tempo change, the meter first where both fall on one beat
 * @returns {{ kind: 'meter'|'tempo', index: number, beat: number, label: string }[]}
 */
export function timelineFlags(p)
{
    const meters = p.meters.map((m, index)=> ({ kind: /** @type {const} */ ('meter'), index, beat: m.beat, label: m.sig }));
    const tempos = p.tempoMap.map((s, index)=> ({ kind: /** @type {const} */ ('tempo'), index, beat: s.beat,
        label: `♩ ${round(s.bpm)}${s.to !== undefined && p.tempoMap[index + 1] ? ` → ${round(s.to)}` : ''}` }));
    return [...meters, ...tempos].sort((a, b)=> a.beat - b.beat || (a.kind === 'meter' ? -1 : 1));
}

/** edits a flag's change */
export const editFlag = (f)=> f.kind === 'tempo' ? askTempoChange(f.beat) : askMeterChange(f.beat);

/** a flag's right-click menu */
export function flagMenu(f)
{
    const p = project.value;
    if (f.kind === 'meter')
        return appMenu.popup([
            { label: `Edit Meter at ${barName(f.beat)}…`, run: ()=> editFlag(f) },
            { label: 'Remove Meter Change', enabled: f.index > 0, run: ()=> edit(q => removeMeterChange(q, f.index)) },
        ]);
    const s = p.tempoMap[f.index], next = p.tempoMap[f.index + 1];
    appMenu.popup([
        { label: `Edit Tempo at ${barName(f.beat)}…`, run: ()=> editFlag(f) },
        { label: 'Ramp to Next', enabled: !!next, checked: s.to !== undefined && !!next, run: ()=> edit(q => setTempoAt(q, s.beat, s.bpm, { ramp: s.to === undefined })) },
        { label: 'Remove Tempo Change', enabled: f.index > 0, run: ()=> edit(q => removeTempoChange(q, f.index)) },
    ]);
}
