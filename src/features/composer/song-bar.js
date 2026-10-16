// The song controls: a song/feeling list and Play/Stop. Plain DOM in #song-bar, under the keyboard's bar.
const $ = (id)=> /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @param {{ choices: { id: string, label: string }[], selected: number,
 *   onSelect: (i: number)=> void, onPlay: (i: number)=> void, onStop: ()=> void }} opts
 */
export function createSongBar({ choices, selected, onSelect, onPlay, onStop })
{
    const root = $('song-bar');
    root.innerHTML = `
        <span class="label">Composer</span>
        <select id="song-choice" aria-label="Song"></select>
        <button id="song-play" type="button">▶ Play song</button>
        <span id="song-status" role="status"></span>`;

    const select = /** @type {HTMLSelectElement} */ ($('song-choice'));
    const written = document.createElement('optgroup');
    written.label = 'Written songs';
    const feelings = document.createElement('optgroup');
    feelings.label = 'Compose from a feeling';
    choices.forEach((c, i)=> (c.id.startsWith('feel:') ? feelings : written).append(new Option(c.label, String(i))));
    select.append(written, feelings);
    select.value = String(selected);
    // let go of focus at once, so the computer keys play notes again
    select.onchange = ()=> { onSelect(Number(select.value)); select.blur(); };

    let playing = false;
    const button = /** @type {HTMLButtonElement} */ ($('song-play'));
    button.onclick = ()=> { playing ? onStop() : onPlay(Number(select.value)); button.blur(); };

    return {
        setPlaying(on) { playing = on; button.textContent = on ? '■ Stop' : '▶ Play song'; },
        setStatus(text) { $('song-status').textContent = text; },
        // pixels the fixed control bars cover at the top of the canvas
        height() { return $('top').getBoundingClientRect().bottom; },
    };
}
