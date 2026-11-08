import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject, makeTrack, addTrack, addClip, moveClip, splitAt, removeTrack, setMixer, setTempo, trackNotes,
    history, commit, undo, redo, newId } from '../../src/daw/project.js';
import { writeProject, readProject } from '../../src/daw/project-format.js';
import { barAt, barLines, beatsPerBar, snap } from '../../src/daw/meter.js';
import { performProject, registerFx } from '../../src/daw/fx.js';

function fixture()
{
    let p = emptyProject({ title: 'Fixture', bpm: 100 });
    p = addTrack(p, makeTrack(p, { name: 'Keys' }));
    p = addTrack(p, makeTrack(p, { name: 'Kit', instrument: { bank: 128, program: 0 } }));
    const [keys, kit] = p.tracks.map(t => t.id);
    p = addClip(p, keys, { id: 'c1', start: 4, beats: 4, notes: [{ beat: 0, beats: 1, key: 60, vel: 90 }, { beat: 2.5, beats: 1 / 3, key: 64, vel: 80, vibrato: true }] });
    p = setMixer(p, kit, { duck: null, volumeDb: -3 });
    return { p, keys, kit };
}

test('a clip places its notes from its start', ()=>
{
    const { p, keys } = fixture();
    assert.deepEqual(trackNotes(p.tracks.find(t => t.id === keys)).map(n => [n.beat, n.key]), [[4, 60], [6.5, 64]]);
});

test('a project file reads back as the project it was written from, with one line per note', ()=>
{
    const { p } = fixture();
    const text = writeProject(p);
    assert.match(text, /\[2\.5,0\.3333,64,80,\{"vibrato":true\}\]/);
    const back = readProject(text);
    assert.equal(back.tracks[0].clips[0].notes[1].vibrato, true);
    assert.ok(Math.abs(back.tracks[0].clips[0].notes[1].beats - 1 / 3) < 1e-4);
    assert.deepEqual(back.tracks.map(t => t.mixer), p.tracks.map(t => t.mixer));
    assert.throws(()=> readProject('{"format":"something-else"}'), /not a Music Generator project/);
    assert.throws(()=> readProject(JSON.stringify({ format: 'music-generator-project', version: 99 })), /version 99/);
});

test('moving, copying and splitting clips', ()=>
{
    const { p, keys, kit } = fixture();
    const moved = moveClip(p, keys, 'c1', kit, 8);
    assert.equal(moved.tracks[0].clips.length, 0);
    assert.equal(moved.tracks[1].clips[0].start, 8);
    const copied = moveClip(p, keys, 'c1', keys, 12, true);
    assert.deepEqual(copied.tracks[0].clips.map(c => c.start), [4, 12]);
    assert.notEqual(copied.tracks[0].clips[0].id, copied.tracks[0].clips[1].id);
    const split = splitAt(p, 6);
    assert.deepEqual(split.tracks[0].clips.map(c => [c.start, c.beats, c.notes.length]), [[4, 2, 1], [6, 2, 1]]);
    assert.deepEqual(trackNotes(split.tracks[0]).map(n => n.beat), [4, 6.5]);
    assert.equal(newId(split, 'c'), 'c3');
});

test('removing a track drops ducking that listened to it', ()=>
{
    const { p, keys, kit } = fixture();
    const ducked = setMixer(p, keys, { duck: { from: kit, keys: [36], db: 4 } });
    assert.equal(removeTrack(ducked, kit).tracks[0].mixer.duck, null);
});

test('a new tempo scales the tempo map', ()=>
{
    const p = { ...emptyProject(), tempoMap: [{ beat: 0, bpm: 100 }, { beat: 16, bpm: 100, to: 120 }] };
    assert.deepEqual(setTempo(p, 150).tempoMap, [{ beat: 0, bpm: 150 }, { beat: 16, bpm: 150, to: 180 }]);
});

test('undo and redo step through edits', ()=>
{
    const { p, keys } = fixture();
    let h = history(p);
    h = commit(h, moveClip(h.present, keys, 'c1', keys, 0));
    h = commit(h, h.present);
    assert.equal(h.past.length, 1, 'an edit that changed nothing is not a step');
    h = undo(h);
    assert.equal(h.present, p);
    h = redo(h);
    assert.equal(h.present.tracks[0].clips[0].start, 0);
    assert.equal(undo(history(p)).present, p);
});

test('bars across meter changes', ()=>
{
    const meters = [{ beat: 0, sig: '4/4' }, { beat: 8, sig: '6/8' }, { beat: 14, sig: '7/4' }];
    assert.equal(beatsPerBar('6/8'), 3);
    assert.deepEqual(barLines(meters, 0, 22), [0, 4, 8, 11, 14, 21]);
    assert.deepEqual(barAt(meters, 12), { bar: 3, start: 11, beatsPerBar: 3 });
    assert.deepEqual(barAt(meters, 30), { bar: 6, start: 28, beatsPerBar: 7 });
    assert.equal(snap(meters, 11.6, 0.5), 11.5);
});

test('MIDI FX play a track; a track without one plays as written', ()=>
{
    const { p, keys, kit } = fixture();
    registerFx('test-octave', { name: 'Octave', perform: (project)=> ({ notes: new Map([[keys, [{ beat: 4, beats: 1, key: 72, vel: 90, grid: 4 }]]]), events: [] }) });
    const withFx = { ...p, tracks: p.tracks.map(t => t.id === keys ? { ...t, fx: [{ type: 'test-octave' }] } : t) };
    const out = performProject(withFx, 0);
    assert.deepEqual(out.tracks[0].map(n => n.key), [72]);
    assert.deepEqual(out.tracks[1], []);
    assert.deepEqual(performProject(p, 0).tracks[0].map(n => [n.key, n.grid]), [[60, 4], [64, 6.5]]);
    assert.equal(kit.length > 0, true);
});
