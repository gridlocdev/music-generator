// Saves a sketch: every take not saved yet as take-<n>.wav and take-<n>.json, and the sketch's text as section.js.txt,
// into ideas/<name>/ when the page is served by tools/sketch-server.mjs, or as downloads when it isn't.
import { encodeWav } from '../../lib/wav.js';

/** @returns {Promise<string>} what happened, for the status line */
export async function saveSketch(name, takes, text)
{
    name = name.replace(/[^\w-]+/g, '-') || 'sketch';
    // the sketch server lists a sketch's folder as JSON; any other server answers 404 or a page
    let existing = null;
    try
    {
        const res = await fetch(`ideas/${name}/`);
        if (res.ok && res.headers.get('content-type')?.includes('json')) existing = await res.json();
    }
    catch { existing = null; }
    let next = Math.max(0, ...(existing ?? []).map(f => Number(/^take-(\d+)\.wav$/.exec(f)?.[1] ?? 0))) + 1;
    const files = [];
    for (const t of takes)
    {
        if (t.saved === name) continue;
        const id = `take-${next++}`;
        files.push([`${id}.wav`, encodeWav(t.samples, t.rate), 'audio/wav']);
        // a melody take keeps its notes and the chords whistled over it; a chord take its notes and the stretch it named
        const chord = ({ beat, beats, symbol })=> ({ beat, beats, symbol });
        const json = { kind: t.kind, source: t.source, tempo: t.tempo, meter: t.meter, key: t.key && `${t.key.key} ${t.key.mode}`,
            notes: t.notes, ...(t.chords && { chords: t.chords.map(chord) }), ...(t.range && { chord: chord(t.range) }) };
        files.push([`${id}.json`, JSON.stringify(json, null, 1), 'application/json']);
        t.saved = name;
    }
    files.push(['section.js.txt', text, 'text/plain']);
    if (existing)
    {
        for (const [file, body] of files)
        {
            const res = await fetch(`ideas/${name}/${file}`, { method: 'PUT', body });
            if (!res.ok) return `Saving ideas/${name}/${file} failed: ${res.status}`;
        }
        return `Saved ${files.length} files to ideas/${name}/`;
    }
    for (const [file, body, type] of files)
    {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([body], { type }));
        a.download = `${name}-${file}`;
        a.click();
        setTimeout(()=> URL.revokeObjectURL(a.href), 1000);
    }
    return `Downloaded ${files.length} files (serve with \`just sketch\` to save straight into ideas/).`;
}
