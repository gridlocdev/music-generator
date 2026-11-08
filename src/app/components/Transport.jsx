// The bar across the top: go to start, stop, play, record; where the playhead is; the project's tempo and meter (both
// editable), key and the marker at the playhead; the project's title, with * when there are changes to save; New,
// Save, Save as; what's loading; the master volume.
import { audioEngine } from '../../platform/audio-engine.js';
import { barAt, meterAt, beatsPerBar } from '../../daw/meter.js';
import { setTempo, setMeter } from '../../daw/project.js';
import { bpmAt } from '../../lib/tempo-map.js';
import { noteName } from '../../lib/notes.js';
import { project, dirty, beat, playing, status, settings, setSettings } from '../store.js';
import { edit, save, saveAs } from '../document.js';
import { play, stop, seek } from '../player.js';
import { recording, record } from '../recording.js';
import { dialog } from './NewProject.jsx';

/** 'harmonicMinor' → 'harmonic minor' */
export const modeName = (mode)=> mode.replace(/[A-Z]/g, c => ` ${c.toLowerCase()}`);

/** '12.3' : bar and beat, from 1 */
export function position(meters, b)
{
    const at = barAt(meters, b);
    return `${at.bar + 1}.${Math.floor(b - at.start + 1e-6) + 1}`;
}

const validMeter = (s)=> /^\d{1,2}\/(2|4|8|16)$/.test(s) && beatsPerBar(s) > 0;

export function Transport()
{
    const p = project.value, now = beat.value;
    const bpm = Math.round(bpmAt(p.tempoMap, now));
    const sig = meterAt(p.meters, now).sig;
    const marker = p.markers.findLast(m => m.beat <= now + 1e-6);
    return (
        <div class="transport">
            <div class="buttons">
                <button title="Go to the start" onClick={()=> seek(0)}>⏮</button>
                <button title="Stop (Space) · again to go to the start" onClick={stop}>■</button>
                <button class={`play ${playing.value ? 'on' : ''}`} title="Play (Space)" onClick={()=> play()}>▶</button>
                <button class={`rec ${recording.value ? 'on' : ''}`} title="Record a whistled melody on the selected track, or a chord over the stretch picked on the chord track (R)"
                    onClick={record}>●</button>
            </div>
            <div class="lcd">
                <span class="pos">{position(p.meters, now)}</span>
                <span><input class="num" type="number" min="20" max="300" value={bpm} title="Tempo: changes the whole tempo map in proportion"
                    onChange={(e)=> { const v = Number(e.currentTarget.value); if (v >= 20 && v <= 300) edit(q => setTempo(q, v)); else e.currentTarget.value = String(bpm); }} /> bpm</span>
                <span><input class="num meter" value={sig} title="Meter (the first one; 4/4, 6/8, 7/8…)"
                    onChange={(e)=> { const v = e.currentTarget.value.trim(); if (validMeter(v)) edit(q => setMeter(q, v)); else e.currentTarget.value = sig; }} /></span>
                {p.key && <span><b>{`${noteName(60 + p.key.tonic).replace(/-?\d+$/, '')} ${modeName(p.key.mode)}`}</b></span>}
                {marker && <span>{marker.name}</span>}
            </div>
            <div class="title">{p.title}{dirty.value ? ' *' : ''}</div>
            <div class="buttons file">
                <button title="New project (Cmd+N)" onClick={()=> { dialog.value = true; }}>New…</button>
                <button title="Save (Cmd+S)" onClick={save}>Save</button>
                <button title="Save as (Shift+Cmd+S)" onClick={saveAs}>Save as…</button>
            </div>
            {status.value && <div class="status" role="status">{status.value}</div>}
            <label class="master" title="Master volume">Vol
                <input type="range" min="0" max="1" step="0.01" value={settings.value.volume}
                    onInput={(e)=> { const v = Number(e.currentTarget.value); audioEngine.volume = v; setSettings({ volume: v }); }} />
            </label>
        </div>
    );
}
