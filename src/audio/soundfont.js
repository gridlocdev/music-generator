// Plays SoundFont presets through Web Audio: loads and caches .sf2 files, then turns notes into voices
// (sample → optional low-pass → volume envelope → optional pan → instrument output).
import { parseSf2, regionsFor } from '../lib/sf2.js';
import { voiceParams, envelopeLevel, ENV_TIME_CONSTANTS } from '../lib/sf2-voice.js';
import { audioEngine } from '../platform/audio-engine.js';

const MAX_VOICES = 96;          // oldest voices are cut beyond this, released or not
const MIN_RELEASE = 0.03;       // seconds; shorter releases click
const MIN_ATTACK = 0.002;       // seconds; an instant attack clicks
const FAST_RELEASE = 0.01;      // seconds; for stolen, retriggered and choked voices
const BUFFER_BUDGET = 256e6;    // bytes of decoded Float32 samples kept across all fonts

const fonts = new Map();        // url → { promise, listeners: Set<onProgress> }
const active = [];              // every sounding voice, oldest first

/**
 * Downloads and parses a .sf2 file once; later calls share the same load and all get progress.
 * @param {string} url
 * @param {(loaded: number, total: number)=> void} [onProgress]
 */
export function loadSoundFont(url, onProgress)
{
    let load = fonts.get(url);
    if (!load)
    {
        const listeners = new Set();
        const promise = download(url, (loaded, total)=> { for (const fn of listeners) fn(loaded, total); })
            .then(buffer => ({ url, ...parseSf2(buffer) }));
        promise.catch(()=> fonts.delete(url)).finally(()=> listeners.clear());   // a failed load can be retried
        fonts.set(url, load = { promise, listeners });
    }
    if (onProgress) load.listeners.add(onProgress);
    return load.promise;
}

async function download(url, onProgress)
{
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`${url}: ${res.status} ${res.statusText}`);
    // content-length is the compressed size when the server compresses, so it's only a first guess
    const total = Number(res.headers.get('content-length')) || 0;
    let bytes = new Uint8Array(total || 1 << 24);
    let loaded = 0;
    const reader = res.body.getReader();
    for (;;)
    {
        const { done, value } = await reader.read();
        if (done) break;
        if (loaded + value.length > bytes.length)
        {
            const grown = new Uint8Array(Math.max(bytes.length * 2, loaded + value.length));
            grown.set(bytes.subarray(0, loaded));
            bytes = grown;
        }
        bytes.set(value, loaded);
        loaded += value.length;
        if (total) onProgress?.(Math.min(loaded, total), total);
    }
    return loaded === bytes.length ? bytes.buffer : bytes.buffer.slice(0, loaded);
}

export function findPreset(font, bank, program)
{
    return font.presets.find(p => p.bank === bank && p.program === program) ?? null;
}

/**
 * One playable instrument: a preset from a loaded font, with its own output and sustain pedal.
 */
export function createInstrument(font, preset)
{
    const ctx = audioEngine.context;
    const output = ctx.createGain();
    output.connect(audioEngine.output);
    const held = new Map();         // key → voices started by that key
    const sustained = new Set();    // voices whose key is up but the pedal holds them
    let pedal = false;

    return {
        preset,
        noteOn(key, velocity = 100)
        {
            this.noteOff(key, true);
            const voices = regionsFor(preset, key, velocity).map(r => startVoice(font, voiceParams(r, key, velocity), output));
            // a new voice in an exclusive class chokes the others in it (open/closed hi-hat)
            for (const v of voices)
                if (v.exclusiveClass)
                    for (const other of active)
                        if (other.output === output && other.exclusiveClass === v.exclusiveClass && !voices.includes(other)) other.release(true);
            held.set(key, voices);
        },
        // fast = cut it short (retriggering the same key), ignoring the pedal
        noteOff(key, fast = false)
        {
            for (const v of held.get(key) ?? []) pedal && !fast ? sustained.add(v) : v.release(fast);
            held.delete(key);
        },
        setSustain(on)
        {
            pedal = on;
            if (on) return;
            for (const v of sustained) v.release();
            sustained.clear();
        },
        // stop everything, including release tails, and detach; the instrument can't be used afterwards
        dispose()
        {
            held.clear();
            sustained.clear();
            for (const v of active) if (v.output === output) v.release(true);
            setTimeout(()=> output.disconnect(), (FAST_RELEASE + 0.1) * 1000);
        },
    };
}

function startVoice(font, p, output)
{
    const ctx = audioEngine.context;
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = sampleBuffer(font, p.start, p.end, p.sampleRate);
    const rate = source.buffer.sampleRate;
    // the buffer's rate differs from the sample's only when that was out of range (see sampleBuffer)
    source.playbackRate.value = p.playbackRate * (p.sampleRate > 0 ? p.sampleRate / rate : 1);
    if ((p.loopMode === 1 || p.loopMode === 3) && p.loopEnd > p.loopStart)
    {
        source.loop = true;
        source.loopStart = (p.loopStart - p.start) / rate;
        source.loopEnd = (p.loopEnd - p.start) / rate;
    }

    let node = /** @type {AudioNode} */ (source);
    if (p.filter)
    {
        const filter = ctx.createBiquadFilter();
        filter.frequency.value = Math.min(p.filter.hz, ctx.sampleRate / 2);
        filter.Q.value = p.filter.q;
        node = node.connect(filter);
    }

    // DAHDS of the volume envelope; R happens in release()
    const env = ctx.createGain();
    const { delay, attack, hold, decay, sustain } = p.env;
    const peak = p.gain;
    const attackEnd = t + delay + Math.max(attack, MIN_ATTACK);
    env.gain.setValueAtTime(0, t);
    env.gain.setValueAtTime(0, t + delay);
    env.gain.linearRampToValueAtTime(peak, attackEnd);
    env.gain.setValueAtTime(peak, attackEnd + hold);
    env.gain.setTargetAtTime(peak * sustain, attackEnd + hold, Math.max(decay, 0.001) / ENV_TIME_CONSTANTS);
    node = node.connect(env);

    if (p.pan)
    {
        const pan = ctx.createStereoPanner();
        pan.pan.value = p.pan;
        node = node.connect(pan);
    }
    node.connect(output);
    source.start(t);

    // where the release started, so a later fast release can pick up from the level it had reached
    let releasedAt = -1, releaseLevel = 0, releaseTime = 0;
    const level = (now)=> releasedAt < 0
        ? envelopeLevel(p.env, peak, now - t, MIN_ATTACK)
        : releaseLevel * Math.exp(-(now - releasedAt) * ENV_TIME_CONSTANTS / releaseTime);

    const voice = {
        output,
        exclusiveClass: p.exclusiveClass,
        // true once cut short; a voice in a normal release can still be cut short
        stopping: false,
        release(fast = false)
        {
            if (voice.stopping || (releasedAt >= 0 && !fast)) return;
            const now = ctx.currentTime;
            releaseLevel = level(now);
            releasedAt = now;
            releaseTime = fast ? FAST_RELEASE : Math.max(p.env.release, MIN_RELEASE);
            voice.stopping = fast;
            env.gain.cancelScheduledValues(now);
            env.gain.setValueAtTime(releaseLevel, now);
            env.gain.setTargetAtTime(0, now, releaseTime / ENV_TIME_CONSTANTS);
            if (p.loopMode === 3) source.loop = false;      // play the sample's tail after the loop
            source.stop(now + releaseTime + 0.05);
        },
    };
    source.onended = ()=>
    {
        voice.stopping = true;
        env.disconnect();
        const i = active.indexOf(voice);
        if (i >= 0) active.splice(i, 1);
    };
    active.push(voice);

    // steal the oldest voices past the limit; voices already being cut short don't count
    let over = active.filter(v => !v.stopping).length - MAX_VOICES;
    for (const v of active)
    {
        if (over <= 0) break;
        if (!v.stopping && v !== voice) { v.release(true); over--; }
    }
    return voice;
}

// Decoded samples, least recently used first, shared by all fonts and trimmed to BUFFER_BUDGET.
// Voices keep their own reference, so dropping an entry never cuts a sounding note.
const buffers = new Map();
let bufferBytes = 0;

function sampleBuffer(font, start, end, sampleRate)
{
    const id = `${font.url}:${start}:${end}:${sampleRate}`;
    let buf = buffers.get(id);
    if (buf)
    {
        buffers.delete(id);     // re-insert as most recently used
        buffers.set(id, buf);
        return buf;
    }
    const frames = font.sampleData.subarray(start, Math.max(start + 1, end));
    // AudioBuffer accepts 8–96 kHz everywhere; a sample outside that is stored at 44.1k and sped up to match
    const rate = sampleRate >= 8000 && sampleRate <= 96000 ? sampleRate : 44100;
    buf = new AudioBuffer({ length: frames.length, sampleRate: rate, numberOfChannels: 1 });
    const out = buf.getChannelData(0);
    for (let i = 0; i < frames.length; i++) out[i] = frames[i] / 32768;
    buffers.set(id, buf);
    bufferBytes += frames.length * 4;
    for (const [oldId, old] of buffers)
    {
        if (bufferBytes <= BUFFER_BUDGET || oldId === id) break;
        buffers.delete(oldId);
        bufferBytes -= old.length * 4;
    }
    return buf;
}
