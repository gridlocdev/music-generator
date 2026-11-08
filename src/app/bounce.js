// Export as Audio File: the whole project played into an offline context, faster than it would play, and saved as a
// stereo WAV. It plays as Play would (instruments, mixer, automation, Humanize) but once through, with no loop.
import { loadInstruments } from '../daw/instruments.js';
import { playProject, LEAD_IN } from '../daw/player.js';
import { projectEnd } from '../daw/project.js';
import { beatToSeconds } from '../lib/tempo-map.js';
import { encodeWavChannels } from '../lib/wav.js';
import { audioEngine } from '../platform/audio-engine.js';
import { appMenu } from '../platform/app-menu.js';
import { project, projectName, mix, status } from './store.js';
import { stop } from './player.js';

const TAIL = 3;             // seconds after the last beat, for reverb and release

export async function bounce()
{
    stop();
    const p = { ...project.value, loop: null };
    const name = projectName.value || 'untitled';
    try
    {
        const instruments = await loadInstruments(p.tracks, text => { status.value = text; });
        status.value = 'Bouncing…';
        const seconds = LEAD_IN + beatToSeconds(p.tempoMap, projectEnd(p)) + TAIL;
        let handle = null;
        const buffer = await audioEngine.render(seconds, ()=>
        {
            let tick = ()=> {};
            handle = playProject(p, instruments, { mix: mix.value, ticker: (ms, fn)=> { tick = fn; return ()=> {}; } });
            return ()=> tick();
        });
        try { handle?.stop(); } catch { /* its nodes went with the offline context */ }
        const skip = Math.round(LEAD_IN * buffer.sampleRate);
        const channels = [0, 1].map(c => buffer.getChannelData(c).subarray(skip));
        const file = await appMenu.saveFile(`${name}.wav`, encodeWavChannels(channels, buffer.sampleRate));
        status.value = file ? `Exported ${file}` : '';
    }
    catch (e) { status.value = `Couldn't export: ${e.message}`; }
}
