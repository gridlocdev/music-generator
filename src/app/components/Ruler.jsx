// The arrangement's ruler: markers, a flag for each tempo and meter change, bar numbers and the loop. Click it to
// move the playhead, or drag along it to loop the bars dragged over. Right-click or double-click a flag to change it.
import { barLines } from '../../daw/meter.js';
import { projectEnd } from '../../daw/project.js';
import { project } from '../store.js';
import { edit } from '../document.js';
import { seek } from '../player.js';
import { rulerMenu } from '../context-menus.js';
import { timelineFlags, flagMenu, editFlag } from '../timeline.js';
import { useCanvas } from './canvas.js';
import { px, snapTo } from './arrange-view.js';

const FLAGS = [15, 29];         // px: the row of tempo and meter flags
/** the flags as last drawn, with where they are, for clicks to find */
let shown = /** @type {{ flag: ReturnType<typeof timelineFlags>[number], x: number, w: number }[]} */ ([]);

/** the flags that fit, left to right, each starting at its beat and none over another */
function drawFlags(g, p, ppb)
{
    shown = [];
    let right = -Infinity;
    for (const flag of timelineFlags(p))
    {
        const x = flag.beat * ppb, w = g.measureText(flag.label).width + 8;
        const at = Math.max(x, right + 2);
        if (at - x > w) continue;
        g.fillStyle = flag.kind === 'tempo' ? 'rgba(255,199,102,.2)' : 'rgba(127,180,255,.22)';
        g.fillRect(at, FLAGS[0], w, FLAGS[1] - FLAGS[0]);
        g.fillStyle = flag.kind === 'tempo' ? '#ffc766' : '#8fbfff';
        g.fillRect(x, FLAGS[0], 1, FLAGS[1] - FLAGS[0]);
        g.fillStyle = '#e0e0e6';
        g.fillText(flag.label, at + 4, (FLAGS[0] + FLAGS[1]) / 2);
        shown.push({ flag, x: at, w });
        right = at + w;
    }
}

/** the flag under a pointer event, if any */
function flagAt(e)
{
    const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    return y >= FLAGS[0] && y < FLAGS[1] ? shown.find(s => x >= s.x && x < s.x + s.w)?.flag : undefined;
}

export function Ruler({ beats, ppb })
{
    const p = project.value;
    const ref = useCanvas((g, w, h)=>
    {
        g.font = '11px -apple-system, system-ui, sans-serif';
        g.textBaseline = 'middle';
        drawFlags(g, p, ppb);
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
            g.fillRect(b * ppb, FLAGS[1] + 2, 1, h - FLAGS[1] - 2);
            g.fillStyle = '#9898a4';
            g.fillText(String(i + 1), b * ppb + 3, FLAGS[1] + 9);
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
        if (e.button !== 0 || flagAt(e)) return;
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
            onDblClick={(e)=> { const f = flagAt(e); if (f) editFlag(f); }}
            onContextMenu={(e)=> { e.preventDefault(); const f = flagAt(e); f ? flagMenu(f) : rulerMenu(at(e)); }}><canvas ref={ref} /></div>
    );
}
