#!/usr/bin/env node
// Serves the game like `just serve`, and lets the sketchpad save whistled takes into ideas/ (ideas-files.mjs), only
// from this machine.
//   node tools/sketch-server.mjs [--port 8003]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { ideasRequest } from './ideas-files.mjs';

const args = process.argv.slice(2);
const at = args.indexOf('--port');
const port = Number(at >= 0 ? args[at + 1] : 8003);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
    '.css': 'text/css', '.wav': 'audio/wav', '.sf2': 'application/octet-stream', '.md': 'text/plain', '.txt': 'text/plain' };

const server = http.createServer(async (req, res)=>
{
    const answer = await ideasRequest(root, req.method, req.url ?? '', async ()=>
    {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        return Buffer.concat(chunks);
    }).catch((e)=> ({ status: 500, body: String(e) }));
    if (answer)
    {
        if (answer.saved) console.log(`saved ${answer.saved}`);
        res.writeHead(answer.status, { 'content-type': answer.type ?? 'text/plain', 'cache-control': 'no-cache' });
        res.end(answer.body);
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
