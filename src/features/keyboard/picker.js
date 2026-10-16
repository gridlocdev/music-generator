// The control bar: instrument list, volume, octave, MIDI button and load status. Plain DOM in #controls.
const $ = (id)=> /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @param {{ entries: { url: string, part: number, bank: number, program: number, name: string }[],
 *   parts: { url: string, bytes: number }[], selected: number, volume: number,
 *   onSelect: (index: number)=> void, onVolume: (v: number, done: boolean)=> void, onMidi: ()=> void }} opts
 */
export function createPicker({ entries, parts, selected, volume, onSelect, onVolume, onMidi })
{
    const root = $('controls');
    root.innerHTML = `
        <select id="instrument" aria-label="Instrument"></select>
        <label>Volume <input id="volume" type="range" min="0" max="1" step="0.01"></label>
        <span id="octave"></span>
        <button id="midi" type="button">Connect MIDI</button>
        <span id="status" role="status"></span>`;

    const select = /** @type {HTMLSelectElement} */ ($('instrument'));
    parts.forEach((part, i)=>
    {
        const group = document.createElement('optgroup');
        group.label = `${fileName(part.url)} · ${Math.round(part.bytes / 1e6)} MB`;
        entries.forEach((e, j)=>
        {
            if (e.part !== i) return;
            const label = e.bank >= 127 ? `Drums ${e.program} · ${e.name}` : `${e.bank ? `Bank ${e.bank} · ` : ''}${e.program + 1}. ${e.name}`;
            group.append(new Option(label, String(j)));
        });
        select.append(group);
    });
    select.value = String(selected);
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
        focusList() { keyboardFocus = true; select.focus(); },
        setOctave(n) { $('octave').textContent = `Octave ${n}  (Z / X)`; },
        setStatus(text) { $('status').textContent = text; },
        setMidi(text, disabled = false) { midiButton.textContent = text; midiButton.disabled = disabled; },
    };
}

const fileName = (url)=> url.split('/').pop();
