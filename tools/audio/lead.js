// Follows the lead line in recorded music: for each frame, the pitch whose harmonics are loudest (harmonic summation
// over a magnitude spectrum), then a level and a voiced/unvoiced call. Frames are 1/60 s so the result feeds the same
// note-finding and melody statistics as the NSF reader. This finds the most prominent pitched line; chords, a bass
// louder than the lead, a bass whose overtones fill in the pitch an octave under the lead (a G2 under a D5 makes D4
// look complete), or two equal voices will confuse it. Pure: takes samples, returns frames.

/** in-place radix-2 FFT; re and im have a power-of-two length */
export function fft(re, im)
{
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++)
    {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1)
    {
        const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len)
        {
            let cr = 1, ci = 0;
            for (let k = 0; k < len / 2; k++)
            {
                const a = i + k, b = a + len / 2;
                const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
                re[b] = re[a] - tr; im[b] = im[a] - ti;
                re[a] += tr; im[a] += ti;
                const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
            }
        }
    }
}

const hz = (midi)=> 440 * 2 ** ((midi - 69) / 12);

/**
 * The lead's pitch, frame by frame.
 * @param {Float32Array} samples  mono
 * @param {number} rate  sample rate
 * @param {{ fps?: number, size?: number, low?: number, high?: number, harmonics?: number, voicing?: number, voices?: number,
 *   share?: number, lift?: number, smooth?: boolean, hold?: number, register?: number, ceiling?: number,
 *   octaveUp?: number, attack?: number }} [opts]
 *   low/high: the MIDI range searched; voicing: the share of a loud frame's salience a frame needs to count as pitched;
 *   voices: how many pitches to look for in a frame; share: how strong a pitch must be, against the strongest, to count;
 *   lift: how much an octave up favours a pitch as the lead; smooth: spectral smoothness on (see below); hold: frames
 *   of median smoothing; register: semitones under the lead's recent register that count as a rest (0: off);
 *   ceiling: semitones over it that count as a rest, since what pokes far above is a harmonic left over (0: off);
 *   octaveUp: how weak a pitch's fundamental may be, against its second harmonic, before it's taken as the octave above
 *   (in √amplitude; 0: off);
 *   attack: the short window, in samples, the level is measured over
 * @returns {{ pitch: number | null, level: number, salience: number, power: number }[]}  pitch: fractional MIDI;
 *   level: the lead's strength in dB; power: the whole frame's, in dB
 */
export function pitchTrack(samples, rate, { fps = 60, size = 2048, low = 50, high = 100, harmonics = 8, voicing = 0.3, voices = 3, share = 0.35, lift = 1.4, smooth = true, hold = 5, register = 10, ceiling = 12, octaveUp = 0.6, attack = 512 } = {})
{
    const hop = rate / fps, bin = rate / size;
    const win = Float32Array.from({ length: size }, (_, i)=> 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size));
    // candidates every 10 cents, each with its harmonics' bins and weights
    const cands = [];
    for (let m = low; m <= high + 1e-9; m += 0.1)
    {
        const f = hz(m), bins = [], weights = [];
        for (let h = 1; h <= harmonics && h * f < rate / 2 - bin; h++) { bins.push(h * f / bin); weights.push(0.8 ** (h - 1)); }
        cands.push({ m, bins, weights });
    }
    const re = new Float64Array(size), im = new Float64Array(size), mag = new Float64Array(size / 2);
    const at = (b)=> { const i = Math.floor(b); return Math.max(mag[i], mag[i + 1] ?? 0); };
    const out = [];
    for (let start = -size / 2; start + size / 2 < samples.length; start += hop)
    {
        const s0 = Math.round(start);
        for (let i = 0; i < size; i++) { re[i] = (samples[s0 + i] ?? 0) * win[i]; im[i] = 0; }
        fft(re, im);
        let power = 0;
        for (let i = 0; i < size / 2; i++) { const p = re[i] * re[i] + im[i] * im[i]; power += p; mag[i] = Math.sqrt(Math.sqrt(p)); }
        power = 10 * Math.log10(power / size + 1e-12);
        const orig = mag.slice();
        // the pitches sounding: the strongest, then its harmonics taken out of the spectrum and the next, while
        // they stay within `voices` of the first; the lead is the highest of them (the top voice)
        const found = [];
        for (let v = 0; v < voices; v++)
        {
            let best = null, score = 0;
            for (const c of cands)
            {
                // each harmonic counts only up to the average of it and its neighbours (spectral smoothness): a pitch
                // an octave under the lead would otherwise claim the lead's harmonics as its even ones
                let s = 0;
                const a = c.bins.map(at);
                for (let h = 0; h < a.length; h++)
                {
                    const near = smooth ? (a[h] + (a[h - 1] ?? a[h]) + (a[h + 1] ?? a[h])) / 3 : a[h];
                    s += c.weights[h] * Math.min(a[h], near);
                }
                // a pitch with nothing at its fundamental is a subharmonic of the real one
                if (s > score && at(c.bins[0]) > 0.25 * s / c.bins.length) { score = s; best = c; }
            }
            if (!best || (found.length && score < share * found[0].score)) break;
            found.push({ m: best.m, score });
            // take out what this pitch explains: each harmonic down to the smoothed level of its neighbours, so a
            // voice an octave up keeps the part of the shared harmonics that's its own
            const amps = best.bins.map(at);
            best.bins.forEach((b, h)=>
            {
                const near = [amps[h - 1], amps[h], amps[h + 1]].filter(a => a !== undefined);
                const take = Math.min(amps[h], near.reduce((x, y)=> x + y, 0) / near.length);
                for (let i = Math.floor(b) - 1; i <= Math.floor(b) + 2; i++) if (i >= 0 && i < mag.length) mag[i] = Math.max(0, mag[i] - take);
            });
        }
        // the lead: the strongest once higher pitches get a lean (`lift`: how many times stronger an octave up counts)
        const rank = (x)=> x.score * lift ** ((x.m - 60) / 12);
        const top = found.reduce((a, b)=> !a || rank(b) > rank(a) ? b : a, null);
        // a bass's third harmonic can stand in for the fundamental of the pitch an octave under the lead, which then
        // claims the lead's harmonics as its even ones: a pitch whose fundamental is much weaker than its second
        // harmonic is taken as the octave above (instruments, even a thin pulse, keep a fundamental about as strong)
        if (octaveUp && top && top.m + 12 <= high)
        {
            const [f1, f2] = cands[Math.round((top.m - low) * 10)].bins.map(b => Math.max(orig[Math.floor(b)], orig[Math.floor(b) + 1] ?? 0));
            if (f1 < octaveUp * f2) top.m += 12;
        }
        out.push({ pitch: top ? top.m : null, level: top ? 20 * Math.log10(top.score + 1e-9) : -200, salience: top ? top.score : 0, power });
    }
    // unvoiced: well under the loud frames' salience
    const loud = [...out.map(f => f.salience)].sort((a, b)=> a - b)[Math.floor(out.length * 0.9)] ?? 0;
    for (const f of out) if (f.salience < voicing * loud) f.pitch = null;
    // brief jumps (to another voice, or an octave off) are mistakes, not notes: a median over `hold` frames, with
    // silence winning when it's most of the window. A real note is at least a 32nd (5 frames at 180 bpm).
    const pitches = out.map(f => f.pitch), half = hold >> 1;
    for (let i = 0; i < out.length; i++)
    {
        const win = pitches.slice(Math.max(0, i - half), i + half + 1);
        const voiced = win.filter(p => p !== null).sort((a, b)=> a - b);
        out[i].pitch = voiced.length * 2 <= win.length ? null : voiced[voiced.length >> 1];
    }
    // when the lead rests, the bass shows through: a pitch more than `register` semitones under where the lead has
    // been sitting (the median over two seconds either side) is a rest, and so is one more than `ceiling` over it
    if (register || ceiling)
    {
        const voicedAt = out.map((f, i)=> [i, f.pitch]).filter(([, p])=> p !== null);
        const span = 2 * fps;
        let lo = 0, hi = 0;
        for (const [i, p] of voicedAt)
        {
            while (voicedAt[lo][0] < i - span) lo++;
            while (hi < voicedAt.length && voicedAt[hi][0] <= i + span) hi++;
            const near = voicedAt.slice(lo, hi).map(([, q])=> q).sort((a, b)=> a - b);
            const mid = near[near.length >> 1];
            if ((register && p < mid - register) || (ceiling && p > mid + ceiling)) out[i].pitch = null;
        }
    }
    // the lead's level from a short window, so the dip between two strikes of one note shows
    const sre = new Float64Array(attack), sim = new Float64Array(attack), sbin = rate / attack;
    const swin = Float32Array.from({ length: attack }, (_, i)=> 0.5 - 0.5 * Math.cos(2 * Math.PI * i / attack));
    out.forEach((f, k)=>
    {
        if (f.pitch === null) return;
        const s0 = Math.round(k * hop - attack / 2);
        for (let i = 0; i < attack; i++) { sre[i] = (samples[s0 + i] ?? 0) * swin[i]; sim[i] = 0; }
        fft(sre, sim);
        let e = 0;
        for (let h = 1; h <= harmonics && h * hz(f.pitch) < rate / 2; h++)
        {
            const b = Math.round(h * hz(f.pitch) / sbin);
            for (let i = Math.max(0, b - 1); i <= Math.min(attack / 2 - 1, b + 1); i++) e += sre[i] * sre[i] + sim[i] * sim[i];
        }
        f.level = 10 * Math.log10(e / attack + 1e-12);
    });
    return out;
}

/**
 * Frame states in the NSF decoder's shape ({ pitch, vol 0–15, duty, hit }), so its note-finding can be reused.
 * A volume step is 2 dB under the track's loud frames (the 2A03's steps are about that).
 */
export function statesOf(track)
{
    const levels = track.filter(f => f.pitch !== null).map(f => f.level).sort((a, b)=> a - b);
    const top = levels[Math.floor(levels.length * 0.95)] ?? 0;
    return track.map(f => ({
        pitch: f.pitch, duty: 0, hit: false,
        vol: f.pitch === null ? 0 : Math.max(1, Math.min(15, Math.round(15 + (f.level - top) / 2))),
    }));
}

/**
 * The beat, from how much the spectrum's loudness rises frame to frame (an onset strength), autocorrelated.
 * @returns {number} frames per beat, between 60 and 200 bpm at `fps`
 */
export function beatFrames(track, fps = 60)
{
    const flux = track.map((f, i)=> i ? Math.max(0, f.power - track[i - 1].power) : 0);
    const mean = flux.reduce((a, b)=> a + b, 0) / flux.length;
    const x = flux.map(v => v - mean);
    let best = 0, lag = null;
    for (let l = Math.round(fps * 60 / 200); l <= Math.round(fps * 60 / 60); l++)
    {
        let s = 0;
        for (let i = l; i < x.length; i++) s += x[i] * x[i - l];
        // a slight lean towards 120 bpm, so a half or double tempo doesn't win on a tie
        s *= 1 - 0.1 * Math.abs(Math.log2(l / (fps / 2)));
        if (s > best) { best = s; lag = l; }
    }
    return lag;
}
