import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCpu } from '../../tools/nsf/cpu6502.js';
import { parseNsf, runSong } from '../../tools/nsf/nsf.js';
import { channelStates, notesOf, hitsOf, findLoop } from '../../tools/nsf/decode.js';

// a CPU over 64 KB of plain RAM with `code` at $8000
function cpuWith(code)
{
    const mem = new Uint8Array(0x10000);
    mem.set(code, 0x8000);
    return { mem, cpu: createCpu(a => mem[a], (a, v)=> { mem[a] = v; }) };
}

test('6502: add with carry and overflow, subtract with borrow', ()=>
{
    // LDA #$7F; CLC; ADC #$01; STA $10; PHP; PLA; STA $11; LDA #$05; SEC; SBC #$07; STA $12; RTS
    const { mem, cpu } = cpuWith([0xa9, 0x7f, 0x18, 0x69, 0x01, 0x85, 0x10, 0x08, 0x68, 0x85, 0x11,
        0xa9, 0x05, 0x38, 0xe9, 0x07, 0x85, 0x12, 0x60]);
    cpu.call(0x8000);
    assert.equal(mem[0x10], 0x80);
    assert.ok(mem[0x11] & 0x40, 'overflow set');
    assert.ok(mem[0x11] & 0x80, 'negative set');
    assert.equal(mem[0x12], 0xfe);
    assert.equal(cpu.p & 1, 0, 'borrow clears carry');
});

test('6502: loops, subroutines and the indirect jump page bug', ()=>
{
    // LDX #3; loop: JSR inc; DEX; BNE loop; JMP ($80FF); inc: INC $20; RTS
    // ($80FF) reads its high byte from $8000, not $8100
    const code = [0xa2, 0x03, 0x20, 0x0b, 0x80, 0xca, 0xd0, 0xfa, 0x6c, 0xff, 0x80, 0xe6, 0x20, 0x60];
    const { mem, cpu } = cpuWith(code);
    mem[0x80ff] = 0x0d;                 // low byte → $xx0D
    mem[0x8100] = 0x99;                 // would be the high byte without the bug
    // the high byte comes from $8000, which holds $A2: put an RTS at $A20D
    mem[0xa20d] = 0x60;
    cpu.call(0x8000);
    assert.equal(mem[0x20], 3);
});

test('6502: an unknown opcode throws', ()=>
{
    const { cpu } = cpuWith([0x02]);
    assert.throws(()=> cpu.call(0x8000), /unknown opcode \$2/);
});

// a minimal NSF: init stores the song number, play counts frames and writes the count to pulse 1's period
function tinyNsf()
{
    const code = [
        0x85, 0x00, 0x60,                       // $8000 init: STA $00; RTS
        0xe6, 0x01, 0xa5, 0x01, 0x29, 0x03,     // $8003 play: INC $01; LDA $01; AND #3
        0x09, 0x80, 0x8d, 0x02, 0x40,           //   ORA #$80; STA $4002
        0xa9, 0xbf, 0x8d, 0x00, 0x40,           //   LDA #$BF; STA $4000
        0xa5, 0x00, 0x8d, 0x03, 0x40, 0x60,     //   LDA $00; STA $4003; RTS
    ];
    const bytes = new Uint8Array(0x80 + code.length);
    bytes.set([...'NESM'].map(c => c.charCodeAt(0)), 0);
    bytes[4] = 0x1a; bytes[6] = 2; bytes[7] = 1;
    bytes.set([0x00, 0x80, 0x00, 0x80, 0x03, 0x80], 8);
    bytes.set([...'Tiny'].map(c => c.charCodeAt(0)), 0x0e);
    bytes.set(code, 0x80);
    return bytes;
}

test('NSF: the header and a song played frame by frame', ()=>
{
    const nsf = parseNsf(tinyNsf());
    assert.equal(nsf.name, 'Tiny');
    assert.equal(nsf.songs, 2);
    assert.equal(nsf.banks, null);
    const { frames } = runSong(nsf, 1, 3);
    assert.deepEqual(frames[0], []);
    assert.deepEqual(frames[1], [[0x4002, 0x81], [0x4000, 0xbf], [0x4003, 1]]);
    assert.deepEqual(frames[3].map(([, v])=> v), [0x83, 0xbf, 1]);
    assert.throws(()=> parseNsf(new Uint8Array(0x80)), /not an NSF/);
});

test('NSF: a repeating song is found to loop', ()=>
{
    const { frames } = runSong(parseNsf(tinyNsf()), 0, 40);
    const loop = findLoop(frames, 8);
    assert.equal(loop.length, 4);
    assert.ok(loop.start <= 2);
    assert.equal(findLoop(frames.slice(0, 6), 8), null);
});

test('decode: pulse registers to pitch, volume and duty', ()=>
{
    // period 253 is A4 (440 Hz, MIDI 69); duty 2, volume 12
    const states = channelStates([[[0x4000, 0x8c], [0x4002, 253], [0x4003, 0]], [[0x4000, 0x80]]]);
    assert.ok(Math.abs(states.pulse1[0].pitch - 69) < 0.05);
    assert.equal(states.pulse1[0].vol, 12);
    assert.equal(states.pulse1[0].duty, 2);
    assert.equal(states.pulse1[1].pitch, null);
});

// frame states for one channel from [pitch, vol] pairs (pitch null = silent)
const frames = (...pairs)=> pairs.map(([pitch, vol])=> ({ pitch, vol, duty: 0, hit: false }));

test('decode: an envelope that swells or dips briefly to silence stays one note', ()=>
{
    const notes = notesOf(frames([60, 5], [60, 8], [60, 5], [null, 0], [60, 4], [60, 6], [60, 3]));
    assert.equal(notes.length, 1);
    assert.equal(notes[0].frames, 7);
    assert.equal(notes[0].key, 60);
});

test('decode: a decayed note struck again is two notes', ()=>
{
    const notes = notesOf(frames([60, 12], [60, 6], [60, 2], [60, 12], [60, 6]));
    assert.deepEqual(notes.map(n => [n.frame, n.frames]), [[0, 3], [3, 2]]);
    // and coming back out of silence at full strength
    const again = notesOf(frames([60, 12], [60, 6], [null, 0], [60, 12]));
    assert.equal(again.length, 2);
});

test('decode: a chord arpeggio folds into one note; a drop or a trill does not count as one', ()=>
{
    const arp = notesOf(frames(...[0, 4, 7, 0, 4, 7, 0, 4, 7].map(d => [60 + d, 10])));
    assert.equal(arp.length, 1);
    assert.deepEqual(arp[0].arp, [0, 4, 7]);

    const drop = notesOf(frames([50, 15], [42, 15], [37, 15], [33, 15]));
    assert.equal(drop.length, 1);
    assert.equal(drop[0].arp, null);
    assert.equal(drop[0].slide, -17);

    const trill = notesOf(frames(...[0, 1, 0, 1, 0, 1].map(d => [60 + d, 10])));
    assert.equal(trill.length, 1);
    assert.equal(trill[0].arp, null);
    assert.ok(trill[0].vibrato >= 50);
});

test('decode: drum hits are attacks, not every frame of the envelope', ()=>
{
    const hits = hitsOf(frames([14, 15], [14, 12], [2, 6], [null, 0], [14, 15], [14, 4], [14, 13]));
    assert.deepEqual(hits.map(h => h.frame), [0, 4, 6]);
});
