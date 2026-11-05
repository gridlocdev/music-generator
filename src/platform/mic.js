// The microphone, raw: no echo cancelling, noise suppression or gain riding, which smear a whistle's pitch and level.
// Samples arrive in blocks on the game's AudioContext, stamped with its time, so a take can be lined up with a click
// scheduled on the same context. Nothing is sent anywhere; the page keeps the samples.
import { audioEngine } from './audio-engine.js';

let open = null;            // { stream, source, tap } while the mic is on

export const mic = {
    get on() { return !!open; },
    get rate() { return audioEngine.context.sampleRate; },
    /**
     * Opens the mic (the browser asks once) and calls onBlock for every block of samples.
     * @param {(samples: Float32Array, time: number)=> void} onBlock  time: the context time of the block's first sample
     */
    async start(onBlock)
    {
        if (open) this.stop();
        const ctx = audioEngine.context;
        if (ctx.state !== 'running') await ctx.resume();
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
        });
        await ctx.audioWorklet.addModule(new URL('./mic-worklet.js', import.meta.url));
        const source = ctx.createMediaStreamSource(stream);
        const tap = new AudioWorkletNode(ctx, 'mic-tap', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1, channelCountMode: 'explicit' });
        tap.port.onmessage = ({ data })=> onBlock(data.samples, data.frame / ctx.sampleRate);
        source.connect(tap);
        open = { stream, source, tap };
    },
    stop()
    {
        if (!open) return;
        open.source.disconnect();
        open.tap.port.onmessage = null;
        for (const t of open.stream.getTracks()) t.stop();
        open = null;
    },
    /** the delay between a sound scheduled on the context and its echo arriving back in a take, as far as the browser knows */
    get latency()
    {
        const ctx = audioEngine.context;
        return (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    },
    /** an audio file (any format the browser plays) as mono samples at the context's rate */
    async decode(bytes)
    {
        const buffer = await audioEngine.context.decodeAudioData(bytes);
        const out = new Float32Array(buffer.length);
        for (let c = 0; c < buffer.numberOfChannels; c++)
        {
            const ch = buffer.getChannelData(c);
            for (let i = 0; i < out.length; i++) out[i] += ch[i] / buffer.numberOfChannels;
        }
        return { samples: out, rate: buffer.sampleRate };
    },
};
