// A 6502 CPU, enough to run NSF music drivers: every official opcode, no decimal mode (the NES's 2A03 has none),
// no cycle timing. Pure: memory is two functions, read(addr) and write(addr, value).

const C = 1, Z = 2, I = 4, D = 8, B = 16, U = 32, V = 64, N = 128;

/**
 * @param {(addr: number)=> number} read
 * @param {(addr: number, value: number)=> void} write
 */
export function createCpu(read, write)
{
    const cpu = { a: 0, x: 0, y: 0, s: 0xfd, pc: 0, p: I | U };
    const flag = (f, on)=> { cpu.p = on ? cpu.p | f : cpu.p & ~f; };
    const nz = (v)=> { flag(Z, (v & 0xff) === 0); flag(N, v & 0x80); return v & 0xff; };
    const word = (a)=> read(a) | read((a + 1) & 0xffff) << 8;
    // the indirect JMP bug: the high byte is read from the same page
    const wordBug = (a)=> read(a) | read((a & 0xff00) | ((a + 1) & 0xff)) << 8;
    const push = (v)=> { write(0x100 | cpu.s, v & 0xff); cpu.s = (cpu.s - 1) & 0xff; };
    const pull = ()=> { cpu.s = (cpu.s + 1) & 0xff; return read(0x100 | cpu.s); };
    const fetch = ()=> { const v = read(cpu.pc); cpu.pc = (cpu.pc + 1) & 0xffff; return v; };
    const fetch16 = ()=> { const v = word(cpu.pc); cpu.pc = (cpu.pc + 2) & 0xffff; return v; };

    // addressing modes → an effective address (imm returns the operand's own address)
    const mode = {
        imm: ()=> { const a = cpu.pc; cpu.pc = (cpu.pc + 1) & 0xffff; return a; },
        zp: ()=> fetch(),
        zpx: ()=> (fetch() + cpu.x) & 0xff,
        zpy: ()=> (fetch() + cpu.y) & 0xff,
        abs: ()=> fetch16(),
        abx: ()=> (fetch16() + cpu.x) & 0xffff,
        aby: ()=> (fetch16() + cpu.y) & 0xffff,
        izx: ()=> { const z = (fetch() + cpu.x) & 0xff; return read(z) | read((z + 1) & 0xff) << 8; },
        izy: ()=> { const z = fetch(); return ((read(z) | read((z + 1) & 0xff) << 8) + cpu.y) & 0xffff; },
    };

    const adc = (v)=>
    {
        const r = cpu.a + v + (cpu.p & C);
        flag(C, r > 0xff);
        flag(V, ~(cpu.a ^ v) & (cpu.a ^ r) & 0x80);
        cpu.a = nz(r);
    };
    const cmp = (reg, v)=> { flag(C, reg >= v); nz(reg - v); };
    const branch = (cond)=> { const off = fetch(); if (cond) cpu.pc = (cpu.pc + (off < 128 ? off : off - 256)) & 0xffff; };
    // read-modify-write on memory or, with no mode, the accumulator
    const rmw = (m, fn)=>
    {
        if (!m) { cpu.a = fn(cpu.a); return; }
        const a = mode[m]();
        write(a, fn(read(a)));
    };
    const asl = (v)=> { flag(C, v & 0x80); return nz(v << 1); };
    const lsr = (v)=> { flag(C, v & 1); return nz(v >> 1); };
    const rol = (v)=> { const c = cpu.p & C; flag(C, v & 0x80); return nz(v << 1 | c); };
    const ror = (v)=> { const c = cpu.p & C; flag(C, v & 1); return nz(v >> 1 | c << 7); };

    /** @type {Record<number, ()=> void>} */
    const ops = {};
    const def = (codes, fn)=> { for (const [code, m] of Object.entries(codes)) ops[+code] = ()=> fn(m); };
    const r = (m)=> read(mode[m]());

    def({ 0xa9: 'imm', 0xa5: 'zp', 0xb5: 'zpx', 0xad: 'abs', 0xbd: 'abx', 0xb9: 'aby', 0xa1: 'izx', 0xb1: 'izy' }, m => { cpu.a = nz(r(m)); });
    def({ 0xa2: 'imm', 0xa6: 'zp', 0xb6: 'zpy', 0xae: 'abs', 0xbe: 'aby' }, m => { cpu.x = nz(r(m)); });
    def({ 0xa0: 'imm', 0xa4: 'zp', 0xb4: 'zpx', 0xac: 'abs', 0xbc: 'abx' }, m => { cpu.y = nz(r(m)); });
    def({ 0x85: 'zp', 0x95: 'zpx', 0x8d: 'abs', 0x9d: 'abx', 0x99: 'aby', 0x81: 'izx', 0x91: 'izy' }, m => write(mode[m](), cpu.a));
    def({ 0x86: 'zp', 0x96: 'zpy', 0x8e: 'abs' }, m => write(mode[m](), cpu.x));
    def({ 0x84: 'zp', 0x94: 'zpx', 0x8c: 'abs' }, m => write(mode[m](), cpu.y));
    def({ 0x69: 'imm', 0x65: 'zp', 0x75: 'zpx', 0x6d: 'abs', 0x7d: 'abx', 0x79: 'aby', 0x61: 'izx', 0x71: 'izy' }, m => adc(r(m)));
    def({ 0xe9: 'imm', 0xe5: 'zp', 0xf5: 'zpx', 0xed: 'abs', 0xfd: 'abx', 0xf9: 'aby', 0xe1: 'izx', 0xf1: 'izy' }, m => adc(r(m) ^ 0xff));
    def({ 0x29: 'imm', 0x25: 'zp', 0x35: 'zpx', 0x2d: 'abs', 0x3d: 'abx', 0x39: 'aby', 0x21: 'izx', 0x31: 'izy' }, m => { cpu.a = nz(cpu.a & r(m)); });
    def({ 0x09: 'imm', 0x05: 'zp', 0x15: 'zpx', 0x0d: 'abs', 0x1d: 'abx', 0x19: 'aby', 0x01: 'izx', 0x11: 'izy' }, m => { cpu.a = nz(cpu.a | r(m)); });
    def({ 0x49: 'imm', 0x45: 'zp', 0x55: 'zpx', 0x4d: 'abs', 0x5d: 'abx', 0x59: 'aby', 0x41: 'izx', 0x51: 'izy' }, m => { cpu.a = nz(cpu.a ^ r(m)); });
    def({ 0xc9: 'imm', 0xc5: 'zp', 0xd5: 'zpx', 0xcd: 'abs', 0xdd: 'abx', 0xd9: 'aby', 0xc1: 'izx', 0xd1: 'izy' }, m => cmp(cpu.a, r(m)));
    def({ 0xe0: 'imm', 0xe4: 'zp', 0xec: 'abs' }, m => cmp(cpu.x, r(m)));
    def({ 0xc0: 'imm', 0xc4: 'zp', 0xcc: 'abs' }, m => cmp(cpu.y, r(m)));
    def({ 0x24: 'zp', 0x2c: 'abs' }, m => { const v = r(m); flag(Z, (cpu.a & v) === 0); flag(N, v & N); flag(V, v & V); });
    def({ 0x0a: '', 0x06: 'zp', 0x16: 'zpx', 0x0e: 'abs', 0x1e: 'abx' }, m => rmw(m, asl));
    def({ 0x4a: '', 0x46: 'zp', 0x56: 'zpx', 0x4e: 'abs', 0x5e: 'abx' }, m => rmw(m, lsr));
    def({ 0x2a: '', 0x26: 'zp', 0x36: 'zpx', 0x2e: 'abs', 0x3e: 'abx' }, m => rmw(m, rol));
    def({ 0x6a: '', 0x66: 'zp', 0x76: 'zpx', 0x6e: 'abs', 0x7e: 'abx' }, m => rmw(m, ror));
    def({ 0xe6: 'zp', 0xf6: 'zpx', 0xee: 'abs', 0xfe: 'abx' }, m => rmw(m, v => nz(v + 1)));
    def({ 0xc6: 'zp', 0xd6: 'zpx', 0xce: 'abs', 0xde: 'abx' }, m => rmw(m, v => nz(v - 1)));

    Object.assign(ops, {
        0xe8: ()=> { cpu.x = nz(cpu.x + 1); }, 0xca: ()=> { cpu.x = nz(cpu.x - 1); },
        0xc8: ()=> { cpu.y = nz(cpu.y + 1); }, 0x88: ()=> { cpu.y = nz(cpu.y - 1); },
        0xaa: ()=> { cpu.x = nz(cpu.a); }, 0x8a: ()=> { cpu.a = nz(cpu.x); },
        0xa8: ()=> { cpu.y = nz(cpu.a); }, 0x98: ()=> { cpu.a = nz(cpu.y); },
        0xba: ()=> { cpu.x = nz(cpu.s); }, 0x9a: ()=> { cpu.s = cpu.x; },
        0x48: ()=> push(cpu.a), 0x68: ()=> { cpu.a = nz(pull()); },
        0x08: ()=> push(cpu.p | B | U), 0x28: ()=> { cpu.p = pull() & ~B | U; },
        0x18: ()=> flag(C, 0), 0x38: ()=> flag(C, 1), 0x58: ()=> flag(I, 0), 0x78: ()=> flag(I, 1),
        0xb8: ()=> flag(V, 0), 0xd8: ()=> flag(D, 0), 0xf8: ()=> flag(D, 1),
        0x10: ()=> branch(!(cpu.p & N)), 0x30: ()=> branch(cpu.p & N),
        0x50: ()=> branch(!(cpu.p & V)), 0x70: ()=> branch(cpu.p & V),
        0x90: ()=> branch(!(cpu.p & C)), 0xb0: ()=> branch(cpu.p & C),
        0xd0: ()=> branch(!(cpu.p & Z)), 0xf0: ()=> branch(cpu.p & Z),
        0x4c: ()=> { cpu.pc = fetch16(); },
        0x6c: ()=> { cpu.pc = wordBug(fetch16()); },
        0x20: ()=> { const to = fetch16(); const ret = (cpu.pc - 1) & 0xffff; push(ret >> 8); push(ret); cpu.pc = to; },
        0x60: ()=> { cpu.pc = ((pull() | pull() << 8) + 1) & 0xffff; },
        0x40: ()=> { cpu.p = pull() & ~B | U; cpu.pc = pull() | pull() << 8; },
        0x00: ()=> { cpu.pc = (cpu.pc + 1) & 0xffff; push(cpu.pc >> 8); push(cpu.pc); push(cpu.p | B | U); flag(I, 1); cpu.pc = word(0xfffe); },
        0xea: ()=> {},
    });

    /** runs one instruction; throws on an opcode it doesn't know */
    cpu.step = ()=>
    {
        const at = cpu.pc, op = fetch(), fn = ops[op];
        if (!fn) throw new Error(`unknown opcode $${op.toString(16)} at $${at.toString(16)}`);
        fn();
    };

    /**
     * Calls the routine at `addr` the way JSR would and runs until it returns.
     * @returns {number} instructions run
     */
    cpu.call = (addr, limit = 2e6)=>
    {
        // RTS adds one to the address it pulls, so the routine returns to $0000, where no NSF keeps code
        const sentinel = 0xffff;
        push(sentinel >> 8); push(sentinel & 0xff);
        cpu.pc = addr;
        let n = 0;
        while (cpu.pc !== 0x0000)
        {
            cpu.step();
            if (++n > limit) throw new Error(`routine at $${addr.toString(16)} ran over ${limit} instructions`);
        }
        return n;
    };
    return cpu;
}
