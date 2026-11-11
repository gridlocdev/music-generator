// Renders projects to WAV, as the app's Export as Audio File does with its defaults (the whole project, the mix, a
// 3 s tail, not normalized): export.html?songs=a,b,c[&library=<id>] (the first SoundFont library without one). Each WAV goes back to tools/export.mjs as PUT /wav/<name>;
// a failure as PUT /error/<name>, and the end as PUT /done.
import { readProject } from '../../src/daw/project-format.js';
import { loadInstruments } from '../../src/daw/instruments.js';
import { playProject, LEAD_IN } from '../../src/daw/player.js';
import { projectEnd } from '../../src/daw/project.js';
import { registerFx } from '../../src/daw/fx.js';
import { dbToGain } from '../../src/audio/mixer.js';
import { beatToSeconds } from '../../src/lib/tempo-map.js';
import { encodeWavChannels } from '../../src/lib/wav.js';
import { audioEngine } from '../../src/platform/audio-engine.js';
import { soundfontLibrary } from '../../src/audio/soundfont-library.js';
import { humanizeFx, HUMANIZE } from '../../src/composer/humanize-fx.js';

const TAIL = 3;                 // seconds after the last beat, for reverb and release
const FADER_FLOOR_DB = -40;     // a fader at the bottom is silent, as in the app

const params = new URLSearchParams(location.search);
if (params.has('library')) soundfontLibrary.select(params.get('library'));
registerFx(HUMANIZE, humanizeFx);
const put = (path, body)=> fetch(path, { method: 'PUT', body });

/** each track's gain and pan: muted and un-soloed tracks, and faders at the bottom, are silent */
function mixOf(p)
{
    const soloed = p.tracks.some(t => t.mixer.solo);
    return p.tracks.map(({ mixer: m })=> ({ gain: m.mute || (soloed && !m.solo) || m.volumeDb <= FADER_FLOOR_DB ? 0 : dbToGain(m.volumeDb), pan: m.pan }));
}

async function exportSong(name)
{
    const p = { ...readProject(await (await fetch(`/projects/${encodeURIComponent(name)}/project.json`)).text()), loop: null };
    const instruments = await loadInstruments(p.tracks);
    const to = projectEnd(p);
    const seconds = LEAD_IN + beatToSeconds(p.tempoMap, to) + TAIL;
    let handle = null;
    const buffer = await audioEngine.render(seconds, ()=>
    {
        let tick = ()=> {};
        handle = playProject(p, instruments, { from: 0, until: to, mix: mixOf(p), ticker: (ms, fn)=> { tick = fn; return ()=> {}; } });
        return ()=> tick();
    });
    try { handle?.stop(); } catch { /* its nodes went with the offline context */ }
    const skip = Math.round(LEAD_IN * buffer.sampleRate);
    const channels = [0, 1].map(c => buffer.getChannelData(c).slice(skip));
    await put(`/wav/${encodeURIComponent(name)}`, encodeWavChannels(channels, buffer.sampleRate));
}

for (const name of params.get('songs').split(','))
{
    try { await exportSong(name); }
    catch (e) { await put(`/error/${encodeURIComponent(name)}`, `${e}\n${e?.stack ?? ''}`); }
}
await put('/done');
