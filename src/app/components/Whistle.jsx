// The whistle track's editor: the take's pitch trace and the notes read from it, which you can drag up and down,
// the chords whistled or guessed over it, and stretches dragged out to whistle a chord for; and above it the
// recording settings, the takes, the key, and making, copying and saving the sketch.
import { useRef, useState } from 'preact/hooks';
import { noteName } from '../../lib/notes.js';
import { METERS, VIEW } from '../../sketch/sketchpad-data.js';
import { KEYS, chordsOf, snapRange } from '../../sketch/takes.js';
import { beatsPerBar } from '../../sketch/sketch-spec.js';
import { settings, setSettings } from '../store.js';
import { pad, padTick, edited, selectNote, setRange, setKeyChoice, nextReading, view, hearTake, makeSong, copy, save, dropFiles } from '../sketchpad.js';
import { useCanvas, rgba } from './canvas.js';
import { GUTTER, STRIP, C, text, lanes } from './roll-draw.js';

/** where everything goes, in CSS pixels, for drawing and for finding what the pointer is over */
function layout(take, rec, w, h)
{
    if (rec?.kind !== 'melody') rec = null;
    const shown = rec ?? take;
    const x0 = GUTTER, x1 = w - 12;
    const stripY = 6, lanesTop = stripY + STRIP + 6, lanesBottom = h - 6;
    const frames = shown?.frames ?? [];
    const offset = shown?.offset ?? 0;
    let t0, t1;
    if (rec) { t1 = Math.max(VIEW.liveSeconds, rec.playhead + 0.5); t0 = t1 - VIEW.liveSeconds; }
    else
    {
        t0 = Math.min(frames[0]?.time ?? 0, shown?.origin ?? 0) - 0.2;
        t1 = Math.max(t0 + 2, (frames.at(-1)?.time ?? 0) + 0.3);
    }
    // the lanes cover what was whistled, with a little room, and never fewer than VIEW.minLanes
    const keys = frames.filter(f => f.midi !== null && f.time >= t0).map(f => f.midi - offset);
    for (const n of shown?.notes ?? []) keys.push(n.key);
    let lo = keys.length ? Math.floor(Math.min(...keys)) - 2 : VIEW.range[0];
    let hi = keys.length ? Math.ceil(Math.max(...keys)) + 2 : VIEW.range[1];
    if (rec) { lo = Math.min(lo, VIEW.range[0]); hi = Math.max(hi, VIEW.range[1]); }
    if (hi - lo + 1 < VIEW.minLanes) { const grow = VIEW.minLanes - (hi - lo + 1); lo -= Math.floor(grow / 2); hi += Math.ceil(grow / 2); }
    const laneH = (lanesBottom - lanesTop) / (hi - lo + 1);
    const pxPerSec = (x1 - x0) / (t1 - t0);
    const beatSec = 60 / (shown?.gridTempo ?? shown?.tempo ?? 60);
    const origin = shown?.gridOrigin ?? shown?.origin ?? 0;
    return {
        x0, x1, stripY, lanesTop, lanesBottom, lo, hi, laneH, t0, t1, offset, origin, beatSec,
        x: (t)=> x0 + (t - t0) * pxPerSec,
        y: (key)=> lanesBottom - (key - lo + 1) * laneH,
        key: (y)=> lo + Math.floor((lanesBottom - y) / laneH),
        beatX: (b)=> x0 + (origin + b * beatSec - t0) * pxPerSec,
        beatAt: (x)=> (t0 + (x - x0) / pxPerSec - origin) / beatSec,
    };
}

const noteAt = (L, notes, p)=> notes.findIndex(n =>
    p.x >= L.beatX(n.beat) && p.x < L.beatX(n.beat + n.beats) && p.y >= L.y(n.key) && p.y < L.y(n.key) + L.laneH);
const chordAt = (L, chords, p)=> p.y < L.stripY || p.y > L.stripY + STRIP ? -1
    : chords.findIndex(c => p.x >= L.beatX(c.beat) && p.x < L.beatX(c.beat + c.beats));

/** the note the mic hears now, and how far off it is */
function liveNote(g, L, rec)
{
    const f = rec.frames.findLast(fr => fr.time > rec.seconds - 0.08 && fr.midi !== null);
    if (!f) return;
    const k = Math.round(f.midi), cents = Math.round(100 * (f.midi - k));
    text(g, `${noteName(k)} ${cents >= 0 ? '+' : ''}${cents}¢`, L.x1 - 8, L.lanesTop + 22, 22, C.text, 'right');
}

function drawWhistle(g, L, w)
{
    let rec = pad.rec;
    const chordRec = rec?.kind === 'chord' ? rec : null;
    if (chordRec) rec = null;
    const take = pad.take, shown = rec ?? take;
    lanes(g, L, shown?.key ?? null, w);
    if (!shown)
    {
        text(g, 'Press ● (or R) and whistle a melody, or drop an audio file here', (L.x0 + L.x1) / 2, (L.lanesTop + L.lanesBottom) / 2, 15, C.label, 'center');
        return;
    }
    const bpb = beatsPerBar(shown.meter);
    // the beat grid: bar lines brighter, beat 0 (the first bar after the count-in) brightest
    const first = Math.ceil((L.t0 - L.origin) / L.beatSec), last = Math.floor((L.t1 - L.origin) / L.beatSec);
    for (let b = first; b <= last; b++)
    {
        const x = L.beatX(b), onBar = ((b % bpb) + bpb) % bpb === 0;
        g.fillStyle = b === 0 ? C.downbeat : onBar ? C.bar : C.beat;
        g.fillRect(x, L.lanesTop, 1, L.lanesBottom - L.lanesTop);
        if (onBar && b >= 0) text(g, String(b / bpb + 1), x + 3, L.lanesTop + 8, 10, C.label);
    }
    // the chords above the lanes: whistled ones solid, guessed ones faint, one picked from its runners-up tinted
    for (const c of rec ? [] : chordsOf(take))
    {
        const a = L.beatX(c.beat), b = L.beatX(c.beat + c.beats);
        if (b < L.x0 || a > L.x1) continue;
        g.fillStyle = c.guessed ? C.guessEdge : C.chordEdge; g.fillRect(a + 1, L.stripY, b - a - 2, STRIP);
        g.fillStyle = c.pick ? C.chordPicked : C.chord; g.fillRect(a + 2, L.stripY + 1, b - a - 4, STRIP - 2);
        text(g, c.symbol, (a + b) / 2, L.stripY + STRIP / 2, 13, c.guessed ? C.guessText : C.text, 'center');
    }
    if (pad.range)
    {
        const a = L.beatX(pad.range.beat), b = L.beatX(pad.range.beat + pad.range.beats);
        g.fillStyle = C.range; g.fillRect(a, L.stripY, b - a, L.lanesBottom - L.stripY);
        g.fillStyle = C.rangeEdge; g.fillRect(a, L.stripY, 2, L.lanesBottom - L.stripY); g.fillRect(b - 2, L.stripY, 2, L.lanesBottom - L.stripY);
    }
    // the notes, then the raw pitch over them so both read
    const notes = shown.notes ?? [];
    notes.forEach((n, i)=>
    {
        const a = L.beatX(n.beat), b = L.beatX(n.beat + n.beats), y = L.y(n.key);
        if (i === pad.note && !rec) { g.fillStyle = C.selected; g.fillRect(a - 1, y - 1, b - a + 1, L.laneH + 2); }
        g.fillStyle = C.melody; g.fillRect(a + 1, y + 1, b - a - 2, L.laneH - 2);
    });
    const dot = Math.max(2, Math.min(3, L.laneH / 5));
    for (const f of shown.frames)
    {
        if (f.midi === null || f.time < L.t0) continue;
        g.fillStyle = rgba(C.trace, 0.35 + 0.6 * f.clarity);
        g.fillRect(L.x(f.time) - dot / 2, L.y(f.midi - L.offset) + L.laneH / 2 - dot / 2, dot, dot);
    }
    for (const n of notes) if (n.vibrato) text(g, '~', L.beatX(n.beat) + 2, L.y(n.key) - 6, 14, C.selected);
    // recording a melody: the playhead, the note being whistled faint up to it, and the count-in
    if (rec)
    {
        const x = L.x(rec.playhead);
        if (rec.live) { g.fillStyle = C.live; g.fillRect(L.x(rec.live.from), L.y(rec.live.key) + 1, Math.max(2, x - L.x(rec.live.from)), L.laneH - 2); }
        g.fillStyle = C.playhead; g.fillRect(x, L.lanesTop, 2, L.lanesBottom - L.lanesTop);
        liveNote(g, L, rec);
        if (rec.countIn > 0) text(g, String(rec.countIn), (L.x0 + L.x1) / 2, (L.lanesTop + L.lanesBottom) / 2, 72, 'rgba(255,199,102,.8)', 'center');
    }
    // whistling a chord: the notes heard, over the stretch it's for
    if (chordRec)
    {
        liveNote(g, L, chordRec);
        const heard = new Set(chordRec.frames.filter(f => f.midi !== null).map(f => noteName(Math.round(f.midi - chordRec.offset)).replace(/-?\d+$/, '')));
        text(g, `Whistle the chord, any order, any octave · heard: ${[...heard].join(' ') || '…'}`, (L.x0 + L.x1) / 2, L.lanesBottom - 14, 14, C.text, 'center');
    }
}

function WhistleRoll()
{
    const L = useRef(/** @type {ReturnType<typeof layout>|null} */ (null));
    const press = useRef(/** @type {any} */ (null));
    const [drop, setDrop] = useState(false);
    const ref = useCanvas((g, w, h)=>
    {
        padTick.value;
        L.current = layout(pad.take, pad.rec, w, h);
        drawWhistle(g, L.current, w);
    });
    const point = (e)=> { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const down = (e)=>
    {
        const take = pad.take, l = L.current;
        if (!take || pad.rec || !l) return;
        const p = point(e);
        if (p.x < l.x0 || p.y < l.stripY) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const i = noteAt(l, take.notes, p);
        selectNote(i);
        press.current = i >= 0 ? { note: i, key: l.key(p.y) }
            : { x: p.x, beat: l.beatAt(p.x), chord: chordAt(l, chordsOf(take), p), moved: false };
    };
    const move = (e)=>
    {
        const pr = press.current, take = pad.take, l = L.current;
        if (!pr || !take || !l) return;
        const p = point(e);
        if (pr.note !== undefined)
        {
            // a note dragged up or down
            const to = l.key(p.y), n = take.notes[pr.note];
            if (n && to !== pr.key) { n.key += to - pr.key; pr.key = to; edited(); }
            return;
        }
        // a stretch dragged out for a chord; Alt snaps to beats instead of half bars
        if (Math.abs(p.x - pr.x) > 5) pr.moved = true;
        if (pr.moved) { pad.note = -1; setRange(snapRange(pr.beat, l.beatAt(p.x), take.meter, e.altKey)); }
    };
    const up = ()=>
    {
        const pr = press.current;
        press.current = null;
        if (!pr || pr.note !== undefined || pr.moved) return;
        // a click, not a drag: a chord steps to its next reading, anywhere else clears the stretch
        if (pr.chord >= 0) nextReading(chordsOf(pad.take)[pr.chord]);
        setRange(null);
    };
    const files = (e)=> e.dataTransfer?.types.includes('Files');
    return (
        <div class={`roll ${drop ? 'drop' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up}
            onDragOver={(e)=> { if (files(e)) { e.preventDefault(); setDrop(true); } }}
            onDragLeave={()=> setDrop(false)}
            onDrop={(e)=> { setDrop(false); if (!files(e)) return; e.preventDefault(); dropFiles([...e.dataTransfer.files]); }}>
            <canvas ref={ref} />
        </div>
    );
}

function WhistleBar()
{
    padTick.value;
    const s = settings.value.sketch;
    const set = (patch)=> setSettings({ sketch: patch });
    const melodies = pad.takes.filter(t => t.kind === 'melody');
    const ready = !!pad.take?.key && !pad.rec;
    return (
        <div class="toolbar">
            <label title="The tempo you whistle at, with a click">Whistle
                <input type="number" min="30" max="200" value={s.tempo} onChange={(e)=> set({ tempo: Number(e.currentTarget.value) || s.tempo })} /> bpm</label>
            <select value={s.meter} onChange={(e)=> set({ meter: e.currentTarget.value })} title="Meter">
                {METERS.map(m => <option value={m}>{m}</option>)}
            </select>
            <label title="Keep clicking after the count-in"><input type="checkbox" checked={s.click} onChange={(e)=> set({ click: e.currentTarget.checked })} /> Click</label>
            <span class="sep" />
            {melodies.length > 0 && (
                <select value={pad.take?.n ?? ''} onChange={(e)=> view(melodies.find(t => t.n === Number(e.currentTarget.value)))} title="The take in view">
                    {melodies.map(t => <option value={t.n} title={t.source}>Take {t.n}</option>)}
                </select>
            )}
            <button disabled={!pad.take?.samples || !!pad.rec} onClick={hearTake} title="Hear the take as whistled">▶ Take</button>
            <select value={pad.keyChoice} onChange={(e)=> setKeyChoice(e.currentTarget.value)} title="The key: guessed from the notes, or one you pick">
                <option value="auto">Key: {pad.take?.key ? `${pad.take.key.key} ${pad.take.key.mode}` : 'auto'}</option>
                {KEYS.map(k => <option value={k}>{k}</option>)}
            </select>
            <span class="sep" />
            <label title="The tempo the song plays at">Song
                <input type="number" min="30" max="240" value={s.songTempo} onChange={(e)=> set({ songTempo: Number(e.currentTarget.value) || s.songTempo })} /> bpm</label>
            <button disabled={!ready} onClick={makeSong} title="Compose a band around the sketch and play it in the arrangement">Make song</button>
                        <button disabled={!ready} onClick={copy} title="Copy the sketch as a section for a *-songs-data.js file">Copy</button>
            <input type="text" value={s.name} size={10} onChange={(e)=> set({ name: e.currentTarget.value.replace(/[^\w-]/g, '') || 'sketch' })} title="The ideas/ folder to save to" />
            <button disabled={!ready} onClick={save} title="Save the takes and the sketch into ideas/">Save</button>
        </div>
    );
}

const HELP = 'Drag a note up or down · ↑↓ move · ←→ select · V vibrato · Delete removes · drag across bars, then ● to whistle a chord (Alt: by beats) · click a chord for the next reading';

export function Whistle()
{
    padTick.value;
    return (
        <>
            <WhistleBar />
            <WhistleRoll />
            <div class="message">{pad.message || <span class="help">{pad.take ? HELP : 'A–\' play the selected track\'s instrument · Z X octave · Space play · R record'}</span>}</div>
        </>
    );
}
