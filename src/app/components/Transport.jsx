// The bar across the top: go to start, stop, play, record; where the playhead is; the song's tempo, meter and key;
// what's loading; the master volume.
import { audioEngine } from '../../platform/audio-engine.js';
import { barAt } from '../../composer/meter.js';
import { noteName } from '../../lib/notes.js';
import { song, beat, playing, status, settings, setSettings } from '../store.js';
import { play, stop, seek } from '../player.js';
import { pad, padTick, record } from '../sketchpad.js';

/** 'harmonicMinor' → 'harmonic minor' */
export const modeName = (mode)=> mode.replace(/[A-Z]/g, c => ` ${c.toLowerCase()}`);

/** '12.3' : bar and beat, from 1 */
export function position(score, b)
{
    if (!score) return '1.1';
    const at = barAt(score.sections, b);
    return `${at.bar + 1}.${Math.floor(b - at.start + 1e-6) + 1}`;
}

export function Transport()
{
    padTick.value;
    const s = song.value, score = s?.score;
    const recording = !!pad.rec;
    const chordNext = !!(pad.range && pad.take);
    const section = score && score.sections[barAt(score.sections, beat.value).section];
    return (
        <div class="transport">
            <div class="buttons">
                <button title="Go to the start" onClick={()=> seek(0)} disabled={!score}>⏮</button>
                <button title="Stop (Space) · again to go to the start" onClick={stop}>■</button>
                <button class={`play ${playing.value ? 'on' : ''}`} title="Play (Space)" onClick={()=> play()} disabled={!score}>▶</button>
                <button class={`rec ${recording ? 'on' : ''}`} title={chordNext ? 'Whistle the chord for the stretch (R)' : 'Record a whistled melody (R)'}
                    onClick={record}>●</button>
            </div>
            <div class="lcd">
                <span class="pos">{position(score, beat.value)}</span>
                <span><b>{score ? Math.round(score.tempo) : '–'}</b> bpm</span>
                <span><b>{section?.meter ?? '4/4'}</b></span>
                <span><b>{section ? `${noteName(60 + section.tonic).replace(/-?\d+$/, '')} ${modeName(section.mode)}` : '–'}</b></span>
                {section && <span>{section.label}</span>}
            </div>
            <div class="title">{s ? s.label : 'No song open'}{s?.story && <small>{s.story}</small>}</div>
            {status.value && <div class="status" role="status">{status.value}</div>}
            <label class="master" title="Master volume">Vol
                <input type="range" min="0" max="1" step="0.01" value={settings.value.volume}
                    onInput={(e)=> { const v = Number(e.currentTarget.value); audioEngine.volume = v; setSettings({ volume: v }); }} />
            </label>
        </div>
    );
}
