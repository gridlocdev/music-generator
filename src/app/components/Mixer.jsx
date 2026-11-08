// The mixer: a strip per track (pan, fader, mute, solo) and the master volume. Every move is an edit of the project,
// a drag one undo step. Right-click a strip for more.
import { audioEngine } from '../../platform/audio-engine.js';
import { presetFor } from '../../daw/instruments.js';
import { setMixer } from '../../daw/project.js';
import { project, selected, settings, setSettings, FADER_FLOOR_DB } from '../store.js';
import { edit } from '../document.js';
import { toggleMute, toggleSolo } from '../tracks.js';
import { stripMenu } from '../context-menus.js';
import { rgba } from './canvas.js';

const DB = [FADER_FLOOR_DB, 6];
const db = (v)=> v <= DB[0] ? '-∞' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
const panName = (p)=> Math.abs(p) < 0.01 ? 'C' : `${p < 0 ? 'L' : 'R'}${Math.round(Math.abs(p) * 100)}`;

const set = (id, field, value)=> edit(p => setMixer(p, id, { [field]: value }), `mix:${id}:${field}`);

export function Mixer()
{
    settings.value.library;
    const list = project.value.tracks;
    if (!list.length) return <div class="mixer"><div class="empty">Add a track to mix it.</div></div>;
    return (
        <div class="mixer">
            {list.map(t =>
            {
                const m = t.mixer;
                return (
                    <div class={`strip ${selected.value === t.id ? 'on' : ''}`} style={{ '--track': rgba(t.color) }}
                        onPointerDown={()=> { selected.value = t.id; }} onContextMenu={(e)=> { e.preventDefault(); stripMenu(t.id); }}>
                        <span class="name" title={t.name}>{t.name}</span>
                        <span class="inst">{presetFor(t.instrument.bank, t.instrument.program).name}</span>
                        <input class="pan" type="range" min="-1" max="1" step="0.01" value={m.pan} title={`Pan ${panName(m.pan)} (double-click to centre)`}
                            onInput={(e)=> set(t.id, 'pan', Number(e.currentTarget.value))} onDblClick={()=> set(t.id, 'pan', 0)} />
                        <span class="db">{panName(m.pan)}</span>
                        <input class="fader" type="range" min={DB[0]} max={DB[1]} step="0.5" value={m.volumeDb} title="Volume (double-click for 0 dB)"
                            onInput={(e)=> set(t.id, 'volumeDb', Number(e.currentTarget.value))} onDblClick={()=> set(t.id, 'volumeDb', 0)} />
                        <span class="db">{db(m.volumeDb)} dB</span>
                        <div class="ms">
                            <button class={`mute ${m.mute ? 'on' : ''}`} title="Mute" onClick={()=> toggleMute(t.id)}>M</button>
                            <button class={`solo ${m.solo ? 'on' : ''}`} title="Solo" onClick={()=> toggleSolo(t.id)}>S</button>
                        </div>
                    </div>
                );
            })}
            <div class="strip master">
                <span class="name">Master</span>
                <span class="inst">&nbsp;</span>
                <input class="fader" type="range" min="0" max="1" step="0.01" value={settings.value.volume} title="Master volume"
                    onInput={(e)=> { const v = Number(e.currentTarget.value); audioEngine.volume = v; setSettings({ volume: v }); }} />
                <span class="db">{Math.round(settings.value.volume * 100)}%</span>
            </div>
        </div>
    );
}
