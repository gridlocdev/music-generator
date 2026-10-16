import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../../src/features/composer/compose.js';
import { perform } from '../../src/features/composer/perform.js';
import { planMix, valueAt } from '../../src/features/composer/mix-plan.js';
import { EXPRESSION, MOVEMENT, DUCK, SECTIONS } from '../../src/features/composer/composer-data.js';
import { SONGS } from '../../src/features/composer/songs-data.js';
import { GENRE_SONGS } from '../../src/features/composer/genre-songs-data.js';

const ALL = [...SONGS, ...GENRE_SONGS];

test('a performance is deterministic and keeps every note playable', ()=>
{
    for (const spec of ALL)
    {
        const score = compose(spec);
        const a = perform(score);
        assert.deepEqual(a, perform(compose(spec)), spec.id);
        a.forEach((notes, i)=>
        {
            assert.ok(notes.length <= score.tracks[i].notes.length);
            for (const n of notes) assert.ok(n.beat >= 0 && n.beats > 0 && n.vel >= 1 && n.vel <= 127, `${spec.id} ${score.tracks[i].role}`);
        });
    }
});

test('drums and bass stay on the grid; melodic parts drift by no more than their jitter', ()=>
{
    const score = compose(GENRE_SONGS[0]);
    const spb = 60 / score.tempo;
    perform(score).forEach((notes, i)=>
    {
        const t = score.tracks[i];
        const max = (EXPRESSION.jitterMs[t.role] ?? 0) / 1000 / spb;
        const written = [...t.notes].sort((a, b)=> a.beat - b.beat || a.key - b.key);
        // match each played note to the written note it came from (same key, nearest start)
        for (const n of notes)
        {
            const w = written.filter(w => w.key === n.key).reduce((best, w)=> Math.abs(w.beat - n.beat) < Math.abs(best.beat - n.beat) ? w : best);
            assert.ok(Math.abs(w.beat - n.beat) <= max + 1e-9, `${t.role} at ${n.beat}`);
        }
        if (!max) assert.deepEqual(notes.map(n => n.beat), written.map(n => n.beat), t.role);
    });
});

test('a repeated key always ends before it sounds again', ()=>
{
    for (const spec of ALL)
        for (const notes of perform(compose(spec)))
        {
            const last = new Map();
            for (const n of notes)
            {
                const p = last.get(n.key);
                if (p && !p.held) assert.ok(p.beat + p.beats <= n.beat + 1e-9, `${spec.id} key ${n.key} at ${n.beat}`);
                last.set(n.key, n);
            }
        }
});

test('two of the same key at once play as one note, not one cut short by the other', ()=>
{
    const score = compose({ title: 'Dupes', emotion: 'hopeful' });
    const t = score.tracks.find(t => t.role === 'drums');
    const hit = t.notes[0];
    t.notes.splice(1, 0, { ...hit, vel: hit.vel - 10, beats: hit.beats * 2 });
    const notes = perform(score)[score.tracks.indexOf(t)].filter(n => n.key === hit.key && n.beat === hit.beat);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].vel, hit.vel);
    assert.equal(notes[0].beats, hit.beats * 2);
});

test('glides only on bending instruments, from a held note, by a small interval', ()=>
{
    const spec = { title: 'Glide test', emotion: 'hopeful', band: { lead: 81, bass: 35 } };
    const score = compose(spec);
    let glides = 0;
    perform(score).forEach((notes, i)=>
    {
        const t = score.tracks[i];
        notes.forEach((n, j)=>
        {
            if (n.glideFrom === undefined) return;
            glides++;
            assert.ok(EXPRESSION.glide.roles.includes(t.role) && EXPRESSION.glide.programs.includes(t.program));
            const prev = notes.slice(0, j).findLast(p => p.key === n.glideFrom);
            assert.ok(prev?.held, 'the note glided from is held');
            assert.ok(Math.abs(n.key - n.glideFrom) <= EXPRESSION.glide.maxInterval);
        });
    });
    assert.ok(glides > 0);
    // a piano lead never glides
    const piano = compose({ ...spec, band: { lead: 0, counter: null, bass: 33 } });
    assert.ok(perform(piano).flat().every(n => n.glideFrom === undefined && !n.vibrato));
});

test('vibrato only on long notes of singing instruments', ()=>
{
    const score = compose({ title: 'Vibrato test', emotion: 'tender', band: { lead: 40 } });
    const lead = perform(score)[score.tracks.findIndex(t => t.role === 'lead')];
    const spb = 60 / score.tempo;
    const withVib = lead.filter(n => n.vibrato);
    assert.ok(withVib.length > 0);
    for (const n of withVib) assert.ok(n.beats * spb >= EXPRESSION.vibrato.minSeconds - 0.05 && n.vibrato.delay > 0);
});

test('phrases end softer than they would have', ()=>
{
    const score = compose(SONGS[0]);
    const i = score.tracks.findIndex(t => t.role === 'lead');
    const written = score.tracks[i].notes, played = perform(score)[i];
    assert.notDeepEqual(played.map(n => n.vel), [...written].sort((a, b)=> a.beat - b.beat).map(n => n.vel));
});

test('the mix plan ducks under kicks, sweeps into builds and opens the reverb at the end', ()=>
{
    const score = compose({ title: 'Mix test', emotion: 'hopeful', form: 'pop' });
    const plan = planMix(score);
    assert.ok(plan.ducks.length > 0);
    const spb = 60 / score.tempo;
    for (let i = 1; i < plan.ducks.length; i++) assert.ok((plan.ducks[i] - plan.ducks[i - 1]) * spb >= DUCK.seconds - 1e-9);
    const bass = plan.tracks[score.tracks.findIndex(t => t.role === 'bass')];
    assert.equal(bass.duck, DUCK.db.bass);

    const pre = score.sections.find(s => SECTIONS[s.type].build);
    const pad = plan.tracks[score.tracks.findIndex(t => t.role === 'pad')];
    assert.ok(valueAt(pad.frames.tone, pre.beat + 1) <= MOVEMENT.sweep.closed + 1e-6);
    assert.ok(valueAt(pad.frames.tone, pre.beat + pre.beats / 2) > MOVEMENT.sweep.closed);
    assert.equal(valueAt(pad.frames.tone, pre.beat + pre.beats), MOVEMENT.sweep.open);

    const outro = score.sections.at(-1);
    const r = (b)=> valueAt(pad.frames.reverb, b);
    assert.ok(r(outro.beat + outro.beats - 1) > r(score.sections.find(s => s.type === 'chorus').beat + 4));
});

test('valueAt interpolates like Web Audio ramps', ()=>
{
    const f = [{ beat: 0, value: 100, curve: 'set' }, { beat: 4, value: 400, curve: 'exp' }, { beat: 8, value: 0, curve: 'linear' }, { beat: 9, value: 7, curve: 'set' }];
    assert.equal(valueAt(f, -1), 100);
    assert.ok(Math.abs(valueAt(f, 2) - 200) < 1e-9);
    assert.equal(valueAt(f, 6), 200);
    assert.equal(valueAt(f, 8.5), 0);
    assert.equal(valueAt(f, 9), 7);
});
