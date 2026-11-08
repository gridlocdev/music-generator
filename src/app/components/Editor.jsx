// The panel under the arrangement: the piano roll for the selected track, or the mixer.
import { settings, setSettings, selected, tracks } from '../store.js';
import { PianoRoll } from './PianoRoll.jsx';
import { Mixer } from './Mixer.jsx';

const TABS = [['roll', 'Piano Roll'], ['mixer', 'Mixer']];

export function Editor()
{
    const tab = settings.value.editorTab;
    const sel = selected.value;
    const what = sel === 'whistle' ? 'Whistle' : tracks.value[sel]?.name ?? '';
    return (
        <div class="editor">
            <div class="tabs">
                {TABS.map(([id, label])=> <button class={tab === id ? 'on' : ''} onClick={()=> setSettings({ editorTab: id })}>{label}</button>)}
                {tab === 'roll' && <span class="what">{what}{sel !== 'whistle' && ' · as composed'}</span>}
            </div>
            {tab === 'roll' ? <PianoRoll /> : <Mixer />}
        </div>
    );
}
