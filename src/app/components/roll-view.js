// What the piano roll's parts share: the part of the roll shown, its geometry on a canvas, the selection rectangle
// and snapping to the grid.
import { signal } from '@preact/signals';
import { settings } from '../store.js';

export const GUTTER = 46;       // px of note names at the left
export const STRIP = 26;        // px of chord names above the lanes
export const PPB = [4, 400];
export const LANE_H = 12;
export const VEL_H = 44;
export const EDGE = 5;          // px at a note's right edge that resize it

/** a selection rectangle being dragged out: two corners as { beat, key } */
export const band = signal(/** @type {{ a: { beat: number, key: number }, b: { beat: number, key: number } }|null} */ (null));
/** what's shown: from beat, px per beat, and the key at the bottom */
export const view = signal({ from: 0, ppb: 40, low: 48 });

/** the view's geometry for a canvas of w × h */
export function geometry(w, h)
{
    const { from, ppb, low } = view.value;
    const top = STRIP + 4, bottom = h - VEL_H;
    const rows = Math.ceil((bottom - top) / LANE_H);
    const L = { lo: low, hi: low + rows - 1, laneH: LANE_H, y: (k)=> bottom - (k - low + 1) * LANE_H };
    return {
        L, top, bottom, w, h, from, ppb,
        x: (b)=> GUTTER + (b - from) * ppb,
        beatAt: (x)=> from + (x - GUTTER) / ppb,
        keyAt: (y)=> low + Math.floor((bottom - y) / LANE_H),
    };
}

/** the beat snapped to the grid, unless Alt */
export const snap = (b, e)=> e.altKey ? b : Math.round(b / settings.value.grid) * settings.value.grid;
