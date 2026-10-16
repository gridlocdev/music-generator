// AI-composed songs: pick a written song or a feeling, compose it into a multi-part score, and play it
// as a grid of pianos with notes falling onto their keys. While a song plays it owns the screen (an activity).
//
// Also scriptable, for embedding or for an AI to drive from the console:
//   composer.play({ title: 'Test', emotion: 'tender', key: 'A' })   // any spec; see docs/COMPOSING.md
//   composer.play('first-light')   composer.stop()   composer.compose(spec) → score
// and from the URL: index.html#song=first-light, #feel=heroic, or #spec=<URI-encoded JSON spec> (plays on first click).
import { input } from '../../platform/input.js';
import { compose } from './compose.js';
import { SONGS } from './songs-data.js';
import { EMOTIONS } from './composer-data.js';
import { loadBand, playScore } from './song-player.js';
import { prepareView, drawSong } from './song-view.js';
import { createSongBar } from './song-bar.js';

let settings;               // this feature's save slice
let bar;
let playing = null;         // { score, handle, panels } while a song plays
let starting = 0;           // id of the newest play request, so a slow load can't start a song that was replaced

// every choice in the menu: the written songs, then one song per feeling composed from its defaults alone
const choices = [
    ...SONGS.map(spec => ({ id: spec.id, label: spec.title, spec })),
    ...Object.keys(EMOTIONS).map(e => ({ id: `feel:${e}`, label: `Feeling: ${e}`, spec: { id: e, title: `${e[0].toUpperCase()}${e.slice(1)}`, emotion: e } })),
];

function specFor(what)
{
    if (typeof what !== 'string') return what;
    const c = choices.find(c => c.id === what || c.id === `feel:${what}`);
    if (!c) throw new Error(`no song or feeling called ${what}`);
    return c.spec;
}

async function play(what, { activity, events })
{
    const id = ++starting;
    stop(activity);
    const spec = specFor(what);
    const score = compose(spec);
    bar.setPlaying(true);
    try
    {
        const band = await loadBand(score, text => { if (id === starting) bar.setStatus(text); });
        if (id !== starting) return score;
        const panels = prepareView(score, band.map(b => b.preset.name));
        const handle = playScore(score, band);
        playing = { score, handle, panels };
        bar.setStatus('');
        activity.start({
            name: 'song',
            update() { if (handle.done || input.cancel()) activity.end(); },
            cleanup() { handle.stop(); if (playing?.handle === handle) playing = null; bar.setPlaying(false); document.body.classList.remove('song'); },
        });
        document.body.classList.add('song');
        events.emit('notice', { text: `${score.title} · ${score.emotion} · ${score.key} ${score.mode}` });
    }
    catch (e)
    {
        if (id === starting) { bar.setStatus(`Couldn't play: ${e.message}`); bar.setPlaying(false); }
    }
    return score;
}

function stop(activity)
{
    if (activity.current?.name === 'song') activity.end();
}

// #song=id, #feel=emotion or #spec=<json>, if the page was opened with one
function fromHash()
{
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.has('spec')) return JSON.parse(params.get('spec'));
    if (params.has('song')) return params.get('song');
    if (params.has('feel')) return `feel:${params.get('feel')}`;
    return null;
}

export default {
    id: 'composer',
    build(ctx)
    {
        settings = ctx.state.slice('composer', { choice: choices[0].id });
        let selected = Math.max(0, choices.findIndex(c => c.id === settings.choice));
        let pending = null;
        try { pending = fromHash(); } catch (e) { console.warn('bad #spec', e); }
        if (typeof pending === 'string') selected = Math.max(0, choices.findIndex(c => c.id === pending || c.id === `feel:${pending}`));

        bar = createSongBar({
            choices, selected,
            onSelect(i) { settings.choice = choices[i].id; ctx.state.write(); },
            onPlay(i) { pending = null; play(choices[i].spec, ctx); },
            onStop() { starting++; stop(ctx.activity); bar.setStatus(''); bar.setPlaying(false); },
        });

        // browsers only allow sound after a gesture, so a song from the URL starts on the first click or key
        if (pending)
        {
            bar.setStatus('Click anywhere or press a key to play the song from the link');
            const go = ()=> { removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true); if (pending) play(pending, ctx); pending = null; };
            addEventListener('pointerdown', go, true);
            addEventListener('keydown', go, true);
        }

        /** @type {any} */ (globalThis).composer = {
            compose: (what)=> compose(specFor(what)),
            play: (what)=> play(what, ctx),
            stop: ()=> stop(ctx.activity),
            songs: choices.map(c => c.id),
        };
    },
    render({ activity })
    {
        if (activity.current?.name !== 'song' || !playing) return;
        drawSong(playing.panels, playing.score, playing.handle.beat, bar.height());
    },
};
