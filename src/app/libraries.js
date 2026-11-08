// The SoundFont libraries: the one picked, falling back to one that's installed, and downloading the others.
import { soundfontLibrary } from '../audio/soundfont-library.js';
import { soundfonts } from '../platform/soundfonts.js';
import { settings, setSettings, installedLibraries, libraryDownload, status } from './store.js';
import { reload } from './player.js';

/** plays the picked library, or the first installed one while it isn't installed */
function pick()
{
    const have = installedLibraries.value;
    const want = settings.value.library || soundfontLibrary.all[0].id;
    soundfontLibrary.select(have.includes(want) ? want : have[0] ?? want);
}

/** finds which libraries are installed */
export async function checkLibraries()
{
    installedLibraries.value = await soundfonts.installed() ?? soundfontLibrary.all.map(l => l.id);
    pick();
}

/** switches to an installed library */
export function chooseLibrary(id)
{
    setSettings({ library: id });
    pick();
    reload();
}

/** downloads a library, then switches to it */
export async function downloadLibrary(id)
{
    if (libraryDownload.value) return;
    const name = soundfontLibrary.all.find(l => l.id === id)?.name ?? id;
    libraryDownload.value = { id, fraction: 0 };
    try
    {
        await soundfonts.download(id, (loaded, total)=> { libraryDownload.value = { id, fraction: loaded / total }; });
        await checkLibraries();
        chooseLibrary(id);
        status.value = `Downloaded ${name}`;
    }
    catch (e)
    {
        console.error(e);
        status.value = `Could not download ${name}: ${e.message ?? e}`;
    }
    finally { libraryDownload.value = null; }
}
