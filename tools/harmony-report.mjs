#!/usr/bin/env node
// Reports how alike the composer's harmony is: per genre (each composed the same way, bright and dark), the share
// of plain triads, the colours it uses and how it ends; then across the written songs, the four-chord windows most
// of them share and the most alike pairs; then each genre's melody (pace, steps and leaps, syncopation, range, notes
// outside the key) and the genres whose tunes are nearest. Sameness shows up here before it's heard.
//
//   node tools/harmony-report.mjs [song-id ...]     (no ids: the genres, then every written song)
import { compose } from '../src/composer/compose.js';
import { CATALOG } from '../src/composer/catalog.js';
import { GENRES } from '../src/composer/genre-data.js';
import { harmonyStats, melodyDistance, melodyStats, overlap } from '../src/composer/harmony-report.js';

const ids = process.argv.slice(2);
const pct = (x)=> `${Math.round(x * 100)}%`.padStart(4);
const top = (q, n = 6)=> Object.entries(q).sort((a, b)=> b[1] - a[1]).slice(0, n).map(([k, v])=> `${k || 'maj'}:${v}`).join(' ');

if (!ids.length)
{
    console.log('Genres (composed with joyful and melancholy, every section type)\n');
    const fingerprints = [];
    for (const genre of Object.keys(GENRES))
        for (const emotion of ['joyful', 'melancholy'])
        {
            const s = harmonyStats(compose({ title: `Report ${genre}`, genre, emotion }));
            fingerprints.push({ name: `${genre}/${emotion}`, group: genre, s });
            console.log(`${`${genre} ${emotion}`.padEnd(26)} triads ${pct(s.triads)}  ${top(s.qualities).padEnd(48)} ends ${[...new Set(s.endings)].join(', ')}`);
        }
    report(fingerprints, 'genres');

    console.log('\nMelodies (the lead, joyful and melancholy averaged)\n');
    console.log(`${''.padEnd(16)}  pace  steps leaps  rept  offb   len range  out`);
    const tunes = Object.keys(GENRES).map((genre)=>
    {
        const both = ['joyful', 'melancholy'].map(emotion => melodyStats(compose({ title: `Report ${genre}`, genre, emotion })));
        const m = Object.fromEntries(Object.keys(both[0]).map(k => [k, (both[0][k] + both[1][k]) / 2]));
        console.log(`${genre.padEnd(16)} ${Object.values(m).map(v => v.toFixed(2).padStart(5)).join(' ')}`);
        return { genre, m };
    });
    const near = [];
    for (let i = 0; i < tunes.length; i++) for (let j = i + 1; j < tunes.length; j++) near.push([melodyDistance(tunes[i].m, tunes[j].m), tunes[i].genre, tunes[j].genre]);
    near.sort((a, b)=> a[0] - b[0]);
    console.log('Nearest melodies:');
    for (const [x, a, b] of near.slice(0, 6)) console.log(`  ${x.toFixed(2)}  ${a} ~ ${b}`);
    console.log(`Mean distance ${(near.reduce((t, p)=> t + p[0], 0) / near.length).toFixed(2)}`);

    console.log('\nSound and shape (tempo joyful/melancholy, key, form, lead program, sends, the pocket in ms)\n');
    for (const [genre, g] of Object.entries(GENRES))
    {
        const [up, down] = ['joyful', 'melancholy'].map(emotion => compose({ title: `Report ${genre}`, genre, emotion }));
        const lead = up.tracks.find(t => t.role === 'lead');
        const band = `lead ${lead ? `${lead.bank ? 'chip ' : ''}${lead.program}` : '-'}, ${up.tracks.length} parts`;
        const pocket = Object.entries(g.feel?.pocket ?? {}).map(([k, v])=> `${k} ${v}`).join(' ');
        console.log(`${genre.padEnd(16)} ${`${up.tempo}/${down.tempo}`.padEnd(8)} ${up.key.padEnd(3)} ${(g.form ?? '-').padEnd(7)} `
            + `${band.padEnd(18)} rev ${String(g.mix?.reverb ?? 1).padEnd(4)} del ${String(g.mix?.delay ?? 1).padEnd(4)} `
            + `tight ${String(g.feel?.tight ?? 1).padEnd(4)} ${pocket}`);
    }
}

const songs = CATALOG.filter(c => !ids.length || ids.includes(c.id));
if (ids.length && !songs.length) throw new Error(`no such song: ${ids.join(', ')}`);
console.log(`\nWritten songs (${songs.length})\n`);
const fingerprints = [];
for (const c of songs)
{
    const s = harmonyStats(compose(c.spec));
    fingerprints.push({ name: c.id, group: c.id, s });
    console.log(`${c.id.padEnd(28)} ${String(s.chords).padStart(4)} chords  triads ${pct(s.triads)}  ${top(s.qualities)}`);
}
report(fingerprints, 'songs');

function report(list, what)
{
    if (list.length < 2) return;
    const shared = {};
    for (const { s } of list) for (const w of s.windows) shared[w] = (shared[w] ?? 0) + 1;
    console.log(`\nFour-chord windows the most ${what} share:`);
    for (const [w, n] of Object.entries(shared).sort((a, b)=> b[1] - a[1]).slice(0, 8)) console.log(`  ${String(n).padStart(3)}  ${w}`);
    const pairs = [];
    // a genre against itself doesn't count: one that sets its own mode plays the same chords for every emotion
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (list[i].group !== list[j].group) pairs.push([overlap(list[i].s.windows, list[j].s.windows), list[i].name, list[j].name]);
    pairs.sort((a, b)=> b[0] - a[0]);
    console.log(`Most alike ${what}:`);
    for (const [x, a, b] of pairs.slice(0, 6)) console.log(`  ${x.toFixed(2)}  ${a} ~ ${b}`);
    const triads = list.reduce((t, { s })=> t + s.triads * s.chords, 0) / list.reduce((t, { s })=> t + s.chords, 0);
    console.log(`Mean overlap ${(pairs.reduce((t, p)=> t + p[0], 0) / pairs.length).toFixed(3)}, plain triads ${pct(triads).trim()} of all chords`);
}
