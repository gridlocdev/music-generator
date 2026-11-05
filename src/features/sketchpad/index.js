// The whistle sketchpad: whistle a melody over a click at a tempo of your own (slower than the song is fine) and watch
// it written out as you go, then drag over a stretch of it and whistle that stretch's chord as an arpeggio, freely,
// with no click. Fix a note or pick another chord, hear it played by a band, and copy or save it as a song's
// `melody:` and `progression:`. Stretches with no chord whistled get chords guessed from the melody. Audio files
// dropped on the page become takes too. Saved takes go to ideas/<name>/ through tools/sketch-server.mjs.
import { mousePosScreen, mouseWasPressed, mouseIsDown, keyIsDown, keyWasPressed } from '../../platform/engine.js';
import { input } from '../../platform/input.js';
import { mic } from '../../platform/mic.js';
import { audioEngine } from '../../platform/audio-engine.js';
import { trackPitch } from '../../lib/pitch-track.js';
import { transcribe, tuningOffset, smoothPitch, noteStarts, clickGrid, guessKeys, freeNotes } from '../../lib/transcribe.js';
import { guessChords, nameChord } from '../../lib/chord-guess.js';
import { pitchClass } from '../../lib/music-theory.js';
import { DEFAULTS, METERS } from './sketchpad-data.js';
import { beatsPerBar, sketchSection, sketchSpec, sketchText } from './sketch-spec.js';
import { layout, noteAt, chordAt, drawSketch } from './sketchpad-view.js';
import { saveSketch } from './sketch-files.js';
import { startRecording, takeBlock, updateRecording, stopRecording } from './recorder.js';

const MAJOR = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const KEYS = [...MAJOR.map(k => `${k} major`), ...MINOR.map(k => `${k} minor`)];
const HINT = 'Press ● Record and whistle after the count-in, or drop an audio file here · headphones keep the click out of the take';

let bar;                    // the controls
let settings;               // this feature's save slice
let pad = null;             // the open sketchpad

// ── takes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const sameKey = (a, b)=> a?.tonic === b?.tonic && a?.mode === b?.mode;
const end = (list)=> Math.max(0, ...list.map(x => x.beat + x.beats));

/** the key chosen, or null for auto */
function forcedKey()
{
    if (pad.keyChoice === 'auto') return null;
    const [name, mode] = pad.keyChoice.split(' ');
    return { key: name, tonic: pitchClass(name), mode };
}

/** reads a melody take's notes off its frames, on the click's grid when it had one */
function analyse(take)
{
    const offset = tuningOffset(take.frames), smooth = smoothPitch(take.frames);
    const starts = noteStarts(take.frames, { offset, smooth });
    const grid = take.downbeat === null ? null : clickGrid(starts, take.tempo, take.downbeat);
    const t = transcribe(take.frames, { tempo: take.tempo, starts, grid });
    Object.assign(take, { notes: t.notes, origin: t.origin, gridTempo: t.tempo, offset: t.offset, chords: take.chords ?? [] });
    rekey(take, true);
}

/**
 * A melody take's key (the one chosen, else the likeliest from its notes and its chords' notes), the chords whistled
 * over it named in that key, and chords guessed from its notes for the stretches with none. Chords already named
 * keep their pick unless the key changed.
 */
function rekey(take, notesChanged = false)
{
    const chordNotes = take.chords.flatMap(c => c.notes.map(n => ({ beat: 0, beats: n.seconds, key: n.key })));
    const heard = [...chordNotes, ...take.notes];
    const key = forcedKey() ?? (heard.length ? guessKeys(heard)[0] : null);
    const moved = !sameKey(key, take.key);
    take.key = key;
    if (!key) { take.guesses = []; return; }
    for (const c of take.chords) if (moved || !c.symbol) Object.assign(c, nameChord(c.notes, key), { options: null, pick: 0 });
    if (moved || notesChanged || !take.guesses)
        take.guesses = take.notes.length ? guessChords(take.notes, { tonic: key.tonic, mode: key.mode, beatsPerBar: beatsPerBar(take.meter), melody: true }) : [];
}

/** the chords over a take: whistled ones, and guessed ones cut to fit the stretches between them */
function chordsOf(take)
{
    const whistled = [...take.chords].sort((a, b)=> a.beat - b.beat);
    const gaps = [];
    let at = 0;
    for (const c of whistled) { if (c.beat > at) gaps.push([at, c.beat]); at = Math.max(at, c.beat + c.beats); }
    const last = Math.max(end(take.notes), end(take.guesses));
    if (last > at) gaps.push([at, last]);
    const guessed = [];
    for (const g of take.guesses)
        for (const [a, b] of gaps)
        {
            const from = Math.max(a, g.beat), to = Math.min(b, g.beat + g.beats);
            if (to > from) guessed.push({ beat: from, beats: to - from, symbol: g.symbol, guessed: true, src: g });
        }
    return [...whistled, ...guessed].sort((a, b)=> a.beat - b.beat);
}

/** what the sketch is now: its key, meter, chords and section */
function sketch()
{
    const take = pad.take;
    if (!take?.key) return null;
    const chords = chordsOf(take);
    const section = sketchSection({ key: take.key, meter: take.meter, melody: take.notes, chords });
    return { key: take.key, meter: take.meter, chords, section };
}

function addTake(take)
{
    analyse(take);
    pad.takes.push(take);
    view(take);
}

function view(take)
{
    pad.take = take;
    pad.selected = -1;
    pad.range = null;
    show();
}

/** a chord whistled for a stretch: it takes the stretch over from any chord whistled there before */
function addChord(take, range, notes, from)
{
    const a = range.beat, b = range.beat + range.beats;
    take.chords = take.chords.flatMap(c => cut(c, a, b));
    const chord = { beat: a, beats: range.beats, notes };
    take.chords.push(chord);
    from.range = chord;
    rekey(take);
    status(`${chord.symbol} for ${barsName(range, take.meter)}${chord.others.length ? ` (or ${chord.others.map(o => o.symbol).join(', ')}: click it)` : ''}`);
}

/** what's left of a chord outside a stretch: nothing, one piece or two */
function cut(c, a, b)
{
    if (c.beat + c.beats <= a || c.beat >= b) return [c];
    const out = [];
    if (c.beat < a) out.push({ ...c, beats: a - c.beat });
    if (c.beat + c.beats > b) out.push({ ...c, beat: b, beats: c.beat + c.beats - b });
    return out;
}

/** 'bar 2', 'bars 1–2', 'bar 3 beats 3–4', 'bar 1 beat 3 to bar 2 beat 4' */
function barsName({ beat, beats }, meter)
{
    const bpb = beatsPerBar(meter), lastBeat = beat + beats - 1;
    const first = Math.floor(beat / bpb) + 1, last = Math.floor(lastBeat / bpb) + 1;
    if (beat % bpb === 0 && beats % bpb === 0) return first === last ? `bar ${first}` : `bars ${first}–${last}`;
    const at = (b)=> b % bpb + 1;
    if (first === last) return `bar ${first} beat${beats > 1 ? `s ${at(beat)}–${at(lastBeat)}` : ` ${at(beat)}`}`;
    return `bar ${first} beat ${at(beat)} to bar ${last} beat ${at(lastBeat)}`;
}

// ── recording ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** R: a chord for the stretch dragged out, else a new melody take */
async function record()
{
    const p = pad;
    const kind = p.range && p.take ? 'chord' : 'melody';
    // nothing plays while a chord is whistled: the band leaking into the mic would be heard as chord notes
    if (p.playing) { p.events.emit('music:stop'); p.playing = false; }
    hearing?.stop();
    try
    {
        if (!mic.on) await mic.start((samples, time)=> pad?.rec && takeBlock(pad.rec, samples, time));
    }
    catch (e)
    {
        status(`No microphone: ${e.message}. You can still drop audio files here.`);
        return;
    }
    if (pad !== p || p.rec) return;
    p.rec = startRecording({ kind, tempo: settings.tempo, meter: settings.meter, click: settings.click });
    p.note = '';
    if (kind === 'melody') { p.take = null; p.range = null; }
    show();
}

function stop()
{
    const r = pad.rec, take = stopRecording(r);
    pad.rec = null;
    if (!take) { status('That take was too short to read.'); return; }
    const n = pad.takes.length + 1;
    if (r.kind === 'melody') { addTake({ n, ...take }); return; }
    chordTake({ n, ...take });
}

/** a chord whistled, from the mic or a file: named for the stretch dragged out */
function chordTake(take)
{
    const notes = freeNotes(take.frames);
    if (!notes.length) { status('No notes heard in that chord.'); return; }
    Object.assign(take, { kind: 'chord', notes, tempo: pad.take.tempo, meter: pad.take.meter });
    pad.takes.push(take);
    addChord(pad.take, pad.range, notes, take);
    take.key = pad.take.key;
    pad.range = null;
    show();
}

// ── editing ────────────────────────────────────────────────────────────────────────────────────────────────────────

function edited(take)
{
    rekey(take, true);
    show();
}

/** a stretch from one beat to another, snapped out to half bars (bars in an odd meter), or to beats with Alt held */
function snapRange(a, b, meter)
{
    const bpb = beatsPerBar(meter);
    const unit = keyIsDown('AltLeft') || keyIsDown('AltRight') ? 1 : bpb % 2 ? bpb : bpb / 2;
    const from = Math.max(0, Math.floor(Math.min(a, b) / unit) * unit);
    const to = Math.max(from + unit, Math.ceil(Math.max(a, b) / unit) * unit);
    return { beat: from, beats: to - from };
}

function updateEditing(L)
{
    const take = pad.take;
    if (!take) return;
    const notes = take.notes;
    const p = mousePosScreen;
    if (mouseWasPressed(0) && p.y > L.stripY && p.x > L.x0)
    {
        pad.selected = noteAt(L, notes, p);
        pad.drag = pad.selected >= 0 ? { key: L.key(p.y) } : null;
        pad.press = pad.selected >= 0 ? null : { x: p.x, beat: L.beatAt(p.x), chord: chordAt(L, sketch()?.chords ?? [], p), moved: false };
        show();
    }
    if (mouseIsDown(0) && pad.drag)
    {
        const to = L.key(p.y), n = notes[pad.selected];
        if (n && to !== pad.drag.key) { n.key += to - pad.drag.key; pad.drag.key = to; edited(take); }
    }
    else if (mouseIsDown(0) && pad.press)
    {
        // dragging out a stretch for a chord
        if (Math.abs(p.x - pad.press.x) > 5) pad.press.moved = true;
        if (pad.press.moved) { pad.range = snapRange(pad.press.beat, L.beatAt(p.x), take.meter); pad.note = ''; show(); }
    }
    else if (pad.press)
    {
        // a click, not a drag: a chord steps to its next guess, anywhere else clears the stretch
        const { chord, moved } = pad.press;
        pad.press = null;
        if (!moved) { if (chord >= 0) pickNext(sketch().chords[chord]); pad.range = null; show(); }
    }
    else pad.drag = null;

    if (typing()) return;
    const n = notes[pad.selected];
    if (!n)
    {
        // a stretch with no note selected: Delete forgets the chords whistled there
        if (pad.range && (keyWasPressed('Delete') || keyWasPressed('Backspace')))
        {
            take.chords = take.chords.flatMap(c => cut(c, pad.range.beat, pad.range.beat + pad.range.beats));
            edited(take);
        }
        return;
    }
    const step = +keyWasPressed('ArrowUp') - +keyWasPressed('ArrowDown');
    if (step) { n.key += step; edited(take); }
    const move = +keyWasPressed('ArrowRight') - +keyWasPressed('ArrowLeft');
    if (move) { pad.selected = Math.max(0, Math.min(notes.length - 1, pad.selected + move)); show(); }
    if (keyWasPressed('KeyV')) { n.vibrato = n.vibrato ? null : { rate: 6, depth: 0.25 }; edited(take); }
    if (keyWasPressed('Delete') || keyWasPressed('Backspace')) { notes.splice(pad.selected, 1); pad.selected = Math.min(pad.selected, notes.length - 1); edited(take); }
}

/** a chord box clicked: the next of its runners-up, and round to the first reading */
function pickNext(shown)
{
    const c = shown.src ?? shown;
    c.options ??= [c.symbol, ...c.others.map(o => o.symbol)];
    c.pick = ((c.pick ?? 0) + 1) % c.options.length;
    c.symbol = c.options[c.pick];
    show();
}

// ── hearing, copying, saving ───────────────────────────────────────────────────────────────────────────────────────

function playSketch(events)
{
    if (pad.playing) { events.emit('music:stop'); pad.playing = false; show(); return; }
    const s = sketch();
    if (!s) return;
    events.emit('music:play', { song: sketchSpec({ name: settings.name, key: s.key, tempo: settings.songTempo, meter: s.meter, section: s.section }) });
    pad.playing = true;
    show();
}

let hearing = null;
function hearTake()
{
    hearing?.stop();
    if (!pad.take?.samples) return;
    const ctx = audioEngine.context;
    const buffer = new AudioBuffer({ length: pad.take.samples.length, sampleRate: pad.take.rate });
    buffer.copyToChannel(pad.take.samples, 0);
    hearing = new AudioBufferSourceNode(ctx, { buffer });
    hearing.connect(audioEngine.output);
    hearing.start();
}

const textOf = (s)=> sketchText({ name: settings.name, key: s.key, tempo: settings.songTempo, meter: s.meter, section: s.section, whistledAt: pad.take.tempo });

async function copy()
{
    const s = sketch();
    if (!s) return;
    await navigator.clipboard.writeText(textOf(s));
    status('Copied: paste it into a song in a *-songs-data.js file.');
}

async function save()
{
    const s = sketch();
    if (s) status(await saveSketch(settings.name, pad.takes.filter(t => t.kind === 'chord' || t === pad.take), textOf(s)));
}

/** an audio file dropped: a chord for the stretch dragged out, else a melody take at the tempo set */
async function dropped(e)
{
    e.preventDefault();
    for (const file of e.dataTransfer?.files ?? [])
    {
        if (!pad) return;
        status(`Reading ${file.name}…`);
        try
        {
            const { samples, rate } = await mic.decode(await file.arrayBuffer());
            const take = { n: pad.takes.length + 1, source: file.name, samples, rate, frames: trackPitch(samples, rate) };
            status('');
            if (pad.range && pad.take) chordTake(take);
            else addTake({ ...take, kind: 'melody', tempo: settings.tempo, meter: settings.meter, downbeat: null });
        }
        catch (err) { status(`${file.name}: ${err.message}`); }
    }
}
const dragOver = (e)=> e.preventDefault();

// ── the activity ───────────────────────────────────────────────────────────────────────────────────────────────────

function open({ activity, events })
{
    const p = pad = { takes: [], take: null, keyChoice: 'auto', rec: null, selected: -1, drag: null, press: null, range: null,
        playing: false, note: '', offs: [], events };
    p.offs.push(
        events.on('music:status', ({ text })=> status(text)),
        events.on('music:started', ()=> status('')));
    addEventListener('dragover', dragOver);
    addEventListener('drop', dropped);
    activity.start({
        name: 'sketchpad',
        update()
        {
            if (input.cancel())
            {
                if (p.rec) stop();
                else if (p.range) { p.range = null; show(); }
                else activity.end();
                return;
            }
            if (keyWasPressed('KeyR') && !typing()) { p.rec ? stop() : record(); return; }
            if (p.rec) { if (!updateRecording(p.rec)) stop(); }
            else updateEditing(layout({ take: p.take, rec: null, top: bar.root.getBoundingClientRect().bottom }));
        },
        cleanup()
        {
            if (p.rec) { stopRecording(p.rec); p.rec = null; }
            for (const off of p.offs) off();
            removeEventListener('dragover', dragOver);
            removeEventListener('drop', dropped);
            mic.stop();
            hearing?.stop();
            if (p.playing) events.emit('music:stop');
            if (pad === p) pad = null;
            document.body.classList.remove('sketchpad');
            show();
        },
    });
    document.body.classList.add('sketchpad');
    show();
}

const typing = ()=> document.activeElement?.tagName === 'INPUT' && /** @type {HTMLInputElement} */ (document.activeElement).type !== 'checkbox';

function status(text) { if (pad) pad.note = text; show(); }

// ── the bar ────────────────────────────────────────────────────────────────────────────────────────────────────────

function show()
{
    const b = bar.els;
    b.open.textContent = pad ? '■ Close sketchpad' : '🎙 Whistle sketchpad';
    bar.controls.hidden = !pad;
    bar.text.hidden = !pad;
    if (!pad) return;
    const chordNext = !!(pad.range && pad.take);
    b.rec.textContent = pad.rec ? '■ Stop (R)' : chordNext ? '● Whistle the chord (R)' : '● Record (R)';
    for (const el of [b.tempo, b.meter]) el.disabled = !!pad.rec;
    b.play.textContent = pad.playing ? '■ Stop sketch' : '▶ Play sketch';
    const melodies = pad.takes.filter(t => t.kind === 'melody');
    b.takes.replaceChildren(...melodies.map(t => new Option(`${t.n}. ${t.source === 'mic' ? 'take' : t.source} · ${t.notes.length} notes`, String(t.n), false, t === pad.take)));
    b.takes.hidden = !melodies.length;
    b.hear.disabled = !pad.take?.samples;
    const key = pad.take?.key;
    b.key.options[0].textContent = pad.keyChoice === 'auto' && key ? `Key: ${key.key} ${key.mode} (auto)` : 'Key: auto';
    const s = pad.take ? sketch() : null;
    for (const el of [b.play, b.copy, b.save]) el.disabled = !s;
    const help = pad.rec?.kind === 'chord' ? 'Whistle the chord\'s notes as an arpeggio, in your own time · R stops'
        : pad.rec ? 'Whistle after the count-in · R or Esc stops'
            : chordNext ? `${barsName(pad.range, pad.take.meter)}: R and whistle its chord (or drop a file) · Alt snaps to beats · Delete clears its chords · Esc lets go`
                : pad.take ? 'Drag over bars and whistle their chord · drag a note or ↑ ↓ to move it · ← → select · V vibrato · Delete removes · click a chord for the next guess (faint ones are guessed from the tune)'
                    : '';
    bar.status.textContent = [pad.note, help].filter(Boolean).join(' · ');
    bar.text.textContent = s ? [s.section.progression && `progression: '${s.section.progression}'`, s.section.melody && `melody: '${s.section.melody}'`].filter(Boolean).join('\n') : '';
}

export default {
    id: 'sketchpad',
    build(ctx)
    {
        settings = ctx.state.slice('sketchpad', DEFAULTS);
        const root = document.createElement('div');
        root.id = 'sketch-bar';
        root.innerHTML = `<button type="button" data-el="open"></button>
            <span class="controls">
              <button type="button" data-el="rec"></button>
              <label>whistle at <input data-el="tempo" type="number" min="30" max="240" step="1"> bpm</label>
              <select data-el="meter">${METERS.map(m => `<option>${m}</option>`).join('')}</select>
              <label><input data-el="click" type="checkbox"> click</label>
              <select data-el="takes" title="melody takes"></select>
              <button type="button" data-el="hear">▶ Take</button>
              <select data-el="key"><option value="auto">Key: auto</option>${KEYS.map(k => `<option>${k}</option>`).join('')}</select>
              <label>song at <input data-el="songTempo" type="number" min="30" max="240" step="1"> bpm</label>
              <button type="button" data-el="play"></button>
              <button type="button" data-el="copy">Copy</button>
              <input data-el="name" type="text" size="12" title="the ideas/ folder to save to">
              <button type="button" data-el="save">Save to ideas/</button>
            </span>
            <span role="status" data-el="status"></span>
            <pre data-el="text"></pre>`;
        document.getElementById('top').append(root);
        const els = Object.fromEntries([...root.querySelectorAll('[data-el]')].map(el => [el.dataset.el, el]));
        bar = { root, els, controls: root.querySelector('.controls'), status: els.status, text: els.text };
        const write = ()=> ctx.state.write();
        els.open.onclick = ()=> { els.open.blur(); ctx.activity.current?.name === 'sketchpad' ? ctx.activity.end() : open(ctx); };
        els.rec.onclick = ()=> { els.rec.blur(); pad.rec ? stop() : record(); };
        els.tempo.value = settings.tempo;
        els.tempo.onchange = ()=> { settings.tempo = Math.max(30, Math.min(240, Number(els.tempo.value) || DEFAULTS.tempo)); els.tempo.value = settings.tempo; write(); };
        els.meter.value = settings.meter;
        els.meter.onchange = ()=> { settings.meter = els.meter.value; els.meter.blur(); write(); };
        els.click.checked = settings.click;
        els.click.onchange = ()=> { settings.click = els.click.checked; write(); };
        els.takes.onchange = ()=> { view(pad.takes.find(t => t.n === Number(els.takes.value))); els.takes.blur(); };
        els.hear.onclick = ()=> { els.hear.blur(); hearTake(); };
        els.key.onchange = ()=>
        {
            pad.keyChoice = els.key.value;
            els.key.blur();
            for (const t of pad.takes) if (t.kind === 'melody') rekey(t);
            show();
        };
        els.songTempo.value = settings.songTempo;
        els.songTempo.onchange = ()=> { settings.songTempo = Math.max(30, Math.min(240, Number(els.songTempo.value) || DEFAULTS.songTempo)); els.songTempo.value = settings.songTempo; write(); };
        els.play.onclick = ()=> { els.play.blur(); playSketch(ctx.events); };
        els.copy.onclick = ()=> { els.copy.blur(); copy(); };
        els.name.value = settings.name;
        els.name.onchange = ()=> { settings.name = els.name.value.trim() || DEFAULTS.name; els.name.value = settings.name; write(); };
        els.save.onclick = ()=> { els.save.blur(); save(); };
        show();
    },
    render({ activity })
    {
        if (activity.current?.name !== 'sketchpad' || !pad) return;
        const L = layout({ take: pad.take, rec: pad.rec, top: bar.root.getBoundingClientRect().bottom });
        const melodyRec = pad.rec?.kind === 'melody';
        const s = melodyRec || !pad.take ? null : sketch();
        drawSketch(L, {
            take: pad.take, rec: pad.rec, key: s?.key ?? null, chords: s?.chords ?? [], selected: pad.selected,
            range: pad.range, beatsPerBar: beatsPerBar((melodyRec ? pad.rec : pad.take)?.meter ?? settings.meter), hint: HINT,
        });
    },
};
