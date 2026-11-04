// Analyses the lead line of recorded game music (any file ffmpeg reads), measured the same way as tools/nsf-report.mjs
// so recordings and NSF rips can be compared.
//   node tools/audio-report.mjs reference/some/*.ogg [--json out.json]
// Needs ffmpeg. Keep the files in reference/ (ignored by git); this is for learning how the music is built.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pitchTrack, statesOf, beatFrames } from './audio/lead.js';
import { notesOf } from './nsf/decode.js';
import { melody, melodyLines, melodyTotals, pct, median, noteName, tally } from './music-stats.js';

const RATE = 22050, FPS = 60;
const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : null;
if (!args.length) { console.error('usage: node tools/audio-report.mjs file… [--json out.json]'); process.exit(1); }

const all = [];
for (const file of args)
{
    const ff = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
    if (ff.status !== 0) { console.error(`${file}: ${ff.stderr}`); continue; }
    const samples = new Float32Array(ff.stdout.buffer, ff.stdout.byteOffset, ff.stdout.length >> 2);
    const track = pitchTrack(samples, RATE, { fps: FPS });
    const notes = notesOf(statesOf(track));
    const beat = beatFrames(track, FPS);
    const row = beat ? beat / 4 : null;
    const keys = notes.map(n => n.key);
    // how well the lead keeps to one seven-note scale: the share of notes on its seven commonest pitch classes
    const classes = tally(keys.map(k => k % 12));
    const inScale = classes.slice(0, 7).reduce((n, [, c])=> n + c, 0) / Math.max(1, keys.length);
    const r = {
        file: basename(file), seconds: Math.round(samples.length / RATE), bpm: beat ? Math.round(FPS * 60 / beat) : null,
        voiced: track.filter(f => f.pitch !== null).length / track.length, inScale,
        notes: notes.length, range: keys.length ? [Math.min(...keys), Math.max(...keys)] : null, mid: median(keys),
        arps: tally(notes.filter(n => n.arp).map(n => n.arp.join(','))).slice(0, 4),
        arpShare: notes.filter(n => n.arp).length / Math.max(1, notes.length),
        melody: notes.length > 10 ? melody(notes, row) : null, noteList: jsonOut ? notes : undefined,
    };
    all.push(r);
    console.log(`── ${r.file}: ${r.seconds}s, ≈ ${r.bpm} bpm (row ${row?.toFixed(1)} frames), lead pitched ${pct(r.voiced, 1)} of the time, ${pct(inScale, 1)} of notes on 7 pitch classes`);
    if (r.range) console.log(`  ${r.notes} notes ${noteName(r.range[0])}–${noteName(r.range[1])} mid ${noteName(r.mid)}; fast cycles (arpeggios) ${pct(r.arpShare, 1)} ${r.arps.map(([s, n])=> `[${s}]×${n}`).join(' ')}`);
    if (r.melody) console.log(melodyLines('', r.melody));
    console.log();
}
if (all.length > 1)
{
    console.log('══ All files');
    console.log(melodyTotals(all.filter(r => r.melody).map(r => r.melody)));
    console.log(`  tempo: ${all.map(r => r.bpm).join(' ')} bpm`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all, null, 1));
