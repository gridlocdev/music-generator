// The whistle track: recording melody and chord takes from the mic, reading dropped audio files and sketches saved in
// ideas/, editing the notes and chords, and turning the sketch into a song in the arrangement.
//
// The sketch lives in one plain object, `pad`, changed in place; `padTick` is bumped after each change so the views
// that read it redraw.
import { signal } from '@preact/signals';
import { mic } from '../platform/mic.js';
import { audioEngine } from '../platform/audio-engine.js';
import { trackPitch } from '../lib/pitch-track.js';
import { freeNotes } from '../lib/transcribe.js';
import { startRecording, takeBlock, updateRecording, stopRecording } from '../sketch/recorder.js';
import { analyse, rekey, addChord, clearChords, pickNext, sketchOf, barsName } from '../sketch/takes.js';
import { sketchSpec, sketchText } from '../sketch/sketch-spec.js';
import { saveSketch, readSketch, listSketches } from '../sketch/sketch-files.js';
import { settings, selected } from './store.js';
import { openSong, play, stop as stopSong } from './player.js';

export const pad = {
    /** every take, melody and chord, in the order made */
    takes: [],
    /** the melody take in view */
    take: null,
    keyChoice: 'auto',
    /** the take being recorded */
    rec: null,
    /** the note selected, by index */
    note: -1,
    /** a stretch dragged out to whistle a chord for: { beat, beats } */
    range: null,
    /** a line for the status bar */
    message: '',
};
export const padTick = signal(0);
/** the sketch folders in ideas/ */
export const ideas = signal(/** @type {string[]} */ ([]));

const changed = ()=> { padTick.value++; };
export function say(text) { pad.message = text; changed(); }

/** what the melody take in view makes, or null */
export const currentSketch = ()=> sketchOf(pad.take);

// ── takes ────────────────────────────────────────────────────────────────────────────────────────────────────────────

function addMelody(take)
{
    analyse(take, pad.keyChoice);
    pad.takes.push(take);
    view(take);
}

export function view(take)
{
    pad.take = take;
    pad.note = -1;
    pad.range = null;
    changed();
}

/** a chord whistled, from the mic or a file: named for the stretch dragged out */
function chordTake(take)
{
    const notes = freeNotes(take.frames);
    if (!notes.length) { say('No notes heard in that chord.'); return; }
    Object.assign(take, { kind: 'chord', notes, tempo: pad.take.tempo, meter: pad.take.meter, range: pad.range });
    pad.takes.push(take);
    const chord = addChord(pad.take, pad.range, notes, pad.keyChoice);
    take.key = pad.take.key;
    say(`${chord.symbol} for ${barsName(pad.range, pad.take.meter)}${chord.others.length ? ` (or ${chord.others.map(o => o.symbol).join(', ')}: click it)` : ''}`);
    pad.range = null;
    changed();
}

// ── recording ────────────────────────────────────────────────────────────────────────────────────────────────────────

let frame = 0;

/** a chord for the stretch dragged out, else a new melody take; again to stop */
export async function record()
{
    if (pad.rec) { finish(); return; }
    const kind = pad.range && pad.take ? 'chord' : 'melody';
    // nothing plays while recording: the band leaking into the mic would be heard as notes
    stopSong();
    hearing?.stop();
    selected.value = 'whistle';
    try
    {
        if (!mic.on) await mic.start((samples, time)=> pad.rec && takeBlock(pad.rec, samples, time));
    }
    catch (e)
    {
        say(`No microphone: ${e.message}. You can still drop audio files on the whistle track.`);
        return;
    }
    if (pad.rec) return;
    const s = settings.value.sketch;
    pad.rec = startRecording({ kind, tempo: s.tempo, meter: s.meter, click: s.click });
    pad.message = '';
    if (kind === 'melody') { pad.take = null; pad.range = null; pad.note = -1; }
    const step = ()=>
    {
        if (!pad.rec) return;
        if (!updateRecording(pad.rec)) { finish(); return; }
        changed();
        frame = requestAnimationFrame(step);
    };
    step();
}

/** stops recording and reads the take */
export function finish()
{
    const r = pad.rec;
    if (!r) return;
    cancelAnimationFrame(frame);
    pad.rec = null;
    const take = stopRecording(r);
    if (!take) { say('That take was too short to read.'); return; }
    const n = pad.takes.length + 1;
    if (r.kind === 'melody') addMelody({ n, ...take });
    else chordTake({ n, ...take });
}

/** audio files dropped: a chord for the stretch dragged out, else melody takes at the tempo set */
export async function dropFiles(files)
{
    for (const file of files)
    {
        say(`Reading ${file.name}…`);
        try
        {
            const { samples, rate } = await mic.decode(await file.arrayBuffer());
            const take = { n: pad.takes.length + 1, source: file.name, samples, rate, frames: trackPitch(samples, rate) };
            say('');
            const s = settings.value.sketch;
            if (pad.range && pad.take) chordTake(take);
            else addMelody({ ...take, kind: 'melody', tempo: s.tempo, meter: s.meter, downbeat: null });
        }
        catch (err) { say(`${file.name}: ${err.message}`); }
    }
    selected.value = 'whistle';
}

// ── editing ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** after notes change: the key and the guessed chords follow */
export function edited()
{
    if (pad.take) rekey(pad.take, pad.keyChoice, true);
    changed();
}

export function selectNote(i) { pad.note = i; changed(); }
export function setRange(range) { pad.range = range; if (range) pad.message = ''; changed(); }

export function setKeyChoice(choice)
{
    pad.keyChoice = choice;
    for (const t of pad.takes) if (t.kind === 'melody') rekey(t, choice);
    changed();
}

/** a chord box clicked: its next reading */
export function nextReading(chord) { pickNext(chord); changed(); }

/** the keys for editing the take: ↑ ↓ move a note, ← → select, V vibrato, Delete removes; Esc lets go */
export function editKey(e)
{
    const take = pad.take;
    if (!take) return false;
    if (e.code === 'Escape') { if (pad.range || pad.note >= 0) { pad.range = null; pad.note = -1; changed(); return true; } return false; }
    const n = take.notes[pad.note];
    const del = e.code === 'Delete' || e.code === 'Backspace';
    if (!n)
    {
        // a stretch with no note selected: Delete forgets the chords whistled there
        if (pad.range && del) { clearChords(take, pad.range, pad.keyChoice); changed(); return true; }
        return false;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') { n.key += e.code === 'ArrowUp' ? 1 : -1; edited(); return true; }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight')
    {
        pad.note = Math.max(0, Math.min(take.notes.length - 1, pad.note + (e.code === 'ArrowRight' ? 1 : -1)));
        changed();
        return true;
    }
    if (e.code === 'KeyV') { n.vibrato = n.vibrato ? null : { rate: 6, depth: 0.25 }; edited(); return true; }
    if (del) { take.notes.splice(pad.note, 1); pad.note = Math.min(pad.note, take.notes.length - 1); edited(); return true; }
    return false;
}

// ── hearing, songs, copying, saving ──────────────────────────────────────────────────────────────────────────────────

let hearing = null;
export function hearTake()
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

const specOf = (s)=> sketchSpec({ name: settings.value.sketch.name, key: s.key, tempo: settings.value.sketch.songTempo, meter: s.meter, section: s.section });
const textOf = (s)=> sketchText({ name: settings.value.sketch.name, key: s.key, tempo: settings.value.sketch.songTempo, meter: s.meter,
    section: s.section, whistledAt: pad.take.tempo });

/** composes the sketch with a band into the arrangement, and plays it */
export function makeSong()
{
    const s = currentSketch();
    if (!s) return;
    openSong({ id: 'sketch', label: settings.value.sketch.name, story: 'Your whistled sketch, with a band', spec: specOf(s) });
    play();
}

export async function copy()
{
    const s = currentSketch();
    if (!s) return;
    await navigator.clipboard.writeText(textOf(s));
    say('Copied: paste it into a song in a *-songs-data.js file.');
}

export async function save()
{
    const s = currentSketch();
    if (!s) return;
    say(await saveSketch(settings.value.sketch.name, pad.takes.filter(t => t.kind === 'chord' || t === pad.take), textOf(s)));
    refreshIdeas();
}

export async function refreshIdeas() { ideas.value = await listSketches(); }

/** opens a sketch from ideas/: its melody takes, with the chords whistled over the last one before each chord take */
export async function openIdea(name)
{
    if (pad.rec) return;
    say(`Opening ideas/${name}/…`);
    try
    {
        const files = await readSketch(name);
        const takes = [];
        let melody = null;
        for (const f of files)
        {
            const { samples, rate } = await mic.decode(f.bytes);
            const d = f.data ?? {};
            const take = { n: takes.length + 1, source: `${name}/${f.file}`, samples, rate, frames: trackPitch(samples, rate),
                tempo: d.tempo ?? settings.value.sketch.tempo, meter: d.meter ?? settings.value.sketch.meter, saved: name };
            if (d.kind === 'chord' && melody && d.chord)
            {
                const notes = freeNotes(take.frames);
                Object.assign(take, { kind: 'chord', notes, range: d.chord, key: melody.key });
                if (notes.length) addChord(melody, d.chord, notes, pad.keyChoice);
            }
            else melody = analyse(Object.assign(take, { kind: 'melody', downbeat: d.downbeat ?? null }), pad.keyChoice);
            takes.push(take);
        }
        pad.takes = takes;
        selected.value = 'whistle';
        view(takes.findLast(t => t.kind === 'melody') ?? null);
        say(`Opened ideas/${name}/: ${takes.length} take${takes.length === 1 ? '' : 's'}`);
    }
    catch (e) { say(`Couldn't open ideas/${name}/: ${e.message}`); }
}
