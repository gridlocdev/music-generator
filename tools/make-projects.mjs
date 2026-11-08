#!/usr/bin/env node
// Writes every written song in the catalog as a project file, projects/<id>/project.json: the composer's notes, mix and
// automation, with the Humanize MIDI FX on each track. The songs' specs stay as presets for File → New from…; a project
// written here is free to be edited from then on, so this overwrites only the songs named (or all, with no names).
//
//   node tools/make-projects.mjs [song-id …]
import fs from 'node:fs';
import path from 'node:path';
import { compose } from '../src/composer/compose.js';
import { toProject } from '../src/composer/to-project.js';
import { CATALOG } from '../src/composer/catalog.js';
import { writeProject } from '../src/daw/project-format.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const names = process.argv.slice(2);
const songs = CATALOG.filter(c => c.group !== 'Feelings' && (!names.length || names.includes(c.id)));
for (const name of names) if (!songs.some(s => s.id === name)) { console.error(`no song ${name}`); process.exit(1); }

let bytes = 0;
for (const { id, spec } of songs)
{
    const dir = path.join(ROOT, 'projects', id);
    fs.mkdirSync(dir, { recursive: true });
    const text = writeProject(toProject(compose(spec)));
    fs.writeFileSync(path.join(dir, 'project.json'), text);
    bytes += text.length;
}
console.log(`wrote ${songs.length} projects to projects/ (${Math.round(bytes / 1024)} KB)`);
