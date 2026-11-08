// The panel at the left: songs and feelings to open, instruments to put on the selected track (or drag onto any
// track), and the sketches saved in ideas/.
import { useEffect, useMemo } from 'preact/hooks';
import { CATALOG } from '../../composer/catalog.js';
import { soundfontLibrary } from '../../audio/soundfont-library.js';
import { settings, setSettings, song, selected, tracks, setTrack } from '../store.js';
import { openSong, reload } from '../player.js';
import { ideas, refreshIdeas, openIdea } from '../sketchpad.js';
import { liveName } from '../live.js';

const TABS = [['songs', 'Songs'], ['instruments', 'Instruments'], ['ideas', 'Ideas']];

function groups(list, key)
{
    const out = new Map();
    for (const x of list) { const g = key(x); if (!out.has(g)) out.set(g, []); out.get(g).push(x); }
    return [...out];
}

function Songs()
{
    const open = song.value?.id;
    const story = CATALOG.find(c => c.id === open)?.story;
    return (
        <>
            <div class="list">
                {groups(CATALOG, c => c.group).map(([group, list])=> (
                    <>
                        <div class="group">{group}</div>
                        {list.map(c => (
                            <div class={`item ${c.id === open ? 'on' : ''}`} title={c.story ?? c.label} onClick={()=> openSong(c)}>{c.label}</div>
                        ))}
                    </>
                ))}
            </div>
            {story && <div class="foot">{story}</div>}
        </>
    );
}

/** puts a preset on a score track, in place of the song's own, and restarts playback so it's heard */
export function assignPreset(i, p)
{
    setTrack(i, { override: { bank: p.bank, program: p.program, name: p.name } });
    reload();
}

function Instruments()
{
    settings.value.library;
    const presets = useMemo(()=> soundfontLibrary.presets(), [settings.value.library]);
    const lib = soundfontLibrary.current;
    const sel = selected.value;
    const track = typeof sel === 'number' ? tracks.value[sel] : null;
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
                                onDragStart={(e)=> e.dataTransfer?.setData('application/x-preset', JSON.stringify({ bank: p.bank, program: p.program, name: p.name }))}
                                onClick={()=> track && assignPreset(/** @type {number} */ (sel), p)}>{p.name}</div>
                        ))}
                    </>
                ))}
            </div>
        </>
    );
}

function Ideas()
{
    useEffect(()=> { refreshIdeas(); }, []);
    return (
        <div class="list">
            {ideas.value.length ? ideas.value.map(name => <div class="item" onClick={()=> openIdea(name)}>{name}</div>)
                : <div class="empty">Sketches you save from the whistle track show up here.</div>}
        </div>
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
            {tab === 'songs' ? <Songs /> : tab === 'instruments' ? <Instruments /> : <Ideas />}
        </div>
    );
}
