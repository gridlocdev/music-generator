// What both piano rolls draw with: the colours, text, and a key's lanes with note names in the gutter.
import { MODES } from '../../lib/music-theory.js';
import { noteName } from '../../lib/notes.js';
import { VIEW } from '../../sketch/sketchpad-data.js';
import { held } from '../live.js';

export const GUTTER = VIEW.gutter, STRIP = VIEW.chordStrip;
const FONT = '-apple-system, system-ui, sans-serif';
export const C = {
    lane: 'rgba(255,255,255,.025)', inKey: 'rgba(255,255,255,.07)', tonic: 'rgba(255,199,102,.16)', held: 'rgba(127,180,255,.45)',
    beat: 'rgba(255,255,255,.07)', bar: 'rgba(255,255,255,.22)', downbeat: 'rgba(255,199,102,.5)',
    label: '#9898a4', text: '#e6e6ea', selected: '#ffffff', melody: 'rgba(255,199,102,.85)', live: 'rgba(255,199,102,.3)',
    chord: '#403856', chordEdge: '#7f75a0', chordPicked: '#6b4d33', guessEdge: '#514c61', guessText: '#9994ad',
    range: 'rgba(140,190,255,.12)', rangeEdge: 'rgba(140,190,255,.7)', playhead: '#ff5a5a', trace: [0.55, 0.85, 1],
};

export function text(g, s, x, y, size, color, align = 'left')
{
    g.font = `${size}px ${FONT}`;
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(s, x, y);
}

/** the key's lanes, with note names in the gutter; keys held on the keyboard light up */
export function lanes(g, L, key, w)
{
    const scale = key ? new Set(MODES[key.mode].map(i => (key.tonic + i) % 12)) : null;
    const on = held.value;
    for (let k = L.lo; k <= L.hi; k++)
    {
        const pc = ((k % 12) + 12) % 12, tonic = key && pc === key.tonic;
        g.fillStyle = tonic ? C.tonic : scale?.has(pc) ? C.inKey : C.lane;
        g.fillRect(GUTTER, L.y(k) + 1, w - GUTTER, L.laneH - 1);
        if (on.has(k)) { g.fillStyle = C.held; g.fillRect(0, L.y(k) + 1, GUTTER - 2, L.laneH - 1); }
        if (L.laneH >= 11 || pc === 0 || tonic)
            text(g, noteName(k), GUTTER - 6, L.y(k) + L.laneH / 2, Math.min(12, Math.max(9, L.laneH * 0.8)), tonic ? C.text : C.label, 'right');
    }
}
