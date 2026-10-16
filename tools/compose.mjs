#!/usr/bin/env node
// Composes a song from the command line, without a browser: prints its plan and can write a .mid file.
//
//   node tools/compose.mjs <song-id | feel:emotion | spec.json> [--midi out.mid] [--melody]
//
// --melody also prints the lead line bar by bar, as note names, to read a melody without hearing it.
import fs from 'node:fs';
import { compose, describe } from '../src/features/composer/compose.js';
import { SONGS } from '../src/features/composer/songs-data.js';
import { EMOTIONS } from '../src/features/composer/composer-data.js';
import { writeMidi } from '../src/lib/midi-file.js';
import { noteName } from '../src/lib/notes.js';

const args = process.argv.slice(2);
const opt = (f)=> { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const what = args.find((a, i)=> !a.startsWith('--') && args[i - 1] !== '--midi');
if (!what)
{
    console.log('usage: node tools/compose.mjs <song-id | feel:emotion | spec.json> [--midi out.mid] [--melody]');
    console.log(`songs: ${SONGS.map(s => s.id).join(', ')}`);
    console.log(`feelings: ${Object.keys(EMOTIONS).map(e => `feel:${e}`).join(', ')}`);
    process.exit(1);
}

const spec = what.endsWith('.json') ? JSON.parse(fs.readFileSync(what, 'utf8'))
    : what.startsWith('feel:') ? { title: what.slice(5), emotion: what.slice(5) }
    : SONGS.find(s => s.id === what);
if (!spec) { console.error(`no song ${what}`); process.exit(1); }

const score = compose(spec);
console.log(describe(score));

if (args.includes('--melody'))
{
    const lead = score.tracks.find(t => t.role === 'lead');
    const bars = new Map();
    for (const n of lead?.notes ?? [])
    {
        const bar = Math.floor(n.beat / score.beatsPerBar) + 1;
        bars.set(bar, [...(bars.get(bar) ?? []), `${noteName(n.key)}:${+n.beats.toFixed(2)}`]);
    }
    for (const [bar, notes] of bars) console.log(`  bar ${String(bar).padStart(3)}  ${notes.join(' ')}`);
}

const out = opt('--midi');
if (out)
{
    // drums go on channel 10 (index 9); the other parts take the rest in order
    const melodic = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
    let next = 0;
    const tracks = score.tracks.map(t => ({
        name: t.name, program: t.program, notes: t.notes, channel: t.bank >= 127 ? 9 : melodic[next++ % melodic.length],
    }));
    fs.writeFileSync(out, writeMidi({ ...score, tracks }));
    console.log(`wrote ${out}`);
}
