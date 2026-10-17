import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../../src/features/composer/compose.js';
import { perform, swungTracks } from '../../src/features/composer/perform.js';
import { planMix, valueAt } from '../../src/features/composer/mix-plan.js';
import { SECTIONS } from '../../src/features/composer/composer-data.js';
import { EXPRESSION, MOVEMENT, DUCK } from '../../src/features/composer/performance-data.js';
import { EAR_CANDY } from '../../src/features/composer/adaptive-data.js';
import { planEarCandy } from '../../src/features/composer/ear-candy.js';
import { swingTime, swingAmount } from '../../src/features/composer/meter.js';
import { stingNotes } from '../../src/features/composer/stingers.js';
import { beatToSeconds } from '../../src/lib/tempo-map.js';
import { SONGS } from '../../src/features/composer/songs-data.js';
import { GENRE_SONGS } from '../../src/features/composer/genre-songs-data.js';
import { GAME_SONGS } from '../../src/features/composer/game-songs-data.js';

const ALL = [...SONGS, ...GENRE_SONGS, ...GAME_SONGS];

test('a performance is deterministic and keeps every note playable', ()=>
{
    for (const spec of ALL)
    {
        const score = compose(spec);
        const a = perform(score);
        assert.deepEqual(a, perform(compose(spec)), spec.id);
        a.forEach((notes, i)=>
        {
            assert.ok(notes.filter(n => !n.ghost && !n.candy).length <= score.tracks[i].notes.length);
            for (const n of notes) assert.ok(n.beat >= 0 && n.beats > 0 && n.vel >= 1 && n.vel <= 127, `${spec.id} ${score.tracks[i].role}`);
        });
    }
});

test('drums and bass stay on the grid; melodic parts drift by no more than their jitter', ()=>
{
    const score = compose(GENRE_SONGS[0]);
    const spb = 60 / Math.max(...score.tempoMap.map(t => t.bpm));       // the fastest tempo: the most beats per ms
    perform(score).forEach((notes, i)=>
    {
        const t = score.tracks[i];
        const max = (EXPRESSION.jitterMs[t.role] ?? 0) / 1000 / spb;
        const written = [...t.notes].sort((a, b)=> a.beat - b.beat || a.key - b.key);
        // match each played note to the written note it came from (same key, nearest start)
        for (const n of notes.filter(n => !n.ghost))
        {
            const w = written.filter(w => w.key === n.key).reduce((best, w)=> Math.abs(w.beat - n.beat) < Math.abs(best.beat - n.beat) ? w : best);
            assert.ok(Math.abs(w.beat - n.beat) <= max + 1e-9, `${t.role} at ${n.beat}`);
        }
        if (!max) assert.deepEqual(notes.filter(n => !n.ghost).map(n => n.beat), written.map(n => n.beat), t.role);
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
    const secs = (b)=> beatToSeconds(score.tempoMap, b);
    for (let i = 1; i < plan.ducks.length; i++) assert.ok(secs(plan.ducks[i]) - secs(plan.ducks[i - 1]) >= DUCK.seconds - 1e-9);
    const bass = plan.tracks[score.tracks.findIndex(t => t.role === 'bass')];
    assert.equal(bass.duck, DUCK.db.bass);

    const pre = score.sections.find(s => SECTIONS[s.type].build);
    const pad = plan.tracks[score.tracks.findIndex(t => t.role === 'pad')];
    assert.ok(valueAt(pad.frames.tone, pre.beat + 1) <= MOVEMENT.sweep.closed + 1e-6);
    assert.ok(valueAt(pad.frames.tone, pre.beat + pre.beats / 2) > MOVEMENT.sweep.closed);
    // it opens to the brightness of the section it builds into: a louder section is brighter
    const { low, high } = MOVEMENT.brightness, chorus = score.sections[score.sections.indexOf(pre) + 1];
    assert.ok(Math.abs(valueAt(pad.frames.tone, pre.beat + pre.beats) - low * (high / low) ** chorus.energy) < 1e-6);
    const verse = score.sections.find(s => s.type === 'verse');
    assert.ok(valueAt(pad.frames.tone, verse.beat + 6) < valueAt(pad.frames.tone, chorus.beat + 6), 'the verse is darker than the chorus');
    // the lead's delay opens only on phrase endings
    const lead = plan.tracks[score.tracks.findIndex(t => t.role === 'lead')];
    const sends = new Set(lead.frames.delay.map(f => f.value));
    assert.equal(sends.size, 2);

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

test('ghost notes are quiet and short, and sit next to a snare backbeat or just before a bass note', ()=>
{
    const score = compose({ title: 'Ghosts', emotion: 'joyful', style: 'funky' });
    const performed = perform(score);
    let ghosts = 0;
    performed.forEach((notes, i)=>
    {
        for (const n of notes.filter(n => n.ghost))
        {
            ghosts++;
            const role = score.tracks[i].role;
            const { vel, beats } = EXPRESSION.ghost[role === 'drums' ? 'snare' : 'bass'];
            assert.ok(n.vel >= vel[0] && n.vel <= vel[1] && n.beats === beats, `${role} at ${n.beat}`);
            assert.ok(['drums', 'bass'].includes(role));
        }
    });
    assert.ok(ghosts > 20, `${ghosts} ghost notes`);
    assert.ok(perform(compose({ title: 'Ghosts', emotion: 'joyful', style: { ghosts: 0 } })).flat().every(n => !n.ghost));
});

test('scoops start a semitone low on bending instruments; risers an octave', ()=>
{
    const score = compose({ title: 'Scoops', emotion: 'tender', style: { scoops: 1 }, band: { lead: 40, chords: 48 } });
    const scooped = perform(score).flatMap((notes, i)=> notes.filter(n => n.scoop).map(n => ({ n, t: score.tracks[i] })));
    assert.ok(scooped.some(({ n })=> n.scoop.cents === EXPRESSION.scoop.cents));
    for (const { n, t } of scooped)
    {
        assert.ok([EXPRESSION.scoop.cents, EAR_CANDY.riser.cents].includes(n.scoop.cents));
        if (n.scoop.cents === EXPRESSION.scoop.cents) assert.ok(n.scoop.seconds >= EXPRESSION.scoop.seconds[0] && n.scoop.seconds <= EXPRESSION.scoop.seconds[1], t.role);
    }
    const piano = compose({ title: 'Scoops', emotion: 'tender', style: { scoops: 1, earCandy: 0 }, band: { lead: 0, chords: 0, pad: 0, counter: 0 } });
    assert.ok(perform(piano).flat().every(n => !n.scoop), 'a piano never scoops');
});

test('swing warps time for every part alike: offbeat eighths late, beats untouched, 0.5 straight', ()=>
{
    assert.equal(swingTime(1, 2 / 3), 1);
    assert.ok(Math.abs(swingTime(1.5, 2 / 3) - (1 + 2 / 3)) < 1e-9);
    assert.equal(swingTime(1.5, 0.5), 1.5);
    assert.ok(Math.abs(swingTime(0.75, 0.6, 0.25) - 0.8) < 1e-9);      // sixteenth swing
    assert.ok(Math.abs(swingAmount(1) - 2 / 3) < 1e-9);
    const score = compose({ title: 'Swung', emotion: 'playful', swing: 1 });
    const drums = perform(score)[score.tracks.findIndex(t => t.role === 'drums')].filter(n => !n.ghost);
    assert.ok(drums.some(n => Math.abs((n.beat % 1) - 2 / 3) < 1e-6), 'offbeats land on the triplet');
    assert.ok(drums.every(n => Math.abs((n.beat % 1) - 0.5) > 1e-6), 'no straight offbeats left');
});

test('a loop pass changes the details, not the music', ()=>
{
    const score = compose({ title: 'Loop', emotion: 'joyful', loop: true, style: { ghosts: 0.9, earCandy: 0 } });
    const a = perform(score, 0), b = perform(score, 1);
    assert.notDeepEqual(a, b);
    const written = (p)=> p.map(notes => notes.filter(n => !n.ghost && !n.candy).length);
    assert.deepEqual(written(a), written(b));
});

test('ear candy is rare, spaced by its cooldown, and the same for the same pass', ()=>
{
    for (const spec of ALL)
    {
        const score = compose(spec);
        const candy = planEarCandy(score);
        assert.deepEqual(candy, planEarCandy(compose(spec)), spec.id);
        const keyChanges = new Set(score.sections.filter((s, i)=> i && s.tonic !== score.sections[i - 1].tonic).map(s => s.beat));
        const spaced = candy.filter(c => !keyChanges.has(c.beat));
        for (let i = 1; i < spaced.length; i++) assert.ok(spaced[i].beat - spaced[i - 1].beat >= EAR_CANDY.cooldownBars * 3 - 1e-9, `${spec.id} at ${spaced[i].beat}`);
        assert.ok(candy.length <= score.beats / score.beatsPerBar / 4, spec.id);
    }
    const lifted = compose({ title: 'Lift', emotion: 'hopeful', lift: 1, style: { earCandy: 0 } });
    const chorus = lifted.sections.findLast(s => s.type === 'chorus');
    assert.ok(planEarCandy(lifted).some(c => c.kind === 'riser' && c.beat === chorus.beat), 'a key change always gets its riser');
});

test('stingers are in the key and mode of the section playing', ()=>
{
    const up = stingNotes('pickup', 2, 'major');                // D major: D F# A D
    assert.deepEqual(up.map(n => n.key % 12), [2, 6, 9, 2]);
    assert.deepEqual(stingNotes('pickup', 9, 'minor').map(n => n.key % 12), [9, 0, 4, 9]);
    const fail = stingNotes('fail', 0, 'major');
    for (let i = 1; i < fail.length; i++) assert.equal(fail[i - 1].key - fail[i].key, 3, 'falls in minor thirds');
    assert.throws(()=> stingNotes('nope', 0, 'major'));
});

test('every played note knows the beat it belongs on, even when it sounds before it', ()=>
{
    const score = compose({ title: 'Grid', emotion: 'joyful', style: { syncopation: 1 } });
    const lead = score.tracks.findIndex(t => t.role === 'lead');
    const early = score.tracks[lead].notes.filter(n => n.anticipates !== undefined);
    assert.ok(early.length > 0);
    for (const n of early) assert.equal(n.anticipates - n.beat, 0.25);
    perform(score).forEach((notes, i)=>
    {
        const written = new Set(score.tracks[i].notes.map(n => n.anticipates ?? n.beat));
        for (const n of notes.filter(n => !n.ghost && !n.candy)) assert.ok(written.has(n.grid), `${score.tracks[i].role} grid ${n.grid}`);
    });
    const anticipated = perform(score)[lead].filter(n => n.grid - n.beat > 0.2);
    assert.ok(anticipated.length > 0, 'an anticipation sounds before its grid');
});

test('swing counts from each section, so an odd-length bar before it can’t turn it around; MIDI gets it too', ()=>
{
    const spec = { title: 'Odd', emotion: 'playful', swing: 1, form: ['intro', 'link', 'verse'], sections: { link: { meter: '7/8' } } };
    const score = compose(spec);
    const verse = score.sections.find(s => s.type === 'verse');
    assert.equal(verse.beat % 1, 0.5, 'the verse starts on a half beat');
    const i = score.tracks.findIndex(t => t.role === 'drums');
    const kicks = perform(score)[i].filter(n => n.key === 36 && !n.ghost && n.beat >= verse.beat);
    const written = score.tracks[i].notes.filter(n => n.key === 36 && n.beat >= verse.beat);
    assert.deepEqual(kicks.filter(k => (k.grid - verse.beat) % 1 === 0).map(k => k.beat), written.filter(k => (k.beat - verse.beat) % 1 === 0).map(k => k.beat), 'downbeats stay put');
    const midi = swungTracks(score)[i].notes;
    assert.ok(midi.some(n => Math.abs(((n.beat - verse.beat) % 1) - 2 / 3) < 1e-6), 'the export is swung');
    const straight = compose({ title: 'x', emotion: 'joyful' });
    assert.equal(swungTracks(straight), straight.tracks, 'a straight song exports as written');
});

test('tape stops swallow the notes in their last seconds, measured through the tempo map', ()=>
{
    const score = compose({ title: 'Tape', emotion: 'joyful', form: 'edm', style: { earCandy: 1 } });
    const candy = [{ kind: 'tapeStop', beat: score.sections[3].beat, seconds: 0.6 }];
    const secs = (b)=> beatToSeconds(score.tempoMap, b);
    for (const notes of perform(score, 0, candy))
        for (const n of notes) assert.ok(!(n.grid < candy[0].beat && secs(candy[0].beat) - secs(n.grid) < 0.6 - 1e-6 && !n.ghost && n.beat < candy[0].beat), `note at ${n.beat}`);
});
