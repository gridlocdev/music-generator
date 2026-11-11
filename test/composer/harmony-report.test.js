import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../../src/composer/compose.js';
import { GENRES } from '../../src/composer/genre-data.js';
import { harmonyStats, overlap, readChordName } from '../../src/composer/harmony-report.js';

test('readChordName reads a root and a quality; overlap is shared over all', ()=>
{
    assert.deepEqual(readChordName('Bbm7/F'), { root: 10, quality: 'm7' });
    assert.deepEqual(readChordName('F#'), { root: 6, quality: '' });
    assert.equal(overlap(new Set(['a', 'b']), new Set(['b', 'c'])), 1 / 3);
});

test('harmonyStats reads chords as numerals in their section\'s key', ()=>
{
    const s = harmonyStats(compose({ title: 'Plain', emotion: 'joyful', extend: null, style: { secondary: 0, sus: 0, borrowed: 0 },
        form: ['verse'], sections: { verse: { progression: 'I IV V I', endOn: null } } }));
    assert.equal(s.triads, 1);
    assert.ok(s.windows.has('I IV V I'));
    assert.deepEqual(s.endings, ['V I']);
});

// Every genre is composed the same way, so whatever differs comes from the genre. Thresholds sit well clear of
// today's numbers (`just harmony`): a change that makes the genres sound alike again fails here.
test('genres sound different: their own progressions, colours and endings', ()=>
{
    const genres = Object.keys(GENRES);
    for (const g of genres) assert.ok(GENRES[g].progressions, `${g} has progressions of its own`);
    const stats = genres.map(genre => harmonyStats(compose({ title: 'Genres apart', genre, emotion: 'joyful' })));
    let sum = 0, pairs = 0;
    for (let i = 0; i < genres.length; i++)
        for (let j = i + 1; j < genres.length; j++)
        {
            const x = overlap(stats[i].windows, stats[j].windows);
            assert.ok(x < 0.35, `${genres[i]} and ${genres[j]} share ${Math.round(x * 100)}% of their progressions`);
            sum += x; pairs++;
        }
    assert.ok(sum / pairs < 0.06, `genres share ${(sum / pairs).toFixed(3)} of their progressions on average`);
    const chords = stats.reduce((t, s)=> t + s.chords, 0), triads = stats.reduce((t, s)=> t + s.triads * s.chords, 0);
    assert.ok(triads / chords < 0.5, `${Math.round(triads / chords * 100)}% of the genres' chords are plain triads`);
    const qualities = new Set(stats.flatMap(s => Object.keys(s.qualities)));
    assert.ok(qualities.size >= 12, `only ${[...qualities].join(' ')}`);
    const endings = new Set(stats.flatMap(s => s.endings.map(e => e.split(' ').at(-2))));
    assert.ok(endings.size >= 8, `sections lead into their last chord from only ${[...endings].join(', ')}`);
});

test('styles bring their own passing chords: tritone substitutes in jazz, mediants in film, not only dim7', ()=>
{
    const names = (spec)=> compose({ title: 'Passing', form: ['verse', 'chorus', 'verse', 'chorus'], ...spec }).chords.map(c => c.name);
    const jazz = names({ emotion: 'joyful', key: 'C', style: 'jazzy' });
    assert.ok(jazz.some(n => /^(Db|Eb|Gb|Ab|Bb)7$/.test(n)), `a tritone substitute in ${jazz.join(' ')}`);
    const film = harmonyStats(compose({ title: 'Passing', emotion: 'joyful', key: 'C', style: 'cinematic' }));
    assert.ok(['bVI', 'bIII', '#IV', 'bII'].some(r => [...film.windows].some(w => w.includes(r))), 'a chromatic mediant or borrowed chord');
});
