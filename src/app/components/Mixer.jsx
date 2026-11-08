// The mixer: a strip per track of the song (pan, fader, mute, solo) and the master volume.
import { audioEngine } from '../../platform/audio-engine.js';
import { ROLE_COLORS } from '../../composer/composer-data.js';
import { presetFor } from '../../composer/band-loader.js';
import { tracks, setTrack, selected, settings, setSettings, FADER_FLOOR_DB } from '../store.js';
import { rgba } from './canvas.js';

const DB = [FADER_FLOOR_DB, 6];
const db = (v)=> v <= DB[0] ? '-∞' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
const panName = (p)=> Math.abs(p) < 0.01 ? 'C' : `${p < 0 ? 'L' : 'R'}${Math.round(Math.abs(p) * 100)}`;

export function Mixer()
{
    settings.value.library;
    const list = tracks.value;
    if (!list.length) return <div class="mixer"><div class="empty">Open a song to mix it.</div></div>;
    return (
        <div class="mixer">
            {list.map((t, i)=> (
                <div class={`strip ${selected.value === i ? 'on' : ''}`} style={{ '--track': rgba(ROLE_COLORS[t.role] ?? ROLE_COLORS.lead) }}
                    onPointerDown={()=> { selected.value = i; }}>
                    <span class="name" title={t.name}>{t.name}</span>
                    <span class="inst">{t.override?.name ?? presetFor(t.bank, t.program).name}</span>
                    <input class="pan" type="range" min="-1" max="1" step="0.01" value={t.pan} title={`Pan ${panName(t.pan)} (double-click to centre)`}
                        onInput={(e)=> setTrack(i, { pan: Number(e.currentTarget.value) })} onDblClick={()=> setTrack(i, { pan: 0 })} />
                    <span class="db">{panName(t.pan)}</span>
                    <input class="fader" type="range" min={DB[0]} max={DB[1]} step="0.5" value={t.volumeDb} title="Volume (double-click for 0 dB)"
                        onInput={(e)=> setTrack(i, { volumeDb: Number(e.currentTarget.value) })} onDblClick={()=> setTrack(i, { volumeDb: 0 })} />
                    <span class="db">{db(t.volumeDb)} dB</span>
                    <div class="ms">
                        <button class={`mute ${t.mute ? 'on' : ''}`} title="Mute" onClick={()=> setTrack(i, { mute: !t.mute })}>M</button>
                        <button class={`solo ${t.solo ? 'on' : ''}`} title="Solo" onClick={()=> setTrack(i, { solo: !t.solo })}>S</button>
                    </div>
                </div>
            ))}
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
