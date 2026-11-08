// The piano roll's toolbar: the snap grid, the track and clip shown, the click and New from melody.
import { barAt } from '../../daw/meter.js';
import { findClip } from '../../daw/project.js';
import { project, selectedClip, selectedTrack, settings, setSettings } from '../store.js';
import { GRIDS } from '../notes.js';
import { newFromMelody } from '../recording.js';

export function RollToolbar()
{
    const t = selectedTrack.value, sel = selectedClip.value;
    const clip = sel && findClip(project.value, sel.track, sel.clip);
    return (
        <div class="toolbar">
            <label>Snap
                <select value={String(settings.value.grid)} onChange={(e)=> setSettings({ grid: Number(e.currentTarget.value) })}>
                    {GRIDS.map(([g, name])=> <option value={String(g)}>{name}</option>)}
                </select>
            </label>
            <span class="sep" />
            <span>{t ? `${t.name}${clip ? ` · clip at bar ${barAt(project.value.meters, clip.start).bar + 1}` : ''}` : 'Select a track'}</span>
            <span class="sep" />
            <label title="A click while recording, after the count-in"><input type="checkbox" checked={settings.value.click}
                onChange={(e)=> setSettings({ click: e.currentTarget.checked })} /> Click</label>
            <button disabled={!clip?.notes.length} onClick={newFromMelody} title="A new project composed round the selected clip's melody and the chords over it">New from melody</button>
        </div>
    );
}
