// Whistle to MIDI: ● (or R) records a whistled melody into a new clip on the selected track, from the bar the playhead
// is in, with a bar's count-in and a click at the project's tempo. With a stretch of the chord track picked, it
// records a chord instead: an arpeggio whistled freely, named and put on the chord track. Audio files dropped on a
// track are read the same way. A saved project keeps its takes' audio in projects/<name>/takes/.
//
// "New from melody" hands the selected clip and the chords over it to the composer, which writes a new project
// round them.
import { signal } from '@preact/signals';
import { mic } from '../platform/mic.js';
import { projectFiles } from '../platform/project-files.js';
import { trackPitch } from '../lib/pitch-track.js';
import { freeNotes, guessKeys } from '../lib/transcribe.js';
import { guessChords, nameChord } from '../lib/chord-guess.js';
import { parseChord, chordName, chordPitchClasses, pitchName } from '../lib/music-theory.js';
import { encodeWav } from '../lib/wav.js';
import { bpmAt } from '../lib/tempo-map.js';
import { barAt, meterAt, beatsPerBar } from '../daw/meter.js';
import { makeTrack, addTrack, addClip, newId, findClip } from '../daw/project.js';
import { startRecording, takeBlock, updateRecording, stopRecording } from '../sketch/recorder.js';
import { analyse, chordsOf, cut } from '../sketch/takes.js';
import { sketchSection, sketchSpec } from '../sketch/sketch-spec.js';
import { project, projectName, selected, selectedClip, chordRange, beat, status, settings } from './store.js';
import { edit, newProject } from './document.js';
import { stop } from './player.js';

const WHISTLE = { name: 'Whistle', instrument: { bank: 0, program: 73 } };    // a flute
const VELOCITY = 90;

/** the take being recorded: { kind, track, start (beat), rec }, for the views to show */
export const recording = signal(/** @type {any} */ (null));
let frame = 0;

/** the key the project is in, or the likeliest for some notes */
function keyFor(notes)
{
    const k = project.value.key;
    if (k) return { key: pitchName(k.tonic, true), tonic: k.tonic, mode: k.mode };
    return notes.length ? guessKeys(notes)[0] : { key: 'C', tonic: 0, mode: 'major' };
}

/** the selected track, or a new whistle track */
function targetTrack()
{
    if (project.value.tracks.some(t => t.id === selected.value)) return selected.value;
    let id = '';
    edit(p => { const t = makeTrack(p, WHISTLE); id = t.id; return addTrack(p, t); });
    selected.value = id;
    return id;
}

/** a melody take's notes as a clip from a bar on a track */
function placeTake(trackId, start, take, label)
{
    const notes = take.notes.filter(n => n.beat >= 0).map(n => ({ beat: n.beat, beats: n.beats, key: n.key, vel: VELOCITY }));
    if (!notes.length) { status.value = `No notes heard in ${label}.`; return; }
    const bpb = barAt(project.value.meters, start).beatsPerBar;
    const beats = Math.max(1, Math.ceil(Math.max(...notes.map(n => n.beat + n.beats)) / bpb - 1e-6)) * bpb;
    let clip = '';
    edit(p => { clip = newId(p, 'c'); return addClip(p, trackId, { id: clip, start, beats, notes }); });
    selectedClip.value = { track: trackId, clip };
    status.value = `${notes.length} notes from ${label}`;
}

/** keeps a take's audio beside a saved project */
async function keepAudio(take)
{
    const name = projectName.value;
    if (!name) return '';
    const files = await projectFiles.takes(name).catch(()=> []);
    const n = Math.max(0, ...files.map(f => Number(/^take-(\d+)\.wav$/.exec(f)?.[1] ?? 0))) + 1;
    await projectFiles.writeTake(name, `take-${n}.wav`, encodeWav(take.samples, take.rate));
    return `take-${n}.wav`;
}

// ── recording ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** a chord for the stretch picked on the chord track, else a melody on the selected track; again to stop */
export async function record()
{
    if (recording.value) { finish(); return; }
    // nothing plays while recording: the band leaking into the mic would be heard as notes
    stop();
    try
    {
        if (!mic.on) await mic.start((samples, time)=> recording.value && takeBlock(recording.value.rec, samples, time));
    }
    catch (e)
    {
        status.value = `No microphone: ${e.message}. You can still drop audio files on a track.`;
        return;
    }
    if (recording.value) return;
    const p = project.value;
    const range = chordRange.value;
    const kind = range ? 'chord' : 'melody';
    const at = range ? range.beat : barAt(p.meters, beat.value).start;
    const track = kind === 'melody' ? targetTrack() : null;
    const rec = startRecording({ kind, tempo: Math.round(bpmAt(p.tempoMap, at)), meter: meterAt(p.meters, at).sig, click: settings.value.click });
    recording.value = { kind, track, start: at, rec };
    status.value = kind === 'chord' ? 'Whistle the chord as an arpeggio, then press ● again' : 'Recording…';
    const step = ()=>
    {
        const r = recording.value;
        if (!r) return;
        if (!updateRecording(r.rec)) { finish(); return; }
        // the playhead follows the take as heard, from its bar once the count-in is over
        if (r.kind === 'melody') beat.value = r.start + Math.max(0, (r.rec.playhead - r.rec.origin) / r.rec.beatSec);
        status.value = r.rec.countIn ? `Count-in: ${r.rec.countIn}` : r.kind === 'chord' ? status.value : 'Recording…';
        recording.value = { ...r };
        frame = requestAnimationFrame(step);
    };
    step();
}

/** stops recording and reads the take */
export async function finish()
{
    const r = recording.value;
    if (!r) return;
    cancelAnimationFrame(frame);
    recording.value = null;
    const take = stopRecording(r.rec);
    if (!take) { status.value = 'That take was too short to read.'; return; }
    if (r.kind === 'chord') chordTake(take);
    else placeTake(r.track, r.start, analyse({ ...take }), 'the take');
    const file = await keepAudio(take).catch(e => { status.value = e.message; return ''; });
    if (file) status.value += ` · audio kept in takes/${file}`;
}

/** a chord whistled over the stretch picked: named in the project's key and put on the chord track there */
function chordTake(take)
{
    const range = chordRange.value;
    const notes = freeNotes(take.frames);
    const key = keyFor(notes.map(n => ({ beat: n.time, beats: n.seconds, key: n.key })));
    const named = nameChord(notes, key);
    if (!range || !named) { status.value = 'No notes heard in that chord.'; return; }
    const parsed = parseChord(named.symbol, key.tonic, key.mode);
    const chord = { beat: range.beat, beats: range.beats, name: chordName(parsed, key.key.includes('b')), tones: chordPitchClasses(parsed), symbol: named.symbol };
    edit(p => ({ ...p, chords: [...p.chords.flatMap(c => cut(c, range.beat, range.beat + range.beats)), chord].sort((a, b)=> a.beat - b.beat) }));
    chordRange.value = null;
    status.value = `${chord.name}${named.others.length ? ` (or ${named.others.map(o => chordName(parseChord(o.symbol, key.tonic, key.mode))).join(', ')})` : ''}`;
}

/** audio files dropped on a track: each read as a whistled melody at the project's tempo, in a clip from the bar at `at` */
export async function dropAudio(trackId, files, at)
{
    selected.value = trackId;
    let start = barAt(project.value.meters, at).start;
    for (const file of files)
    {
        status.value = `Reading ${file.name}…`;
        try
        {
            const { samples, rate } = await mic.decode(await file.arrayBuffer());
            const p = project.value;
            const take = analyse({ kind: 'melody', samples, rate, frames: trackPitch(samples, rate),
                tempo: Math.round(bpmAt(p.tempoMap, start)), meter: meterAt(p.meters, start).sig, downbeat: null });
            placeTake(trackId, start, take, file.name);
            const c = selectedClip.value && findClip(project.value, trackId, selectedClip.value.clip);
            if (c) start = c.start + c.beats;
        }
        catch (err) { status.value = `${file.name}: ${err.message}`; }
    }
}

/** a take kept with the project, read again onto a track at `at` */
export async function dropTake(trackId, file, at)
{
    const name = projectName.value;
    if (!name) return;
    const bytes = await projectFiles.readTake(name, file).catch(e => { status.value = e.message; return null; });
    if (bytes) await dropAudio(trackId, [new File([bytes], file, { type: 'audio/wav' })], at);
}

// ── new from melody ──────────────────────────────────────────────────────────────────────────────────────────────────

/** the selected clip's notes and the chords over them, composed into a new project with a band */
export function newFromMelody()
{
    const sel = selectedClip.value, p = project.value;
    const clip = sel && findClip(p, sel.track, sel.clip);
    if (!clip?.notes.length) { status.value = 'Select a clip with a melody in it first.'; return; }
    const meter = meterAt(p.meters, clip.start).sig, bpb = beatsPerBar(meter);
    const notes = clip.notes.filter(n => n.beat < clip.beats);
    const key = keyFor(notes);
    // chords whistled over the clip keep their reading; the rest are guessed from the melody
    const a = clip.start, b = clip.start + clip.beats;
    const whistled = p.chords.filter(c => c.symbol && c.beat < b && c.beat + c.beats > a).map(c =>
    {
        const from = Math.max(a, c.beat), to = Math.min(b, c.beat + c.beats);
        return { ...c, beat: from - a, beats: to - from };
    });
    const chords = chordsOf({ chords: whistled, notes, guesses: guessChords(notes, { tonic: key.tonic, mode: key.mode, beatsPerBar: bpb, melody: true }) });
    const section = sketchSection({ key, meter, melody: notes, chords });
    const tempo = Math.round(bpmAt(p.tempoMap, clip.start));
    newProject({ title: `${p.title} melody`, spec: sketchSpec({ name: `${p.title} melody`, key, tempo, meter, section }) });
}
