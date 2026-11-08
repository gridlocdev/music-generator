// The open project as a document: opening, saving, starting a new one (empty, or made by the composer from a feeling,
// a genre or one of its songs), and every edit, each a step undo can take back.
import { projectFiles, folderName } from '../platform/project-files.js';
import { emptyProject, history, commit, undo as undoStep, redo as redoStep } from '../daw/project.js';
import { readProject, writeProject } from '../daw/project-format.js';
import { compose } from '../composer/compose.js';
import { toProject } from '../composer/to-project.js';
import { hist, project, projectName, projectList, saved, dirty, selected, selectedClip, picked, chordRange, beat, status, setSettings } from './store.js';
import { stop } from './player.js';
import { askText, askYes } from './ask.js';

let mergeKey = null;

/**
 * Changes the project. Edits with the same merge key one after another (a fader dragged) are one undo step.
 * @param {(p: import('../daw/project.js').Project)=> import('../daw/project.js').Project} fn
 * @param {string|null} [merge]
 */
export function edit(fn, merge = null)
{
    const h = hist.value, next = fn(h.present);
    if (next === h.present) return;
    hist.value = merge && merge === mergeKey && h.past.length ? { ...h, present: next, future: [] } : commit(h, next);
    mergeKey = merge;
}

export function undo() { mergeKey = null; hist.value = undoStep(hist.value); keepSelection(); }
export function redo() { mergeKey = null; hist.value = redoStep(hist.value); keepSelection(); }

// a selection the undo took away goes; picked notes go too, as their indexes may now be other notes
function keepSelection()
{
    const p = project.value;
    if (picked.value.size) picked.value = new Set();
    if (selected.value && !p.tracks.some(t => t.id === selected.value)) selected.value = p.tracks[0]?.id ?? null;
    const c = selectedClip.value;
    if (c && !p.tracks.find(t => t.id === c.track)?.clips.some(x => x.id === c.clip)) selectedClip.value = null;
}

/** puts a project in the window, stopped at its start */
function show(p, name)
{
    stop();
    mergeKey = null;
    hist.value = history(p);
    saved.value = name ? p : null;
    projectName.value = name;
    selected.value = p.tracks[0]?.id ?? null;
    selectedClip.value = null;
    chordRange.value = null;
    beat.value = 0;
    status.value = '';
    if (name) setSettings({ project: name });
}

/** lists projects/ again */
export async function refreshProjects()
{
    projectList.value = await projectFiles.list().catch(e => { status.value = e.message; return []; });
}

const discardOk = async ()=> !dirty.value || askYes(`Discard the changes to “${project.value.title}”?`, 'Discard');

export async function openProject(name)
{
    if (!await discardOk()) return false;
    try
    {
        show(readProject(await projectFiles.read(name)), name);
        return true;
    }
    catch (e) { status.value = `Couldn't open projects/${name}: ${e.message}`; return false; }
}

/** a new project, not saved yet: empty, or from a generator spec (a feeling, a genre, a song's spec, a whistled sketch) */
export async function newProject({ title = 'Untitled', spec = null, bpm = 120, sig = '4/4', bars = 16 } = {})
{
    if (!await discardOk()) return;
    const p = spec ? { ...toProject(compose({ ...spec, title })), title } : emptyProject({ title, bpm, sig, bars });
    show(p, '');
}

/** saves to the project's folder, or asks for a name when it has none */
export async function save()
{
    if (!projectName.value) return saveAs();
    const p = project.value;
    try
    {
        await projectFiles.write(projectName.value, writeProject(p));
        saved.value = p;
        status.value = `Saved projects/${projectName.value}/`;
        refreshProjects();
    }
    catch (e) { status.value = e.message; }
}

/** saves under a new name: a new folder in projects/, or over one after asking */
export async function saveAs()
{
    const title = await askText('Save the project as', project.value.title, 'Save');
    if (!title) return;
    const name = folderName(title);
    const existing = await projectFiles.list().catch(()=> []);
    if (name !== projectName.value && existing.some(e => e.name === name) && !await askYes(`projects/${name} exists. Replace it?`, 'Replace')) return;
    edit(p => p.title === title ? p : { ...p, title });
    projectName.value = name;
    setSettings({ project: name });
    await save();
}
