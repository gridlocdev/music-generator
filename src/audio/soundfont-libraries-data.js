// The SoundFont libraries the game can play, and where their .sf2 files live (relative to index.html).
// tools/sf2-catalog.mjs reads this to write soundfont-catalog-data.js. Imports nothing.
export const LIBRARY_SOURCES = [
    { id: 'generaluser', name: 'GeneralUser GS', dir: 'soundfonts/GeneralUser-GS',
        license: 'GeneralUser GS License v2.0, by S. Christian Collins' },
    { id: 'fluidr3', name: 'FluidR3_GM', dir: 'soundfonts/FluidR3_GM',
        license: 'MIT, by Frank Wen' },
    { id: 'musescore', name: 'MuseScore_General', dir: 'soundfonts/MuseScore_General',
        license: 'MIT, by Frank Wen, Michael Cowgill and S. Christian Collins' },
];
