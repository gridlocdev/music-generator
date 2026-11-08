import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { downloadLibrary } from '../../tools/soundfont-download.mjs';

const pad = (s, n)=> Buffer.from(String(s).padEnd(n, ' '), 'latin1');

/** a tar of files, as tar writes them: a 512-byte header, the bytes padded to 512 */
function tar(files)
{
    const parts = [];
    for (const [name, bytes] of files)
    {
        const h = Buffer.alloc(512);
        h.write(name, 0, 'utf8');
        h.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124, 'latin1');
        parts.push(h, bytes, Buffer.alloc(Math.ceil(bytes.length / 512) * 512 - bytes.length));
    }
    return Buffer.concat([...parts, Buffer.alloc(1024)]);
}

/** an ar archive, as a .deb is */
function ar(members)
{
    const parts = [Buffer.from('!<arch>\n', 'latin1')];
    for (const [name, bytes] of members)
        parts.push(pad(name, 16), pad(0, 12), pad(0, 6), pad(0, 6), pad(100644, 8), pad(bytes.length, 10), Buffer.from('`\n', 'latin1'), bytes, Buffer.alloc(bytes.length & 1, 10));
    return Buffer.concat(parts);
}

/** a fetch that answers from a map of url → bytes, in small chunks, as a network would */
const fakeFetch = (files)=> async (url)=>
{
    const bytes = files[url];
    if (!bytes) return new Response(null, { status: 404 });
    const body = new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 1000) c.enqueue(bytes.subarray(i, i + 1000)); c.close(); } });
    return new Response(body, { headers: { 'content-length': String(bytes.length) } });
};

test('a library inside a .deb: its files are taken out of data.tar.zst as it streams in', async ()=>
{
    const sf2 = randomBytes(1_500_001), copyright = Buffer.from('MIT');
    const data = tar([['./usr/', Buffer.alloc(0)], ['./usr/share/sounds/sf2/FluidR3_GM.sf2', sf2], ['./usr/share/doc/fluid-soundfont-gm/copyright', copyright], ['./etc/x', Buffer.from('x')]]);
    const deb = ar([['debian-binary', Buffer.from('2.0\n')], ['control.tar.zst', Buffer.from('abc')], ['data.tar.zst', zlib.zstdCompressSync(data)]]);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-'));
    const seen = [];
    await downloadLibrary('fluidr3', root, { fetch: fakeFetch({ 'http://archive.ubuntu.com/ubuntu/pool/universe/f/fluid-soundfont/fluid-soundfont-gm_3.1-5.3_all.deb': deb }),
        progress: (loaded, total)=> seen.push([loaded, total]) });
    assert.deepEqual((await fs.readdir(root)).sort(), ['FluidR3_GM']);
    assert.deepEqual(await fs.readFile(path.join(root, 'FluidR3_GM', 'FluidR3_GM.sf2')), sf2);
    assert.equal(await fs.readFile(path.join(root, 'FluidR3_GM', 'COPYING'), 'utf8'), 'MIT');
    assert.ok(seen.length && seen.at(-1)[0] === deb.length && seen.at(-1)[1] === deb.length);
    await fs.rm(root, { recursive: true });
});

test('a download that fails leaves nothing behind', async ()=>
{
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-'));
    await assert.rejects(downloadLibrary('musescore', root, { fetch: fakeFetch({}) }), /404/);
    assert.deepEqual(await fs.readdir(root), []);
    await fs.rm(root, { recursive: true });
});
