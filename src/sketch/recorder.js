// One take being recorded. A melody take has a count-in and a click on the game's AudioContext; its pitch is tracked
// as it comes in, the note being whistled is shown at the playhead, and notes are firmed up about a beat behind it.
// A chord take is whistled freely, with no click: only which notes are heard matters.
import { mic } from '../platform/mic.js';
import { audioEngine } from '../platform/audio-engine.js';
import { trackPitch, gateFrames } from '../lib/pitch-track.js';
import { readLive } from '../lib/transcribe.js';
import { RECORD, CLICK, LIVE } from './sketchpad-data.js';
import { beatsPerBar } from '../daw/meter.js';

/**
 * Starts a take a moment from now. The mic must be on, sending its blocks to takeBlock.
 * @param {{ kind: 'melody'|'chord', tempo: number, meter: string, click: boolean }} o
 */
export function startRecording({ kind, tempo, meter, click })
{
    const rate = mic.rate, bpb = beatsPerBar(meter), beatSec = 60 / tempo;
    const countBeats = kind === 'melody' ? RECORD.countInBars * bpb : 0;
    return {
        kind, tempo, meter, click: kind === 'melody' && click, rate, beatSec, bpb, countBeats,
        start: audioEngine.context.currentTime + 0.15,
        // beat 0 is the first bar line after the count-in, as heard: the click reaches the ear late, the whistle the take
        origin: countBeats * beatSec + mic.latency,
        buffer: new Float32Array(rate * RECORD.maxSeconds), length: 0,
        frames: [], raw: [], nextFrame: 0, peak: 0, offset: 0, tune: { x: 0, y: 0 }, seconds: 0, playhead: 0, countIn: countBeats, nextBeat: 0,
        notes: [], gridOrigin: null, firmedAt: 0, live: null, reading: null,
    };
}

/** a block from the mic, kept from the moment the count-in starts */
export function takeBlock(r, samples, time)
{
    const skip = Math.max(0, Math.round((r.start - time) * r.rate));
    if (skip >= samples.length) return;
    const at = Math.max(0, Math.round((time - r.start) * r.rate));
    const n = Math.min(samples.length - skip, r.buffer.length - at);
    if (n > 0) r.buffer.set(samples.subarray(skip, skip + n), at);
    r.length = Math.max(r.length, at + n);
}

/** the click, the live pitch and the notes so far, once a frame; false once the take is as long as a take can be */
export function updateRecording(r)
{
    const ctx = audioEngine.context, now = ctx.currentTime;
    r.seconds = Math.max(0, now - r.start);
    // the playhead is where the click is as heard, not as scheduled, so it doesn't run ahead of the sound
    r.playhead = r.seconds - (ctx.outputLatency || 0) + mic.latency;
    r.countIn = Math.max(0, Math.ceil((r.start + r.countBeats * r.beatSec - now) / r.beatSec));
    while (r.kind === 'melody' && r.start + r.nextBeat * r.beatSec < now + RECORD.lookahead)
    {
        const i = r.nextBeat++;
        if (i < r.countBeats || r.click) tick(r.start + i * r.beatSec, i % r.bpb === 0);
    }

    // the pitch of the frames recorded since last time, gated by the take's loudest so far; kept ungated too, for the end
    const need = Math.round(r.rate * 0.02) + Math.ceil(r.rate / 300) + 2;
    if (r.length - Math.round(r.nextFrame * HOP * r.rate) >= need + HOP * r.rate)
    {
        const frames = newFrames(r);
        for (const f of frames)
        {
            r.raw.push({ ...f });
            r.peak = Math.max(r.peak, f.level);
            if (f.level < Math.max(LIVE.gate, r.peak * LIVE.gateOfPeak)) f.midi = null;
            r.frames.push(f);
            // the tuning offset as tuningOffset would give it for every frame so far, kept as a running sum
            if (f.midi !== null) { r.tune.x += Math.cos(2 * Math.PI * f.midi); r.tune.y += Math.sin(2 * Math.PI * f.midi); }
            r.offset = r.tune.x || r.tune.y ? Math.atan2(r.tune.y, r.tune.x) / (2 * Math.PI) : 0;
            follow(r, f);
        }
    }
    if (r.kind === 'melody' && r.seconds - r.firmedAt >= LIVE.firmEvery) firm(r);
    return r.length < r.buffer.length;
}

const HOP = 1 / 100;    // seconds between pitch frames: trackPitch's default rate

/** the pitch frames (ungated) of the take recorded since the last ones, at their times in the take */
function newFrames(r)
{
    const from = Math.round(r.nextFrame * HOP * r.rate);
    const frames = trackPitch(r.buffer.subarray(from, r.length), r.rate, { floor: 0 });
    for (const f of frames) f.time += from / r.rate;
    r.nextFrame += frames.length;
    return frames;
}

/** the semitone being whistled now, and since when: a faint note at the playhead until it's firmed up */
function follow(r, f)
{
    if (f.midi === null) { r.live = null; return; }
    const recent = [];
    for (let i = r.frames.length - 1; i >= 0 && recent.length < LIVE.follow; i--) if (r.frames[i].midi !== null) recent.push(r.frames[i].midi);
    recent.sort((a, b)=> a - b);
    const key = Math.round(recent[recent.length >> 1] - r.offset);
    if (r.live?.key !== key) r.live = { key, from: f.time };
}

/**
 * The notes so far, up to a beat behind the playhead: a note still sounding, or whose last 8th the smoothing hasn't
 * passed yet, waits. Once enough notes are in, the click grid is fixed and each reading reads on from about the last
 * note, so the work stays the same however long the take. A ~ comes with its note, once it's held long enough to
 * measure. The take as kept is read again, whole, when it stops.
 */
function firm(r)
{
    r.firmedAt = r.seconds;
    const cut = r.playhead - r.beatSec * LIVE.behindBeats;
    if (cut <= r.origin) return;
    r.reading = readLive(r.reading, r.frames, { tempo: r.tempo, downbeat: r.origin, upTo: cut, offset: r.offset });
    if (!r.reading) return;
    r.notes = r.reading.notes;
    r.gridOrigin = r.reading.grid.origin;
}

/** ends a take: it comes back, or null when it was too short to hold a note */
export function stopRecording(r)
{
    const samples = r.buffer.slice(0, r.length);
    if (samples.length < r.rate * (r.origin + 0.5)) return null;
    // the frames tracked while recording, and the last few since, gated as one: no second pass over the whole take
    const frames = gateFrames([...r.raw, ...newFrames(r)]);
    const take = { kind: r.kind, source: 'mic', samples, rate: r.rate, frames, tempo: r.tempo, meter: r.meter };
    return r.kind === 'melody' ? { ...take, downbeat: r.origin } : take;
}

/** a short low tick at a time on the game's AudioContext */
function tick(when, accent)
{
    const ctx = audioEngine.context;
    const osc = new OscillatorNode(ctx, { frequency: accent ? CLICK.accentHz : CLICK.hz });
    const gain = new GainNode(ctx, { gain: 0 });
    gain.gain.setValueAtTime(accent ? CLICK.accentGain : CLICK.gain, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + CLICK.seconds);
    osc.connect(gain).connect(audioEngine.output);
    osc.start(when);
    osc.stop(when + CLICK.seconds + 0.01);
}
