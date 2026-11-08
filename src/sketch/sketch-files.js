// Sketches in ideas/<name>/: saving every take not saved yet as take-<n>.wav and take-<n>.json, and the sketch's text
// as section.js.txt; listing the sketch folders; and reading a folder's takes back. The desktop app answers these
// requests (tools/ideas-files.mjs).
import { encodeWav } from '../lib/wav.js';

const safe = (name)=> name.replace(/[^\w-]+/g, '-') || 'sketch';

async function json(url)
{
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.json();
}

/** the sketch folders in ideas/, newest first */
export const listSketches = ()=> json('ideas/').catch(()=> []);

/** @returns {Promise<string>} what happened, for the status line */
export async function saveSketch(name, takes, text)
{
    name = safe(name);
    const existing = await json(`ideas/${name}/`).catch(()=> []);
    let next = Math.max(0, ...existing.map(f => Number(/^take-(\d+)\.wav$/.exec(f)?.[1] ?? 0))) + 1;
    const files = [];
    for (const t of takes)
    {
        if (t.saved === name) continue;
        const id = `take-${next++}`;
        files.push([`${id}.wav`, encodeWav(t.samples, t.rate)]);
        // a melody take keeps its notes, where its click's downbeat was and the chords whistled over it;
        // a chord take its notes and the stretch it named
        const chord = ({ beat, beats, symbol })=> ({ beat, beats, symbol });
        const data = { kind: t.kind, source: t.source, tempo: t.tempo, meter: t.meter, key: t.key && `${t.key.key} ${t.key.mode}`,
            ...(t.kind === 'melody' && { downbeat: t.downbeat }),
            notes: t.notes, ...(t.chords && { chords: t.chords.map(chord) }), ...(t.range && { chord: chord(t.range) }) };
        files.push([`${id}.json`, JSON.stringify(data, null, 1)]);
        t.saved = name;
    }
    files.push(['section.js.txt', text]);
    for (const [file, body] of files)
    {
        const res = await fetch(`ideas/${name}/${file}`, { method: 'PUT', body });
        if (!res.ok) return `Saving ideas/${name}/${file} failed: ${res.status}`;
    }
    return `Saved ${files.length} files to ideas/${name}/`;
}

/**
 * A sketch folder's takes, in order: each take's .json (when there is one) and its audio's bytes.
 * @returns {Promise<{ n: number, file: string, data: any, bytes: ArrayBuffer }[]>}
 */
export async function readSketch(name)
{
    const files = await json(`ideas/${safe(name)}/`);
    const audio = files.filter(f => /\.(wav|m4a|mp3|ogg|flac)$/i.test(f)).sort((a, b)=> numberOf(a) - numberOf(b));
    return Promise.all(audio.map(async (file)=>
    {
        const base = file.replace(/\.\w+$/, '');
        const data = files.includes(`${base}.json`) ? await json(`ideas/${name}/${base}.json`).catch(()=> null) : null;
        const bytes = await (await fetch(`ideas/${name}/${file}`)).arrayBuffer();
        return { n: numberOf(file), file, data, bytes };
    }));
}

const numberOf = (file)=> Number(/(\d+)/.exec(file)?.[1] ?? 0);
