#!/usr/bin/env node
// Serves the A/B listening page: this checkout at /, and an older commit of it at /old/, so the page can render the
// same song with each version's own composer, performer and mixer and play them side by side.
//
//   node tools/ab-server.mjs [rev=main] [--port 8010]
//
// The old commit is extracted (git archive) into .ab/<sha>/. Both versions share this checkout's SoundFonts and
// node_modules. Every finished render is saved as .ab/out/<before|after>/<song>.wav.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (f, d)=> { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const rev = args.find((a, i)=> !a.startsWith('--') && args[i - 1] !== '--port') ?? 'main';
const port = Number(opt('--port', 8010));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const git = (...a)=> execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

const sha = git('rev-parse', '--short', rev);
const old = path.join(root, '.ab', sha);
if (!fs.existsSync(old))
{
    fs.mkdirSync(old, { recursive: true });
    execFileSync('sh', ['-c', `git archive ${sha} | tar -x -C "${old}"`], { cwd: root });
}
const out = path.join(root, '.ab', 'out');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
    '.css': 'text/css', '.wav': 'audio/wav', '.sf2': 'application/octet-stream', '.md': 'text/plain' };
// shared by both versions: too big to copy, and not part of what changed
const SHARED = /^\/(soundfonts|node_modules)\//;

function resolve(url)
{
    const p = decodeURIComponent(new URL(url, 'http://x').pathname);
    if (p.startsWith('/old/') && !SHARED.test(p.slice(4))) return path.join(old, p.slice(5));
    return path.join(root, p.startsWith('/old/') ? p.slice(5) : p.slice(1));
}

const server = http.createServer((req, res)=>
{
    // a finished render: PUT /save/<before|after>/<song>.wav
    const save = /^\/save\/(before|after)\/([\w:-]+)\.wav$/.exec(req.url ?? '');
    if (req.method === 'PUT' && save)
    {
        const dir = path.join(out, save[1]);
        fs.mkdirSync(dir, { recursive: true });
        req.pipe(fs.createWriteStream(path.join(dir, `${save[2].replace(':', '-')}.wav`))).on('finish', ()=> { res.writeHead(204); res.end(); });
        return;
    }
    if (req.url === '/ab-info.json')
    {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ before: { rev, sha, subject: git('log', '-1', '--format=%s', sha) }, after: { rev: 'working tree', sha: git('rev-parse', '--short', 'HEAD') } }));
        return;
    }
    let file = resolve(req.url ?? '/');
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    // the SoundFonts never change, so the browser may keep them; code must be fresh, or edits wouldn't be heard
    const cache = path.extname(file) === '.sf2' ? 'max-age=86400' : 'no-cache';
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': cache });
    fs.createReadStream(file).pipe(res);
});

// a port in use (another A/B server, or anything else) moves on to the next one, up to ten
let tries = 0;
server.on('error', (e)=>
{
    if (e.code !== 'EADDRINUSE' || ++tries > 10) throw e;
    console.log(`port ${port + tries - 1} is in use, trying ${port + tries}`);
    server.listen(port + tries);
});
server.on('listening', ()=>
{
    console.log(`A/B: before = ${rev} (${sha}), after = this checkout`);
    console.log(`open http://localhost:${server.address().port}/tools/ab/`);
    console.log(`renders are saved in ${path.relative(process.cwd(), out)}/`);
});
server.listen(port);
