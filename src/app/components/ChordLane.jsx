// The chord track: the project's chords, and a stretch dragged out to whistle a chord for.
import { barAt } from '../../daw/meter.js';
import { project, chordRange } from '../store.js';
import { focus } from '../focus.js';
import { chordMenu } from '../context-menus.js';
import { useCanvas } from './canvas.js';
import { px, snapTo } from './arrange-view.js';

export function ChordLane({ beats, ppb })
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
        if (e.button !== 0) return;
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
        const up = ()=> { removeEventListener('pointermove', pick); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
        addEventListener('pointermove', pick);
        addEventListener('pointerup', up); addEventListener('pointercancel', up);
    };
    const menu = (e)=> { e.preventDefault(); chordMenu((e.clientX - e.currentTarget.getBoundingClientRect().left) / ppb); };
    return <div class="lane" style={{ width: px(beats * ppb) }} onPointerDown={down} onContextMenu={menu}><canvas ref={ref} /></div>;
}
