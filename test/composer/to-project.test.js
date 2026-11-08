import test from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../../src/composer/compose.js';
import { perform } from '../../src/composer/perform.js';
import { planEarCandy } from '../../src/composer/ear-candy.js';
import { toProject } from '../../src/composer/to-project.js';
import { humanizeFx } from '../../src/composer/humanize-fx.js';
import { CATALOG } from '../../src/composer/catalog.js';
import { writeProject, readProject } from '../../src/daw/project-format.js';
import { trackNotes } from '../../src/daw/project.js';

const near = (a, b)=> Math.abs(a - b) < 2e-3;

test('a song as a project holds every note of the score', ()=>
{
    for (const { spec } of CATALOG)
    {
        const score = compose(spec), project = toProject(score);
        assert.equal(project.tracks.length, score.tracks.length, spec.id);
        project.tracks.forEach((t, i)=>
        {
            const got = trackNotes(t), want = score.tracks[i].notes;
            assert.equal(got.length, want.length, `${spec.id} ${t.name}`);
            got.forEach((n, k)=> assert.ok(near(n.beat, want[k].beat) && n.key === want[k].key, `${spec.id} ${t.name} #${k}`));
        });
        assert.deepEqual(project.markers.map(m => m.beat), score.sections.map(s => s.beat));
    }
});

test('the Humanize FX plays a project, read back from its file, as the score is performed', ()=>
{
    for (const { spec } of CATALOG.filter((c, i)=> i % 3 === 0))
    {
        const score = compose(spec);
        const project = readProject(writeProject(toProject(score)));
        for (const pass of [0, 1])
        {
            const want = perform(score, pass, planEarCandy(score, pass));
            const got = humanizeFx.perform(project, pass);
            project.tracks.forEach((t, i)=>
            {
                const a = got.notes.get(t.id), b = want[i];
                assert.equal(a.length, b.length, `${spec.id} ${t.name} pass ${pass}`);
                a.forEach((n, k)=> assert.ok(n.key === b[k].key && n.vel === b[k].vel && near(n.beat, b[k].beat) && near(n.grid, b[k].grid),
                    `${spec.id} ${t.name} pass ${pass} #${k}: ${JSON.stringify(n)} vs ${JSON.stringify(b[k])}`));
            });
        }
    }
});

test('every project in projects/ reads, and plays through the Humanize FX', async ()=>
{
    const fs = await import('node:fs');
    const dir = new URL('../../projects/', import.meta.url);
    const names = fs.readdirSync(dir).filter(n => fs.existsSync(new URL(`${n}/project.json`, dir)));
    assert.ok(names.length >= 38);
    for (const name of names)
    {
        const project = readProject(fs.readFileSync(new URL(`${name}/project.json`, dir), 'utf8'));
        const { notes } = humanizeFx.perform(project, 0);
        assert.ok([...notes.values()].some(n => n.length), name);
    }
});
