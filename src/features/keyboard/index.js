// A playable keyboard for every instrument in the SoundFont library: computer keys, mouse and MIDI input.
import { mousePos, mouseIsDown, mouseWasPressed } from '../../platform/engine.js';
import { input } from '../../platform/input.js';
import { midi } from '../../platform/midi.js';
import { audioEngine } from '../../platform/audio-engine.js';
import { octaveC } from '../../lib/notes.js';
import { soundfontLibrary } from '../../audio/soundfont-library.js';
import { loadSoundFont, findPreset, createInstrument } from '../../audio/soundfont.js';
import { DEFAULTS, OCTAVE_MIN, OCTAVE_MAX, KEY_VELOCITY, SUSTAIN_CC } from './keyboard-data.js';
import { fitCamera, drawPiano, keyAt } from './piano-view.js';
import { createPicker } from './picker.js';

// every preset in the current library, flat, in catalog order
let entries = soundfontLibrary.presets();

let settings;               // this feature's save slice
let picker;
let instrument = null;
let loading = 0;            // id of the newest load, so a slow earlier one can't replace it
let current = 0;            // index into entries

// a key sounds while any input holds it: computer keys, the mouse, or MIDI
const down = new Map();     // MIDI key → number of inputs holding it
const typed = new Map();    // computer-key semitone offset → the MIDI key it started (octave may change meanwhile)
let mouseKey = -1;
let dragging = false;        // the mouse went down on the piano, not on the control bar
const pedal = { keys: false, midi: false };

function press(key, velocity)
{
    const n = down.get(key) ?? 0;
    if (!n) instrument?.noteOn(key, velocity);
    down.set(key, n + 1);
}

function release(key)
{
    const n = (down.get(key) ?? 0) - 1;
    if (n > 0) { down.set(key, n); return; }
    down.delete(key);
    instrument?.noteOff(key);
}

function releaseAll()
{
    for (const key of [...down.keys()]) { down.set(key, 1); release(key); }
    typed.clear();
    mouseKey = -1;
    dragging = false;
}

async function choose(index, state, events)
{
    current = (index + entries.length) % entries.length;
    const entry = entries[current];
    Object.assign(settings, { bank: entry.bank, program: entry.program });
    state.write();
    picker.select(current);

    const id = ++loading;
    const label = entry.url.split('/').pop();
    picker.setStatus(`Loading ${label}…`);
    try
    {
        const font = await loadSoundFont(entry.url, (loaded, total)=>
        {
            if (id === loading) picker.setStatus(`Loading ${label}… ${Math.floor(loaded / total * 100)}%`);
        });
        if (id !== loading) return;
        const preset = findPreset(font, entry.bank, entry.program);
        if (!preset) throw new Error(`no preset ${entry.bank}:${entry.program} in ${label}`);
        instrument?.dispose();
        instrument = createInstrument(font, preset);
        instrument.setSustain(pedal.keys || pedal.midi);
        picker.setStatus('');
        events.emit('notice', { text: preset.name });
    }
    catch (e)
    {
        if (id === loading) picker.setStatus(`Couldn't load ${label}: ${e.message}`);
    }
}

// switches library and keeps the same instrument when the new one has it, to compare them side by side
function chooseLibrary(id, state, events)
{
    const library = soundfontLibrary.select(id);
    settings.library = library.id;
    const { bank, program } = entries[current];
    entries = soundfontLibrary.presets();
    const same = entries.findIndex(e => e.bank === bank && e.program === program);
    const sameProgram = entries.findIndex(e => (e.bank >= 127) === (bank >= 127) && e.program === program);
    const index = same >= 0 ? same : Math.max(0, sameProgram);
    picker.setLibrary(library, entries, index);
    events.emit('notice', { text: `${library.name}: ${library.license}` });
    choose(index, state, events);
}

function setOctave(n)
{
    settings.octave = Math.min(OCTAVE_MAX, Math.max(OCTAVE_MIN, n));
    picker.setOctave(settings.octave);
}

export default {
    id: 'keyboard',
    build({ state, events })
    {
        settings = state.slice('keyboard', DEFAULTS);
        soundfontLibrary.select(settings.library);
        entries = soundfontLibrary.presets();
        const saved = entries.findIndex(e => e.bank === settings.bank && e.program === settings.program);
        audioEngine.volume = settings.volume;

        picker = createPicker({
            libraries: soundfontLibrary.all,
            library: soundfontLibrary.current,
            entries,
            selected: Math.max(0, saved),
            onLibrary: (id)=> chooseLibrary(id, state, events),
            volume: settings.volume,
            onSelect: (i)=> choose(i, state, events),
            onVolume: (v, done)=> { audioEngine.volume = settings.volume = v; if (done) state.write(); },
            async onMidi()
            {
                picker.setMidi('Connecting…', true);
                const ok = await midi.init(n => picker.setMidi(n ? `MIDI: ${n} input${n > 1 ? 's' : ''}` : 'No MIDI found', true));
                if (!ok) picker.setMidi('MIDI blocked', false);
            },
        });
        if (!midi.available) picker.setMidi('No Web MIDI', true);
        setOctave(settings.octave);

        midi.on(m =>
        {
            if (m.type === 'noteon') press(m.key, m.velocity);
            else if (m.type === 'noteoff') release(m.key);
            else if (m.controller === SUSTAIN_CC) { pedal.midi = m.value >= 64; instrument?.setSustain(pedal.keys || pedal.midi); }
        });

        choose(Math.max(0, saved), state, events);
    },
    update({ state, events, activity })
    {
        // a takeover (a song playing) owns the screen and the keys; let go of anything held
        if (activity.current) { releaseAll(); return; }
        fitCamera();

        const octave = input.octaveStep();
        if (octave) { setOctave(settings.octave + octave); state.write(); }
        if (input.focusInstruments()) picker.focusList();
        const step = input.instrumentStep();
        if (step) choose(current + step, state, events);

        for (const offset of input.notesPressed())
        {
            const key = octaveC(settings.octave) + offset;
            typed.set(offset, key);
            press(key, KEY_VELOCITY);
        }
        // poll instead of waiting for key-up: the engine drops held keys without a release when the window loses focus
        for (const [offset, key] of typed)
            if (!input.noteHeld(offset)) { release(key); typed.delete(offset); }

        const sustain = input.sustain();
        if (sustain !== pedal.keys) { pedal.keys = sustain; instrument?.setSustain(pedal.keys || pedal.midi); }

        // dragging across the keys plays each one in turn (a glissando)
        if (mouseWasPressed(0)) dragging = !!keyAt(mousePos);
        if (!mouseIsDown(0)) dragging = false;
        const hit = dragging ? keyAt(mousePos) : null;
        if ((hit?.key ?? -1) !== mouseKey)
        {
            if (mouseKey >= 0) release(mouseKey);
            mouseKey = hit?.key ?? -1;
            if (hit) press(hit.key, hit.velocity);
        }
    },
    render({ activity })
    {
        if (activity.current) return;
        drawPiano(key => down.has(key), octaveC(settings.octave), input.noteLabel);
    },
};
