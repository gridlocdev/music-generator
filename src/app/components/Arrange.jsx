// The arrangement: a ruler of bars and markers, the chord track, then a row per track with its header (name,
// instrument, mute, solo) and a lane of clips. Click the ruler to move the playhead; Cmd/Ctrl + wheel zooms.
//
// Clips: drag to move (to another track too), Alt-drag to copy, drag the right edge to resize, double-click empty
// space for a new clip; they snap to bars, or to beats with Shift. Drag across the chord track to pick a stretch to
// whistle a chord for. Drop an instrument on a track to play it there, or audio files to read them as notes.
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { barLines, barAt } from '../../daw/meter.js';
import { presetFor } from '../../daw/instruments.js';
import { projectEnd, makeTrack, addTrack, removeTrack, updateTrack, setMixer, addClip, updateClip, moveClip, newId } from '../../daw/project.js';
import { project, selected, selectedClip, chordRange, beat, settings, setSettings } from '../store.js';
import { edit } from '../document.js';
import { seek } from '../player.js';
import { recording, dropAudio, dropTake } from '../recording.js';
import { focus } from '../focus.js';
import { askText } from '../ask.js';
import { useCanvas, rgba } from './canvas.js';

const HEAD_W = 200;
const ZOOM = [0.5, 120];        // px per beat
const ROOM = 32;                // beats of empty space after the end, to add clips in
const NEW_CLIP_BARS = 4;
const EDGE = 6;                 // px at a clip's right edge that resize it
/** px per beat, or 0 to fit the project to the window */
const zoom = signal(0);
/** the arrangement's width for lanes, px */
const width = signal(0);
/** a clip being dragged: { track, clip, mode: 'move'|'resize', start, beats, to, copy } */
const drag = signal(/** @type {any} */ (null));

/** Preact sets numbers in style as they are, with no unit */
const px = (n)=> `${n}px`;

function span()
{
    const r = recording.value;
    return Math.max(projectEnd(project.value), r ? r.start + 4 : 0, 16) + ROOM;
}

/** a beat snapped to the bar it's nearest, or to the beat with Shift */
function snapTo(b, e)
{
    const meters = project.value.meters;
    if (e.shiftKey) return Math.max(0, Math.round(b));
    const at = barAt(meters, b);
    return b - at.start < at.beatsPerBar / 2 ? at.start : at.start + at.beatsPerBar;
}

function Ruler({ beats, ppb })
{
    const p = project.value;
    const ref = useCanvas((g, w, h)=>
    {
        g.font = '11px -apple-system, system-ui, sans-serif';
        g.textBaseline = 'middle';
        p.markers.forEach((m, i)=>
        {
            const x = m.beat * ppb, end = (p.markers[i + 1]?.beat ?? projectEnd(p)) * ppb;
            g.fillStyle = 'rgba(255,255,255,.05)';
            g.fillRect(x, 0, end - x, 14);
            g.fillStyle = '#6a6a76';
            g.fillRect(x, 0, 1, 14);
            g.save();
            g.beginPath(); g.rect(x, 0, end - x - 2, 14); g.clip();
            g.fillStyle = '#c8c8d0';
            g.fillText(m.name, x + 4, 7);
            g.restore();
        });
        const lines = barLines(p.meters, 0, beats);
        const every = Math.max(1, Math.ceil(28 / (ppb * (lines[1] - lines[0] || 4))));
        lines.forEach((b, i)=>
        {
            if (i % every) return;
            g.fillStyle = '#55555f';
            g.fillRect(b * ppb, 18, 1, h - 18);
            g.fillStyle = '#9898a4';
            g.fillText(String(i + 1), b * ppb + 3, 25);
        });
        if (p.loop)
        {
            g.fillStyle = 'rgba(111,208,140,.25)';
            g.fillRect(p.loop.from * ppb, h - 4, (p.loop.to - p.loop.from) * ppb, 4);
        }
    });
    const click = (e)=>
    {
        const r = e.currentTarget.getBoundingClientRect();
        seek((e.clientX - r.left) / ppb);
    };
    return <div class="bars" style={{ width: px(beats * ppb) }} onPointerDown={click}><canvas ref={ref} /></div>;
}

/** the chord track: the project's chords, and a stretch dragged out to whistle a chord for */
function ChordLane({ beats, ppb })
{
    const p = project.value;
    const ref = useCanvas((g, w, h)=>
    {
        g.font = '11px -apple-system, system-ui, sans-serif';
        g.textBaseline = 'middle';
        for (const c of p.chords)
        {
            const a = c.beat * ppb, b = (c.beat + c.beats) * ppb;
            g.fillStyle = c.symbol ? 'rgba(127,180,255,.22)' : 'rgba(255,255,255,.06)';
            g.fillRect(a + 1, 3, b - a - 2, h - 6);
            if (b - a > 22) { g.fillStyle = '#d0d0d8'; g.fillText(c.name, a + 4, h / 2); }
        }
        const r = chordRange.value;
        if (r)
        {
            g.fillStyle = 'rgba(140,190,255,.18)';
            g.fillRect(r.beat * ppb, 0, r.beats * ppb, h);
            g.fillStyle = 'rgba(140,190,255,.8)';
            g.fillRect(r.beat * ppb, 0, 1, h); g.fillRect((r.beat + r.beats) * ppb - 1, 0, 1, h);
        }
    });
    const down = (e)=>
    {
        focus.value = 'chords';
        const r = e.currentTarget.getBoundingClientRect();
        const at = (x)=> (x - r.left) / ppb;
        const from = at(e.clientX);
        const pick = (m)=>
        {
            const a = snapTo(Math.min(from, at(m.clientX)), m), b = snapTo(Math.max(from, at(m.clientX)), m);
            const bar = barAt(project.value.meters, a);
            chordRange.value = { beat: a, beats: Math.max(b - a, m.shiftKey ? 1 : bar.beatsPerBar) };
        };
        pick(e);
        const up = ()=> { removeEventListener('pointermove', pick); removeEventListener('pointerup', up); };
        addEventListener('pointermove', pick);
        addEventListener('pointerup', up);
    };
    return <div class="lane" style={{ width: px(beats * ppb) }} onPointerDown={down}><canvas ref={ref} /></div>;
}

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
            g.globalAlpha = ghost ? 0.5 : 1;
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
            removeEventListener('pointerup', up);
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
        addEventListener('pointerup', up);
    };

    const dblclick = (e)=>
    {
        const b = beatAt(e), c = clipAt(b);
        if (c) { setSettings({ editorTab: 'roll' }); return; }
        const meters = project.value.meters, start = barAt(meters, b).start;
        let id = '';
        edit(p => { id = newId(p, 'c'); return addClip(p, track.id, { id, start, beats: barAt(meters, start).beatsPerBar * NEW_CLIP_BARS, notes: [] }); });
        selectedClip.value = { track: track.id, clip: id };
    };

    const hover = (e)=>
    {
        const b = beatAt(e), c = clipAt(b);
        e.currentTarget.style.cursor = c && (c.start + c.beats - b) * ppb <= EDGE ? 'ew-resize' : c ? 'grab' : '';
    };

    const [dropping, setDropping] = useState(false);
    const isFiles = (e)=> e.dataTransfer?.types.includes('Files') || e.dataTransfer?.types.includes('application/x-take');
    return (
        <div class={`lane ${dropping ? 'drop' : ''}`} style={{ width: px(beats * ppb) }} onPointerDown={down} onDblClick={dblclick} onPointerMove={hover}
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

/** puts an instrument on a track */
export function assignPreset(trackId, { bank, program })
{
    edit(p => updateTrack(p, trackId, { instrument: { bank, program } }));
}

function TrackRow({ track, beats, ppb })
{
    const [drop, setDrop] = useState(false);
    settings.value.library;
    const m = track.mixer;
    const rename = async ()=>
    {
        const name = await askText('Track name', track.name, 'Rename');
        if (name) edit(p => updateTrack(p, track.id, { name }));
    };
    return (
        <div class={`track ${selected.value === track.id ? 'on' : ''} ${drop ? 'drop' : ''}`} data-id={track.id} style={{ '--track': rgba(track.color) }}
            onDragOver={(e)=> { if (isPreset(e)) { e.preventDefault(); setDrop(true); } }}
            onDragLeave={()=> setDrop(false)}
            onDrop={(e)=> { setDrop(false); if (!isPreset(e)) return; e.preventDefault(); assignPreset(track.id, JSON.parse(e.dataTransfer.getData('application/x-preset'))); }}>
            <div class="head" onClick={()=> { selected.value = track.id; }}>
                <span class="name" onDblClick={rename} title="Double-click to rename">{track.name}</span>
                <span class="inst">{presetFor(track.instrument.bank, track.instrument.program).name}</span>
                <div class="ms" onClick={(e)=> e.stopPropagation()}>
                    <button class={`mute ${m.mute ? 'on' : ''}`} title="Mute" onClick={()=> edit(p => setMixer(p, track.id, { mute: !m.mute }))}>M</button>
                    <button class={`solo ${m.solo ? 'on' : ''}`} title="Solo" onClick={()=> edit(p => setMixer(p, track.id, { solo: !m.solo }))}>S</button>
                    <button class="del" title="Delete the track" onClick={()=> edit(p => removeTrack(p, track.id))}>×</button>
                </div>
            </div>
            <Lane track={track} beats={beats} ppb={ppb} />
        </div>
    );
}

function addNewTrack()
{
    let id = '';
    edit(p => { const t = makeTrack(p, { name: `Track ${p.tracks.length + 1}` }); id = t.id; return addTrack(p, t); });
    selected.value = id;
    setSettings({ browserTab: 'instruments', browserOpen: true });
}

/** px per beat: the zoom, or the project fitted to the window; a canvas wider than ~32k px doesn't draw */
function fitted()
{
    const beats = span();
    return Math.min(zoom.value || Math.max(ZOOM[0], width.value / beats) || 8, 30000 / beats);
}

export function Arrange()
{
    const scroller = useRef(/** @type {HTMLDivElement|null} */ (null));
    const p = project.value;
    const beats = span();
    // a new project is fitted to the window, and stays fitted as the window resizes until zoomed
    const first = p.tracks[0]?.id;
    useEffect(()=> { zoom.value = 0; if (scroller.current) scroller.current.scrollLeft = 0; }, [p.title, first]);
    useEffect(()=>
    {
        const el = scroller.current;
        if (!el) return;
        const observer = new ResizeObserver(()=> { width.value = el.clientWidth - HEAD_W - 12; });
        observer.observe(el);
        return ()=> observer.disconnect();
    }, []);
    // Cmd/Ctrl + wheel zooms around the pointer
    useEffect(()=>
    {
        const el = scroller.current;
        if (!el) return;
        const wheel = (e)=>
        {
            if (!(e.metaKey || e.ctrlKey)) return;
            e.preventDefault();
            const r = el.getBoundingClientRect();
            const x = e.clientX - r.left - HEAD_W + el.scrollLeft;
            const was = fitted(), at = x / was;
            zoom.value = Math.max(ZOOM[0], Math.min(ZOOM[1], was * Math.exp(-e.deltaY * 0.004)));
            el.scrollLeft = at * zoom.value - (e.clientX - r.left - HEAD_W);
        };
        el.addEventListener('wheel', wheel, { passive: false });
        return ()=> el.removeEventListener('wheel', wheel);
    }, []);
    const ppb = fitted();
    const marker = p.markers.findLast(m => m.beat <= beat.value + 1e-9);
    const range = chordRange.value;
    return (
        <div class="arrange">
            <div class="scroll" ref={scroller}>
                <div class="rows" style={{ width: px(HEAD_W + beats * ppb) }}>
                    <div class="ruler">
                        <div class="head">{marker?.name ?? ''}</div>
                        <Ruler beats={beats} ppb={ppb} />
                    </div>
                    <div class="track chords">
                        <div class="head" title="Drag across the chord track to pick a stretch, then press ● and whistle the chord">
                            <span class="name">Chords</span>
                            <span class="inst">{range ? 'Press ● and whistle the chord' : 'Drag to pick a stretch'}</span>
                        </div>
                        <ChordLane beats={beats} ppb={ppb} />
                    </div>
                    {p.tracks.map(t => <TrackRow key={t.id} track={t} beats={beats} ppb={ppb} />)}
                    <div class="add-track"><button onClick={addNewTrack} title="Add a track">+ Track</button></div>
                    <div class="playhead" style={{ left: px(HEAD_W + beat.value * ppb) }} />
                </div>
            </div>
        </div>
    );
}
