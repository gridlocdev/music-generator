// The app: loads the settings, opens the last song, wires musical typing and MIDI, and lays out the panels. Space
// plays and stops, R records on the whistle track, and the whistle track's editing keys work when it's selected.
import { render } from 'preact';
import { audioEngine } from '../platform/audio-engine.js';
import { typing } from '../platform/keys.js';
import { CATALOG } from '../composer/catalog.js';
import { settings, setSettings, loadSettings, selected } from './store.js';
import { openSong, toggle } from './player.js';
import { startLive, connectMidi } from './live.js';
import { record, editKey } from './sketchpad.js';
import { Transport } from './components/Transport.jsx';
import { Browser } from './components/Browser.jsx';
import { Arrange } from './components/Arrange.jsx';
import { Editor } from './components/Editor.jsx';

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
        </div>
    );
}

addEventListener('keydown', (e)=>
{
    if (e.metaKey || e.ctrlKey || e.altKey || typing()) return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) toggle(); return; }
    if (e.code === 'KeyR' && !e.repeat) { record(); return; }
    if (e.code === 'KeyB' && !e.repeat) { setSettings({ browserOpen: !settings.value.browserOpen }); return; }
    if (selected.value === 'whistle' && editKey(e)) e.preventDefault();
});

await loadSettings();
audioEngine.volume = settings.value.volume;
startLive();
connectMidi();
openSong(CATALOG.find(c => c.id === settings.value.songId) ?? CATALOG[0]);
render(<App />, document.body);
