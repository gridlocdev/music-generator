#!/usr/bin/env node
// Exports the songs in projects/ to export/<name>.mid and export/<name>.wav, and with --mp3 an MP3 too (needs ffmpeg).
//
//   node tools/export.mjs [name…] [--mp3] [--library <id>]
//
// With no names, every project. The MIDI is written here, as the app's Export as MIDI writes it. The WAV is rendered
// as the app's Export as Audio File renders it with its defaults (the whole song, the mix, a 3 s tail, not
// normalized), by tools/export/export.html in a hidden Electron window, served from this checkout. --library picks the
// SoundFont library by its id in src/audio/soundfont-catalog-data.js; without it, the first.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { readProject } from '../src/daw/project-format.js';
import { projectMidi } from '../src/daw/project-midi.js';
import { LIBRARIES } from '../src/audio/soundfont-catalog-data.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const projects = path.join(root, 'projects'), out = path.join(root, 'export');
const args = process.argv.slice(2);
const flag = (f)=> { const i = args.indexOf(f); if (i < 0) return null; const [, v] = args.splice(i, 2); return v; };
const mp3 = args.includes('--mp3') && !!args.splice(args.indexOf('--mp3'), 1);
const library = flag('--library');

const all = fs.readdirSync(projects).filter(n => fs.existsSync(path.join(projects, n, 'project.json'))).sort();
const songs = args.length ? args : all;
const unknown = songs.filter(s => !all.includes(s));
if (unknown.length) { console.error(`no project ${unknown.join(', ')} in projects/`); process.exit(1); }
if (library && !LIBRARIES.some(l => l.id === library))
{ console.error(`no SoundFont library ${library}; the libraries are ${LIBRARIES.map(l => l.id).join(', ')}`); process.exit(1); }
if (mp3) try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); }
catch { console.error('--mp3 needs ffmpeg (brew install ffmpeg)'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

// MIDI, here
for (const name of songs)
    fs.writeFileSync(path.join(out, `${name}.mid`), projectMidi(readProject(fs.readFileSync(path.join(projects, name, 'project.json'), 'utf8'))));
console.log(`MIDI: ${songs.length} file${songs.length > 1 ? 's' : ''}`);

// WAV, in the browser
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const body = (req)=> new Promise(resolve => { const parts = []; req.on('data', d => parts.push(d)); req.on('end', ()=> resolve(Buffer.concat(parts))); });
let failed = 0, done = 0, started = Date.now(), electron = null;
const server = http.createServer(async (req, res)=>
{
    const url = new URL(req.url ?? '/', 'http://x'), p = decodeURIComponent(url.pathname);
    const put = /^\/(wav|error)\/(.+)$/.exec(p);
    if (req.method === 'PUT' && put)
    {
        const data = await body(req), name = put[2];
        res.writeHead(204); res.end();
        if (put[1] === 'error') { failed++; console.error(`${name}: ${data}`); return; }
        const wav = path.join(out, `${name}.wav`);
        fs.writeFileSync(wav, data);
        if (mp3) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-b:a', '320k', path.join(out, `${name}.mp3`)]);
        console.log(`${++done}/${songs.length} ${name} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
        return;
    }
    if (req.method === 'PUT' && p === '/done')
    {
        res.writeHead(204); res.end();
        electron?.kill();
        server.close();
        console.log(`Exported to ${path.relative(process.cwd(), out) || '.'}/${failed ? `; ${failed} failed` : ''}`);
        process.exitCode = failed ? 1 : 0;
        return;
    }
    const file = path.join(root, p);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
});
server.listen(0, '127.0.0.1', ()=>
{
    const query = new URLSearchParams({ songs: songs.join(','), ...(library ? { library } : {}) });
    const page = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}/tools/export/export.html?${query}`;
    electron = spawn(path.join(root, 'node_modules', '.bin', 'electron'), [path.join(root, 'tools', 'export', 'electron.mjs'), page], { stdio: 'inherit' });
    electron.on('exit', (code)=> { if (server.listening) { console.error(`Electron quit (${code}) before the export finished`); server.close(); process.exitCode = 1; } });
});
