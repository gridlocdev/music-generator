import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sketchSection, sketchSpec } from '../../src/sketch/sketch-spec.js';
import { beatsPerBar } from '../../src/daw/meter.js';
import { compose } from '../../src/composer/compose.js';

const key = { key: 'G', tonic: 7, mode: 'major' };
const melody = [
    { beat: 0, beats: 1, key: 79 }, { beat: 1, beats: 1, key: 83, vibrato: { rate: 6, depth: 0.3 } }, { beat: 2, beats: 2, key: 86 },
    { beat: 4, beats: 4, key: 79, vibrato: { rate: 6.2, depth: 0.32 } },
];
const chords = [{ beat: 0, beats: 4, symbol: 'I' }, { beat: 4, beats: 4, symbol: 'V/7' }];

test('sketch: meters count quarter-note beats', ()=>
{
    assert.deepEqual(['4/4', '3/4', '6/8', '2/2', '7/8'].map(beatsPerBar), [4, 3, 3, 4, 3.5]);
});

test('sketch: a melody and chords become a section, with the whistle\'s vibrato as the song\'s', ()=>
{
    const section = sketchSection({ key, meter: '4/4', melody, chords });
    assert.deepEqual(section, { bars: 2, melody: '1 3~ 5:2 | 1~:4', progression: 'I V/7', vibrato: { rate: 6.2, cents: 32 } });
    // a melody alone or chords alone are fine too: the composer writes the other
    assert.equal(sketchSection({ key, meter: '4/4', melody }).progression, undefined);
    assert.equal(sketchSection({ key, meter: '4/4', chords }).melody, undefined);
});

test('sketch: the spec composes, one section the sketch\'s length', ()=>
{
    for (const s of [{ melody, chords }, { melody }, { chords }])
    {
        const section = sketchSection({ key, meter: '4/4', ...s });
        const score = compose(sketchSpec({ key, tempo: 96, meter: '4/4', section }));
        assert.deepEqual(score.sections.map(x => [x.type, x.beats]), [['verse', 8]]);
    }
});
