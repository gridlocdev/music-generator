// Plays the open project: loads its instruments, starts it from the playhead, follows it with the playhead, keeps the
// mixer's faders and pans on its channels, and starts again from where it is when an edit changes what's heard.
import { effect } from '@preact/signals';
import { loadInstruments } from '../daw/instruments.js';
import { playProject } from '../daw/player.js';
import { projectEnd } from '../daw/project.js';
import { project, mix, playing, beat, status } from './store.js';

let handle = null;
let heard = null;           // the project the handle plays
let starting = 0;           // id of the newest play request, so a slow load can't start a project that was replaced
let frame = 0;

export async function play()
{
    const p = project.value;
    const id = ++starting;
    halt();
    playing.value = true;
    try
    {
        const instruments = await loadInstruments(p.tracks, text => { if (id === starting) status.value = text; });
        if (id !== starting) return;
        const from = beat.value >= projectEnd(p) ? 0 : beat.value;
        heard = p;
        handle = playProject(p, instruments, { from, mix: mix.value });
        status.value = '';
        follow(handle);
    }
    catch (e)
    {
        if (id === starting) { status.value = `Couldn't play: ${e.message}`; playing.value = false; }
    }
}

// the playhead follows the project once a frame, until it ends
function follow(h)
{
    cancelAnimationFrame(frame);
    const step = ()=>
    {
        if (h !== handle) return;
        if (h.done) { stop(); return; }
        beat.value = Math.max(0, h.beat);
        frame = requestAnimationFrame(step);
    };
    step();
}

function halt()
{
    cancelAnimationFrame(frame);
    handle?.stop();
    handle = null;
}

/** stops where it is; stopping when already stopped goes back to the start */
export function stop()
{
    starting++;
    if (!playing.value && !handle) beat.value = 0;
    halt();
    playing.value = false;
}

export const toggle = ()=> playing.value ? stop() : play();

export function seek(to)
{
    beat.value = Math.max(0, Math.min(projectEnd(project.value), to));
    handle?.seek(beat.value);
}

/** restarts from the playhead, when playing, so a change is heard */
export function reload()
{
    if (playing.value) play();
}

const MIX_ONLY = ['volumeDb', 'pan', 'mute', 'solo'];
/** whether an edit changed more than the faders, pans, mutes and solos, which play on without a restart */
function heardDifferently(a, b)
{
    if (a.tracks.length !== b.tracks.length || a.tempoMap !== b.tempoMap || a.loop !== b.loop || a.markers !== b.markers || a.groove !== b.groove) return true;
    return a.tracks.some((t, i)=>
    {
        const u = b.tracks[i];
        if (t === u) return false;
        if (t.id !== u.id || t.clips !== u.clips || t.instrument !== u.instrument || t.fx !== u.fx || t.automation !== u.automation) return true;
        return Object.keys(t.mixer).some(k => !MIX_ONLY.includes(k) && t.mixer[k] !== u.mixer[k]);
    });
}

// an edit while playing: the faders follow at once; anything else is heard after a moment's pause in the editing
let restart = 0;
effect(()=>
{
    const p = project.value;
    if (!handle || !heard || p === heard) return;
    if (!heardDifferently(heard, p)) { heard = p; return; }
    clearTimeout(restart);
    restart = setTimeout(()=> { if (playing.value && project.value !== heard) play(); }, 250);
});
effect(()=> { const m = mix.value; handle?.setMix(m); });
