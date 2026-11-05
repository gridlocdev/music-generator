#!/usr/bin/env node
// Serves the game like `just serve`, and lets the sketchpad save whistled takes into ideas/:
//   PUT /ideas/<sketch>/<file>   (take-1.wav, take-1.json, section.js.txt)
//
//   node tools/sketch-server.mjs [--port 8003]
//
// Only names of letters, digits, - and _ are written, only under ideas/, and only from this machine.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const args = process.argv.slice(2);
const at = args.indexOf('--port');
const port = Number(at >= 0 ? args[at + 1] : 8003);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ideas = path.join(root, 'ideas');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
    '.css': 'text/css', '.wav': 'audio/wav', '.sf2': 'application/octet-stream', '.md': 'text/plain', '.txt': 'text/plain' };

const server = http.createServer((req, res)=>
{
    const save = /^\/ideas\/([\w-]+)\/([\w-]+(?:\.js)?\.(?:wav|json|txt))$/.exec(req.url ?? '');
    if (req.method === 'PUT' && save)
    {
        const dir = path.join(ideas, save[1]);
        fs.mkdirSync(dir, { recursive: true });
        req.pipe(fs.createWriteStream(path.join(dir, save[2]))).on('finish', ()=>
        {
            console.log(`saved ideas/${save[1]}/${save[2]}`);
            res.writeHead(204); res.end();
        });
        return;
    }
    // the sketchpad asks whether it can save here, and which take numbers a sketch already has
    const list = /^\/ideas\/([\w-]+)\/$/.exec(req.url ?? '');
    if (req.method === 'GET' && list)
    {
        const dir = path.join(ideas, list[1]);
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
        res.end(JSON.stringify(fs.existsSync(dir) ? fs.readdirSync(dir) : []));
        return;
    }
    let file = path.join(root, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    // the SoundFonts never change, so the browser may keep them; code must be fresh, or edits wouldn't show
    const cache = path.extname(file) === '.sf2' ? 'max-age=86400' : 'no-cache';
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': cache });
    fs.createReadStream(file).pipe(res);
});
server.listen(port, '127.0.0.1', ()=> console.log(`sketchpad: http://localhost:${port}/ (takes are saved in ideas/)`));
