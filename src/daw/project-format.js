// The project file: project.json in a project's folder. JSON, two-space indented so changes diff well, except that each
// note is one compact line, [beat, beats, key, vel] with its marks as a fifth item when it has any, so a song is a
// few hundred kilobytes rather than megabytes. Pure.

export const FORMAT = 'music-generator-project';
export const VERSION = 1;

const NOTE = ['beat', 'beats', 'key', 'vel'];
const round = (x)=> Math.round(x * 1e4) / 1e4;

/** @param {import('./project.js').Project} project */
export function writeProject(project)
{
    const notes = [];
    const body = { format: FORMAT, version: VERSION, ...project,
        tracks: project.tracks.map(t => ({ ...t, clips: t.clips.map(c => ({ ...c, notes: c.notes.map(n =>
        {
            const { beat, beats, key, vel, ...marks } = n;
            const row = [round(beat), round(beats), key, vel];
            if (Object.keys(marks).length) row.push(marks);
            notes.push(JSON.stringify(row));
            return `\u0000${notes.length - 1}`;
        }) })) })) };
    return JSON.stringify(body, null, 2).replace(/"\\u0000(\d+)"/g, (_, i)=> notes[Number(i)]) + '\n';
}

/**
 * @param {string} text
 * @returns {import('./project.js').Project}
 */
export function readProject(text)
{
    const data = JSON.parse(text);
    if (data?.format !== FORMAT) throw new Error('not a Music Generator project');
    if (data.version !== VERSION) throw new Error(`project version ${data.version}; this app reads version ${VERSION}`);
    const { format, version, ...project } = data;
    for (const key of ['title', 'length', 'tempoMap', 'meters', 'tracks'])
        if (project[key] === undefined) throw new Error(`the project has no ${key}`);
    project.tracks = project.tracks.map(t => ({ ...t, clips: t.clips.map(c => ({ ...c, notes: c.notes.map(row =>
        ({ ...Object.fromEntries(NOTE.map((k, i)=> [k, row[i]])), ...row[4] })) })) }));
    return { key: null, markers: [], loop: null, groove: {}, chords: [], ...project };
}
