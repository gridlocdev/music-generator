import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseSf2, regionsFor, GEN } from '../../src/lib/sf2.js';

// Builds a minimal SoundFont: one sample, one instrument with a global zone, one preset with a global zone.
// instrumentZones({ gen, range }) can replace the instrument's zones (each a list of generators, global first).
function tinySf2(instrumentZones)
{
    const chunk = (id, body)=>
    {
        const out = new Uint8Array(8 + body.length + (body.length & 1));
        const v = new DataView(out.buffer);
        [...id].forEach((c, i)=> out[i] = c.charCodeAt(0));
        v.setUint32(4, body.length, true);
        out.set(body, 8);
        return out;
    };
    const list = (type, ...subs)=> chunk('LIST', concat(new TextEncoder().encode(type), ...subs));
    const concat = (...parts)=> { const out = new Uint8Array(parts.reduce((n, p)=> n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
    const rec = (size, fill)=> { const b = new Uint8Array(size); fill(new DataView(b.buffer), b); return b; };
    const name = (b, s)=> [...s].forEach((c, i)=> b[i] = c.charCodeAt(0));
    const gen = (op, amount)=> rec(4, v => { v.setUint16(0, op, true); v.setInt16(2, amount, true); });
    const range = (op, lo, hi)=> rec(4, (v, b)=> { v.setUint16(0, op, true); b[2] = lo; b[3] = hi; });
    const bag = (g)=> rec(4, v => v.setUint16(0, g, true));

    const smpl = new Uint8Array(new Int16Array([0, 1000, -1000, 500, 0, 0, 0, 0]).buffer);
    const phdr = (n, prog, b)=> rec(38, (v, by)=> { name(by, n); v.setUint16(20, prog, true); v.setUint16(22, 0, true); v.setUint16(24, b, true); });
    const inst = (n, b)=> rec(22, (v, by)=> { name(by, n); v.setUint16(20, b, true); });
    const shdr = (n, start, end, root)=> rec(46, (v, by)=>
    {
        name(by, n);
        v.setUint32(20, start, true); v.setUint32(24, end, true);
        v.setUint32(28, start + 1, true); v.setUint32(32, end - 1, true);
        v.setUint32(36, 22050, true); by[40] = root;
    });

    // instrument: global zone (attenuation 100, loop), then two sample zones split at key 60
    const izones = instrumentZones?.({ gen, range }) ?? [
        [gen(GEN.initialAttenuation, 100), gen(GEN.sampleModes, 1)],
        [range(GEN.keyRange, 0, 59), gen(GEN.sampleID, 0)],
        [range(GEN.keyRange, 60, 127), gen(GEN.sampleID, 0)],
    ];

    return concat(new TextEncoder().encode('RIFF'), new Uint8Array(4), new TextEncoder().encode('sfbk'),
        list('INFO', chunk('INAM', new TextEncoder().encode('Tiny\0'))),
        list('sdta', chunk('smpl', smpl)),
        list('pdta',
            chunk('phdr', concat(phdr('Lead', 5, 0), phdr('EOP', 0, 2))),
            // preset: global zone (attenuation +20), then a zone limited to keys 50..70 using instrument 0
            chunk('pbag', concat(bag(0), bag(1), bag(3))),
            chunk('pmod', new Uint8Array(10)),
            chunk('pgen', concat(gen(GEN.initialAttenuation, 20), range(GEN.keyRange, 50, 70), gen(GEN.instrument, 0), gen(0, 0))),
            chunk('inst', concat(inst('Inst', 0), inst('EOI', izones.length))),
            chunk('ibag', concat(...izones.map((_, i)=> bag(izones.slice(0, i).flat().length)), bag(izones.flat().length))),
            chunk('imod', new Uint8Array(10)),
            chunk('igen', concat(...izones.flat(), gen(0, 0))),
            chunk('shdr', concat(shdr('Saw', 0, 6, 60), shdr('EOS', 0, 0, 0)))));
}

const buffer = (bytes)=> bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

test('parses presets, instruments and samples', ()=>
{
    const sf = parseSf2(buffer(tinySf2()));
    assert.equal(sf.name, 'Tiny');
    assert.equal(sf.samples.length, 1);
    assert.equal(sf.samples[0].originalPitch, 60);
    assert.deepEqual([...sf.sampleData.slice(0, 4)], [0, 1000, -1000, 500]);
    assert.equal(sf.presets.length, 1);
    assert.equal(sf.presets[0].name, 'Lead');
    assert.equal(sf.presets[0].program, 5);
});

test('intersects key ranges and adds preset generators to instrument ones', ()=>
{
    const [preset] = parseSf2(buffer(tinySf2())).presets;
    assert.deepEqual(preset.regions.map(r => [r.keyLo, r.keyHi]), [[50, 59], [60, 70]]);
    for (const r of preset.regions)
    {
        assert.equal(r.gen[GEN.initialAttenuation], 120);   // instrument global 100 + preset global 20
        assert.equal(r.gen[GEN.sampleModes], 1);            // from the instrument global zone
        assert.equal(r.gen[GEN.initialFilterFc], 13500);    // spec default
    }
    assert.equal(regionsFor(preset, 55, 100).length, 1);
    assert.equal(regionsFor(preset, 80, 100).length, 0);
});

test('a zone with an explicit full key range is not narrowed to its global zone', ()=>
{
    const keys = (zones)=> parseSf2(buffer(tinySf2(zones))).presets[0].regions.map(r => [r.keyLo, r.keyHi]);
    // global zone limits keys to 0..59; a local zone without a range inherits that, one with 0..127 replaces it
    assert.deepEqual(keys(({ gen, range })=> [[range(GEN.keyRange, 0, 59)], [gen(GEN.sampleID, 0)]]), [[50, 59]]);
    assert.deepEqual(keys(({ gen, range })=> [[range(GEN.keyRange, 0, 59)], [range(GEN.keyRange, 0, 127), gen(GEN.sampleID, 0)]]), [[50, 70]]);
});

test('rejects files that are not SoundFonts', ()=>
{
    assert.throws(()=> parseSf2(new ArrayBuffer(64)), /not a SoundFont/);
});

const real = 'soundfonts/GeneralUser-GS/GeneralUser-GS.sf2';
test('parses a real SoundFont library', { skip: !existsSync(real) && 'SoundFont library not present' }, ()=>
{
    const sf = parseSf2(buffer(readFileSync(real)));
    const piano = sf.presets.find(p => p.bank === 0 && p.program === 0);
    assert.equal(piano?.name, 'Grand Piano');
    for (const r of regionsFor(piano, 60, 100))
        assert.ok(r.sample.end > r.sample.start && r.sample.end <= sf.sampleData.length);
});
