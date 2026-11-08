// The app: loads the settings, opens the last project, wires musical typing and MIDI, and lays out the panels.
//
// Keys: Space plays and stops, R records, B shows the browser; Cmd+Z / Shift+Cmd+Z undo and redo, Cmd+S / Shift+Cmd+S
// save and save as, Cmd+N starts a new project, Cmd+T splits clips at the playhead. Delete removes what's selected in
// the part last clicked (notes, a clip, the chords picked), arrows transpose the selected notes, Cmd+A selects them all,
// Esc clears the selection.
import { render } from 'preact';
import { effect } from '@preact/signals';
import { audioEngine } from '../platform/audio-engine.js';
import { typing } from '../platform/keys.js';
import { projectFiles } from '../platform/project-files.js';
import { registerFx } from '../daw/fx.js';
import { removeClip, splitAt } from '../daw/project.js';
import { cut } from '../sketch/takes.js';
import { HUMANIZE, humanizeFx } from '../composer/humanize-fx.js';
import { settings, setSettings, loadSettings, project, dirty, selectedClip, chordRange, beat } from './store.js';
import { edit, undo, redo, save, saveAs, openProject, newProject } from './document.js';
import { toggle } from './player.js';
import { startLive, connectMidi } from './live.js';
import { record } from './recording.js';
import { focus } from './focus.js';
import { Transport } from './components/Transport.jsx';
import { Browser } from './components/Browser.jsx';
import { Arrange } from './components/Arrange.jsx';
import { Editor } from './components/Editor.jsx';
import { NewProject, dialog } from './components/NewProject.jsx';
import { Ask } from './components/Ask.jsx';
import { asking } from './ask.js';
import { deletePicked, transposePicked, pickAll, clearPicked } from './components/PianoRoll.jsx';

const EDITOR_H = [140, 0.8];        // px, and at most this much of the window

function Split()
{
    const down = (e)=>
    {
        e.currentTarget.setPointerCapture(e.pointerId);
        const startY = e.clientY, startH = settings.value.editorHeight;
        const move = (m)=> setSettings({ editorHeight: Math.round(Math.max(EDITOR_H[0], Math.min(innerHeight * EDITOR_H[1], startH - (m.clientY - startY)))) });
        const up = ()=> { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
        addEventListener('pointermove', move);
        addEventListener('pointerup', up);
    };
    return <div class="split" onPointerDown={down} title="Drag to resize" />;
}

function App()
{
    const s = settings.value;
    return (
        <div class={`app ${s.browserOpen ? '' : 'no-browser'}`} style={{ '--editor-h': `${s.editorHeight}px` }}>
            <Transport />
            {s.browserOpen ? <Browser /> : <div />}
            <Arrange />
            <Split />
            <Editor />
            <NewProject />
            <Ask />
        </div>
    );
}

/** Delete: the selected notes, clip or chords, in the part last clicked */
function deleteSelection()
{
    if (focus.value === 'roll') return deletePicked();
    if (focus.value === 'chords')
    {
        const r = chordRange.value;
        if (!r) return false;
        edit(p => ({ ...p, chords: p.chords.flatMap(c => cut(c, r.beat, r.beat + r.beats)) }));
        chordRange.value = null;
        return true;
    }
    const c = selectedClip.value;
    if (!c) return false;
    edit(p => removeClip(p, c.track, c.clip));
    selectedClip.value = null;
    return true;
}

// the command keys, which work in text fields too except where the field has its own (Cmd+A, Cmd+Z)
const COMMANDS = {
    KeyZ: (e)=> e.shiftKey ? redo() : undo(),
    KeyS: (e)=> e.shiftKey ? saveAs() : save(),
    KeyN: ()=> { dialog.value = true; },
    KeyT: ()=> { const c = selectedClip.value; edit(p => splitAt(p, beat.value, c?.track ?? null)); },
    KeyA: ()=> { if (focus.value !== 'roll') return false; pickAll(); },
};

addEventListener('keydown', (e)=>
{
    if (dialog.value || asking.value) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.code in COMMANDS)
    {
        if (typing() && (e.code === 'KeyZ' || e.code === 'KeyA')) return;
        if (COMMANDS[e.code](e) !== false) e.preventDefault();
        return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || typing()) return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) toggle(); return; }
    if (e.code === 'KeyR' && !e.repeat) { record(); return; }
    if (e.code === 'KeyB' && !e.repeat) { setSettings({ browserOpen: !settings.value.browserOpen }); return; }
    if (e.code === 'Escape') { clearPicked(); selectedClip.value = null; chordRange.value = null; return; }
    if ((e.code === 'Delete' || e.code === 'Backspace') && deleteSelection()) { e.preventDefault(); return; }
    if (focus.value === 'roll' && (e.code === 'ArrowUp' || e.code === 'ArrowDown'))
        if (transposePicked((e.code === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1))) e.preventDefault();
});

effect(()=> { document.title = `${project.value.title}${dirty.value ? ' *' : ''} · Music Generator`; });

registerFx(HUMANIZE, humanizeFx);
await loadSettings();
audioEngine.volume = settings.value.volume;
startLive();
connectMidi();
const list = await projectFiles.list().catch(()=> []);
const first = list.find(p => p.name === settings.value.project) ?? list[0];
if (!first || !await openProject(first.name)) newProject();
render(<App />, document.body);
