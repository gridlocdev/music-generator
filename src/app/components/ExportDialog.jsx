// File → Export as Audio File: what to export (the whole project, the loop or the selection), as the mix or as each
// track on its own, normalized or not, and how long a tail to leave for reverb.
import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { barAt } from '../../daw/meter.js';
import { project, selectedClip, chordRange, picked } from '../store.js';
import { bounce, exportDialog, TAIL } from '../bounce.js';
import { selectionRange } from '../commands.js';

/** the last choices, kept while the app is open */
const choices = signal({ range: 'all', stems: false, normalized: false, tail: TAIL });

const bars = (meters, r)=> `bars ${barAt(meters, r.from).bar + 1}–${barAt(meters, r.to - 1e-6).bar + 1}`;

export function ExportDialog()
{
    const open = exportDialog.value, button = useRef(/** @type {HTMLButtonElement|null} */ (null));
    useEffect(()=> { if (open) button.current?.focus(); }, [open]);
    if (!open) return null;
    const p = project.value, c = choices.value;
    const set = (patch)=> { choices.value = { ...c, ...patch }; };
    const selection = picked.value.size || chordRange.value || selectedClip.value ? selectionRange() : null;
    const ranges = [
        ['all', 'Whole project', true],
        ['loop', p.loop ? `Loop (${bars(p.meters, p.loop)})` : 'Loop', !!p.loop],
        ['selection', selection ? `Selection (${bars(p.meters, selection)})` : 'Selection', !!selection],
    ];
    const range = ranges.find(r => r[0] === c.range && r[2]) ? c.range : 'all';
    const close = ()=> { exportDialog.value = false; };
    const go = ()=>
    {
        close();
        bounce({ range: range === 'loop' ? p.loop : range === 'selection' ? selection : null, stems: c.stems, normalized: c.normalized, tail: c.tail });
    };
    return (
        <div class="dialog-back" onPointerDown={(e)=> e.target === e.currentTarget && close()}>
            <div class="dialog export" role="dialog" aria-label="Export as audio" onKeyDown={(e)=> { if (e.key === 'Escape') close(); if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) go(); }}>
                <h2>Export as Audio File</h2>
                <fieldset>
                    <legend>Range</legend>
                    {ranges.map(([id, label, ok])=> <label class={ok ? '' : 'off'}><input type="radio" name="range" value={id} disabled={!ok} checked={range === id} onChange={()=> set({ range: id })} /> {label}</label>)}
                </fieldset>
                <fieldset>
                    <legend>Export</legend>
                    <label><input type="radio" name="what" value="mix" checked={!c.stems} onChange={()=> set({ stems: false })} /> The mix, as one file</label>
                    <label><input type="radio" name="what" value="stems" checked={c.stems} onChange={()=> set({ stems: true })} /> Each track, into a new folder</label>
                </fieldset>
                <div class="form">
                    <label>Normalize <span><input type="checkbox" name="normalize" checked={c.normalized} onChange={(e)=> set({ normalized: e.currentTarget.checked })} /> loudest peak to −1 dB</span></label>
                    <label>Tail <span><input type="number" name="tail" min="0" max="20" step="0.5" value={c.tail} onInput={(e)=> set({ tail: Math.max(0, Math.min(20, Number(e.currentTarget.value) || 0)) })} /> seconds after the end</span></label>
                </div>
                <p class="hint">{c.stems ? 'One WAV per audible track, all the same length, through the track’s own mixer settings. Normalizing gives them all one gain, so they keep their balance.' : 'A stereo WAV of what Play would play.'}</p>
                <div class="actions">
                    <button onClick={close}>Cancel</button>
                    <button class="primary" ref={button} onClick={go}>Export</button>
                </div>
            </div>
        </div>
    );
}
