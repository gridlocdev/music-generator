// The control bar: library and instrument lists, volume, octave, MIDI button and load status. Plain DOM in #controls.
const $ = (id)=> /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @typedef {{ url: string, file: number, bank: number, program: number, name: string }} Entry
 * @typedef {{ id: string, name: string, files: { url: string, bytes: number }[] }} Library
 */

/**
 * @param {{ libraries: Library[], library: Library, entries: Entry[], selected: number, volume: number,
 *   onLibrary: (id: string)=> void, onSelect: (index: number)=> void, onVolume: (v: number, done: boolean)=> void,
 *   onMidi: ()=> void }} opts
 */
export function createPicker({ libraries, library, entries, selected, volume, onLibrary, onSelect, onVolume, onMidi })
{
    const root = $('controls');
    root.innerHTML = `
        <select id="library" aria-label="SoundFont library"></select>
        <select id="instrument" aria-label="Instrument"></select>
        <label>Volume <input id="volume" type="range" min="0" max="1" step="0.01"></label>
        <span id="octave"></span>
        <button id="midi" type="button">Connect MIDI</button>
        <span id="status" role="status"></span>`;

    const libs = /** @type {HTMLSelectElement} */ ($('library'));
    for (const l of libraries) libs.append(new Option(`${l.name} · ${megabytes(l.files)} MB`, l.id));
    libs.value = library.id;
    libs.onchange = ()=> { onLibrary(libs.value); libs.blur(); };

    const select = /** @type {HTMLSelectElement} */ ($('instrument'));
    function fill(library, list, index)
    {
        entries = list;
        select.replaceChildren();
        library.files.forEach((file, i)=>
        {
            const group = document.createElement('optgroup');
            group.label = `${fileName(file.url)} · ${megabytes([file])} MB`;
            entries.forEach((e, j)=>
            {
                if (e.file !== i) return;
                const label = e.bank >= 127 ? `Drums ${e.program} · ${e.name}` : `${e.bank ? `Bank ${e.bank} · ` : ''}${e.program + 1}. ${e.name}`;
                group.append(new Option(label, String(j)));
            });
            select.append(group);
        });
        select.value = String(index);
    }
    fill(library, entries, selected);
    // While the list has focus the engine ignores the keyboard, so the arrows browse instruments.
    // Focused from the keyboard (focusList), it keeps focus until Esc or Enter; picked with the mouse,
    // it lets go at once so the keys play notes again.
    let keyboardFocus = false;
    select.onchange = ()=> { onSelect(Number(select.value)); if (!keyboardFocus) select.blur(); };
    select.onkeydown = (e)=>
    {
        if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); select.blur(); }
        // step through the list ourselves: on macOS the arrows would open the native popup instead
        const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const i = Math.min(entries.length - 1, Math.max(0, select.selectedIndex + step));
        if (i !== select.selectedIndex) { select.selectedIndex = i; onSelect(Number(select.value)); }
    };
    select.onblur = ()=> { keyboardFocus = false; };

    const vol = /** @type {HTMLInputElement} */ ($('volume'));
    vol.value = String(volume);
    vol.oninput = ()=> onVolume(Number(vol.value), false);
    vol.onchange = ()=> { onVolume(Number(vol.value), true); vol.blur(); };

    const midiButton = /** @type {HTMLButtonElement} */ ($('midi'));
    midiButton.onclick = ()=> { onMidi(); midiButton.blur(); };

    return {
        select(index) { select.value = String(index); },
        /** shows another library's instruments, with `index` selected */
        setLibrary(library, list, index) { libs.value = library.id; fill(library, list, index); },
        focusList() { keyboardFocus = true; select.focus(); },
        setOctave(n) { $('octave').textContent = `Octave ${n}  (Z / X)`; },
        setStatus(text) { $('status').textContent = text; },
        setMidi(text, disabled = false) { midiButton.textContent = text; midiButton.disabled = disabled; },
    };
}

const fileName = (url)=> url.split('/').pop();
const megabytes = (files)=> Math.round(files.reduce((sum, f)=> sum + f.bytes, 0) / 1e6);
