import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose, parseMelody, sectionSeek } from '../../src/features/composer/compose.js';
import { EMOTIONS, FORMS, SECTIONS, RHYTHMS, CONTOURS, RANGES, MIX, ROLES } from '../../src/features/composer/composer-data.js';
import { GROOVES, BASS, COMPING, ARPS, DRUM_KEYS } from '../../src/features/composer/patterns-data.js';
import { SONGS as WRITTEN } from '../../src/features/composer/songs-data.js';
import { GENRE_SONGS } from '../../src/features/composer/genre-songs-data.js';
import { parseProgression, pitchClass, MODES } from '../../src/lib/music-theory.js';

const SONGS = [...WRITTEN, ...GENRE_SONGS];

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

test('rhythm cells fill exactly one bar', ()=>
{
    for (const [beats, r] of Object.entries(RHYTHMS))
        for (const cell of [...r.cells, ...Object.values(r.cadence)])
            assert.equal(cell.reduce((a, d)=> a + Math.abs(d), 0), Number(beats), JSON.stringify(cell));
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

test('the same section repeats the same tune: every chorus has the same melody', ()=>
{
    const s = compose({ title: 'x', emotion: 'joyful' });
    const lead = s.tracks.find(t => t.role === 'lead').notes;
    const choruses = s.sections.filter(x => x.type === 'chorus');
    const tune = (c)=> lead.filter(n => n.beat >= c.beat && n.beat < c.beat + c.beats).map(n => [n.key, n.beat - c.beat]);
    assert.ok(tune(choruses[0]).length > 8);
    assert.deepEqual(tune(choruses[1]), tune(choruses[0]));
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
