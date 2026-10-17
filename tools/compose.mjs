#!/usr/bin/env node
// Composes a song from the command line, without a browser: prints its plan and can write a .mid file.
//
//   node tools/compose.mjs <song-id | feel:emotion | spec.json> [--midi out.mid] [--melody]
//
// --melody also prints the lead line bar by bar, as note names, to read a melody without hearing it.
import fs from 'node:fs';
import { compose, describe } from '../src/features/composer/compose.js';
import { SONGS as WRITTEN } from '../src/features/composer/songs-data.js';
import { GENRE_SONGS } from '../src/features/composer/genre-songs-data.js';
import { GAME_SONGS } from '../src/features/composer/game-songs-data.js';
import { EMOTIONS } from '../src/features/composer/composer-data.js';
import { barAt } from '../src/features/composer/meter.js';
import { swungTracks } from '../src/features/composer/perform.js';
import { METERS } from '../src/features/composer/patterns-data.js';
import { writeMidi } from '../src/lib/midi-file.js';
import { tempoSteps } from '../src/lib/tempo-map.js';
import { noteName } from '../src/lib/notes.js';

const SONGS = [...GAME_SONGS, ...GENRE_SONGS, ...WRITTEN];

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
        const bar = barAt(score.sections, n.beat).bar + 1;
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
    // the notes as they're heard: swung, when the song swings
    const tracks = swungTracks(score).map(t => ({
        name: t.name, program: t.program, notes: t.notes, channel: t.bank >= 127 ? 9 : melodic[next++ % melodic.length],
    }));
    // tempo ramps as a change per beat; a time signature at each change of meter
    const meters = score.sections.filter((s, i)=> i === 0 || s.meter !== score.sections[i - 1].meter)
        .map(s => ({ beat: s.beat, num: METERS[s.meter].sig[0], den: METERS[s.meter].sig[1] }));
    fs.writeFileSync(out, writeMidi({ ...score, tracks, tempos: tempoSteps(score.tempoMap), meters }));
    console.log(`wrote ${out}`);
}
