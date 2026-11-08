// The arrangement's ruler: markers, bar numbers and the loop. Click it to move the playhead, or drag along it to loop
// the bars dragged over.
import { barLines } from '../../daw/meter.js';
import { projectEnd } from '../../daw/project.js';
import { project } from '../store.js';
import { edit } from '../document.js';
import { seek } from '../player.js';
import { rulerMenu } from '../context-menus.js';
import { useCanvas } from './canvas.js';
import { px, snapTo } from './arrange-view.js';

export function Ruler({ beats, ppb })
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
    const at = (e)=> (e.clientX - e.currentTarget.getBoundingClientRect().left) / ppb;
    // a click seeks; a drag loops the bars it covers, snapped to bar lines (beats with Shift)
    const down = (e)=>
    {
        if (e.button !== 0) return;
        const el = e.currentTarget, left = el.getBoundingClientRect().left, x0 = e.clientX, from = at(e);
        el.setPointerCapture(e.pointerId);
        let looping = false;
        const move = (m)=>
        {
            if (!looping && Math.abs(m.clientX - x0) < 4) return;
            looping = true;
            const to = (m.clientX - left) / ppb;
            const a = snapTo(Math.min(from, to), m), b = snapTo(Math.max(from, to), m);
            if (b > a) edit(q => ({ ...q, loop: { from: a, to: b } }), `loop ${e.timeStamp}`);
        };
        const up = ()=>
        {
            el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
            if (!looping) seek(from);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    };
    return (
        <div class="bars" style={{ width: px(beats * ppb) }} onPointerDown={down}
            onContextMenu={(e)=> { e.preventDefault(); rulerMenu(at(e)); }}><canvas ref={ref} /></div>
    );
}
