import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARIES } from '../../src/audio/soundfont-catalog-data.js';
import { LIBRARY_SOURCES } from '../../src/audio/soundfont-libraries-data.js';

test('the catalog has every library source, in order', ()=>
    assert.deepEqual(LIBRARIES.map(l => l.id), LIBRARY_SOURCES.map(s => s.id)));

test('every library names its license', ()=>
{
    for (const l of LIBRARIES) assert.ok(l.name && l.license);
});

test('every file lists presets with a bank, program and name', ()=>
{
    for (const l of LIBRARIES)
    {
        assert.ok(l.files.length > 0);
        for (const f of l.files)
        {
            assert.match(f.url, /\.sf2$/i);
            assert.ok(f.presets.length > 0);
            for (const p of f.presets) assert.ok(p.name && p.bank >= 0 && p.bank <= 128 && p.program >= 0 && p.program <= 127);
        }
    }
});

test('no preset appears twice in a library', ()=>
{
    for (const l of LIBRARIES)
    {
        const ids = l.files.flatMap(f => f.presets.map(p => `${p.bank}:${p.program}`));
        assert.equal(new Set(ids).size, ids.length, l.id);
    }
});

test('every library has the default instrument (bank 0, program 0) and a drum kit on bank 128', ()=>
{
    for (const l of LIBRARIES)
    {
        const presets = l.files.flatMap(f => f.presets);
        assert.ok(presets.some(p => p.bank === 0 && p.program === 0), l.id);
        assert.ok(presets.some(p => p.bank === 128), l.id);
    }
});
