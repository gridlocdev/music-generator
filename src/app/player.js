// Plays the song in the arrangement: loads its instruments, starts it from the playhead, follows it with the
// playhead, and keeps the mixer's settings on its channels.
import { effect } from '@preact/signals';
import { compose } from '../composer/compose.js';
import { loadBand } from '../composer/band-loader.js';
import { playScore } from '../composer/song-player.js';
import { song, tracks, mix, playing, beat, status, setSettings } from './store.js';

let handle = null;
let starting = 0;           // id of the newest play request, so a slow load can't start a song that was replaced
let frame = 0;

/** composes a song from the catalog (or a sketch's spec) and puts it in the arrangement, stopped at its start */
export function openSong({ id, label, story, spec })
{
    stop();
    const score = compose(spec);
    song.value = { id, label, story, spec, score };
    tracks.value = score.tracks.map(t => ({ name: t.name, role: t.role, bank: t.bank, program: t.program, override: null,
        mute: false, solo: false, volumeDb: 0, pan: 0 }));
    beat.value = 0;
    status.value = '';
    if (id !== 'sketch') setSettings({ songId: id });
}

export async function play()
{
    const s = song.value;
    if (!s) return;
    const id = ++starting;
    halt();
    playing.value = true;
    try
    {
        const band = await loadBand(s.score, text => { if (id === starting) status.value = text; }, tracks.value.map(t => t.override));
        if (id !== starting) return;
        const from = beat.value >= s.score.beats ? 0 : beat.value;
        handle = playScore(s.score, band, { from, mix: mix.value });
        status.value = '';
        follow(handle);
    }
    catch (e)
    {
        if (id === starting) { status.value = `Couldn't play: ${e.message}`; playing.value = false; }
    }
}

// the playhead follows the song once a frame, until it ends
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
    const s = song.value;
    if (!s) return;
    beat.value = Math.max(0, Math.min(s.score.beats, to));
    handle?.seek(beat.value);
}

/** restarts from the playhead, when playing, so a new instrument is heard */
export function reload()
{
    if (playing.value) play();
}

// the mixer's faders, pans, mutes and solos, as they change
effect(()=> { const m = mix.value; handle?.setMix(m); });
