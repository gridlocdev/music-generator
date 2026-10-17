// AI-composed songs: pick a written song or a feeling, compose it into a multi-part score, and play it
// as a grid of pianos with notes falling onto their keys. While a song plays it owns the screen (an activity).
//
// Also scriptable, for embedding or for an AI to drive from the console:
//   composer.play({ title: 'Test', emotion: 'tender', key: 'A' })   // any spec; see docs/COMPOSING.md
//   composer.play('first-light')   composer.stop()   composer.compose(spec) → score
// and, while a song plays, as game music: composer.intensity(0..1)   composer.sting('pickup')
//   composer.queue('Chorus', 'phrase')   // carry on from a section at the next bar, phrase or section
// and from the URL: index.html#song=first-light, #feel=heroic, or #spec=<URI-encoded JSON spec> (plays on first click).
import { input } from '../../platform/input.js';
import { mousePosScreen, mouseWasPressed } from '../../platform/engine.js';
import { compose, sectionSeek } from './compose.js';
import { SONGS } from './songs-data.js';
import { GENRE_SONGS } from './genre-songs-data.js';
import { GAME_SONGS } from './game-songs-data.js';
import { EMOTIONS } from './composer-data.js';
import { STINGERS } from './adaptive-data.js';
import { loadBand, playScore } from './song-player.js';
import { prepareView, drawSong, timelineBeatAt } from './song-view.js';
import { createSongBar } from './song-bar.js';

let settings;               // this feature's save slice
let bar;
let playing = null;         // { score, handle, panels } while a song plays
let starting = 0;           // id of the newest play request, so a slow load can't start a song that was replaced

const SEEK_GRACE_SECONDS = 2;   // ← within this long of a section's start goes to the one before

// click the timeline to jump there; ← / → to step through sections
function seekInput(score, handle)
{
    if (mouseWasPressed(0))
    {
        const beat = timelineBeatAt(score, mousePosScreen.x, mousePosScreen.y);
        if (beat !== null) handle.seek(beat);
    }
    const step = input.sectionStep();
    if (step)
    {
        const beat = sectionSeek(score.sections, handle.beat, step, SEEK_GRACE_SECONDS * score.tempo / 60);
        if (beat !== null) handle.seek(beat);
    }
}

// every choice in the menu: the written songs, then one song per feeling composed from its defaults alone
const choices = [
    ...GAME_SONGS.map(spec => ({ id: spec.id, group: 'Game music', label: `${spec.genre}: ${spec.title}`, story: spec.story, spec })),
    ...GENRE_SONGS.map(spec => ({ id: spec.id, group: 'Genres', label: `${spec.genre}: ${spec.title}`, story: spec.story, spec })),
    ...SONGS.map(spec => ({ id: spec.id, group: 'Written songs', label: spec.title, story: spec.story, spec })),
    ...Object.keys(EMOTIONS).map(e => ({ id: `feel:${e}`, group: 'Compose from a feeling', label: `Feeling: ${e}`, spec: { id: e, title: `${e[0].toUpperCase()}${e.slice(1)}`, emotion: e } })),
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
    const chosen = choices.findIndex(c => c.spec === spec);
    if (chosen >= 0) bar.select(chosen);
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
            update() { if (handle.done || input.cancel()) activity.end(); else seekInput(score, handle); },
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
            choices, selected, stingers: Object.keys(STINGERS),
            onIntensity(x) { playing?.handle.setIntensity(x >= 1 ? null : x); },
            onSting(kind) { playing?.handle.sting(kind); },
            onNext()
            {
                if (!playing) return;
                const { score, handle } = playing;
                const i = score.sections.findLastIndex(s => s.beat <= handle.beat);
                const to = score.sections[i + 1] ? i + 1 : score.sections.findIndex(s => s.beat === score.loop?.from);
                if (to >= 0) handle.queue(to, 'phrase');
            },
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
            intensity: (x)=> playing?.handle.setIntensity(x),
            sting: (kind)=> playing?.handle.sting(kind),
            queue: (section, at)=> playing?.handle.queue(section, at) ?? false,
            songs: choices.map(c => c.id),
        };
    },
    render({ activity })
    {
        if (activity.current?.name !== 'song' || !playing) return;
        drawSong(playing.panels, playing.score, playing.handle.beat, bar.height());
    },
};
