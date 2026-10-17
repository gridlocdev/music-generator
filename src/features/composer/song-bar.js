// The song controls: a song/feeling list and Play/Stop, and while a song plays, the game-music controls: an
// intensity slider (vertical layering), a stinger to fire, and a jump to the next section on the next phrase.
// Plain DOM in #song-bar, under the keyboard's bar.
const $ = (id)=> /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @param {{ choices: { id: string, group: string, label: string, story?: string }[], selected: number, stingers: string[],
 *   onSelect: (i: number)=> void, onPlay: (i: number)=> void, onStop: ()=> void,
 *   onIntensity: (x: number)=> void, onSting: (kind: string)=> void, onNext: ()=> void }} opts
 */
export function createSongBar({ choices, selected, stingers, onSelect, onPlay, onStop, onIntensity, onSting, onNext })
{
    const root = $('song-bar');
    root.innerHTML = `
        <span class="label">Composer</span>
        <select id="song-choice" aria-label="Song"></select>
        <button id="song-play" type="button">▶ Play song</button>
        <span id="song-game">
            <label title="Calm keeps the pad and bass; the lead, drums and the rest come in as it rises">Intensity
                <input id="song-intensity" type="range" min="0" max="1" step="0.05" value="1"></label>
            <select id="song-sting" aria-label="Stinger">${stingers.map(s => `<option>${s}</option>`).join('')}</select>
            <button id="song-sting-play" type="button" title="Plays on the next beat, in key">♪ Sting</button>
            <button id="song-next" type="button" title="Moves on at the next phrase">Next section ⏭</button>
        </span>
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

    const intensity = /** @type {HTMLInputElement} */ ($('song-intensity'));
    intensity.oninput = ()=> onIntensity(Number(intensity.value));
    intensity.onchange = ()=> intensity.blur();
    const sting = /** @type {HTMLSelectElement} */ ($('song-sting'));
    sting.onchange = ()=> sting.blur();
    $('song-sting-play').onclick = (e)=> { onSting(sting.value); /** @type {HTMLElement} */ (e.currentTarget).blur(); };
    $('song-next').onclick = (e)=> { onNext(); /** @type {HTMLElement} */ (e.currentTarget).blur(); };

    return {
        // show a choice as selected, e.g. when a song is started from code or a link
        select(i) { select.value = String(i); showStory(); },
        setPlaying(on) { playing = on; button.textContent = on ? '■ Stop' : '▶ Play song'; if (on) intensity.value = '1'; },
        setStatus(text) { $('song-status').textContent = text; },
        // pixels the fixed control bars cover at the top of the canvas
        height() { return $('top').getBoundingClientRect().bottom; },
    };
}
