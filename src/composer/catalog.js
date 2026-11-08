// Every song the app offers: the written songs by group, then one song per feeling composed from its defaults alone.
import { SONGS } from './songs-data.js';
import { GENRE_SONGS } from './genre-songs-data.js';
import { GAME_SONGS } from './game-songs-data.js';
import { CHIP_SONGS } from './chip-songs-data.js';
import { CLASSICAL_SONGS } from './classical-songs-data.js';
import { EMOTIONS } from './composer-data.js';

/** @type {{ id: string, group: string, label: string, story?: string, spec: object }[]} */
export const CATALOG = [
    ...GAME_SONGS.map(spec => ({ id: spec.id, group: 'Game music', label: `${spec.genre}: ${spec.title}`, story: spec.story, spec })),
    ...CHIP_SONGS.map(spec => ({ id: spec.id, group: 'Chiptune', label: `${spec.genre}: ${spec.title}`, story: spec.story, spec })),
    ...CLASSICAL_SONGS.map(spec => ({ id: spec.id, group: 'Classical', label: spec.title, story: spec.story, spec })),
    ...GENRE_SONGS.map(spec => ({ id: spec.id, group: 'Genres', label: `${spec.genre}: ${spec.title}`, story: spec.story, spec })),
    ...SONGS.map(spec => ({ id: spec.id, group: 'Written songs', label: spec.title, story: spec.story, spec })),
    ...Object.keys(EMOTIONS).map(e => ({ id: `feel:${e}`, group: 'Feelings', label: `${e[0].toUpperCase()}${e.slice(1)}`, spec: { id: e, title: `${e[0].toUpperCase()}${e.slice(1)}`, emotion: e } })),
];
