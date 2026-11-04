// Which SoundFont library the game plays: one of the catalog's LIBRARIES, switchable at runtime to compare them.
import { LIBRARIES } from './soundfont-catalog-data.js';
import { CHIP_URL, CHIP_BANK, CHIP_KIT_BANK, CHIP_INSTRUMENTS, CHIP_KITS } from './chip-instruments-data.js';

// the chip instruments, made in code, come with every library
const CHIP_PRESETS = [
    ...CHIP_INSTRUMENTS.map(i => ({ bank: CHIP_BANK, program: i.program, name: i.name })),
    ...CHIP_KITS.map(k => ({ bank: CHIP_KIT_BANK, program: k.program, name: k.name })),
].sort((a, b)=> a.bank - b.bank || a.program - b.program);

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
    /** every preset in a library, flat, in catalog order, with its file's url and index, then the chip instruments */
    presets(library = current)
    {
        return [
            ...library.files.flatMap((f, file)=> f.presets.map(p => ({ ...p, url: f.url, file }))),
            ...CHIP_PRESETS.map(p => ({ ...p, url: CHIP_URL, file: library.files.length })),
        ];
    },
};
