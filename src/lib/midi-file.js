// Writes a Standard MIDI File (format 1) from tracks of notes timed in beats, so a score opens in any DAW. Pure.
const PPQ = 480;                // ticks per beat

/**
 * @param {{ tempo: number, beatsPerBar: number, title?: string,
 *   tracks: { name: string, channel: number, program: number, notes: { key: number, beat: number, beats: number, vel: number }[] }[] }} song
 * @returns {Uint8Array}
 */
export function writeMidi(song)
{
    const conductor = [
        meta(0, 0x03, text(song.title ?? '')),
        meta(0, 0x51, [...u24(Math.round(60e6 / song.tempo))]),
        meta(0, 0x58, [song.beatsPerBar, 2, 24, 8]),
    ];
    const chunks = [trackChunk(conductor.map(e => ({ tick: 0, bytes: e.bytes })))];
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
