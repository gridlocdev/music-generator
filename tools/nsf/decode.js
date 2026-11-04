// Turns an NSF's register writes into what each channel plays: a per-frame state (pitch, volume, duty), then notes.
// Covers the 2A03 (two pulses, triangle, noise, DPCM) and the VRC6 (two pulses, sawtooth). Pure.

const CPU_HZ = 1789773;
const midiOf = (hz)=> 69 + 12 * Math.log2(hz / 440);

// each channel: how to read its frame state from the registers
//   pitch: MIDI (fractional), vol: 0–15, duty: the channel's own duty value
export const CHANNELS = {
    pulse1: { chip: '2A03', regs: 0x4000, kind: 'pulse' },
    pulse2: { chip: '2A03', regs: 0x4004, kind: 'pulse' },
    triangle: { chip: '2A03', regs: 0x4008, kind: 'triangle' },
    noise: { chip: '2A03', regs: 0x400c, kind: 'noise' },
    dpcm: { chip: '2A03', regs: 0x4010, kind: 'dpcm' },
    vrc6a: { chip: 'VRC6', regs: 0x9000, kind: 'vrc6pulse' },
    vrc6b: { chip: 'VRC6', regs: 0xa000, kind: 'vrc6pulse' },
    saw: { chip: 'VRC6', regs: 0xb000, kind: 'saw' },
};

/**
 * Each channel's state at the end of every frame.
 * @param {[number, number][][]} frames  register writes per frame, from runSong
 * @returns {Record<string, { pitch: number | null, vol: number, duty: number, hit: boolean }[]>}
 *   pitch null = silent; hit = a DPCM sample started this frame (drivers rewrite the other channels' trigger
 *   registers every frame, so those say nothing)
 */
export function channelStates(frames)
{
    const reg = new Uint8Array(0x10000);
    const out = Object.fromEntries(Object.keys(CHANNELS).map(k => [k, []]));
    for (const writes of frames)
    {
        let dpcmStart = false;
        for (const [a, v] of writes)
        {
            reg[a] = v;
            if (a === 0x4015 && v & 0x10) dpcmStart = true;
        }
        for (const [name, ch] of Object.entries(CHANNELS))
        {
            const r = (i)=> reg[ch.regs + i];
            let pitch = null, vol = 0, duty = 0, hit = false;
            if (ch.kind === 'pulse')
            {
                const t = r(2) | (r(3) & 7) << 8;
                vol = r(0) & 15; duty = r(0) >> 6;
                if (vol && t >= 8) pitch = midiOf(CPU_HZ / (16 * (t + 1)));
            }
            else if (ch.kind === 'triangle')
            {
                const t = r(2) | (r(3) & 7) << 8;
                vol = r(0) & 0x7f ? 15 : 0;
                if (vol && t >= 2) pitch = midiOf(CPU_HZ / (32 * (t + 1)));
            }
            else if (ch.kind === 'noise')
            {
                vol = r(0) & 15; duty = r(2) >> 7;
                // the noise "pitch" is its period index, 0 (highest) to 15
                if (vol) pitch = r(2) & 15;
            }
            else if (ch.kind === 'dpcm')
            {
                // a sample start; the pitch is the sample's address byte, which names the sample
                hit = dpcmStart;
                vol = hit ? 15 : 0;
                pitch = hit ? r(2) : null;
                duty = r(0) & 15;       // playback rate index
            }
            else if (ch.kind === 'vrc6pulse')
            {
                const t = r(1) | (r(2) & 15) << 8;
                vol = r(0) & 15; duty = (r(0) >> 4) & 7;
                if (r(2) & 0x80 && vol) pitch = midiOf(CPU_HZ / (16 * (t + 1)));
            }
            else if (ch.kind === 'saw')
            {
                const t = r(1) | (r(2) & 15) << 8;
                // the accumulator rate sets the level; above 42 the saw distorts
                vol = Math.min(15, Math.round((r(0) & 63) / 42 * 15));
                if (r(2) & 0x80 && vol) pitch = midiOf(CPU_HZ / (14 * (t + 1)));
            }
            out[name].push({ pitch, vol, duty, hit });
        }
    }
    return out;
}

/**
 * Notes from one tonal channel's frame states. A note starts when the channel starts sounding, when its pitch moves
 * to another semitone and stays there (vibrato and slides within half a semitone don't count), or when its volume
 * jumps back up (a repeated note). Fast cycles of short notes, an arpeggio, are folded into one note with `arp`.
 * @returns {{ frame: number, frames: number, key: number, vol: number, duty: number, arp: number[] | null,
 *   vibrato: number, slide: number }[]}
 *   key: the note's MIDI key (for an arpeggio, its first); arp: semitones of each arpeggio step from the key;
 *   vibrato: peak pitch wobble in cents; slide: semitones the pitch moved during the note (a portamento)
 */
export function notesOf(states, { arpFrames = 2, retrigger = 3, maxGap = 2 } = {})
{
    // runs of one rounded semitone
    // A rise in volume is a new attack only once the note has decayed (an envelope that swells, 5 8 5, is one note),
    // and a gap of a frame or two is the instrument's envelope dipping to silence unless the note comes back at full
    // strength.
    const runs = [];
    let cur = null, gap = 0, last = null;
    states.forEach((s, f)=>
    {
        const key = s.pitch === null ? null : Math.round(s.pitch);
        const prev = states[f - 1];
        if (key === null)
        {
            if (cur) { last = cur; runs.push(cur); cur = null; gap = 0; }
            gap++;
            return;
        }
        if (!cur && last && gap <= maxGap && last.frame + last.frames + gap === f && Math.abs(s.pitch - last.key) < 0.6 && s.vol < last.vol)
        {
            // resume the note the dip interrupted
            runs.pop();
            cur = last;
            cur.frames += gap;
            for (let i = 0; i < gap; i++) cur.pitches.push(cur.pitches.at(-1));
        }
        const rearticulated = cur && prev && prev.pitch !== null && s.vol - prev.vol >= retrigger && prev.vol <= cur.vol - retrigger;
        const held = cur && Math.abs(s.pitch - cur.key) < 0.6 && !rearticulated;
        last = null;
        if (held) { cur.frames++; cur.pitches.push(s.pitch); cur.vol = Math.max(cur.vol, s.vol); return; }
        if (cur) runs.push(cur);
        cur = { frame: f, frames: 1, key, vol: s.vol, duty: s.duty, pitches: [s.pitch], joined: !!cur && !rearticulated };
    });
    if (cur) runs.push(cur);

    // fold arpeggios: consecutive joined runs of at most arpFrames frames each
    const notes = [];
    for (let i = 0; i < runs.length;)
    {
        let j = i + 1;
        while (j < runs.length && runs[j].joined && runs[j].frame === runs[j - 1].frame + runs[j - 1].frames
            && runs[j - 1].frames <= arpFrames && runs[j].frames <= arpFrames + 1) j++;
        const group = runs.slice(i, j);
        const first = group[0], last = group.at(-1);
        const frames = last.frame + last.frames - first.frame;
        let arp = null, trill = false;
        if (group.length >= 3)
        {
            const steps = group.map(g => g.key - first.key);
            // the repeating cycle: the shortest prefix the rest repeats; it must come round at least once more, or the
            // group is a pitch drop (a kick on the triangle) or a slide, not an arpeggio
            let n = 1;
            while (n < steps.length && !steps.every((s, k)=> s === steps[k % n])) n++;
            // a cycle of a semitone or two is a trill or a deep vibrato, not a chord
            if (n >= 2 && n <= 4 && steps.length > n) arp = steps.slice(0, n);
            if (arp && Math.max(...arp.map(Math.abs)) < 3) { trill = true; arp = null; }
        }
        const pitches = group.flatMap(g => g.pitches);
        const centre = trill ? Math.round(pitches.reduce((a, b)=> a + b) / pitches.length) : first.key;
        const drift = pitches.map(p => p - (arp ? Math.round(p) : centre));
        const slide = arp || trill ? 0 : Math.round((pitches.at(-1) - pitches[0]) * 100) / 100;
        const vibrato = Math.round(Math.max(0, ...drift.map(Math.abs)) * 100);
        // a run that only grazed a semitone (a slide or a deep vibrato) without arpeggiating stays its own note
        if (group.length < 3) { for (const g of group) notes.push(noteOf(g)); i = j; continue; }
        // a quick fall or rise through several semitones (a drum's pitch drop, a fast slide) is one note with a slide
        notes.push({ frame: first.frame, frames, key: centre, vol: Math.max(...group.map(g => g.vol)), duty: first.duty, arp, vibrato: arp || trill ? vibrato : 0, slide });
        i = j;
    }
    return notes;
}

function noteOf(run)
{
    const p = run.pitches;
    return {
        frame: run.frame, frames: run.frames, key: run.key, vol: run.vol, duty: run.duty, arp: null,
        vibrato: Math.round(Math.max(...p.map(x => Math.abs(x - run.key))) * 100),
        slide: Math.round((p.at(-1) - p[0]) * 100) / 100,
    };
}

/** drum hits from the noise or DPCM channel: { frame, sound, vol } (sound: noise period index or DPCM sample) */
export function hitsOf(states)
{
    const hits = [];
    states.forEach((s, f)=>
    {
        const prev = states[f - 1];
        // drivers rewrite the trigger register every frame, so an attack is a sound out of silence or a jump in volume;
        // a drum's own envelope (a snare stepping through noise periods as it fades) isn't a new hit
        const attack = s.pitch !== null && (!prev || prev.pitch === null || s.vol - prev.vol >= 3);
        if (attack) hits.push({ frame: f, sound: s.pitch, vol: s.vol, mode: s.duty });
    });
    return hits;
}

/**
 * Where the song starts repeating, from the register writes: { start, length } in frames, or null.
 * Compares windows of `window` frames, so a loop shorter than that isn't found.
 */
export function findLoop(frames, window = 240)
{
    // one number per frame, then a rolling hash over each window; a match is checked frame by frame. The modulus is
    // under 2^26 so every product stays exact in a double.
    const keys = frames.map(w => w.reduce((h, [a, v])=> (Math.imul(h, 31) + a * 256 + v) | 0, 7) >>> 0);
    const M = 67108859, B = 131;
    let pow = 1;
    for (let i = 1; i < window; i++) pow = pow * B % M;
    const seen = new Map();
    // a loop: from `start` on, every frame equals the one `length` later, to the end of the recording
    const loops = (start, length)=> { for (let t = start; t + length < keys.length; t++) if (keys[t] !== keys[t + length]) return false; return true; };
    let h = 0;
    for (let i = 0; i < keys.length; i++)
    {
        if (i >= window) h = (h - keys[i - window] % M * pow % M + M) % M;
        h = (h * B + keys[i] % M) % M;
        const start = i - window + 1;
        if (start < 0) continue;
        const before = seen.get(h) ?? [];
        for (const prev of before) if (loops(prev, start - prev)) return { start: prev, length: start - prev };
        before.push(start);
        seen.set(h, before);
    }
    return null;
}
