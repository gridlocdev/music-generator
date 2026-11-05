// Where the sketchpad may save: whistled takes and a sketch's text, into ideas/<sketch>/, for both tools/sketch-server.mjs
// and the desktop app. Only names of letters, digits, - and _ are accepted, and only under ideas/.
//   PUT /ideas/<sketch>/<file>   take-1.wav, take-1.json, section.js.txt
//   GET /ideas/<sketch>/         the folder's files as a JSON list: the sketchpad asks this to know it can save here
import fs from 'node:fs/promises';
import path from 'node:path';

const FILE = /^\/ideas\/([\w-]+)\/([\w-]+(?:\.js)?\.(?:wav|json|txt))$/;
const FOLDER = /^\/ideas\/([\w-]+)\/$/;

/**
 * Answers a request to save or list a sketch, or returns null when the request isn't one.
 * @param {string} root  the repository
 * @param {(()=> Promise<Uint8Array>)} body  reads the request's body
 * @returns {Promise<{ status: number, type?: string, body?: string, saved?: string }|null>}
 */
export async function ideasRequest(root, method, pathname, body)
{
    const ideas = path.join(root, 'ideas');
    const save = FILE.exec(pathname);
    if (method === 'PUT' && save)
    {
        const dir = path.join(ideas, save[1]);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, save[2]), await body());
        return { status: 204, saved: `ideas/${save[1]}/${save[2]}` };
    }
    const list = FOLDER.exec(pathname);
    if (method === 'GET' && list)
    {
        const files = await fs.readdir(path.join(ideas, list[1])).catch(()=> []);
        return { status: 200, type: 'application/json', body: JSON.stringify(files) };
    }
    return null;
}
