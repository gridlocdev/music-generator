// Standard MIDI Files: writes one (format 1) from tracks of notes timed in beats, so a score opens in any DAW, and reads
// one (format 0 or 1) back into tracks of notes. Pure.
const PPQ = 480;                // ticks per beat

/**
 * @param {{ tempo: number, beatsPerBar: number, title?: string,
 *   tempos?: { beat: number, bpm: number }[], meters?: { beat: number, num: number, den: number }[],
 *   tracks: { name: string, channel: number, program: number, notes: { key: number, beat: number, beats: number, vel: number }[] }[] }} song
 *   tempos and meters, when given, replace the single tempo and beatsPerBar with changes at those beats
 * @returns {Uint8Array}
 */
export function writeMidi(song)
{
    const tempos = song.tempos ?? [{ beat: 0, bpm: song.tempo }];
    const meters = song.meters ?? [{ beat: 0, num: song.beatsPerBar, den: 4 }];
    const conductor = [
        { tick: 0, order: 0, bytes: meta(0, 0x03, text(song.title ?? '')).bytes },
        ...tempos.map(t => ({ tick: Math.round(t.beat * PPQ), order: 1, bytes: meta(0, 0x51, [...u24(Math.round(60e6 / t.bpm))]).bytes })),
        ...meters.map(m => ({ tick: Math.round(m.beat * PPQ), order: 1, bytes: meta(0, 0x58, [m.num, Math.log2(m.den), 24, 8]).bytes })),
    ].sort((a, b)=> a.tick - b.tick || a.order - b.order);
    const chunks = [trackChunk(conductor)];
    for (const t of song.tracks)
    {
        const ch = t.channel & 15;
        const events = [
            { tick: 0, order: 0, bytes: meta(0, 0x03, text(t.name)).bytes },
            { tick: 0, order: 0, bytes: [0xc0 | ch, t.program & 127] },
        ];
        for (const n of t.notes)
        {
            const on = Math.round(n.beat * PPQ), off = Math.max(on + 1, Math.round((n.beat + n.beats) * PPQ));
            events.push({ tick: on, order: 2, bytes: [0x90 | ch, n.key & 127, Math.max(1, Math.min(127, n.vel))] });
            events.push({ tick: off, order: 1, bytes: [0x80 | ch, n.key & 127, 0] });
        }
        // note-offs before note-ons at the same tick, so repeated notes don't cut each other off
        events.sort((a, b)=> a.tick - b.tick || a.order - b.order);
        chunks.push(trackChunk(events));
    }
    const header = [...ascii('MThd'), ...u32(6), 0, 1, ...u16(chunks.length), ...u16(PPQ)];
    return new Uint8Array([...header, ...chunks.flat()]);
}

function trackChunk(events)
{
    const data = [];
    let last = 0;
    for (const e of events)
    {
        data.push(...varLen(e.tick - last), ...e.bytes);
        last = e.tick;
    }
    data.push(0, 0xff, 0x2f, 0);        // end of track
    return [...ascii('MTrk'), ...u32(data.length), ...data];
}

const meta = (tick, type, payload)=> ({ tick, bytes: [0xff, type, ...varLen(payload.length), ...payload] });
const ascii = (s)=> [...s].map(c => c.charCodeAt(0) & 127);
const text = (s)=> [...new TextEncoder().encode(s)];
const u16 = (n)=> [(n >> 8) & 255, n & 255];
const u24 = (n)=> [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const u32 = (n)=> [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];

/** MIDI variable-length quantity: 7 bits per byte, high bit set on all but the last */
export function varLen(n)
{
    const out = [n & 127];
    while ((n >>= 7) > 0) out.unshift((n & 127) | 128);
    return out;
}

/**
 * Reads a Standard MIDI File (format 0 or 1). Each MIDI channel of each track chunk becomes a track of its own; a note
 * still held at the end of its chunk ends there. Times are in beats.
 * @param {Uint8Array} bytes
 * @returns {{ title: string, tempos: { beat: number, bpm: number }[], meters: { beat: number, num: number, den: number }[],
 *   tracks: { name: string, channel: number, program: number, notes: { key: number, beat: number, beats: number, vel: number }[] }[] }}
 */
export function readMidi(bytes)
{
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const str = (at, n)=> String.fromCharCode(...b.subarray(at, at + n));
    const u32At = (at)=> ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
    if (b.length < 14 || str(0, 4) !== 'MThd') throw new Error('not a MIDI file');
    const format = (b[8] << 8) | b[9], division = (b[12] << 8) | b[13];
    if (format > 1) throw new Error(`MIDI format ${format} isn't supported`);
    if (division & 0x8000) throw new Error('MIDI files timed in SMPTE frames aren\'t supported');
    const ppq = division || PPQ;
    const decoder = new TextDecoder();
    let title = '';
    const tempos = [], meters = [], tracks = [];

    let at = 8 + u32At(4), chunk = 0;
    while (at + 8 <= b.length)
    {
        const id = str(at, 4), len = u32At(at + 4), end = Math.min(b.length, at + 8 + len);
        let i = at + 8;
        at = end;
        if (id !== 'MTrk') continue;
        let tick = 0, status = 0, name = '';
        /** this chunk's channels: notes, the program, and what's held (key → [start tick, vel] stack) */
        const channels = new Map();
        const chan = (c)=> channels.get(c) ?? channels.set(c, { notes: [], program: null, held: new Map() }).get(c);
        const read = ()=> { let n = 0, x; do { x = b[i++]; n = (n << 7) | (x & 127); } while (x & 128 && i < end); return n; };
        const off = (c, key, t)=>
        {
            const stack = chan(c).held.get(key);
            const on = stack?.shift();
            if (on) chan(c).notes.push({ key, beat: on[0] / ppq, beats: Math.max(1, t - on[0]) / ppq, vel: on[1] });
        };
        while (i < end)
        {
            tick += read();
            let s = b[i];
            if (s & 0x80) i++;
            else s = status;                    // running status
            if (s === 0xff)
            {
                const type = b[i++], n = read(), data = b.subarray(i, i + n);
                i += n;
                if (type === 0x2f) break;
                if (type === 0x03 && !name) name = decoder.decode(data).trim();
                else if (type === 0x51 && n === 3) tempos.push({ beat: tick / ppq, bpm: 60e6 / ((data[0] << 16) | (data[1] << 8) | data[2]) });
                else if (type === 0x58 && n >= 2) meters.push({ beat: tick / ppq, num: data[0], den: 2 ** data[1] });
                continue;
            }
            if (s === 0xf0 || s === 0xf7) { i += read(); continue; }
            if (s < 0x80) throw new Error('bad MIDI data');
            status = s;
            const kind = s & 0xf0, c = s & 15;
            const d1 = b[i++], d2 = kind === 0xc0 || kind === 0xd0 ? 0 : b[i++];
            if (kind === 0x90 && d2 > 0)
            {
                const held = chan(c).held;
                (held.get(d1) ?? held.set(d1, []).get(d1)).push([tick, d2]);
            }
            else if (kind === 0x80 || kind === 0x90) off(c, d1, tick);
            else if (kind === 0xc0 && chan(c).program === null) chan(c).program = d1;
        }
        for (const [c, ch] of channels) for (const [key, stack] of ch.held) while (stack.length) off(c, key, tick);
        if (chunk === 0 && format === 1 && ![...channels.values()].some(c => c.notes.length)) title = name;
        const used = [...channels].filter(([, ch])=> ch.notes.length);
        for (const [c, ch] of used)
            tracks.push({ name: used.length > 1 || !name ? (name ? `${name} ${c + 1}` : '') : name, channel: c, program: ch.program ?? 0,
                notes: ch.notes.sort((x, y)=> x.beat - y.beat || x.key - y.key) });
        chunk++;
    }
    const firsts = (list)=> list.sort((x, y)=> x.beat - y.beat).filter((e, k, all)=> k === all.length - 1 || all[k + 1].beat - e.beat > 1e-9);
    return { title, tempos: firsts(tempos), meters: firsts(meters), tracks };
}
