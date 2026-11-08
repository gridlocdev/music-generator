// The app: loads the settings, opens the last project, wires musical typing and MIDI, and lays out the panels.
//
// The menu bar and the keys are in commands.js, the right-click menus in context-menus.js.
import { render } from 'preact';
import { effect } from '@preact/signals';
import { audioEngine } from '../platform/audio-engine.js';
import { projectFiles } from '../platform/project-files.js';
import { registerFx } from '../daw/fx.js';
import { HUMANIZE, humanizeFx } from '../composer/humanize-fx.js';
import { settings, setSettings, loadSettings, project, dirty } from './store.js';
import { checkLibraries } from './libraries.js';
import { openProject, newProject } from './document.js';
import { startLive, connectMidi } from './live.js';
import { startMenus } from './menu-bar.js';
import { handleKey } from './keys.js';
import { textMenu } from './context-menus.js';
import { Transport } from './components/Transport.jsx';
import { Browser } from './components/Browser.jsx';
import { Arrange } from './components/Arrange.jsx';
import { Editor } from './components/Editor.jsx';
import { NewProject } from './components/NewProject.jsx';
import { ExportDialog } from './components/ExportDialog.jsx';
import { Ask } from './components/Ask.jsx';

const EDITOR_H = [140, 0.8];        // px, and at most this much of the window

function Split()
{
    const down = (e)=>
    {
        e.currentTarget.setPointerCapture(e.pointerId);
        const startY = e.clientY, startH = settings.value.editorHeight;
        const move = (m)=> setSettings({ editorHeight: Math.round(Math.max(EDITOR_H[0], Math.min(innerHeight * EDITOR_H[1], startH - (m.clientY - startY)))) });
        const up = ()=> { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
        addEventListener('pointermove', move);
        addEventListener('pointerup', up); addEventListener('pointercancel', up);
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
            <ExportDialog />
            <Ask />
        </div>
    );
}

addEventListener('keydown', (e)=> { if (handleKey(e)) e.preventDefault(); });
// text fields get the usual edit menu on a right-click
addEventListener('contextmenu', (e)=>
{
    const t = e.target;
    if (e.defaultPrevented || !(t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type !== 'range'))) return;
    e.preventDefault();
    textMenu();
});

effect(()=> { document.title = `${project.value.title}${dirty.value ? ' *' : ''} · Music Generator`; });
// closing the window with changes unsaved: the app asks first
addEventListener('beforeunload', (e)=> { if (dirty.value) { e.preventDefault(); e.returnValue = ''; } });

registerFx(HUMANIZE, humanizeFx);
await loadSettings();
await checkLibraries();
audioEngine.volume = settings.value.volume;
startLive();
connectMidi();
const list = await projectFiles.list().catch(()=> []);
const first = list.find(p => p.name === settings.value.project) ?? list[0];
if (!first || !await openProject(first.name)) newProject();
render(<App />, document.body);
startMenus();
