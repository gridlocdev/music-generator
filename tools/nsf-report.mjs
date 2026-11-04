// Analyses the music in an NSF file: what each channel does, how the lead moves, arpeggios, echoes, vibrato, drums.
//   node tools/nsf-report.mjs reference/Some.nsf [song numbers…] [--json out.json]
// Song numbers count from 1. Each song is played until it loops (or for MAX_SECONDS) and only one pass is measured.
// Reference files stay out of the repo (reference/ is ignored); this is for learning how the music is built.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseNsf, runSong } from './nsf/nsf.js';
import { channelStates, notesOf, hitsOf, findLoop, CHANNELS } from './nsf/decode.js';
import { melody, melodyLines, melodyTotals, pct, median, noteName, tally } from './music-stats.js';

const MAX_SECONDS = 360;
const FPS = 60;

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : null;
const [file, ...picks] = args;
if (!file) { console.error('usage: node tools/nsf-report.mjs file.nsf [song…] [--json out.json]'); process.exit(1); }
const nsf = parseNsf(new Uint8Array(readFileSync(file)));
const songs = picks.length ? picks.map(n => +n - 1) : [...Array(nsf.songs).keys()];
// song titles from a playlist next to the file, if there is one (lines like `file.nsf::NSF,3,Title,0:01:10,…`)
const titles = new Map();
const m3u = file.replace(/\.nsf$/i, '.m3u');
if (existsSync(m3u))
    for (const line of readFileSync(m3u, 'latin1').split(/\r?\n/))
    {
        const m = line.match(/::NSF,\$?(\d+),((?:\\,|[^,])*)/);
        if (m) titles.set(+m[1], m[2].replace(/\\,/g, ',').split(' - ').at(-1));
    }
console.log(`${nsf.name} — ${nsf.artist} — ${nsf.songs} songs${nsf.chips ? `, expansion chips ${nsf.chips}` : ''}\n`);

const all = [];
for (const song of songs)
{
    const { frames } = runSong(nsf, song, MAX_SECONDS * FPS);
    // a "loop" shorter than a second is the song having ended in silence or a held chord
    const found = findLoop(frames);
    const loop = found && found.length >= FPS ? found : null;
    const end = loop ? loop.start + loop.length : found ? found.start : frames.length;
    const states = channelStates(frames.slice(0, end));
    const result = analyse(states, end);
    result.song = song + 1;
    result.title = titles.get(song + 1) ?? null;
    result.seconds = Math.round(end / FPS);
    result.loop = loop ? { start: +(loop.start / FPS).toFixed(1), seconds: +(loop.length / FPS).toFixed(1) } : null;
    result.ends = !loop && !!found;
    all.push(result);
    print(result);
}
if (songs.length > 1) printTotals(all);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all, null, 1));

function analyse(states, frames)
{
    const channels = {};
    for (const name of Object.keys(CHANNELS))
    {
        const s = states[name];
        if (name === 'noise' || name === 'dpcm')
        {
            const hits = hitsOf(s);
            if (hits.length) channels[name] = { hits };
            continue;
        }
        const notes = notesOf(s);
        if (!notes.length) continue;
        const sounding = s.filter(x => x.pitch !== null).length;
        channels[name] = { notes, sounding: sounding / frames };
    }
    // the row: the most common gap between note starts, over every tonal channel
    const gaps = Object.values(channels).flatMap(c => (c.notes ?? []).slice(1).map((n, i)=> n.frame - c.notes[i].frame)).filter(g => g > 1 && g < 40);
    const row = tally(gaps)[0]?.[0] ?? null;
    // the lead: of the channels sounding a fifth of the time or more, the highest that isn't mostly arpeggios
    const tonal = Object.entries(channels).filter(([, c])=> c.notes);
    const candidates = tonal.filter(([, c])=> c.sounding >= 0.2 && c.notes.filter(n => n.arp).length < c.notes.length / 3);
    const lead = candidates.sort((a, b)=> median(b[1].notes.map(n => n.key)) - median(a[1].notes.map(n => n.key)))[0]?.[0] ?? null;
    return { frames, row, lead, channels, melody: lead ? melody(channels[lead].notes, row) : null, echoes: echoes(tonal) };
}

// a channel echoing another: the same keys, later and quieter
function echoes(tonal)
{
    const out = [];
    for (const [a, ca] of tonal)
        for (const [b, cb] of tonal)
        {
            if (a === b) continue;
            const starts = new Map(ca.notes.map(n => [n.frame, n]));
            let best = null;
            for (let d = 1; d <= 30; d++)
            {
                let hit = 0;
                for (const n of cb.notes) { const m = starts.get(n.frame - d); if (m && m.key === n.key && n.vol <= m.vol) hit++; }
                if (!best || hit > best.hit) best = { d, hit };
            }
            const share = best.hit / cb.notes.length;
            if (share >= 0.3 && best.hit >= 20) out.push({ from: a, to: b, delay: best.d, share: +share.toFixed(2) });
        }
    return out;
}

function print(r)
{
    console.log(`── Song ${r.song}${r.title ? ` ${r.title}` : ''}: ${r.seconds}s${r.loop ? ` (loops from ${r.loop.start}s, ${r.loop.seconds}s long)` : r.ends ? ' (ends)' : ' (no loop found)'}, row ≈ ${r.row} frames (${r.row ? Math.round(3600 / (r.row * 4)) : '?'} bpm if a row is a 16th)`);
    for (const [name, c] of Object.entries(r.channels))
    {
        if (c.hits)
        {
            const sounds = tally(c.hits.map(h => h.sound)).slice(0, 4).map(([s, n])=> `${s}×${n}`).join(' ');
            console.log(`  ${name.padEnd(9)} ${String(c.hits.length).padStart(4)} hits   sounds ${sounds}`);
            continue;
        }
        const keys = c.notes.map(n => n.key), arps = c.notes.filter(n => n.arp);
        const shapes = tally(arps.map(n => n.arp.join(','))).slice(0, 3).map(([s, n])=> `[${s}]×${n}`).join(' ');
        const duty = tally(c.notes.map(n => n.duty)).slice(0, 3).map(([d, n])=> `${d}:${pct(n, c.notes.length)}`).join(' ');
        console.log(`  ${(name + (name === r.lead ? '*' : '')).padEnd(9)} ${String(c.notes.length).padStart(4)} notes  ${noteName(Math.min(...keys))}–${noteName(Math.max(...keys))} mid ${noteName(median(keys))}  sounding ${pct(c.sounding, 1)}  arp ${pct(arps.length, c.notes.length)} ${shapes}  duty ${duty}`);
    }
    if (r.melody) console.log(melodyLines(r.lead, r.melody));
    for (const e of r.echoes) console.log(`  echo: ${e.to} repeats ${e.from} ${e.delay} frames later (${pct(e.share, 1)} of its notes)`);
    console.log();
}

function printTotals(rs)
{
    console.log('══ All songs');
    console.log(melodyTotals(rs.filter(r => r.melody).map(r => r.melody)));
    console.log(`  lead channel: ${tally(rs.filter(r => r.lead).map(r => r.lead)).map(([c, n])=> `${c}×${n}`).join(' ')}`);
    console.log(`  rows (frames): ${tally(rs.map(r => r.row)).map(([c, n])=> `${c}×${n}`).join(' ')}`);
    const arps = rs.flatMap(r => Object.values(r.channels).flatMap(c => (c.notes ?? []).filter(n => n.arp)));
    console.log(`  arpeggio shapes: ${tally(arps.map(n => n.arp.join(','))).slice(0, 8).map(([s, n])=> `[${s}]×${n}`).join(' ')}`);
    console.log(`  echoes: ${tally(rs.flatMap(r => r.echoes.map(e => `${e.from}→${e.to}+${e.delay}`))).slice(0, 8).map(([s, n])=> `${s}×${n}`).join(' ')}`);
}
