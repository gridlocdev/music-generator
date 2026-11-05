import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../../src/features/composer/compose.js';
import { perform } from '../../src/features/composer/perform.js';
import { EXPRESSION } from '../../src/features/composer/performance-data.js';

// a short song: a hand-written verse with ~ marks, and a composed chorus that keeps the automatic vibrato
const spec = (lead, style = {})=> ({
    id: 'vibrato-test', title: 'Vibrato test', emotion: 'tender', key: 'C', mode: 'major', tempo: 80,
    band: { lead, counter: null, arp: null, chords: null, pad: null, bass: 33, drums: null },
    form: ['verse', 'chorus'], style: { ornaments: 0, ...style },
    sections: {
        verse: { progression: 'I IV V I', melody: '1 3 5~:2 | 4:2 3~:2 | 2 3 4:2 | 1~:4' },
        chorus: { progression: 'I vi IV V' },
    },
});
const leadOf = (score, performed)=> performed[score.tracks.findIndex(t => t.role === 'lead')];
const verse = (score)=> score.sections.find(s => s.type === 'verse');

test('vibrato: in a section with ~ marks only the marked notes vibrate, short or long', ()=>
{
    const score = compose(spec(73));       // flute: a singing voice, so the composed chorus gets the automatic vibrato
    const v = verse(score), lead = leadOf(score, perform(score));
    const inVerse = lead.filter(n => n.beat < v.beat + v.beats - 0.25 && !n.ornament);
    const withVib = inVerse.filter(n => n.vibrato).map(n => n.beat - v.beat);
    // the marked notes: 5~ on beat 2, 3~ on beat 6, 1~ on beat 12, and again as the 16-beat line repeats to fill the
    // 24-beat verse (beats move a little with timing)
    assert.equal(withVib.length, 5, JSON.stringify(withVib));
    [2, 6, 12, 18, 22].forEach((b, i)=> assert.ok(Math.abs(withVib[i] - b) < 0.1, `${withVib[i]} ≉ ${b}`));
    // the long unmarked 4:2 in bar 2 stays straight
    assert.ok(!inVerse.find(n => Math.abs(n.beat - v.beat - 4) < 0.1).vibrato);
    // the composed chorus keeps the automatic vibrato on its held notes
    const chorus = lead.filter(n => n.beat >= v.beat + v.beats);
    assert.ok(chorus.some(n => n.vibrato && Math.abs(n.vibrato.cents - EXPRESSION.vibrato.cents) < 1e-9));
});

test('vibrato: ~ plays on an instrument that gets no automatic vibrato, at the style\'s rate and depth', ()=>
{
    const score = compose(spec(0, { vibrato: { rate: 5.9, cents: 39 } }));      // a piano: never vibrato by itself
    const lead = leadOf(score, perform(score));
    const marked = lead.filter(n => n.vibrato);
    assert.equal(marked.length, 5);
    for (const n of marked) assert.deepEqual([n.vibrato.rate, n.vibrato.cents], [5.9, 39]);
});

test('vibrato: the score keeps the plain mark for the view and the MIDI file', ()=>
{
    const score = compose(spec(73));
    const lead = score.tracks.find(t => t.role === 'lead').notes;
    assert.equal(lead.filter(n => n.vibrato === true).length, 5);
    perform(score);
    assert.equal(lead.filter(n => n.vibrato === true).length, 5, 'perform does not change the score');
});
