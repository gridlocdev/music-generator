import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose, parseMelody, sectionSeek, describe } from '../../src/features/composer/compose.js';
import { EMOTIONS, FORMS, SECTIONS, RHYTHMS, CONTOURS, RANGES, ROLES } from '../../src/features/composer/composer-data.js';
import { MIX } from '../../src/features/composer/performance-data.js';
import { GROOVES, BASS, COMPING, ARPS, DRUM_KEYS, METERS } from '../../src/features/composer/patterns-data.js';
import { meterOf, rhythmsFor } from '../../src/features/composer/meter-patterns.js';
import { SONGS as WRITTEN } from '../../src/features/composer/songs-data.js';
import { GENRE_SONGS } from '../../src/features/composer/genre-songs-data.js';
import { GAME_SONGS } from '../../src/features/composer/game-songs-data.js';
import { parseProgression, parseChord, pitchClass, MODES } from '../../src/lib/music-theory.js';
import { bpmAt } from '../../src/lib/tempo-map.js';
import { energyShape } from '../../src/features/composer/plan.js';
import { passingDim7 } from '../../src/features/composer/harmony.js';
import { drumBar, withFeel } from '../../src/features/composer/meter-patterns.js';
import { barAt } from '../../src/features/composer/meter.js';
import { STYLES, TEMPO } from '../../src/features/composer/song-craft-data.js';

const SONGS = [...WRITTEN, ...GENRE_SONGS, ...GAME_SONGS];

test('every emotion names a known mode, key, groove, form and parts, and its progressions parse', ()=>
{
    for (const [name, e] of Object.entries(EMOTIONS))
    {
        assert.ok(MODES[e.mode], `${name} mode`);
        assert.ok(GROOVES[e.groove], `${name} groove`);
        assert.ok(FORMS[e.form], `${name} form`);
        assert.ok(COMPING[e.comp] && ARPS[e.arp], `${name} comp/arp`);
        pitchClass(e.key);
        for (const p of Object.values(e.progressions)) parseProgression(p, 0, e.mode);
        for (const [role, program] of Object.entries(e.band)) assert.ok(ROLES.includes(role) && (program === null || (program >= 0 && program <= 127)), `${name} ${role}`);
    }
});

test('forms only use known sections', ()=>
{
    for (const form of Object.values(FORMS)) for (const s of form) assert.ok(SECTIONS[s], s);
});

test('rhythm cells fill exactly one bar, in every meter', ()=>
{
    for (const name of Object.keys(METERS))
    {
        const meter = meterOf(name);
        const r = rhythmsFor(meter);
        assert.ok(r.cells.length > 2, name);
        for (const cell of [...r.cells, ...Object.values(r.cadence)])
            assert.ok(Math.abs(cell.reduce((a, d)=> a + Math.abs(d), 0) - meter.beats) < 1e-9, `${name} ${JSON.stringify(cell)}`);
        assert.ok(Math.abs(meter.groups.reduce((a, b)=> a + b, 0) - meter.beats) < 1e-9, `${name} groups`);
    }
    for (const name of Object.keys(RHYTHMS)) assert.ok(METERS[name], name);
});

test('drum patterns are one bar of known drums', ()=>
{
    for (const [name, g] of Object.entries(GROOVES))
        for (const level of ['low', 'mid', 'high', 'fill'])
            for (const [voice, hits] of Object.entries(g[level] ?? {}))
            {
                assert.ok(DRUM_KEYS[voice], `${name}.${level}.${voice}`);
                assert.equal(hits.length, g.beats * 4, `${name}.${level}.${voice}`);
                assert.match(hits, /^[Xxo.]+$/);
            }
    for (const b of Object.values(BASS)) for (const [s, tone] of [...b.low, ...b.high]) assert.ok(s >= 0 && 'R358A'.includes(tone));
    for (const c of Object.values(CONTOURS)) assert.equal(c.length, 5);
    for (const role of ROLES)
    {
        const m = MIX[role];
        assert.ok(m.volumeDb <= 0 && Math.abs(m.pan) < 1 && m.lowCut >= 20 && m.reverb >= 0 && m.delay >= 0, role);
    }
});

test('composing is deterministic', ()=>
{
    for (const spec of SONGS) assert.deepEqual(compose(spec), compose(structuredClone(spec)), spec.id);
});

test('every written song and every feeling composes into in-range, in-time parts', ()=>
{
    const specs = [...SONGS, ...Object.keys(EMOTIONS).map(e => ({ title: e, emotion: e }))];
    for (const spec of specs)
    {
        const s = compose(spec);
        assert.ok(s.tracks.length >= 4, `${spec.title}: ${s.tracks.length} parts`);
        assert.ok(s.tracks.some(t => t.role === 'lead'), `${spec.title} has a melody`);
        for (const t of s.tracks)
            for (const n of t.notes)
            {
                assert.ok(n.key >= 0 && n.key <= 127 && n.vel >= 1 && n.vel <= 127, `${spec.title} ${t.role}`);
                assert.ok(n.beat >= 0 && n.beats > 0 && n.beat + n.beats <= s.beats + 1e-6, `${spec.title} ${t.role} at ${n.beat}`);
                const range = RANGES[t.role];
                if (range && t.role !== 'lead') assert.ok(n.key >= range[0] && n.key <= range[1] + 12, `${spec.title} ${t.role} key ${n.key}`);
            }
    }
});

test('composed melodies put chord tones on strong beats and end phrases on a cadence', ()=>
{
    for (const emotion of Object.keys(EMOTIONS))
    {
        const s = compose({ title: emotion, emotion });
        const lead = s.tracks.find(t => t.role === 'lead');
        let strong = 0, fit = 0;
        for (const n of lead.notes)
        {
            if (n.beat % 2 !== 0) continue;
            const chord = s.chords.findLast(c => c.beat <= n.beat);
            strong++;
            if (chordTones(s, chord).includes(n.key % 12)) fit++;
        }
        assert.ok(fit / strong > 0.8, `${emotion}: ${fit}/${strong} strong-beat notes are chord tones`);
        // sections whose last phrase is a full cadence end their tune on the tonic
        const tonic = pitchClass(s.key);
        for (const sec of s.sections.filter(x => SECTIONS[x.type].melody?.cadences.at(-1) === 'full' && s.sections.indexOf(x) > 0))
        {
            const last = lead.notes.filter(n => n.beat >= sec.beat && n.beat < sec.beat + sec.beats).at(-1);
            if (last && !EMOTIONS[emotion].lift) assert.equal(last.key % 12, tonic, `${emotion} ${sec.label}`);
        }
    }
});

// pitch classes of the chord starting at a chord-list entry, read from the pad, which holds every chord
function chordTones(score, chord)
{
    const t = score.tracks.find(x => x.role === 'pad');
    return [...new Set(t.notes.filter(n => n.beat === chord.beat).map(n => n.key % 12))];
}

test('the same section repeats the same tune, varied: every chorus has the same melody but for its last bar', ()=>
{
    const s = compose({ title: 'x', emotion: 'joyful', style: { syncopation: 0 } });
    const lead = s.tracks.find(t => t.role === 'lead').notes;
    const choruses = s.sections.filter(x => x.type === 'chorus');
    const tune = (c, bars)=> lead.filter(n => n.beat >= c.beat && n.beat < c.beat + bars * s.beatsPerBar).map(n => [n.key, n.beat - c.beat]);
    const whole = (c)=> lead.filter(n => n.beat >= c.beat && n.beat < c.beat + c.beats).length;
    assert.ok(tune(choruses[0], 7).length > 8);
    assert.deepEqual(tune(choruses[1], 7), tune(choruses[0], 7));
    assert.ok(whole(choruses[1]) > whole(choruses[0]), 'the second chorus approaches its last note by step');
});

test('handwritten melodies: degrees, accidentals, octaves, rests and lengths', ()=>
{
    const m = parseMelody("1 b3:0.5 5' r:2 | 7,:1.5");
    assert.equal(m.beats, 6);
    assert.deepEqual(m.notes.map(n => [n.degree, n.accidental, n.beat, n.beats]), [[1, 0, 0, 1], [3, -1, 1, 0.5], [12, 0, 1.5, 1], [0, 0, 4.5, 1.5]]);
    assert.throws(()=> parseMelody('x'));
    // written melodies in the song book fill whole bars
    for (const spec of SONGS)
        for (const [type, sec] of Object.entries(spec.sections ?? {}))
            if (typeof sec.melody === 'string')
            {
                const beats = (GROOVES[spec.groove ?? EMOTIONS[spec.emotion].groove]).beats;
                assert.equal(parseMelody(sec.melody).beats % beats, 0, `${spec.id} ${type}`);
            }
});

test('every song has a unique id; genre songs have a genre, a story, and scenes that name real sections', ()=>
{
    assert.equal(new Set(SONGS.map(s => s.id)).size, SONGS.length);
    for (const spec of GENRE_SONGS)
    {
        assert.ok(spec.genre && spec.story, spec.id);
        const score = compose(spec);
        const shown = new Set(score.sections.map(s => s.scene).filter(Boolean));
        for (const [key, text] of Object.entries(spec.scenes ?? {})) assert.ok(shown.has(text), `${spec.id}: scene "${key}" matches no section`);
    }
});

test('handwritten hooks put chord tones on strong beats', ()=>
{
    for (const spec of SONGS)
    {
        const score = compose(spec);
        const lead = score.tracks.find(t => t.role === 'lead').notes;
        for (const sec of score.sections)
        {
            if (typeof spec.sections?.[sec.type]?.melody !== 'string') continue;
            let strong = 0, fit = 0;
            for (const n of lead)
            {
                const inBar = (n.beat - sec.beat) % score.beatsPerBar;
                if (n.beat < sec.beat || n.beat >= sec.beat + sec.beats || !(inBar === 0 || (score.beatsPerBar === 4 && inBar === 2))) continue;
                strong++;
                if (score.chords.findLast(c => c.beat <= n.beat).tones.includes(n.key % 12)) fit++;
            }
            assert.ok(fit / strong >= 0.85, `${spec.id} ${sec.label}: ${fit}/${strong} strong-beat notes are chord tones`);
        }
    }
});

test('sectionSeek steps to the next section, back to this one, or to the previous one near its start', ()=>
{
    const sections = [{ beat: 0 }, { beat: 16 }, { beat: 48 }];
    assert.equal(sectionSeek(sections, 20, 1), 48);
    assert.equal(sectionSeek(sections, -0.5, 1), 16);          // during the lead-in
    assert.equal(sectionSeek(sections, 50, 1), null);          // nothing after the last
    assert.equal(sectionSeek(sections, 30, -1, 4), 16);        // well into a section: its start
    assert.equal(sectionSeek(sections, 18, -1, 4), 0);         // just past its start: the one before
    assert.equal(sectionSeek(sections, 2, -1, 4), 0);          // first section stays at the top
});

// ---- the song plan ----------------------------------------------------------------------------------
const feelings = Object.keys(EMOTIONS).map(e => ({ title: e, emotion: e }));
const rootOf = (s, chord)=> chord.tones[0];             // a chord's tones are pitch classes, root first
const lastChord = (s, sec)=> s.chords.filter(c => c.beat >= sec.beat && c.beat < sec.beat + sec.beats).at(-1);
const notesIn = (s, role, from, to)=> (s.tracks.find(t => t.role === role)?.notes ?? []).filter(n => n.beat >= from - 1e-9 && n.beat < to - 1e-9);

test('every song has one climax, the loudest section, two-thirds or more of the way in, and dips for contrast', ()=>
{
    for (const spec of [...SONGS, ...feelings])
    {
        const s = compose(spec);
        const peaks = s.sections.filter(x => x.climax);
        assert.equal(peaks.length, 1, spec.title);
        for (const x of s.sections) if (!x.climax) assert.ok(x.energy < peaks[0].energy, `${spec.title} ${x.label}`);
        const shape = energyShape(s.sections);
        assert.ok(shape.peak >= 0.5 && shape.peak <= 0.97, `${spec.title}: peak at ${shape.peak.toFixed(2)}`);
        if (s.sections.length >= 5) assert.ok(shape.dips >= 1, `${spec.title}: no dip`);
    }
});

test('sections end on their cadence: pre-chorus on V, chorus and outro on I, a chorus before another deceptively', ()=>
{
    for (const spec of feelings)
    {
        const s = compose(spec);
        s.sections.forEach((sec, i)=>
        {
            const c = lastChord(s, sec), tonic = sec.tonic;
            if (sec.type === 'pre') assert.equal(rootOf(s, c), (tonic + 7) % 12, `${spec.title} ${sec.label}`);
            if (sec.type === 'outro') assert.equal(rootOf(s, c), tonic, `${spec.title} ${sec.label}`);
            if (sec.type === 'chorus' && s.sections[i + 1]?.type !== 'chorus') assert.equal(rootOf(s, c), tonic, `${spec.title} ${sec.label}`);
        });
    }
    const s = compose({ title: 'Twice', emotion: 'joyful', form: 'verseChorus' });
    const i = s.sections.findIndex((x, k)=> x.type === 'chorus' && s.sections[k + 1]?.type === 'chorus');
    assert.equal(rootOf(s, lastChord(s, s.sections[i])), (s.sections[i].tonic + 9) % 12, 'V → vi');
    assert.equal(rootOf(s, lastChord(s, s.sections[i + 1])), s.sections[i].tonic);
});

test('modal cadences use the mode\'s own chords: bVII–I in mixolydian, bII–i in phrygian, no borrowed leading tone', ()=>
{
    // every section ends away from the tonic, so each cadence has to be written in
    const ends = (mode, i = mode === 'phrygian' ? 'i VI' : 'I vi')=>
    {
        const s = compose({ title: 'Modal', emotion: 'heroic', mode, form: ['verse', 'pre', 'chorus', 'outro'],
            sections: { verse: { progression: i }, pre: { progression: i }, chorus: { progression: i }, outro: { progression: i } } });
        return s.sections.map(sec => s.chords.filter(c => c.beat < sec.beat + sec.beats).slice(-2).map(c => c.name).join(' '));
    };
    assert.deepEqual(ends('mixolydian').slice(1), ['Bb Ab', 'Ab Bb', 'Ab Bb']);     // Bb mixolydian: pre on bVII, chorus bVII–I
    assert.deepEqual(ends('phrygian').slice(1, 3), ['Bbm Abm', 'B Bbm']);           // Bb phrygian: pre on bvii, chorus bII–i
    assert.deepEqual(ends('major').slice(1), ['Bb F', 'F Bb', 'F Bb']);            // major keeps V–I
});

test('harmonic rhythm: a pre-chorus changes chords twice as fast as written; an intro half as fast', ()=>
{
    const count = (spec, type)=> { const s = compose(spec); const sec = s.sections.find(x => x.type === type); return s.chords.filter(c => c.beat >= sec.beat && c.beat < sec.beat + sec.beats).length; };
    const spec = { title: 'Rhythm', emotion: 'hopeful', style: { dim7: 0 } };
    assert.ok(count(spec, 'pre') > count({ ...spec, sections: { pre: { harmonicRhythm: 1 } } }, 'pre'));
    assert.ok(count(spec, 'intro') < count({ ...spec, sections: { intro: { harmonicRhythm: 1 } } }, 'intro'));
});

test('passing diminished sevenths lead by a semitone into the chord after them, and only when the style asks', ()=>
{
    const s = compose({ title: 'Jazz', emotion: 'playful', style: 'jazzy' });
    const dims = s.chords.map((c, i)=> [c, s.chords[i + 1]]).filter(([c])=> c.name.endsWith('dim7'));
    assert.ok(dims.length > 2);
    for (const [c, next] of dims)
    {
        assert.deepEqual(c.tones.map(t => (t - c.tones[0] + 12) % 12), [0, 3, 6, 9]);
        assert.ok(c.beats <= 1 && c.tones.some(t => next.tones.includes((t + 1) % 12)), `${c.name} → ${next.name}`);
    }
    assert.equal(passingDim7(parseChord('ii', 0, 'major')).root, 1, 'C#dim7 before Dm');
    assert.ok(compose({ title: 'Jazz', emotion: 'playful', style: { dim7: 0 } }).chords.every(c => !c.name.endsWith('dim7')));
});

test('the climax gets a harmony voice: one note under each lead note, in the key', ()=>
{
    const s = compose({ title: 'Harmony', emotion: 'joyful', style: { syncopation: 0 } });
    const peak = s.sections.find(x => x.climax);
    const lead = notesIn(s, 'lead', peak.beat, peak.beat + peak.beats), counter = notesIn(s, 'counter', peak.beat, peak.beat + peak.beats);
    assert.ok(lead.length > 8);
    assert.equal(counter.length, lead.length);
    counter.forEach((h, i)=>
    {
        assert.ok(h.key < lead[i].key && h.beat === lead[i].beat);
        assert.ok(MODES.major.includes((h.key - peak.tonic + 120) % 12), `in key: ${h.key}`);
    });
});

test('a composed melody takes the chord\'s accidental: G# under E major in A minor, never G', ()=>
{
    const s = compose({ title: 'Raised', emotion: 'melancholy',
        sections: { verse: { progression: 'i iv V V' }, chorus: { progression: 'VI iv V i' } } });
    const lead = s.tracks.find(t => t.role === 'lead').notes;
    const overV = lead.filter(n => s.chords.findLast(c => c.beat <= n.beat + 1e-9).name === 'E');
    assert.ok(overV.length > 4);
    assert.ok(overV.every(n => n.key % 12 !== 7), 'no G natural over E major');
    assert.ok(overV.some(n => n.key % 12 === 8), 'the raised seventh is used');
});

test('slash chords and pedals: the bass plays the written bass note; an inversion alternates it with the root', ()=>
{
    const bassUnder = (progression, extra = {})=>
    {
        const s = compose({ title: 'Bass line', emotion: 'joyful', key: 'C', style: { syncopation: 0 }, form: ['verse'],
            sections: { verse: { progression, bars: 4, endOn: null, ...extra } } });
        const bass = s.tracks.find(t => t.role === 'bass').notes;
        return [0, 1, 2, 3].map(bar => bass.filter(n => n.beat >= bar * 4 && n.beat < bar * 4 + 4 - 1e-9).map(n => n.key % 12));
    };
    // the line cliché: C, C/B, Am, Am/G
    const line = bassUnder('I V/7 vi vi/5');
    assert.deepEqual(line.map(b => b[0]), [0, 11, 9, 7]);
    assert.ok(line[1].every(pc => [11, 7].includes(pc)), `G/B plays B and G: ${line[1]}`);
    // a dominant pedal: G under every chord
    assert.ok(bassUnder('I IV vi V', { pedal: 5 }).flat().every(pc => pc === 7));
});

test('call and response: in the bridge the lead and the countermelody take turns and never overlap', ()=>
{
    const s = compose({ title: 'Answer', emotion: 'joyful', style: { syncopation: 0 } });
    const b = s.sections.find(x => x.type === 'bridge');
    const lead = notesIn(s, 'lead', b.beat, b.beat + b.beats), counter = notesIn(s, 'counter', b.beat, b.beat + b.beats);
    assert.ok(lead.length && counter.length);
    for (const c of counter)
        for (const l of lead) assert.ok(l.beat + l.beats <= c.beat + 1e-9 || c.beat + c.beats <= l.beat + 1e-9, `overlap at ${c.beat}`);
});

test('meters: groups place the drums; a 6/8 bar has its backbeat on the second dotted quarter', ()=>
{
    const s = compose(GAME_SONGS.find(x => x.id === 'heroes-rest'));
    assert.equal(s.beatsPerBar, 3);
    const v = s.sections.find(x => x.type === 'chorus');
    const drums = notesIn(s, 'drums', v.beat, v.beat + v.beats);
    const at = (key)=> new Set(drums.filter(n => n.key === key).map(n => (n.beat - v.beat) % 3));
    assert.ok(at(DRUM_KEYS.kick).has(0));
    assert.deepEqual([...at(DRUM_KEYS.snare)], [1.5]);
    assert.equal(barAt(s.sections, v.beat + 3).bar, barAt(s.sections, v.beat).bar + 1);
});

test('a change of meter: a fill before it, plain accented drums for two bars after, and a roll at the odd bar line', ()=>
{
    const s = compose(GAME_SONGS.find(x => x.id === 'the-warden'));
    const i = s.sections.findIndex(x => x.meter === '7/4');
    const odd = s.sections[i], before = s.sections[i - 1];
    assert.equal(odd.beatsPerBar, 7);
    const fill = notesIn(s, 'drums', before.beat + before.beats - before.beatsPerBar, before.beat + before.beats);
    assert.ok(fill.filter(n => n.key === DRUM_KEYS.snare).length >= 4, 'the bar before is a fill');
    const plain = notesIn(s, 'drums', odd.beat, odd.beat + 14);
    assert.ok(plain.every(n => [DRUM_KEYS.kick, DRUM_KEYS.hat, DRUM_KEYS.crash].includes(n.key)), 'kick and hat only, at first');
    const bar4 = notesIn(s, 'drums', odd.beat + 3 * 7 + 6, odd.beat + 4 * 7);
    assert.ok(bar4.some(n => n.key === DRUM_KEYS.tomLow), 'a roll into the bar line');
    for (const name of Object.keys(METERS)) for (const level of ['low', 'mid', 'high', 'fill', 'simple'])
    {
        const bar = drumBar(GROOVES.pop, meterOf(name), level);
        for (const [voice, hits] of Object.entries(bar)) assert.equal(hits.length, METERS[name].beats * 4, `${name} ${level} ${voice}`);
    }
});

test('drum feels: half-time puts the snare on 3, double-time on every beat, a build rolls faster and faster', ()=>
{
    const m = meterOf('4/4');
    assert.equal(withFeel(GROOVES.pop.mid, 'half', m, 0, 4).snare, '........X.......');
    assert.equal(withFeel(GROOVES.pop.mid, 'double', m, 0, 4).snare, '....X...X...X...');
    const hits = (bar)=> [...withFeel(GROOVES.pop.mid, 'roll', m, bar, 8).snare].filter(h => h !== '.').length;
    assert.ok(hits(0) < hits(5) && hits(5) < hits(7));
});

test('tempo: a few bpm of push from the climax, and an ending that slows down', ()=>
{
    const s = compose({ title: 'Tempo', emotion: 'hopeful' });
    const peak = s.sections.find(x => x.climax);
    assert.equal(bpmAt(s.tempoMap, peak.beat - 1), s.tempo);
    assert.equal(bpmAt(s.tempoMap, peak.beat + 1), s.tempo + TEMPO.push);
    assert.ok(bpmAt(s.tempoMap, s.beats - 0.5) < s.tempo);
    assert.ok(s.seconds > s.beats * 60 / (s.tempo + TEMPO.push));
    assert.ok(compose({ title: 'Tempo', emotion: 'hopeful', loop: true }).tempoMap.every(t => t.to === undefined), 'a loop never slows down');
});

test('a game loop: no outro, the intro once, and a last bar on V that leads back to the top', ()=>
{
    const s = compose({ title: 'Loop', emotion: 'heroic', loop: true });
    assert.ok(s.loop && s.loop.to === s.beats);
    assert.notEqual(s.sections.at(-1).type, 'outro');
    assert.equal(s.loop.from, s.sections[1].beat);
    assert.equal(rootOf(s, s.chords.at(-1)), (s.sections.at(-1).tonic + 7) % 12);
});

test('a leitmotif keeps its shape across songs, modes and meters', ()=>
{
    const road = compose(GAME_SONGS.find(x => x.id === 'heroes-road'));
    const rest = compose(GAME_SONGS.find(x => x.id === 'heroes-rest'));
    assert.deepEqual(road.motif, rest.motif);
    assert.deepEqual(road.motif.map(d => d - road.motif[0]), [0, 1, 2, 4, 3]);
    assert.notEqual(road.beatsPerBar, rest.beatsPerBar);
    // a song without one invents a motif of 3–6 notes
    const own = compose({ title: 'Own', emotion: 'joyful' }).motif;
    assert.ok(own.length >= 3 && own.length <= 6);
});

test('parts enter one at a time across the intro, and leave one at a time across the outro', ()=>
{
    const s = compose({ title: 'Entries', emotion: 'tense' });
    const intro = s.sections[0], outro = s.sections.at(-1);
    const firstIn = (role)=> notesIn(s, role, intro.beat, intro.beat + intro.beats)[0]?.beat;
    assert.ok(firstIn('chords') > firstIn('pad'), 'the pad first, then the chords');
    const lastBar = outro.beat + outro.beats - outro.beatsPerBar;
    const drumsGone = notesIn(s, 'drums', outro.beat + outro.beatsPerBar, lastBar);
    assert.equal(drumsGone.length, 0, 'the drums leave first');
    assert.ok(notesIn(s, 'drums', lastBar, outro.beat + outro.beats).length > 0, 'and come back for the final hit');
});

test('a breath before the chorus: in the pre-chorus’s last two beats only the lead and drums play', ()=>
{
    const s = compose({ title: 'Breath', emotion: 'joyful' });
    for (const pre of s.sections.filter(x => x.type === 'pre'))
    {
        const end = pre.beat + pre.beats;
        for (const t of s.tracks.filter(t => !['lead', 'drums'].includes(t.role)))
            assert.ok(t.notes.every(n => n.beat + n.beats <= end - 2 + 1e-9 || n.beat >= end - 1e-9), `${t.role} in ${pre.label}`);
    }
    // echo notes from the rhythm pass respect the breath and the ending too
    const busy = compose({ title: 'Breath', emotion: 'joyful', style: { syncopation: 1 } });
    for (const pre of busy.sections.filter(x => x.type === 'pre'))
        assert.equal(notesIn(busy, 'arp', pre.beat + pre.beats - 2, pre.beat + pre.beats).length, 0, `arp echoes in ${pre.label}'s breath`);
    const outro = busy.sections.at(-1);
    assert.equal(notesIn(busy, 'arp', outro.beat, outro.beat + outro.beats).length, 0, 'no arp in the outro');
    const drop = compose(GAME_SONGS.find(x => x.id === 'neon-drop'));
    const build = drop.sections.find(x => x.type === 'build');
    for (const t of drop.tracks) assert.equal(notesIn(drop, t.role, build.beat + build.beats - 2, build.beat + build.beats).length, 0, `${t.role}: silence before the drop`);
});

test('styles: named presets, and a spec can set any of their values', ()=>
{
    for (const style of Object.values(STYLES)) assert.deepEqual(Object.keys(style).sort(), Object.keys(STYLES.plain).sort());
    for (const e of Object.values(EMOTIONS)) assert.ok(STYLES[e.style], e.style);
    assert.throws(()=> compose({ title: 'x', emotion: 'joyful', style: 'baroque' }));
    assert.equal(compose({ title: 'x', emotion: 'joyful', style: { swing: 0.4 } }).swing, 0.4);
    // stabs cut comped chords short
    const stabbed = compose({ title: 'x', emotion: 'joyful', style: { stab: 0.125 } });
    const chorus = stabbed.sections.find(x => x.type === 'chorus');
    assert.ok(notesIn(stabbed, 'chords', chorus.beat, chorus.beat + chorus.beats).every(n => n.beats <= 0.125 + 1e-9));
});

test('anticipation pulls some phrase starts a sixteenth early when the style syncopates', ()=>
{
    const pushed = (syncopation)=> compose({ title: 'Push', emotion: 'joyful', style: { syncopation } }).tracks.find(t => t.role === 'lead')
        .notes.filter(n => [0.25, 0.75].includes(n.beat % 1)).length;
    assert.ok(pushed(1) > pushed(0) + 3, `${pushed(1)} vs ${pushed(0)}`);
});

test('a hand-written melody plays as written every time; describe spells keys like the chords', ()=>
{
    const s = compose(SONGS.find(x => x.id === 'first-light'));
    const lead = s.tracks.find(t => t.role === 'lead').notes;
    const choruses = s.sections.filter(x => x.type === 'chorus');
    const tune = (c)=> lead.filter(n => n.beat >= c.beat && n.beat < c.beat + c.beats).map(n => [n.key - c.tonic, n.beat - c.beat, n.beats]);
    assert.deepEqual(tune(choruses[1]), tune(choruses[0]));
    const moved = compose({ title: 'Flats', emotion: 'melancholy', key: 'D', sections: { bridge: { transpose: 8 } } });
    assert.ok(moved.flats && describe(moved).includes('(Bb minor)'), describe(moved).split('\n').find(l => l.includes('Bridge')));
});
