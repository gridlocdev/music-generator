// The arrangement: a ruler of bars and sections, the whistle track, then one row per track of the song with its
// header (name, instrument, mute, solo) and a lane of section regions holding a sketch of its notes. Click the ruler
// to move the playhead; Cmd/Ctrl + wheel zooms.
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { ROLE_COLORS } from '../../composer/composer-data.js';
import { barLines, barAt } from '../../composer/meter.js';
import { presetFor } from '../../composer/band-loader.js';
import { song, tracks, setTrack, selected, beat, settings } from '../store.js';
import { seek } from '../player.js';
import { pad, padTick, dropFiles } from '../sketchpad.js';
import { chordsOf } from '../../sketch/takes.js';
import { assignPreset } from './Browser.jsx';
import { useCanvas, rgba } from './canvas.js';

const HEAD_W = 200;
const WHISTLE = [0.55, 0.85, 1];
const ZOOM = [0.5, 120];        // px per beat
/** px per beat, or 0 to fit the song to the window */
const zoom = signal(0);
/** the arrangement's width for lanes, px */
const width = signal(0);

/** Preact sets numbers in style as they are, with no unit */
const px = (n)=> `${n}px`;
const end = (list)=> Math.max(0, ...list.map(n => n.beat + n.beats));

/** the beats the arrangement spans: the song, or the whistled take if it's longer */
function span()
{
    padTick.value;
    return Math.max(song.value?.score.beats ?? 0, end(pad.take?.notes ?? []), 16);
}

function Ruler({ beats, ppb })
{
    const score = song.value?.score;
    const ref = useCanvas((g, w, h)=>
    {
        if (!score) return;
        g.font = '11px -apple-system, system-ui, sans-serif';
        g.textBaseline = 'middle';
        for (const s of score.sections)
        {
            const x = s.beat * ppb;
            g.fillStyle = 'rgba(255,255,255,.05)';
            g.fillRect(x, 0, s.beats * ppb, 14);
            g.fillStyle = '#6a6a76';
            g.fillRect(x, 0, 1, 14);
            g.save();
            g.beginPath(); g.rect(x, 0, s.beats * ppb - 2, 14); g.clip();
            g.fillStyle = '#c8c8d0';
            g.fillText(s.label ?? s.type, x + 4, 7);
            g.restore();
        }
        const every = Math.max(1, Math.ceil(28 / (ppb * score.beatsPerBar)));
        barLines(score.sections, 0, beats).forEach((b, i)=>
        {
            if (i % every) return;
            g.fillStyle = '#55555f';
            g.fillRect(b * ppb, 18, 1, h - 18);
            g.fillStyle = '#9898a4';
            g.fillText(String(i + 1), b * ppb + 3, 25);
        });
    });
    const click = (e)=>
    {
        const r = e.currentTarget.getBoundingClientRect();
        seek((e.clientX - r.left) / ppb);
    };
    return <div class="bars" style={{ width: px(beats * ppb) }} onPointerDown={click}><canvas ref={ref} /></div>;
}

/** a score track's lane: its sections as regions, its notes drawn small inside them */
function Lane({ track, color, beats, ppb })
{
    const score = song.value?.score;
    const ref = useCanvas((g, w, h)=>
    {
        if (!score || !track) return;
        const keys = track.notes.map(n => n.key);
        const lo = Math.min(...keys) - 1, hi = Math.max(...keys) + 1;
        const noteH = Math.max(1.5, Math.min(4, (h - 18) / (hi - lo + 1)));
        for (const s of score.sections)
        {
            const a = s.beat * ppb + 1, b = (s.beat + s.beats) * ppb - 1;
            if (!track.notes.some(n => n.beat >= s.beat && n.beat < s.beat + s.beats)) continue;
            g.fillStyle = rgba(color, 0.16);
            g.beginPath(); g.roundRect(a, 3, b - a, h - 6, 4); g.fill();
            g.fillStyle = rgba(color, 0.6);
            g.fillRect(a, 3, b - a, 1);
        }
        g.fillStyle = rgba(color, 0.9);
        const inner = h - 18;
        for (const n of track.notes)
        {
            const y = 9 + (hi - n.key) / (hi - lo) * (inner - noteH);
            g.fillRect(n.beat * ppb, y, Math.max(1, n.beats * ppb - 1), noteH);
        }
    });
    return <div class="lane" style={{ width: px(beats * ppb) }}><canvas ref={ref} /></div>;
}

/** the whistle track's lane: the melody take in view and the chords over it */
function WhistleLane({ beats, ppb })
{
    const ref = useCanvas((g, w, h)=>
    {
        padTick.value;
        const take = pad.take;
        if (!take?.notes?.length) return;
        g.font = '11px -apple-system, system-ui, sans-serif';
        g.textBaseline = 'middle';
        for (const c of chordsOf(take))
        {
            const a = c.beat * ppb, b = (c.beat + c.beats) * ppb;
            g.fillStyle = c.guessed ? 'rgba(255,255,255,.04)' : 'rgba(127,180,255,.18)';
            g.fillRect(a + 1, 3, b - a - 2, 16);
            g.fillStyle = c.guessed ? '#6a6a76' : '#e6e6ea';
            if (b - a > 18) g.fillText(c.symbol, a + 4, 11);
        }
        const keys = take.notes.map(n => n.key);
        const lo = Math.min(...keys) - 1, hi = Math.max(...keys) + 1;
        const top = 24, inner = h - top - 4, noteH = Math.max(2, Math.min(5, inner / (hi - lo + 1)));
        g.fillStyle = rgba(WHISTLE, 0.12);
        g.beginPath(); g.roundRect(1, top - 2, end(take.notes) * ppb, inner + 4, 4); g.fill();
        g.fillStyle = rgba(WHISTLE, 0.95);
        for (const n of take.notes)
            g.fillRect(n.beat * ppb, top + (hi - n.key) / (hi - lo) * (inner - noteH), Math.max(1, n.beats * ppb - 1), noteH);
    });
    return <div class="lane" style={{ width: px(beats * ppb) }}><canvas ref={ref} /></div>;
}

const presetName = (t)=> t.override?.name ?? presetFor(t.bank, t.program).name;
const isPreset = (e)=> e.dataTransfer?.types.includes('application/x-preset');
const isFiles = (e)=> e.dataTransfer?.types.includes('Files');

function TrackRow({ i, beats, ppb })
{
    const t = tracks.value[i];
    const track = song.value?.score.tracks[i];
    const color = ROLE_COLORS[t.role] ?? ROLE_COLORS.lead;
    const [drop, setDrop] = useState(false);
    settings.value.library;
    return (
        <div class={`track ${selected.value === i ? 'on' : ''} ${drop ? 'drop' : ''}`} style={{ '--track': rgba(color) }}
            onDragOver={(e)=> { if (isPreset(e)) { e.preventDefault(); setDrop(true); } }}
            onDragLeave={()=> setDrop(false)}
            onDrop={(e)=> { setDrop(false); if (!isPreset(e)) return; e.preventDefault(); assignPreset(i, JSON.parse(e.dataTransfer.getData('application/x-preset'))); }}>
            <div class="head" onClick={()=> { selected.value = i; }}>
                <span class="name">{t.name}</span>
                <span class="inst" title={t.override ? 'Your pick (the song plays another)' : ''}>{t.override ? '★ ' : ''}{presetName(t)}</span>
                <div class="ms" onClick={(e)=> e.stopPropagation()}>
                    <button class={`mute ${t.mute ? 'on' : ''}`} title="Mute" onClick={()=> setTrack(i, { mute: !t.mute })}>M</button>
                    <button class={`solo ${t.solo ? 'on' : ''}`} title="Solo" onClick={()=> setTrack(i, { solo: !t.solo })}>S</button>
                </div>
            </div>
            <Lane track={track} color={color} beats={beats} ppb={ppb} />
        </div>
    );
}

function WhistleRow({ beats, ppb })
{
    padTick.value;
    const [drop, setDrop] = useState(false);
    const take = pad.take;
    const info = pad.rec ? 'Recording…' : take ? `Take ${take.n}${take.key ? ` · ${take.key.key} ${take.key.mode}` : ''}` : 'Press ● or drop audio';
    return (
        <div class={`track whistle ${selected.value === 'whistle' ? 'on' : ''} ${drop ? 'drop' : ''}`} style={{ '--track': rgba(WHISTLE) }}
            onDragOver={(e)=> { if (isFiles(e)) { e.preventDefault(); setDrop(true); } }}
            onDragLeave={()=> setDrop(false)}
            onDrop={(e)=> { setDrop(false); if (!isFiles(e)) return; e.preventDefault(); dropFiles([...e.dataTransfer.files]); }}>
            <div class="head" onClick={()=> { selected.value = 'whistle'; }}>
                <span class="name">Whistle</span>
                <span class="inst">{info}</span>
            </div>
            <WhistleLane beats={beats} ppb={ppb} />
        </div>
    );
}

/** px per beat: the zoom, or the song fitted to the window; a canvas wider than ~32k px doesn't draw */
function fitted()
{
    const beats = span();
    return Math.min(zoom.value || Math.max(ZOOM[0], width.value / beats) || 8, 30000 / beats);
}

export function Arrange()
{
    const scroller = useRef(/** @type {HTMLDivElement|null} */ (null));
    const s = song.value;
    const beats = span();
    // a new song is fitted to the window, and stays fitted as the window resizes until zoomed
    useEffect(()=> { zoom.value = 0; if (scroller.current) scroller.current.scrollLeft = 0; }, [s?.score]);
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
    const score = s?.score;
    const sectionIndex = score ? barAt(score.sections, beat.value).section : 0;
    return (
        <div class="arrange">
            <div class="scroll" ref={scroller}>
                <div class="rows" style={{ width: px(HEAD_W + beats * ppb) }}>
                    <div class="ruler">
                        <div class="head">{score ? `${score.sections.length} sections · ${score.sections[sectionIndex]?.label ?? ''}` : ''}</div>
                        <Ruler beats={beats} ppb={ppb} />
                    </div>
                    <WhistleRow beats={beats} ppb={ppb} />
                    {tracks.value.map((_, i)=> <TrackRow i={i} beats={beats} ppb={ppb} />)}
                    {score && <div class="playhead" style={{ left: px(HEAD_W + beat.value * ppb) }} />}
                    {!score && <div class="hint">Pick a song in the browser, or whistle one on the whistle track.</div>}
                </div>
            </div>
        </div>
    );
}
