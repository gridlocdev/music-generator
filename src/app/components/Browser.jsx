// The panel at the left: the projects in projects/ to open, instruments to put on the selected track (or drag onto
// any track), and the open project's whistled takes, to read again onto a track.
import { useEffect, useMemo } from 'preact/hooks';
import { signal } from '@preact/signals';
import { soundfontLibrary } from '../../audio/soundfont-library.js';
import { projectFiles } from '../../platform/project-files.js';
import { settings, setSettings, selectedTrack, projectName, project, beat, status } from '../store.js';
import { openProject } from '../document.js';
import { reload } from '../player.js';
import { dropTake } from '../recording.js';
import { liveName } from '../live.js';
import { assignPreset } from './Arrange.jsx';
import { dialog } from './NewProject.jsx';

const TABS = [['projects', 'Projects'], ['instruments', 'Instruments'], ['takes', 'Takes']];

/** the projects in projects/, and the open one's takes, as last listed */
const listed = signal(/** @type {{ name: string, title: string }[]} */ ([]));
const takes = signal(/** @type {string[]} */ ([]));

async function refreshProjects()
{
    listed.value = await projectFiles.list().catch(e => { status.value = e.message; return []; });
}

function groups(list, key)
{
    const out = new Map();
    for (const x of list) { const g = key(x); if (!out.has(g)) out.set(g, []); out.get(g).push(x); }
    return [...out];
}

function Projects()
{
    // a save adds or renames one
    useEffect(()=> { refreshProjects(); }, [projectName.value]);
    const open = projectName.value;
    return (
        <>
            <div class="foot"><button onClick={()=> { dialog.value = true; }}>New project…</button></div>
            <div class="list">
                {listed.value.length ? listed.value.map(p => (
                    <div class={`item ${p.name === open ? 'on' : ''}`} title={`projects/${p.name}`} onClick={()=> p.name !== open && openProject(p.name)}>{p.title}</div>
                )) : <div class="empty">No projects yet. Save one, or make one with New project.</div>}
            </div>
        </>
    );
}

function Instruments()
{
    settings.value.library;
    const presets = useMemo(()=> soundfontLibrary.presets(), [settings.value.library]);
    const lib = soundfontLibrary.current;
    const track = selectedTrack.value;
    return (
        <>
            <div class="foot">
                <select value={lib.id} onChange={(e)=> { soundfontLibrary.select(e.currentTarget.value); setSettings({ library: soundfontLibrary.current.id }); reload(); }}>
                    {soundfontLibrary.all.map(l => <option value={l.id}>{l.name}</option>)}
                </select>
                <div style="margin-top: 6px">{track ? `Click to put on ${track.name}, or drag onto a track` : 'Select a track to put an instrument on it, or drag one onto a track'}</div>
            </div>
            <div class="list">
                {groups(presets, p => p.bank >= 127 ? 'Drum kits' : p.url.split('/').pop()).map(([group, list])=> (
                    <>
                        <div class="group">{group}</div>
                        {list.map(p => (
                            <div class={`item ${p.name === liveName.value ? 'on' : ''}`} draggable
                                onDragStart={(e)=> e.dataTransfer?.setData('application/x-preset', JSON.stringify({ bank: p.bank, program: p.program }))}
                                onClick={()=> track && assignPreset(track.id, p)}>{p.name}</div>
                        ))}
                    </>
                ))}
            </div>
        </>
    );
}

function Takes()
{
    const name = projectName.value;
    useEffect(()=> { takes.value = []; if (name) projectFiles.takes(name).then(t => { takes.value = t; }); }, [name, project.value]);
    const track = selectedTrack.value;
    if (!name) return <div class="list"><div class="empty">Save the project to keep its whistled takes.</div></div>;
    return (
        <>
            <div class="foot">{track ? `Click to read a take onto ${track.name} at the playhead` : 'Select a track to read a take onto it'}</div>
            <div class="list">
                {takes.value.length ? takes.value.map(f => (
                    <div class="item" draggable onDragStart={(e)=> e.dataTransfer?.setData('application/x-take', f)}
                        onClick={()=> track && dropTake(track.id, f, beat.value)}>{f}</div>
                )) : <div class="empty">Takes you record (●) are kept here.</div>}
            </div>
        </>
    );
}

export function Browser()
{
    const tab = settings.value.browserTab;
    return (
        <div class="browser">
            <div class="tabs">
                {TABS.map(([id, label])=> <button class={tab === id ? 'on' : ''} onClick={()=> setSettings({ browserTab: id })}>{label}</button>)}
            </div>
            {tab === 'instruments' ? <Instruments /> : tab === 'takes' ? <Takes /> : <Projects />}
        </div>
    );
}
