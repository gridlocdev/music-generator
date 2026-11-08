// The bar across the top: go to start, stop, play, record; where the playhead is; the project's tempo and meter (both
// editable), key and the marker at the playhead; the project's title, with * when there are changes to save; New,
// Save, Save as; what's loading; the master volume.
import { computed } from '@preact/signals';
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

// what the playhead is in: these change a few times a song, so the bar re-renders then and not on every frame of
// playback (which would also undo typing in the tempo and meter boxes)
const bpmNow = computed(()=> Math.round(bpmAt(project.value.tempoMap, beat.value)));
const sigNow = computed(()=> meterAt(project.value.meters, beat.value).sig);
const markerNow = computed(()=> project.value.markers.findLast(m => m.beat <= beat.value + 1e-6)?.name ?? '');

/** where the playhead is, the one part that changes every frame */
function Position()
{
    return <span class="pos">{position(project.value.meters, beat.value)}</span>;
}

export function Transport()
{
    const p = project.value;
    const bpm = bpmNow.value, sig = sigNow.value, marker = markerNow.value;
    return (
        <div class="transport">
            <div class="buttons">
                <button title="Go to the start" onClick={()=> seek(0)}>⏮</button>
                <button title="Stop (Space) · again to go to the start" onClick={stop}>■</button>
                <button class={`play ${playing.value ? 'on' : ''}`} title="Play (Space)" onClick={()=> play()}>▶</button>
                <button class={`rec ${recording.value ? 'on' : ''}`} title="Record a whistled melody on the selected track, or a chord over the stretch picked on the chord track (R)"
                    onClick={record}>●</button>
                <button class={`click ${settings.value.metronome ? 'on' : ''}`} title="Metronome: a click on every beat while playing"
                    onClick={()=> setSettings({ metronome: !settings.value.metronome })}>♩</button>
            </div>
            <div class="lcd">
                <Position />
                <span><input class="num" type="number" min="20" max="300" value={bpm} title="Tempo: changes the whole tempo map in proportion"
                    onChange={(e)=> { const v = Number(e.currentTarget.value); if (v >= 20 && v <= 300) edit(q => setTempo(q, v)); else e.currentTarget.value = String(bpm); }} /> bpm</span>
                <span><input class="num meter" value={sig} title="Meter (the first one; 4/4, 6/8, 7/8…)"
                    onChange={(e)=> { const v = e.currentTarget.value.trim(); if (validMeter(v)) edit(q => setMeter(q, v)); else e.currentTarget.value = sig; }} /></span>
                {p.key && <span><b>{`${noteName(60 + p.key.tonic).replace(/-?\d+$/, '')} ${modeName(p.key.mode)}`}</b></span>}
                {marker && <span>{marker}</span>}
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
