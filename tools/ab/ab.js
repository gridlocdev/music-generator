// The A/B listening page: every song, rendered by the old commit (before) and this checkout (after), side by side.
// Each render runs in its own hidden iframe (render.html), so each version's modules, and the memory its
// SoundFonts take, are thrown away afterwards. Finished renders are also saved by the server (tools/ab-server.mjs).
const $ = (id)=> /** @type {HTMLElement} */ (document.getElementById(id));
const VERSIONS = { before: '/old/', after: '/' };

/** loads render.html in a hidden iframe and resolves with what it posts back */
function frame(query)
{
    return new Promise(resolve =>
    {
        const f = document.createElement('iframe');
        f.hidden = true;
        f.src = `render.html?${query}`;
        const done = (e)=>
        {
            if (e.source !== f.contentWindow) return;
            removeEventListener('message', done);
            f.remove();
            resolve(e.data);
        };
        addEventListener('message', done);
        document.body.append(f);
    });
}

const info = await (await fetch('/ab-info.json')).json();
$('info').textContent = `Before: ${info.before.rev} (${info.before.sha}, “${info.before.subject}”) · After: ${info.after.rev} (on ${info.after.sha})`;

const [before, after] = await Promise.all([frame(`root=${VERSIONS.before}&list`), frame(`root=${VERSIONS.after}&list`)]);
const inBefore = new Set(before.list.map(s => s.id));
const rows = new Map();
let group = null;
for (const s of after.list)
{
    if (s.group !== group) $('songs').append(Object.assign(document.createElement('h2'), { textContent: group = s.group }));
    const row = document.createElement('div');
    row.className = 'song';
    row.innerHTML = `<div class="title">${s.title}${s.loop ? ' <span class="stats">(loop: intro + two passes)</span>' : ''}<button type="button">Render</button></div>
        <div class="side" data-side="0"></div><div class="side" data-side="1"></div>`;
    row.querySelector('button').onclick = ()=> render(s.id);
    $('songs').append(row);
    rows.set(s.id, { row, song: s, old: inBefore.has(s.id), swap: false });
}

const dbText = (x)=> Number.isFinite(x) ? `${x.toFixed(1)} dB` : '−∞';
function fill(cell, name, result)
{
    if (result.error) { cell.innerHTML = `<div class="name">${name}</div><div class="error">${result.error}</div>`; return; }
    const url = URL.createObjectURL(new Blob([result.wav], { type: 'audio/wav' }));
    const s = result.stats;
    cell.innerHTML = `<div class="name">${name}</div><audio controls preload="none" src="${url}"></audio>
        <div class="stats">${Math.round(s.seconds)} s · peak ${dbText(s.peakDb)} · loudness ${dbText(s.rmsDb)} (loudest second ${dbText(s.loudestSecondDb)})
        · ${s.notes} notes · rendered in ${s.renderSeconds.toFixed(1)} s</div>`;
}

const label = (r, version)=> $('blind').checked ? `Side ${(version === 'before') !== r.swap ? 'X' : 'Y'}` : version === 'before' ? 'Before' : 'After';

async function render(id)
{
    const r = rows.get(id);
    r.swap = $('blind').checked && Math.random() < 0.5;
    const cells = [...r.row.querySelectorAll('.side')];
    const at = { before: cells[r.swap ? 1 : 0], after: cells[r.swap ? 0 : 1] };
    r.done = {};
    for (const version of /** @type {const} */ (['before', 'after']))
    {
        const cell = at[version];
        if (version === 'before' && !r.old) { cell.innerHTML = '<div class="stats">new in this version</div>'; continue; }
        cell.innerHTML = `<div class="stats">rendering ${label(r, version).toLowerCase()}…</div>`;
        const result = await frame(`root=${VERSIONS[version]}&song=${encodeURIComponent(id)}`);
        r.done[version] = { cell, result };
        fill(cell, label(r, version), result);
        if (result.wav) fetch(`/save/${version}/${id}.wav`, { method: 'PUT', body: result.wav.slice(0) });
    }
}

$('all').onclick = async ()=>
{
    $('all').disabled = true;
    let n = 0;
    for (const id of rows.keys())
    {
        $('status').textContent = `rendering ${++n} of ${rows.size}…`;
        await render(id);
    }
    $('status').textContent = `rendered ${rows.size} songs`;
    $('all').disabled = false;
};

$('blind').onchange = ()=> { $('reveal').hidden = !$('blind').checked; };
$('reveal').onclick = ()=>
{
    for (const r of rows.values())
        for (const [version, d] of Object.entries(r.done ?? {}))
            d.cell.querySelector('.name').textContent = `${label({ ...r }, version)} = ${version === 'before' ? 'Before' : 'After'}`;
};
