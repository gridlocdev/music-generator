import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOUNDFONTS } from '../../src/audio/soundfont-catalog-data.js';

test('every file lists presets with a bank, program and name', ()=>
{
    assert.ok(SOUNDFONTS.length > 0);
    for (const f of SOUNDFONTS)
    {
        assert.match(f.url, /\.sf2$/);
        assert.ok(f.presets.length > 0);
        for (const p of f.presets) assert.ok(p.name && p.bank >= 0 && p.bank <= 128 && p.program >= 0 && p.program <= 127);
    }
});

test('no preset appears in two files', ()=>
{
    const ids = SOUNDFONTS.flatMap(f => f.presets.map(p => `${p.bank}:${p.program}`));
    assert.equal(new Set(ids).size, ids.length);
});

test('the default instrument (bank 0, program 0) exists', ()=>
    assert.ok(SOUNDFONTS.some(f => f.presets.some(p => p.bank === 0 && p.program === 0))));
