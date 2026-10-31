// Which SoundFont library the game plays: one of the catalog's LIBRARIES, switchable at runtime to compare them.
import { LIBRARIES } from './soundfont-catalog-data.js';

let current = LIBRARIES[0];

export const soundfontLibrary = {
    all: LIBRARIES,
    get current() { return current; },
    /** switches to the library with this id; an unknown id keeps the current one */
    select(id)
    {
        current = LIBRARIES.find(l => l.id === id) ?? current;
        return current;
    },
    /** every preset in a library, flat, in catalog order, with its file's url and index */
    presets(library = current)
    {
        return library.files.flatMap((f, file)=> f.presets.map(p => ({ ...p, url: f.url, file })));
    },
};
