// MIDI files in: File → Import MIDI File opens one as a new project; one dropped on the arrangement adds its tracks to
// this project from the bar it was dropped on, as one undo step.
import { midiProject, addMidiTracks } from '../daw/project-midi.js';
import { readMidi } from '../lib/midi-file.js';
import { appMenu } from '../platform/app-menu.js';
import { project, selected, status } from './store.js';
import { edit, openNew } from './document.js';

export const isMidi = (file)=> /\.(mid|midi|smf)$/i.test(file.name);

/** asks for a MIDI file and opens it as a new project */
export async function importMidi()
{
    const file = await appMenu.openFile('MIDI File', ['mid', 'midi', 'smf']);
    if (!file) return;
    try
    {
        const p = midiProject(new Uint8Array(file.bytes), file.name.replace(/\.[^.]+$/, ''));
        if (await openNew(p)) status.value = `Imported ${file.name}: ${p.tracks.length} track${p.tracks.length === 1 ? '' : 's'}`;
    }
    catch (e) { status.value = `Couldn't import ${file.name}: ${e.message}`; }
}

/** MIDI files dropped at beat `at`: their tracks added from that bar */
export async function dropMidi(files, at)
{
    for (const file of files)
    {
        try
        {
            const midi = readMidi(new Uint8Array(await file.arrayBuffer()));
            if (!midi.tracks.length) { status.value = `${file.name} has no notes`; continue; }
            const before = project.value.tracks.length;
            edit(p => addMidiTracks(p, midi, at));
            selected.value = project.value.tracks[before]?.id ?? selected.value;
            status.value = `Added ${midi.tracks.length} track${midi.tracks.length === 1 ? '' : 's'} from ${file.name}`;
        }
        catch (e) { status.value = `Couldn't read ${file.name}: ${e.message}`; }
    }
}
