// Where the app may write: projects/<name>/project.json and the whistled takes beside it in projects/<name>/takes/.
// Names are letters, digits, - and _; nothing outside projects/ is touched. The files themselves are read like any
// other file in the checkout.
//   GET /projects/                  the projects as a JSON list of { name, title }, by title
//   PUT /projects/<name>/project.json   written to a temporary file and swapped in, so a crash never leaves half a file
//   PUT /projects/<name>/takes/<file>   take-3.wav
//   GET /projects/<name>/takes/     the folder's files as a JSON list
import fs from 'node:fs/promises';
import path from 'node:path';

const PROJECT = /^\/projects\/([\w-]+)\/project\.json$/;
const TAKE = /^\/projects\/([\w-]+)\/takes\/([\w-]+\.wav)$/;
const TAKES = /^\/projects\/([\w-]+)\/takes\/$/;
const LIST = /^\/projects\/?$/;

async function writeAtomic(file, bytes)
{
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    await fs.writeFile(temp, bytes);
    await fs.rename(temp, file);
}

/**
 * Answers a request to save or list projects, or returns null when the request isn't one.
 * @param {string} root  the repository
 * @param {(()=> Promise<Uint8Array>)} body  reads the request's body
 * @returns {Promise<{ status: number, type?: string, body?: string, saved?: string }|null>}
 */
export async function projectRequest(root, method, pathname, body)
{
    const projects = path.join(root, 'projects');
    const put = method === 'PUT' && (PROJECT.exec(pathname) ?? TAKE.exec(pathname));
    if (put)
    {
        const rel = pathname.slice(1);
        await writeAtomic(path.join(root, rel), await body());
        return { status: 204, saved: rel };
    }
    const takes = method === 'GET' && TAKES.exec(pathname);
    if (takes)
    {
        const files = await fs.readdir(path.join(projects, takes[1], 'takes')).catch(()=> []);
        return { status: 200, type: 'application/json', body: JSON.stringify(files.filter(f => f.endsWith('.wav'))) };
    }
    if (method === 'GET' && LIST.test(pathname))
    {
        const entries = await fs.readdir(projects, { withFileTypes: true }).catch(()=> []);
        const list = (await Promise.all(entries.filter(e => e.isDirectory() && /^[\w-]+$/.test(e.name)).map(async e =>
        {
            const text = await fs.readFile(path.join(projects, e.name, 'project.json'), 'utf8').catch(()=> null);
            const title = text && /"title":\s*("(?:[^"\\]|\\.)*")/.exec(text)?.[1];
            return text ? { name: e.name, title: title ? JSON.parse(title) : e.name } : null;
        }))).filter(Boolean);
        list.sort((a, b)=> a.title.localeCompare(b.title));
        return { status: 200, type: 'application/json', body: JSON.stringify(list) };
    }
    return null;
}
