// What the arrangement's parts share: its geometry (the header width, how many beats it spans, px per beat) and
// snapping a beat to the bar.
import { signal } from '@preact/signals';
import { barAt } from '../../daw/meter.js';
import { projectEnd } from '../../daw/project.js';
import { project } from '../store.js';
import { recording } from '../recording.js';
import { arrangeZoom as zoom } from '../tracks.js';

export const HEAD_W = 200;
export const ZOOM = [0.5, 120];        // px per beat
const ROOM = 32;                       // beats of empty space after the end, to add clips in
/** the arrangement's width for lanes, px */
export const width = signal(0);

/** Preact sets numbers in style as they are, with no unit */
export const px = (n)=> `${n}px`;

/** how many beats the arrangement shows: the project, the take being recorded, and room after them */
export function span()
{
    const r = recording.value;
    return Math.max(projectEnd(project.value), r ? r.start + 4 : 0, 16) + ROOM;
}

/** a beat snapped to the bar it's nearest, or to the beat with Shift */
export function snapTo(b, e)
{
    const meters = project.value.meters;
    if (e.shiftKey) return Math.max(0, Math.round(b));
    const at = barAt(meters, b);
    return b - at.start < at.beatsPerBar / 2 ? at.start : at.start + at.beatsPerBar;
}

/** px per beat: the zoom, or the project fitted to the window; a canvas wider than ~32k device px doesn't draw */
export function fitted()
{
    const beats = span();
    return Math.min(zoom.value || Math.max(ZOOM[0], width.value / beats) || 8, 30000 / beats / (devicePixelRatio || 1));
}
