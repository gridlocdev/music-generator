// The piano roll for the selected track: a song's track as it was composed (read-only), with its chords above and
// the playhead, or the whistle track's editor.
import { signal } from '@preact/signals';
import { ROLE_COLORS } from '../../composer/composer-data.js';
import { barLines } from '../../composer/meter.js';
import { song, tracks, selected, beat, playing } from '../store.js';
import { seek } from '../player.js';
import { useCanvas, rgba } from './canvas.js';
import { GUTTER, STRIP, C, text, lanes } from './roll-draw.js';
import { Whistle } from './Whistle.jsx';

const PPB = [4, 200];
const view0 = signal({ from: 0, ppb: 24 });

function ScoreRoll({ i })
{
    const score = song.value?.score;
    const track = score?.tracks[i];
    const t = tracks.value[i];
    const color = ROLE_COLORS[t?.role] ?? ROLE_COLORS.lead;
    const ref = useCanvas((g, w, h)=>
    {
        if (!track) return;
        const { ppb } = view0.value;
        let { from } = view0.value;
        const now = beat.value, shown = (w - GUTTER) / ppb;
        // while playing, the view turns the page when the playhead reaches its edge
        if (playing.value && (now < from || now > from + shown)) { from = now; queueMicrotask(()=> { view0.value = { ...view0.value, from }; }); }
        const keys = track.notes.map(n => n.key);
        let lo = Math.min(...keys) - 2, hi = Math.max(...keys) + 2;
        if (hi - lo + 1 < 12) { lo -= Math.floor((12 - (hi - lo + 1)) / 2); hi = lo + 11; }
        const top = STRIP + 4, laneH = (h - top) / (hi - lo + 1);
        const L = { lo, hi, laneH, y: (k)=> h - (k - lo + 1) * laneH };
        const x = (b)=> GUTTER + (b - from) * ppb;
        const sec = score.sections.find(s => now >= s.beat && now < s.beat + s.beats) ?? score.sections[0];
        lanes(g, L, { tonic: sec.tonic, mode: sec.mode }, w);
        for (const b of barLines(score.sections, Math.max(0, from), from + shown))
        {
            g.fillStyle = C.bar;
            g.fillRect(x(b), top, 1, h - top);
        }
        for (const c of score.chords)
        {
            const a = x(c.beat), b = x(c.beat + c.beats);
            if (b < GUTTER || a > w) continue;
            g.fillStyle = C.chordEdge; g.fillRect(a + 1, 0, b - a - 2, STRIP);
            g.fillStyle = C.chord; g.fillRect(a + 2, 1, b - a - 4, STRIP - 2);
            if (b - a > 20) text(g, c.name, (a + b) / 2, STRIP / 2, 12, C.text, 'center');
        }
        g.save();
        g.beginPath(); g.rect(GUTTER, 0, w - GUTTER, h); g.clip();
        for (const n of track.notes)
        {
            const a = x(n.beat), b = x(n.beat + n.beats);
            if (b < GUTTER || a > w) continue;
            g.fillStyle = rgba(color, 0.35 + 0.6 * Math.min(1, (n.vel ?? 90) / 127));
            g.fillRect(a + 0.5, L.y(n.key) + 1, Math.max(1.5, b - a - 1), L.laneH - 2);
        }
        g.fillStyle = C.playhead;
        g.fillRect(x(now), 0, 1, h);
        g.restore();
    });
    const wheel = (e)=>
    {
        const v = view0.value, beats = score?.beats ?? 0;
        if (e.metaKey || e.ctrlKey)
        {
            const r = e.currentTarget.getBoundingClientRect(), at = v.from + (e.clientX - r.left - GUTTER) / v.ppb;
            const ppb = Math.max(PPB[0], Math.min(PPB[1], v.ppb * Math.exp(-e.deltaY * 0.004)));
            view0.value = { ppb, from: Math.max(0, at - (e.clientX - r.left - GUTTER) / ppb) };
        }
        else view0.value = { ...v, from: Math.max(0, Math.min(beats, v.from + (e.deltaX || e.deltaY) / v.ppb)) };
    };
    const down = (e)=>
    {
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientY - r.top < STRIP + 4 && e.clientX - r.left > GUTTER) seek(view0.value.from + (e.clientX - r.left - GUTTER) / view0.value.ppb);
    };
    return <div class="roll" onWheel={wheel} onPointerDown={down}><canvas ref={ref} /></div>;
}

export function PianoRoll()
{
    const sel = selected.value;
    return sel === 'whistle' ? <Whistle /> : <ScoreRoll i={sel} />;
}
