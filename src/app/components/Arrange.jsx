// The arrangement: a ruler of bars and markers, the chord track, then a row per track. Cmd/Ctrl + wheel zooms. While
// playing, the view scrolls to keep the playhead in sight (Follow Playhead).
import { useEffect, useRef } from 'preact/hooks';
import { project, chordRange, beat, playing, settings } from '../store.js';
import { arrangeZoom as zoom, arrangePpb, addNewTrack } from '../tracks.js';
import { HEAD_W, ZOOM, width, px, span, fitted } from './arrange-view.js';
import { Ruler } from './Ruler.jsx';
import { ChordLane } from './ChordLane.jsx';
import { TrackRow } from './TrackRow.jsx';

// The parts that move with the playhead read `beat` in components of their own, so a frame of playback re-renders
// them and not the lanes.

/** the marker the playhead is in */
function MarkerName()
{
    const now = beat.value;
    return project.value.markers.findLast(m => m.beat <= now + 1e-9)?.name ?? '';
}

/** the playhead; while playing, one that runs off the right (or is left of the view) brings the view along a page */
function Playhead({ ppb, scroller })
{
    const now = beat.value;
    useEffect(()=>
    {
        const el = scroller.current;
        if (!el || !playing.value || !settings.value.follow) return;
        const x = now * ppb, view = el.clientWidth - HEAD_W;
        if (x > el.scrollLeft + view - 20 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 20);
    }, [now, ppb]);
    return <div class="playhead" style={{ left: px(HEAD_W + now * ppb) }} />;
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
    useEffect(()=> { arrangePpb.value = ppb; }, [ppb]);
    const range = chordRange.value;
    return (
        <div class="arrange">
            <div class="scroll" ref={scroller}>
                <div class="rows" style={{ width: px(HEAD_W + beats * ppb) }}>
                    <div class="ruler">
                        <div class="head"><MarkerName /></div>
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
                    <div class="add-track"><button onClick={()=> addNewTrack()} title="Add a track">+ Track</button></div>
                    <Playhead ppb={ppb} scroller={scroller} />
                </div>
            </div>
        </div>
    );
}
