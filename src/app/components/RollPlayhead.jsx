import { useEffect, useRef } from 'preact/hooks';
import { beat, playing, settings } from '../store.js';
import { GUTTER, view } from './roll-view.js';

/** the playhead over the roll, apart from the canvas so a frame of playback doesn't redraw the notes; while playing
 * (and following), the view turns the page when it reaches an edge */
export function RollPlayhead()
{
    const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
    const now = beat.value, { from, ppb } = view.value;
    const w = ref.current?.parentElement?.clientWidth ?? 0;
    useEffect(()=>
    {
        if (!playing.value || !settings.value.follow || !w) return;
        if (now < from || now > from + (w - GUTTER) / ppb) view.value = { ...view.value, from: now };
    }, [now, w]);
    const x = GUTTER + (now - from) * ppb;
    return <div ref={ref} class="playhead" style={{ left: `${x}px`, display: x < GUTTER || (w && x > w) ? 'none' : '' }} />;
}
