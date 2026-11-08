// A track's row in the arrangement: its header (name, instrument, mute, solo) and its lane of clips.
//
// Clips: drag to move (to another track too), Alt-drag to copy, drag the right edge to resize, double-click empty
// space for a new clip; they snap to bars, or to beats with Shift. Drop an instrument on a track to play it there, or
// audio files to read them as notes.
import { useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { barAt } from '../../daw/meter.js';
import { presetFor } from '../../daw/instruments.js';
import { updateClip, moveClip, newId } from '../../daw/project.js';
import { project, selected, selectedClip, beat, settings, setSettings } from '../store.js';
import { edit } from '../document.js';
import { recording, dropAudio, dropTake } from '../recording.js';
import { focus } from '../focus.js';
import { assignPreset, renameTrack, deleteTrack, toggleMute, toggleSolo, newClipAt } from '../tracks.js';
import { clipMenu, laneMenu, trackMenu } from '../context-menus.js';
import { useCanvas, rgba } from './canvas.js';
import { px, snapTo } from './arrange-view.js';

const EDGE = 6;                 // px at a clip's right edge that resize it
/** a clip being dragged: { track, clip, mode: 'move'|'resize', start, beats, to, copy } */
const drag = signal(/** @type {any} */ (null));

/** a track's lane: its clips, with their notes drawn small inside, and the take being recorded */
function Lane({ track, beats, ppb })
{
    const ref = useCanvas((g, w, h)=>
    {
        const all = track.clips.flatMap(c => c.notes);
        const rec = recording.value?.track === track.id ? recording.value : null;
        const recNotes = rec?.rec.notes ?? [];
        const keys = [...all, ...recNotes].map(n => n.key);
        const lo = keys.length ? Math.min(...keys) - 1 : 59, hi = keys.length ? Math.max(...keys) + 1 : 61;
        const top = 16, inner = h - top - 5, noteH = Math.max(1.5, Math.min(4, inner / (hi - lo + 1)));
        const y = (k)=> top + (hi - k) / Math.max(1, hi - lo) * (inner - noteH);
        const d = drag.value, sel = selectedClip.value;
        g.font = '11px -apple-system, system-ui, sans-serif';
        g.textBaseline = 'middle';
        const draw = (c, start, len, ghost)=>
        {
            const a = start * ppb + 1, b = (start + len) * ppb - 1;
            const on = sel?.track === track.id && sel.clip === c.id;
            g.globalAlpha = ghost ? 0.5 : c.mute ? 0.35 : 1;
            g.fillStyle = rgba(track.color, on ? 0.3 : 0.18);
            g.beginPath(); g.roundRect(a, 2, b - a, h - 4, 4); g.fill();
            g.fillStyle = rgba(track.color, 0.7);
            g.fillRect(a, 2, b - a, 12);
            if (on) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.roundRect(a + 0.5, 2.5, b - a - 1, h - 5, 4); g.stroke(); }
            g.fillStyle = rgba(track.color, 0.95);
            g.save();
            g.beginPath(); g.rect(a, 0, b - a, h); g.clip();
            for (const n of c.notes) if (n.beat < len) g.fillRect((start + n.beat) * ppb, y(n.key), Math.max(1, n.beats * ppb - 1), noteH);
            g.restore();
            g.globalAlpha = 1;
        };
        for (const c of track.clips)
        {
            const moving = d && d.track === track.id && d.clip === c.id;
            if (moving && d.mode === 'move' && !d.copy) continue;
            draw(c, c.start, moving && d.mode === 'resize' ? d.beats : c.beats, false);
        }
        if (d?.mode === 'move' && d.to === track.id) draw(d.source, d.start, d.source.beats, true);
        if (rec)
        {
            const now = Math.max(rec.start, beat.value);
            g.fillStyle = 'rgba(255,90,90,.18)';
            g.fillRect(rec.start * ppb, 2, (now - rec.start) * ppb, h - 4);
            g.fillStyle = 'rgba(255,90,90,.9)';
            for (const n of recNotes) g.fillRect((rec.start + n.beat) * ppb, y(n.key), Math.max(1, n.beats * ppb - 1), noteH);
        }
    });

    const beatAt = (e)=> (e.clientX - e.currentTarget.getBoundingClientRect().left) / ppb;
    const clipAt = (b)=> track.clips.findLast(c => b >= c.start && b < c.start + c.beats);

    const down = (e)=>
    {
        if (e.button !== 0) return;
        focus.value = 'arrange';
        selected.value = track.id;
        const b = beatAt(e), c = clipAt(b);
        if (!c) { selectedClip.value = null; return; }
        selectedClip.value = { track: track.id, clip: c.id };
        const x0 = e.clientX;
        const mode = (c.start + c.beats - b) * ppb <= EDGE ? 'resize' : 'move';
        const grab = b - c.start;
        drag.value = { track: track.id, clip: c.id, source: c, mode, start: c.start, beats: c.beats, to: track.id, copy: e.altKey };
        const move = (m)=>
        {
            const at = b + (m.clientX - x0) / ppb;
            if (mode === 'resize')
            {
                const end = snapTo(at, m);
                drag.value = { ...drag.value, beats: Math.max(m.shiftKey ? 1 : barAt(project.value.meters, c.start).beatsPerBar, end - c.start) };
                return;
            }
            const row = /** @type {HTMLElement|null} */ (document.elementFromPoint(m.clientX, m.clientY)?.closest('.track[data-id]'));
            drag.value = { ...drag.value, start: snapTo(at - grab, m), to: row?.dataset.id ?? drag.value.to, copy: m.altKey };
        };
        const up = ()=>
        {
            removeEventListener('pointermove', move);
            removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
            const d = drag.value;
            drag.value = null;
            if (!d) return;
            if (d.mode === 'resize') { if (d.beats !== c.beats) edit(p => updateClip(p, track.id, c.id, { beats: d.beats })); return; }
            if (d.start === c.start && d.to === track.id) return;
            let id = c.id;
            edit(p => { if (d.copy) id = newId(p, 'c'); return moveClip(p, track.id, c.id, d.to, d.start, d.copy); });
            selected.value = d.to;
            selectedClip.value = { track: d.to, clip: id };
        };
        addEventListener('pointermove', move);
        addEventListener('pointerup', up); addEventListener('pointercancel', up);
    };

    const dblclick = (e)=>
    {
        const b = beatAt(e), c = clipAt(b);
        if (c) setSettings({ editorTab: 'roll' });
        else newClipAt(track.id, b);
    };

    const menu = (e)=>
    {
        e.preventDefault();
        const b = beatAt(e), c = clipAt(b);
        c ? clipMenu(track.id, c.id, b) : laneMenu(track.id, b);
    };

    const hover = (e)=>
    {
        const b = beatAt(e), c = clipAt(b);
        e.currentTarget.style.cursor = c && (c.start + c.beats - b) * ppb <= EDGE ? 'ew-resize' : c ? 'grab' : '';
    };

    const [dropping, setDropping] = useState(false);
    const isFiles = (e)=> e.dataTransfer?.types.includes('Files') || e.dataTransfer?.types.includes('application/x-take');
    return (
        <div class={`lane ${dropping ? 'drop' : ''}`} style={{ width: px(beats * ppb) }} onPointerDown={down} onDblClick={dblclick} onPointerMove={hover} onContextMenu={menu}
            onDragOver={(e)=> { if (isFiles(e)) { e.preventDefault(); setDropping(true); } }}
            onDragLeave={()=> setDropping(false)}
            onDrop={(e)=> { setDropping(false); if (!isFiles(e)) return; e.preventDefault();
                const take = e.dataTransfer.getData('application/x-take');
                take ? dropTake(track.id, take, beatAt(e)) : dropAudio(track.id, [...e.dataTransfer.files], beatAt(e)); }}>
            <canvas ref={ref} />
        </div>
    );
}

const isPreset = (e)=> e.dataTransfer?.types.includes('application/x-preset');

export function TrackRow({ track, beats, ppb })
{
    const [drop, setDrop] = useState(false);
    settings.value.library;
    const m = track.mixer;
    return (
        <div class={`track ${selected.value === track.id ? 'on' : ''} ${drop ? 'drop' : ''}`} data-id={track.id} style={{ '--track': rgba(track.color) }}
            onDragOver={(e)=> { if (isPreset(e)) { e.preventDefault(); setDrop(true); } }}
            onDragLeave={()=> setDrop(false)}
            onDrop={(e)=> { setDrop(false); if (!isPreset(e)) return; e.preventDefault(); assignPreset(track.id, JSON.parse(e.dataTransfer.getData('application/x-preset'))); }}>
            <div class="head" onClick={()=> { selected.value = track.id; }} onContextMenu={(e)=> { e.preventDefault(); trackMenu(track.id); }}>
                <span class="name" onDblClick={()=> renameTrack(track.id)} title="Double-click to rename">{track.name}</span>
                <span class="inst">{presetFor(track.instrument.bank, track.instrument.program).name}</span>
                <div class="ms" onClick={(e)=> e.stopPropagation()}>
                    <button class={`mute ${m.mute ? 'on' : ''}`} title="Mute" onClick={()=> toggleMute(track.id)}>M</button>
                    <button class={`solo ${m.solo ? 'on' : ''}`} title="Solo" onClick={()=> toggleSolo(track.id)}>S</button>
                    <button class="del" title="Delete the track" onClick={()=> deleteTrack(track.id)}>×</button>
                </div>
            </div>
            <Lane track={track} beats={beats} ppb={ppb} />
        </div>
    );
}
