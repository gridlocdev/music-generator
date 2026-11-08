// The app's commands: each with its label, shortcut, action and when it can be used, for the menu bar, the keys and
// the right-click menus alike. Shortcuts with Cmd are answered by the menu bar (`accelerator`); plain keys, which
// must still type in a text field, by the page (`shown`, matched in keys.js). The menu bar is built in menu-bar.js.
//
// What Edit's commands act on follows the part last clicked (focus.js): the picked notes in the piano roll, the
// selected clip in the arrangement, or the stretch picked on the chord track.
import { appMenu } from '../platform/app-menu.js';
import { barAt, barLines } from '../daw/meter.js';
import { projectEnd, markerRange, addMarker, findClip, insertTime, deleteTime } from '../daw/project.js';
import { projectMidi } from '../daw/project-midi.js';
import { cut as cutChord } from '../sketch/takes.js';
import { project, projectName, dirty, hist, selected, selectedClip, selectedTrack, chordRange, beat, playing,
    settings, setSettings, status, picked } from './store.js';
import { edit, undo, redo, save, saveAs, openProject } from './document.js';
import { toggle, seek } from './player.js';
import { record, recording, newFromMelody } from './recording.js';
import { focus } from './focus.js';
import { asking, askText } from './ask.js';
import { pickedNotes, deletePicked, transposePicked, quantizePicked, pickAll, clearPicked, GRIDS, nudgePicked, humanizePicked,
    scalePicked, reversePicked } from './notes.js';
import { cut, copy, paste, duplicate, canCopy, clipboard } from './clipboard.js';
import { addNewTrack, renameTrack, deleteTrack, duplicateTheTrack, moveTrackBy, toggleMute, toggleSolo, chooseInstrument,
    deleteClip, splitClipsAt, joinWithNext, nextClip, quantizeClip, loopOver, clipRange, arrangeZoom, arrangePpb, toggleClipMute, nudgeClip,
    humanizeClip, scaleClip, reverseClip } from './tracks.js';
import { bounce } from './bounce.js';
import { audioEngine } from '../platform/audio-engine.js';
import { askTempo, askMeter } from './timeline.js';
import { dialog } from './components/NewProject.jsx';

/** a dialog is open: commands wait */
export const busy = ()=> !!(dialog.value || asking.value || audioEngine.rendering);

// ── what the commands act on ─────────────────────────────────────────────────────────────────────────────────────────

const inRoll = ()=> focus.value === 'roll' && picked.value.size > 0;
const clipSelected = ()=> focus.value !== 'roll' && !!selectedClip.value;

/** Delete: the picked notes, the selected clip or the chords in the stretch picked, in the part last clicked */
export function deleteSelection()
{
    if (focus.value === 'roll') return deletePicked();
    if (focus.value === 'chords')
    {
        const r = chordRange.value;
        if (!r) return false;
        edit(p => ({ ...p, chords: p.chords.flatMap(c => cutChord(c, r.beat, r.beat + r.beats)) }));
        chordRange.value = null;
        return true;
    }
    const c = selectedClip.value;
    if (!c) return false;
    deleteClip(c.track, c.clip);
    return true;
}

const canDelete = ()=> focus.value === 'roll' ? picked.value.size > 0 : focus.value === 'chords' ? !!chordRange.value : !!selectedClip.value;

/** the stretch a loop is set to: the selection, else the section at the playhead, else four bars from its bar */
export function selectionRange()
{
    const p = project.value;
    if (inRoll())
    {
        const list = pickedNotes();
        const a = barAt(p.meters, Math.min(...list.map(o => o.at))), b = barAt(p.meters, Math.max(...list.map(o => o.at + o.n.beats)) - 1e-6);
        return { from: a.start, to: b.start + b.beatsPerBar };
    }
    if (focus.value === 'chords' && chordRange.value) return { from: chordRange.value.beat, to: chordRange.value.beat + chordRange.value.beats };
    const c = selectedClip.value;
    if (c) return clipRange(c.track, c.clip);
    const m = p.markers.findLastIndex(x => x.beat <= beat.value + 1e-6);
    if (m >= 0) return markerRange(p, m);
    const bar = barAt(p.meters, beat.value);
    return { from: bar.start, to: bar.start + bar.beatsPerBar * 4 };
}

// ── the transport ────────────────────────────────────────────────────────────────────────────────────────────────────

function stepBar(by)
{
    const p = project.value, lines = barLines(p.meters, 0, projectEnd(p) + 1);
    const i = lines.findLastIndex(b => b <= beat.value + 1e-6);
    // back from inside a bar goes to its start first
    const to = by < 0 && beat.value - lines[i] > 0.25 ? lines[i] : lines[Math.max(0, Math.min(lines.length - 1, i + by))];
    seek(to);
}

function stepMarker(by)
{
    const marks = project.value.markers.map(m => m.beat);
    const to = by < 0 ? marks.findLast(b => b < beat.value - 0.25) : marks.find(b => b > beat.value + 1e-6);
    seek(to ?? (by < 0 ? 0 : beat.value));
}

export async function addMarkerAt(at = beat.value)
{
    const name = await askText('Marker name', `Marker ${project.value.markers.length + 1}`, 'Add');
    if (name) edit(p => addMarker(p, at, name));
}

async function exportMidi()
{
    const p = project.value;
    const file = await appMenu.saveFile(`${projectName.value || 'untitled'}.mid`, projectMidi(p));
    if (file) status.value = `Exported ${file}`;
}

/** asks how many bars, then puts in (or takes out) that many from the bar the playhead is in */
async function changeBars(insert)
{
    const p = project.value, bar = barAt(p.meters, beat.value);
    const n = Math.round(Number(await askText(insert ? 'Bars to insert at the playhead' : 'Bars to delete from the playhead', '1', insert ? 'Insert' : 'Delete')));
    if (!(n >= 1 && n <= 64)) return;
    const beats = n * bar.beatsPerBar;
    edit(q => insert ? insertTime(q, bar.start, beats) : deleteTime(q, bar.start, bar.start + beats));
    selectedClip.value = null;
    clearPicked();
}

/** the picked notes in the piano roll, else the selected clip: fn(notes) or fn(track, clip) */
const onSelection = (notes, clip)=> ()=> inRoll() ? notes() : clip(selectedClip.value.track, selectedClip.value.clip);

const ZOOM = 1.5;
const zoomBy = (k)=> { arrangeZoom.value = Math.max(0.5, Math.min(120, (arrangeZoom.value || arrangePpb.value || 20) * k)); };

const clipMuted = ()=> { const c = selectedClip.value; return !!c && !!findClip(project.value, c.track, c.clip)?.mute; };

// ── the commands ─────────────────────────────────────────────────────────────────────────────────────────────────────

const track = ()=> selectedTrack.value;

/**
 * @typedef {{ label: string, run: ()=> any, accelerator?: string, shown?: string, enabled?: ()=> boolean,
 *   checked?: ()=> boolean, radio?: boolean, text?: string }} Command
 * @type {Record<string, Command>}
 */
export const COMMANDS = {
    // File
    new: { label: 'New…', accelerator: 'CmdOrCtrl+N', run: ()=> { dialog.value = true; } },
    open: { label: 'Show Projects', accelerator: 'CmdOrCtrl+O', run: ()=> setSettings({ browserOpen: true, browserTab: 'projects' }) },
    save: { label: 'Save', accelerator: 'CmdOrCtrl+S', run: save },
    saveAs: { label: 'Save As…', accelerator: 'Shift+CmdOrCtrl+S', run: saveAs },
    revert: { label: 'Revert to Saved', run: ()=> openProject(projectName.value), enabled: ()=> !!projectName.value && dirty.value },
    exportMidi: { label: 'Export as MIDI File…', accelerator: 'CmdOrCtrl+E', run: exportMidi },
    exportAudio: { label: 'Export as Audio File…', accelerator: 'CmdOrCtrl+B', run: bounce, enabled: ()=> project.value.tracks.some(t => t.clips.length) },
    reveal: { label: 'Show in Finder', run: ()=> appMenu.reveal(`${projectName.value}/project.json`), enabled: ()=> !!projectName.value },
    // Edit
    undo: { label: 'Undo', accelerator: 'CmdOrCtrl+Z', text: 'undo', run: undo, enabled: ()=> hist.value.past.length > 0 },
    redo: { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', text: 'redo', run: redo, enabled: ()=> hist.value.future.length > 0 },
    cut: { label: 'Cut', accelerator: 'CmdOrCtrl+X', text: 'cut', run: cut, enabled: canCopy },
    copy: { label: 'Copy', accelerator: 'CmdOrCtrl+C', text: 'copy', run: copy, enabled: canCopy },
    paste: { label: 'Paste', accelerator: 'CmdOrCtrl+V', text: 'paste', run: ()=> paste(), enabled: ()=> !!clipboard.value && !!selected.value },
    duplicate: { label: 'Duplicate', accelerator: 'CmdOrCtrl+D', run: duplicate, enabled: canCopy },
    delete: { label: 'Delete', shown: 'Backspace', run: deleteSelection, enabled: canDelete },
    selectAll: { label: 'Select All', accelerator: 'CmdOrCtrl+A', text: 'selectAll', run: ()=> { focus.value = 'roll'; pickAll(); }, enabled: ()=> !!track() },
    deselect: { label: 'Deselect All', shown: 'Escape', run: ()=> { clearPicked(); selectedClip.value = null; chordRange.value = null; } },
    split: { label: 'Split at Playhead', accelerator: 'CmdOrCtrl+T', run: ()=> splitClipsAt(beat.value, selectedClip.value?.track ?? null) },
    join: { label: 'Join with Next Clip', accelerator: 'CmdOrCtrl+J', enabled: ()=> !!selectedClip.value && !!nextClip(selectedClip.value.track, selectedClip.value.clip),
        run: ()=> joinWithNext(selectedClip.value.track, selectedClip.value.clip) },
    quantize: { label: 'Quantize', shown: 'Q', enabled: ()=> inRoll() || clipSelected(),
        run: ()=> inRoll() ? quantizePicked() : quantizeClip(selectedClip.value.track, selectedClip.value.clip) },
    up: { label: 'Transpose Up', shown: 'Up', run: ()=> transposePicked(1), enabled: inRoll },
    down: { label: 'Transpose Down', shown: 'Down', run: ()=> transposePicked(-1), enabled: inRoll },
    octaveUp: { label: 'Octave Up', shown: 'Shift+Up', run: ()=> transposePicked(12), enabled: inRoll },
    octaveDown: { label: 'Octave Down', shown: 'Shift+Down', run: ()=> transposePicked(-12), enabled: inRoll },
    nudgeLeft: { label: 'Nudge Left', shown: 'Left', enabled: ()=> inRoll() || clipSelected(),
        run: onSelection(()=> nudgePicked(-settings.value.grid), (t, c)=> nudgeClip(t, c, -barAt(project.value.meters, beat.value).beatsPerBar)) },
    nudgeRight: { label: 'Nudge Right', shown: 'Right', enabled: ()=> inRoll() || clipSelected(),
        run: onSelection(()=> nudgePicked(settings.value.grid), (t, c)=> nudgeClip(t, c, barAt(project.value.meters, beat.value).beatsPerBar)) },
    humanize: { label: 'Humanize', enabled: ()=> inRoll() || clipSelected(), run: onSelection(humanizePicked, humanizeClip) },
    doubleSpeed: { label: 'Double Speed', enabled: ()=> inRoll() || clipSelected(), run: onSelection(()=> scalePicked(0.5), (t, c)=> scaleClip(t, c, 0.5)) },
    halfSpeed: { label: 'Half Speed', enabled: ()=> inRoll() || clipSelected(), run: onSelection(()=> scalePicked(2), (t, c)=> scaleClip(t, c, 2)) },
    reverse: { label: 'Reverse', enabled: ()=> inRoll() || clipSelected(), run: onSelection(reversePicked, reverseClip) },
    muteClip: { label: 'Mute Clip', shown: 'M', enabled: ()=> !!selectedClip.value, checked: clipMuted,
        run: ()=> toggleClipMute(selectedClip.value.track, selectedClip.value.clip) },
    insertBars: { label: 'Insert Bars at Playhead…', run: ()=> changeBars(true) },
    deleteBars: { label: 'Delete Bars at Playhead…', run: ()=> changeBars(false) },
    // Track
    newTrack: { label: 'New Track', accelerator: 'Alt+CmdOrCtrl+N', run: ()=> addNewTrack({ after: selected.value }) },
    duplicateTrack: { label: 'Duplicate Track', accelerator: 'Shift+CmdOrCtrl+D', run: ()=> duplicateTheTrack(selected.value), enabled: ()=> !!track() },
    renameTrack: { label: 'Rename Track…', run: ()=> renameTrack(selected.value), enabled: ()=> !!track() },
    instrument: { label: 'Choose Instrument…', run: ()=> chooseInstrument(selected.value), enabled: ()=> !!track() },
    deleteTrack: { label: 'Delete Track', accelerator: 'CmdOrCtrl+Backspace', run: ()=> deleteTrack(selected.value), enabled: ()=> !!track() },
    mute: { label: 'Mute', run: ()=> toggleMute(selected.value), checked: ()=> !!track()?.mixer.mute, enabled: ()=> !!track() },
    solo: { label: 'Solo', run: ()=> toggleSolo(selected.value), checked: ()=> !!track()?.mixer.solo, enabled: ()=> !!track() },
    trackUp: { label: 'Move Track Up', accelerator: 'Alt+CmdOrCtrl+Up', run: ()=> moveTrackBy(selected.value, -1), enabled: ()=> !!track() && project.value.tracks[0] !== track() },
    trackDown: { label: 'Move Track Down', accelerator: 'Alt+CmdOrCtrl+Down', run: ()=> moveTrackBy(selected.value, 1), enabled: ()=> !!track() && project.value.tracks.at(-1) !== track() },
    // Transport
    play: { label: 'Play or Stop', shown: 'Space', run: toggle },
    end: { label: 'Go to End', shown: 'End', run: ()=> seek(projectEnd(project.value)) },
    start: { label: 'Go to Start', shown: 'Return', run: ()=> seek(project.value.loop && playing.value ? project.value.loop.from : 0) },
    prevBar: { label: 'Back a Bar', shown: ',', run: ()=> stepBar(-1) },
    nextBar: { label: 'Forward a Bar', shown: '.', run: ()=> stepBar(1) },
    prevMarker: { label: 'Previous Marker', shown: 'Alt+,', run: ()=> stepMarker(-1), enabled: ()=> project.value.markers.length > 0 },
    nextMarker: { label: 'Next Marker', shown: 'Alt+.', run: ()=> stepMarker(1), enabled: ()=> project.value.markers.length > 0 },
    record: { label: 'Record', shown: 'R', run: record, checked: ()=> !!recording.value },
    metronome: { label: 'Metronome', run: ()=> setSettings({ metronome: !settings.value.metronome }), checked: ()=> settings.value.metronome },
    click: { label: 'Click While Recording', run: ()=> setSettings({ click: !settings.value.click }), checked: ()=> settings.value.click },
    loop: { label: 'Loop', shown: 'C', run: ()=> loopOver(project.value.loop ? null : selectionRange()), checked: ()=> !!project.value.loop },
    loopSelection: { label: 'Loop Selection', accelerator: 'CmdOrCtrl+U', run: ()=> loopOver(selectionRange()) },
    addMarker: { label: 'Add Marker at Playhead…', run: ()=> addMarkerAt() },
    tempo: { label: 'Tempo…', run: askTempo },
    meter: { label: 'Meter…', run: askMeter },
    newFromMelody: { label: 'New from Melody', run: newFromMelody, enabled: ()=>
    {
        const c = selectedClip.value;
        return !!c && !!findClip(project.value, c.track, c.clip)?.notes.length;
    } },
    // View
    browser: { label: 'Browser', shown: 'B', run: ()=> setSettings({ browserOpen: !settings.value.browserOpen }), checked: ()=> settings.value.browserOpen },
    roll: { label: 'Piano Roll', accelerator: 'CmdOrCtrl+1', radio: true, run: ()=> setSettings({ editorTab: 'roll' }), checked: ()=> settings.value.editorTab === 'roll' },
    mixer: { label: 'Mixer', accelerator: 'CmdOrCtrl+2', radio: true, run: ()=> setSettings({ editorTab: 'mixer' }), checked: ()=> settings.value.editorTab === 'mixer' },
    zoomIn: { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', run: ()=> zoomBy(ZOOM) },
    zoomOut: { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', run: ()=> zoomBy(1 / ZOOM) },
    fit: { label: 'Zoom to Fit', accelerator: 'CmdOrCtrl+0', run: ()=> { arrangeZoom.value = 0; } },
    follow: { label: 'Follow Playhead', run: ()=> setSettings({ follow: !settings.value.follow }), checked: ()=> settings.value.follow },
    ghosts: { label: 'Show Other Tracks’ Notes', run: ()=> setSettings({ ghosts: !settings.value.ghosts }), checked: ()=> settings.value.ghosts },
    // Help
    composing: { label: 'How It Composes', run: ()=> appMenu.open('docs/COMPOSING.md') },
    readme: { label: 'Read Me', run: ()=> appMenu.open('README.md') },
};

/** a command as a menu item; `extra` overrides its fields (a label, or a run with arguments) */
export function item(id, extra = {})
{
    const c = COMMANDS[id];
    const run = extra.run ?? c.run;
    return {
        id, label: c.label, accelerator: c.accelerator, shown: c.shown, text: c.text, radio: c.radio,
        enabled: c.enabled ? c.enabled() : true,
        ...(c.checked && { checked: c.checked() }),
        ...extra,
        run: ()=> { if (!busy()) run(); },
    };
}

/** the snap grids, as radio items */
export const snapItems = ()=> GRIDS.map(([g, name])=> ({ label: name, radio: true, checked: settings.value.grid === g, run: ()=> setSettings({ grid: g }) }));
