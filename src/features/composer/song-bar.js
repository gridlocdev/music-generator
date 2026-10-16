// The song controls: a song/feeling list and Play/Stop. Plain DOM in #song-bar, under the keyboard's bar.
const $ = (id)=> /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @param {{ choices: { id: string, group: string, label: string, story?: string }[], selected: number,
 *   onSelect: (i: number)=> void, onPlay: (i: number)=> void, onStop: ()=> void }} opts
 */
export function createSongBar({ choices, selected, onSelect, onPlay, onStop })
{
    const root = $('song-bar');
    root.innerHTML = `
        <span class="label">Composer</span>
        <select id="song-choice" aria-label="Song"></select>
        <button id="song-play" type="button">▶ Play song</button>
        <span id="song-status" role="status"></span>
        <span id="song-story"></span>`;

    const select = /** @type {HTMLSelectElement} */ ($('song-choice'));
    const groups = new Map();
    choices.forEach((c, i)=>
    {
        if (!groups.has(c.group)) groups.set(c.group, Object.assign(document.createElement('optgroup'), { label: c.group }));
        groups.get(c.group).append(new Option(c.label, String(i)));
    });
    select.append(...groups.values());
    select.value = String(selected);
    const showStory = ()=> { $('song-story').textContent = choices[Number(select.value)].story ?? ''; };
    showStory();
    // let go of focus at once, so the computer keys play notes again
    select.onchange = ()=> { onSelect(Number(select.value)); showStory(); select.blur(); };

    let playing = false;
    const button = /** @type {HTMLButtonElement} */ ($('song-play'));
    button.onclick = ()=> { playing ? onStop() : onPlay(Number(select.value)); button.blur(); };

    return {
        // show a choice as selected, e.g. when a song is started from code or a link
        select(i) { select.value = String(i); showStory(); },
        setPlaying(on) { playing = on; button.textContent = on ? '■ Stop' : '▶ Play song'; },
        setStatus(text) { $('song-status').textContent = text; },
        // pixels the fixed control bars cover at the top of the canvas
        height() { return $('top').getBoundingClientRect().bottom; },
    };
}
