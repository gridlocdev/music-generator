// Downloads a SoundFont library into a folder of libraries (soundfonts/ in the checkout, or the packaged app's data
// folder), each with its license: GeneralUser GS and MuseScore_General as they're published, FluidR3_GM (the original,
// MIT) out of Ubuntu's package, read as it streams in. Used by the desktop app's Download button. Node 22.15+ (zstd).
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';

const gu = 'https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main';
const ms = 'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General';

/** each library: its folder, and its files: [url, name], or a .deb and the files to take out of it */
export const DOWNLOADS = {
    generaluser: { dir: 'GeneralUser-GS', files: [[`${gu}/GeneralUser-GS.sf2`, 'GeneralUser-GS.sf2'], [`${gu}/documentation/LICENSE.txt`, 'LICENSE.txt']] },
    musescore: { dir: 'MuseScore_General', files: ['MuseScore_General.sf2', 'MuseScore_General_License.md', 'VERSION'].map(f => [`${ms}/${f}`, f]) },
    fluidr3: { dir: 'FluidR3_GM', deb: 'http://archive.ubuntu.com/ubuntu/pool/universe/f/fluid-soundfont/fluid-soundfont-gm_3.1-5.3_all.deb',
        take: { './usr/share/sounds/sf2/FluidR3_GM.sf2': 'FluidR3_GM.sf2', './usr/share/doc/fluid-soundfont-gm/copyright': 'COPYING' } },
};

/**
 * Downloads library `id` into `root`/<its folder>. Files go to a temporary folder first, so a download cut short
 * leaves nothing behind that looks installed.
 * @param {string} id
 * @param {string} root
 * @param {{ fetch?: typeof fetch, progress?: (loaded: number, total: number)=> void }} [o] progress counts the
 *   biggest file's bytes
 */
export async function downloadLibrary(id, root, { fetch: get = fetch, progress = ()=> {} } = {})
{
    const lib = DOWNLOADS[id];
    if (!lib) throw new Error(`no library ${id}`);
    const dest = path.join(root, lib.dir), temp = `${dest}.download`;
    await fs.rm(temp, { recursive: true, force: true });
    await fs.mkdir(temp, { recursive: true });
    const open = async (url)=>
    {
        const res = await get(url);
        if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
        return res;
    };
    // the bytes of a response, counted for the progress if it's the big one
    const counted = (res)=>
    {
        const total = Number(res.headers.get('content-length')) || 0;
        let loaded = 0;
        return Readable.fromWeb(res.body).on('data', (c)=> { loaded += c.length; if (total > 1e6) progress(loaded, total); });
    };
    try
    {
        if (lib.files) for (const [url, name] of lib.files) await pipeline(counted(await open(url)), createWriteStream(path.join(temp, name)));
        else await fromDeb(counted(await open(lib.deb)), lib.take, temp);
        await fs.rm(dest, { recursive: true, force: true });
        await fs.rename(temp, dest);
    }
    catch (e) { await fs.rm(temp, { recursive: true, force: true }); throw e; }
}

/** reads exactly what's asked of a stream of chunks */
function reader(stream)
{
    const it = stream[Symbol.asyncIterator]();
    let buf = Buffer.alloc(0), done = false;
    const fill = async (n)=>
    {
        while (buf.length < n && !done)
        {
            const r = await it.next();
            if (r.done) done = true;
            else buf = buf.length ? Buffer.concat([buf, r.value]) : r.value;
        }
    };
    return {
        /** the next n bytes (fewer at the end) */
        async read(n)
        {
            await fill(n);
            const out = buf.subarray(0, n);
            buf = buf.subarray(n);
            return out;
        },
        /** the next n bytes, as chunks */
        async *chunks(n)
        {
            while (n > 0)
            {
                await fill(1);
                if (!buf.length) throw new Error('the download ended early');
                const out = buf.subarray(0, Math.min(n, buf.length));
                buf = buf.subarray(out.length);
                n -= out.length;
                yield out;
            }
        },
    };
}

/** the files `take` names (path in the package → file name), out of a .deb's data.tar.zst, into `dir` */
async function fromDeb(stream, take, dir)
{
    const ar = reader(stream);
    if ((await ar.read(8)).toString('latin1') !== '!<arch>\n') throw new Error('not a .deb');
    for (;;)
    {
        const head = await ar.read(60);
        if (head.length < 60) throw new Error('no data.tar.zst in the package');
        const name = head.toString('latin1', 0, 16).trim(), size = Number(head.toString('latin1', 48, 58).trim());
        if (name === 'data.tar.zst') return untar(Readable.from(ar.chunks(size)).pipe(zlib.createZstdDecompress()), take, dir);
        for await (const _ of ar.chunks(size + (size & 1))) { /* skipped */ }
    }
}

async function untar(stream, take, dir)
{
    const tar = reader(stream), want = new Map(Object.entries(take));
    while (want.size)
    {
        const head = await tar.read(512);
        if (head.length < 512 || head[0] === 0) throw new Error(`not in the package: ${[...want.keys()].join(', ')}`);
        const name = head.toString('utf8', 0, 100).replace(/\0.*$/s, ''), size = parseInt(head.toString('latin1', 124, 136).trim(), 8) || 0;
        const padded = Math.ceil(size / 512) * 512;
        const file = want.get(name);
        if (file)
        {
            want.delete(name);
            await pipeline(Readable.from(tar.chunks(size)), createWriteStream(path.join(dir, file)));
            await tar.read(padded - size);
        }
        else for await (const _ of tar.chunks(padded)) { /* skipped */ }
    }
}
