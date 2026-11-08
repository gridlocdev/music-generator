import test from 'node:test';
import assert from 'node:assert/strict';
import { insertTime, deleteTime, humanizeNotes, scaleNotes, reverseNotes, updateClip, emptyProject, makeTrack, addTrack, addClip, moveClip, splitAt, removeTrack, setMixer, setTempo, setTempoAt, removeTempoChange, setMeterAt, removeMeterChange, trackNotes,
    history, commit, undo, redo, newId, setLoop, addMarker, renameMarker, removeMarker, markerRange, moveTrack, duplicateTrack,
    joinClips, quantizeNotes } from '../../src/daw/project.js';
import { writeProject, readProject } from '../../src/daw/project-format.js';
import { projectMidi, midiProject, addMidiTracks } from '../../src/daw/project-midi.js';
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

test('a marker splitting a section takes its meta; markers rename, go, and head a stretch', ()=>
{
    let p = { ...emptyProject(), markers: [{ beat: 0, name: 'Intro', meta: { type: 'intro', energy: 0.3 } }] };
    p = addMarker(p, 16, 'Verse');
    assert.deepEqual(p.markers[1], { beat: 16, name: 'Verse', meta: { type: 'intro', energy: 0.3 } });
    assert.equal(addMarker(p, 16, 'Again'), p);
    assert.deepEqual(markerRange(p, 0), { from: 0, to: 16 });
    assert.deepEqual(markerRange(p, 1), { from: 16, to: 64 });
    assert.equal(renameMarker(p, 1, 'Chorus').markers[1].name, 'Chorus');
    assert.deepEqual(removeMarker(p, 0).markers.map(m => m.name), ['Verse']);
    assert.deepEqual(setLoop(p, { from: 4, to: 8 }).loop, { from: 4, to: 8 });
    assert.equal(setLoop(p, { from: 8, to: 8 }).loop, null);
});

test('tracks move and duplicate with new ids', ()=>
{
    const { p, keys, kit } = fixture();
    assert.deepEqual(moveTrack(p, kit, -1).tracks.map(t => t.id), [kit, keys]);
    assert.equal(moveTrack(p, keys, -1), p);
    const d = duplicateTrack(p, keys);
    assert.deepEqual(d.tracks.map(t => t.name), ['Keys', 'Keys copy', 'Kit']);
    const ids = d.tracks.flatMap(t => [t.id, ...t.clips.map(c => c.id)]);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(d.tracks[1].clips[0].notes, d.tracks[0].clips[0].notes);
});

test('clips join into one, notes kept in place', ()=>
{
    const { p, keys } = fixture();
    const q = addClip(p, keys, { id: 'c2', start: 12, beats: 4, notes: [{ beat: 1, beats: 1, key: 67, vel: 70 }] });
    const j = joinClips(q, keys, ['c1', 'c2']);
    const t = j.tracks.find(x => x.id === keys);
    assert.equal(t.clips.length, 1);
    assert.deepEqual([t.clips[0].start, t.clips[0].beats], [4, 12]);
    assert.deepEqual(trackNotes(t).map(n => n.beat), trackNotes(q.tracks.find(x => x.id === keys)).map(n => n.beat));
});

test('quantize moves starts and ends onto the grid', ()=>
{
    const q = quantizeNotes([{ beat: 0.9, beats: 0.4, key: 60, vel: 90 }, { beat: 2.1, beats: 0.05, key: 62, vel: 90 }], 0.5);
    assert.deepEqual(q.map(n => [n.beat, n.beats]), [[1, 0.5], [2, 0.05]]);
    assert.deepEqual(quantizeNotes([{ beat: 0.8, beats: 1, key: 60, vel: 90 }], 1, 0.5).map(n => n.beat), [0.9]);
});

test('a project exports as a MIDI file with a track per track', ()=>
{
    const { p } = fixture();
    const bytes = projectMidi(p);
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'MThd');
    assert.equal((bytes[10] << 8) | bytes[11], 3);      // the conductor track and two tracks
    // the kit plays on channel 10: a program change 0xC9
    assert.ok(bytes.some((b, i)=> b === 0xc9 && bytes[i + 1] === 0));
});

test('inserting time moves everything after it on, cutting a clip across it', ()=>
{
    let p = emptyProject({ bars: 4 });
    p = addTrack(p, makeTrack(p, { name: 'Keys' }));
    const id = p.tracks[0].id;
    p = addClip(p, id, { id: 'c1', start: 0, beats: 8, notes: [{ beat: 1, beats: 1, key: 60, vel: 90 }, { beat: 5, beats: 1, key: 62, vel: 90 }] });
    p = { ...p, markers: [{ beat: 0, name: 'A' }, { beat: 4, name: 'B' }], loop: { from: 4, to: 8 }, chords: [{ beat: 0, beats: 8, name: 'C', tones: [0, 4, 7] }] };
    const q = insertTime(p, 4, 4);
    assert.deepEqual(trackNotes(q.tracks[0]).map(n => n.beat), [1, 9]);
    assert.deepEqual(q.markers.map(m => m.beat), [0, 8]);
    assert.deepEqual(q.loop, { from: 8, to: 12 });
    assert.deepEqual(q.chords.map(c => [c.beat, c.beats]), [[0, 4], [8, 4]]);
    assert.equal(q.length, 20);
    // and taking it out again puts the notes back
    const back = deleteTime(q, 4, 8);
    assert.deepEqual(trackNotes(back.tracks[0]).map(n => n.beat), [1, 5]);
    assert.deepEqual(back.loop, { from: 4, to: 8 });
    assert.equal(back.length, 16);
});

test('deleting time drops what was in it', ()=>
{
    let p = emptyProject({ bars: 4 });
    p = addTrack(p, makeTrack(p, { name: 'Keys' }));
    const id = p.tracks[0].id;
    p = addClip(p, id, { id: 'c1', start: 0, beats: 12, notes: [0, 4, 8].map(beat => ({ beat, beats: 1, key: 60, vel: 90 })) });
    p = { ...p, markers: [{ beat: 0, name: 'A' }, { beat: 4, name: 'B' }, { beat: 8, name: 'C' }], tempoMap: [{ beat: 0, bpm: 100 }, { beat: 6, bpm: 120 }] };
    const q = deleteTime(p, 4, 8);
    assert.deepEqual(trackNotes(q.tracks[0]).map(n => n.beat), [0, 4]);
    assert.deepEqual(q.markers.map(m => m.name), ['A', 'C']);
    assert.deepEqual(q.tempoMap, [{ beat: 0, bpm: 100 }]);
});

test('a muted clip is not played', ()=>
{
    let p = emptyProject();
    p = addTrack(p, makeTrack(p, { name: 'Keys' }));
    const id = p.tracks[0].id;
    p = addClip(p, id, { id: 'c1', start: 0, beats: 4, notes: [{ beat: 0, beats: 1, key: 60, vel: 90 }] });
    assert.equal(trackNotes(updateClip(p, id, 'c1', { mute: true }).tracks[0]).length, 0);
});

test('humanize, speed and reverse', ()=>
{
    const notes = [{ beat: 0, beats: 1, key: 60, vel: 80 }, { beat: 2, beats: 2, key: 64, vel: 80 }];
    const h = humanizeNotes(notes, { timing: 0.1, velocity: 10 }, ()=> 1);
    assert.deepEqual(h.map(n => [n.beat, n.vel]), [[0.1, 90], [2.1, 90]]);
    assert.deepEqual(scaleNotes(notes, 0.5).map(n => [n.beat, n.beats]), [[0, 0.5], [1, 1]]);
    assert.deepEqual(reverseNotes(notes, 0, 4).map(n => [n.beat, n.key]), [[0, 64], [3, 60]]);
});

test('tempo changes are added, edited, ramped and removed', ()=>
{
    let p = emptyProject({ bpm: 100 });
    p = setTempoAt(p, 16, 120);
    assert.deepEqual(p.tempoMap, [{ beat: 0, bpm: 100 }, { beat: 16, bpm: 120 }]);
    p = setTempoAt(p, 0, 100, { ramp: true });
    assert.deepEqual(p.tempoMap[0], { beat: 0, bpm: 100, to: 120 });
    // a ramp into a change follows it to its new tempo
    p = setTempoAt(p, 16, 130);
    assert.deepEqual(p.tempoMap, [{ beat: 0, bpm: 100, to: 130 }, { beat: 16, bpm: 130 }]);
    p = setTempoAt(p, 0, 100, { ramp: false });
    assert.equal(p.tempoMap[0].to, undefined);
    p = setTempoAt(p, 8, 90);
    assert.deepEqual(p.tempoMap.map(s => s.beat), [0, 8, 16]);
    assert.equal(removeTempoChange(p, 0), p, 'the first stays');
    assert.deepEqual(removeTempoChange(p, 1).tempoMap.map(s => s.beat), [0, 16]);
});

test('meter changes are added, edited and removed', ()=>
{
    let p = emptyProject({ sig: '4/4' });
    p = setMeterAt(p, 16, '6/8');
    assert.deepEqual(p.meters, [{ beat: 0, sig: '4/4' }, { beat: 16, sig: '6/8' }]);
    assert.deepEqual(barAt(p.meters, 19), { bar: 5, start: 19, beatsPerBar: 3 });
    p = setMeterAt(p, 16, '7/8');
    assert.deepEqual(p.meters[1], { beat: 16, sig: '7/8' });
    assert.equal(removeMeterChange(p, 0), p);
    assert.deepEqual(removeMeterChange(p, 1).meters, [{ beat: 0, sig: '4/4' }]);
});

test('a MIDI export opens as a project with the same notes, tempo map and meters', ()=>
{
    let p = emptyProject({ title: 'Trip', bpm: 90, sig: '3/4', bars: 4 });
    p = setTempoAt(p, 6, 120);
    const lead = makeTrack(p, { name: 'Lead', instrument: { bank: 0, program: 73 } });
    p = addClip(addTrack(p, lead), lead.id, { id: 'c1', start: 3, beats: 6, notes: [{ key: 72, beat: 0, beats: 1, vel: 90 }, { key: 74, beat: 4.5, beats: 1.5, vel: 80 }] });
    const kit = makeTrack(p, { name: 'Kit', instrument: { bank: 128, program: 0 } });
    p = addClip(addTrack(p, kit), kit.id, { id: 'c2', start: 0, beats: 3, notes: [{ key: 36, beat: 0, beats: 0.5, vel: 100 }] });
    const q = midiProject(projectMidi(p), 'file');
    assert.equal(q.title, 'Trip');
    assert.deepEqual(q.tempoMap, [{ beat: 0, bpm: 90 }, { beat: 6, bpm: 120 }]);
    assert.deepEqual(q.meters, [{ beat: 0, sig: '3/4' }]);
    assert.deepEqual(q.tracks.map(t => [t.name, t.instrument]), [['Lead', { bank: 0, program: 73 }], ['Kit', { bank: 128, program: 0 }]]);
    assert.deepEqual(trackNotes(q.tracks[0]), trackNotes(p.tracks[0]));
    assert.deepEqual(trackNotes(q.tracks[1]), trackNotes(p.tracks[1]));
    assert.equal(q.length, 9);
    assert.deepEqual(q.tracks[0].clips.map(c => [c.start, c.beats]), [[0, 9]]);
});

test('MIDI tracks dropped into a project start at the bar of the drop', ()=>
{
    const bytes = projectMidi({ ...emptyProject(), tracks: [{ ...makeTrack(emptyProject(), { name: 'A' }), clips: [{ id: 'c1', start: 0, beats: 4, notes: [{ key: 60, beat: 1, beats: 5, vel: 100 }] }] }] });
    const p = addMidiTracks(emptyProject({ bars: 2 }), bytes, 5.5);
    assert.equal(p.tracks.length, 1);
    assert.deepEqual(p.tracks[0].clips.map(c => [c.start, c.beats, c.notes[0].beat]), [[4, 8, 1]]);
    assert.equal(p.length, 12);
});
