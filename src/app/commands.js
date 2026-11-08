// The app's commands: each with its label, shortcut, action and when it can be used, for the menu bar, the keys and
// the right-click menus alike. Shortcuts with Cmd are answered by the menu bar (`accelerator`); plain keys, which
// must still type in a text field, by the page (`shown`, matched by handleKey).
//
// What Edit's commands act on follows the part last clicked (focus.js): the picked notes in the piano roll, the
// selected clip in the arrangement, or the stretch picked on the chord track.
import { effect } from '@preact/signals';
import { appMenu } from '../platform/app-menu.js';
import { typing } from '../platform/keys.js';
import { barAt, barLines } from '../daw/meter.js';
import { projectEnd, markerRange, addMarker, setTempo, setMeter, findClip } from '../daw/project.js';
import { projectMidi } from '../daw/project-midi.js';
import { beatsPerBar } from '../daw/meter.js';
import { bpmAt } from '../lib/tempo-map.js';
import { cut as cutChord } from '../sketch/takes.js';
import { project, projectName, projectList, dirty, hist, selected, selectedClip, selectedTrack, chordRange, beat, playing,
    settings, setSettings, status } from './store.js';
import { edit, undo, redo, save, saveAs, openProject, refreshProjects } from './document.js';
import { toggle, seek } from './player.js';
import { record, recording, newFromMelody } from './recording.js';
import { focus } from './focus.js';
import { asking, askText } from './ask.js';
import { picked, pickedNotes, deletePicked, transposePicked, quantizePicked, pickAll, clearPicked, GRIDS } from './notes.js';
import { cut, copy, paste, duplicate, canCopy, clipboard } from './clipboard.js';
import { addNewTrack, renameTrack, deleteTrack, duplicateTheTrack, moveTrackBy, toggleMute, toggleSolo, chooseInstrument,
    deleteClip, splitClipsAt, joinWithNext, nextClip, quantizeClip, loopOver, clipRange, arrangeZoom } from './tracks.js';
import { dialog } from './components/NewProject.jsx';

/** a dialog is open: commands wait */
const busy = ()=> !!(dialog.value || asking.value);

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

export async function askTempo()
{
    const now = Math.round(bpmAt(project.value.tempoMap, beat.value));
    const v = Number(await askText('Tempo (bpm): the whole tempo map changes in proportion', String(now), 'Set'));
    if (v >= 20 && v <= 300) edit(p => setTempo(p, v));
}

export async function askMeter()
{
    const v = (await askText('Meter (4/4, 6/8, 7/8…)', project.value.meters[0].sig, 'Set'))?.trim();
    if (v && /^\d{1,2}\/(2|4|8|16)$/.test(v) && beatsPerBar(v) > 0) edit(p => setMeter(p, v));
}

async function exportMidi()
{
    const p = project.value;
    const file = await appMenu.saveFile(`${projectName.value || 'untitled'}.mid`, projectMidi(p));
    if (file) status.value = `Exported ${file}`;
}

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
    start: { label: 'Go to Start', shown: 'Return', run: ()=> seek(project.value.loop && playing.value ? project.value.loop.from : 0) },
    prevBar: { label: 'Back a Bar', shown: ',', run: ()=> stepBar(-1) },
    nextBar: { label: 'Forward a Bar', shown: '.', run: ()=> stepBar(1) },
    prevMarker: { label: 'Previous Marker', shown: 'Alt+,', run: ()=> stepMarker(-1), enabled: ()=> project.value.markers.length > 0 },
    nextMarker: { label: 'Next Marker', shown: 'Alt+.', run: ()=> stepMarker(1), enabled: ()=> project.value.markers.length > 0 },
    record: { label: 'Record', shown: 'R', run: record, checked: ()=> !!recording.value },
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
    fit: { label: 'Zoom to Fit', accelerator: 'CmdOrCtrl+0', run: ()=> { arrangeZoom.value = 0; } },
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

// ── the menu bar ─────────────────────────────────────────────────────────────────────────────────────────────────────

function menuBar()
{
    const open = projectList.value.map(x => ({ label: x.title, radio: true, checked: x.name === projectName.value, run: ()=> openProject(x.name) }));
    return [
        { label: 'File', submenu: [item('new'), item('open'), { label: 'Open Project', submenu: open.length ? open : [{ label: 'No projects', enabled: false }] }, '-',
            item('save'), item('saveAs'), item('revert'), '-', item('exportMidi'), item('reveal')] },
        { label: 'Edit', submenu: [item('undo'), item('redo'), '-', item('cut'), item('copy'), item('paste'), item('duplicate'), item('delete'), '-',
            item('selectAll'), item('deselect'), '-', item('split'), item('join'), item('quantize'), { label: 'Snap', submenu: snapItems() }, '-',
            item('up'), item('down'), item('octaveUp'), item('octaveDown')] },
        { label: 'Track', submenu: [item('newTrack'), item('duplicateTrack'), item('renameTrack'), item('instrument'), '-',
            item('mute'), item('solo'), '-', item('trackUp'), item('trackDown'), '-', item('deleteTrack')] },
        { label: 'Transport', submenu: [item('play'), item('record'), '-', item('start'), item('prevBar'), item('nextBar'), item('prevMarker'), item('nextMarker'), '-',
            item('loop'), item('loopSelection'), item('click'), '-', item('addMarker'), item('tempo'), item('meter'), '-', item('newFromMelody')] },
        { label: 'View', submenu: [item('browser'), '-', item('roll'), item('mixer'), '-', item('fit'), { role: 'togglefullscreen' }, '-',
            { label: 'Developer', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] }] },
        { label: 'Help', submenu: [item('composing'), item('readme')] },
    ];
}

/** keeps the menu bar's items enabled, checked and listed as the app changes, a moment after it does */
export function startMenus()
{
    let timer = 0;
    effect(()=>
    {
        const bar = menuBar();
        clearTimeout(timer);
        timer = setTimeout(()=> appMenu.setBar(bar), 60);
    });
    const focusChanged = ()=> appMenu.typing(typing());
    addEventListener('focusin', focusChanged);
    addEventListener('focusout', ()=> setTimeout(focusChanged));
    refreshProjects();
}

// ── plain keys ───────────────────────────────────────────────────────────────────────────────────────────────────────

const CODES = { Space: 'Space', Up: 'ArrowUp', Down: 'ArrowDown', Return: 'Enter', ',': 'Comma', '.': 'Period', Escape: 'Escape', Backspace: 'Backspace' };
const codeOf = (key)=> CODES[key] ?? (/^\d$/.test(key) ? `Digit${key}` : `Key${key}`);

function parse(keys, id)
{
    const parts = keys.split('+');
    return { code: codeOf(parts.at(-1)), shift: parts.includes('Shift'), alt: parts.includes('Alt'), cmd: parts.includes('CmdOrCtrl'), id };
}

/** the shortcuts the page answers: the plain keys, and the Cmd ones too where there's no menu bar */
const KEYS = Object.entries(COMMANDS).flatMap(([id, c])=> [c.shown && parse(c.shown, id), !appMenu.native && c.accelerator && parse(c.accelerator, id)]).filter(Boolean);

/** answers a key the menu bar doesn't: true when it did something */
export function handleKey(e)
{
    if (busy()) return false;
    const code = e.code === 'Delete' ? 'Backspace' : e.code, cmd = e.metaKey || e.ctrlKey;
    const k = KEYS.find(x => x.code === code && x.shift === e.shiftKey && x.alt === e.altKey && x.cmd === cmd);
    // a text field keeps its own keys, and its own undo, copy and paste
    if (!k || (typing() && (!k.cmd || COMMANDS[k.id].text))) return false;
    if (e.repeat && !['up', 'down', 'octaveUp', 'octaveDown', 'prevBar', 'nextBar'].includes(k.id)) return false;
    const c = COMMANDS[k.id];
    if (c.enabled && !c.enabled()) return false;
    c.run();
    return true;
}
