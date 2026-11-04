// Plays an NSF (NES Sound Format) file's music driver frame by frame and records what it writes to the sound chips.
// An NSF is a 6502 program, not a list of notes: init picks a song, then play runs once per frame (60 Hz) and pokes
// the 2A03's registers ($4000–$4017) and any expansion chip's. Pure: takes bytes, returns register writes.
import { createCpu } from './cpu6502.js';

// expansion chips, by bit of header byte $7B
export const CHIPS = { vrc6: 1, vrc7: 2, fds: 4, mmc5: 8, n163: 16, s5b: 32 };

/** @param {Uint8Array} bytes */
export function parseNsf(bytes)
{
    const text = (o, n)=> String.fromCharCode(...bytes.subarray(o, o + n)).replace(/\0.*$/s, '').trim();
    const u16 = (o)=> bytes[o] | bytes[o + 1] << 8;
    if (text(0, 4) !== 'NESM' || bytes[4] !== 0x1a) throw new Error('not an NSF file');
    const banks = [...bytes.subarray(0x70, 0x78)];
    return {
        songs: bytes[6], first: bytes[7] - 1,
        load: u16(8), init: u16(0x0a), play: u16(0x0c),
        name: text(0x0e, 32), artist: text(0x2e, 32), copyright: text(0x4e, 32),
        // microseconds per play call on NTSC
        speed: u16(0x6e) || 16639,
        banks: banks.some(b => b) ? banks : null,
        chips: bytes[0x7b],
        data: bytes.subarray(0x80),
    };
}

/**
 * Runs one song for `frames` play calls.
 * @param {ReturnType<typeof parseNsf>} nsf
 * @returns {{ frames: [number, number][][] }}  each frame's sound-register writes, [addr, value], in order
 */
export function runSong(nsf, song, frames)
{
    const ram = new Uint8Array(0x800), wram = new Uint8Array(0x2000);
    // 4 KB banks over $8000–$FFFF; a bank-switched file is padded in front by the load address's offset in its bank
    const pad = nsf.banks ? nsf.load & 0xfff : 0;
    const rom = new Uint8Array(Math.ceil((nsf.data.length + pad) / 0x1000) * 0x1000 || 0x1000);
    if (nsf.banks) rom.set(nsf.data, pad);
    const slots = nsf.banks ? [...nsf.banks] : null;
    const flat = new Uint8Array(0x8000);
    if (!nsf.banks) flat.set(nsf.data.subarray(0, Math.max(0, 0x10000 - nsf.load)), nsf.load - 0x8000);

    let log = [];
    const sound = (a)=> (a >= 0x4000 && a <= 0x4017) || (a >= 0x9000 && a <= 0xbfff && nsf.chips & CHIPS.vrc6);
    const read = (a)=>
    {
        if (a < 0x2000) return ram[a & 0x7ff];
        if (a >= 0x6000 && a < 0x8000) return wram[a - 0x6000];
        if (a >= 0x8000)
        {
            if (!slots) return flat[a - 0x8000];
            const bank = slots[(a - 0x8000) >> 12];
            return rom[(bank * 0x1000 + (a & 0xfff)) % rom.length];
        }
        return 0;
    };
    const write = (a, v)=>
    {
        if (a < 0x2000) ram[a & 0x7ff] = v;
        else if (a >= 0x6000 && a < 0x8000) wram[a - 0x6000] = v;
        else if (a >= 0x5ff8 && a <= 0x5fff && slots) slots[a - 0x5ff8] = v;
        if (sound(a)) log.push([a, v]);
    };

    const cpu = createCpu(read, write);
    // the spec's init state: sound channels enabled and silent, then A = song, X = 0 (NTSC)
    for (let a = 0x4000; a < 0x4014; a++) write(a, 0);
    write(0x4015, 0x0f); write(0x4017, 0x40);
    log = [];
    cpu.a = song; cpu.x = 0; cpu.y = 0;
    cpu.call(nsf.init);
    const out = [log];
    for (let f = 0; f < frames; f++)
    {
        log = [];
        cpu.call(nsf.play);
        out.push(log);
    }
    return { frames: out };
}
