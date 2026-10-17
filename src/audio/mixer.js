// A song's mixer: one channel strip per part, and a shared reverb and tempo-synced delay that every strip sends into,
// so the parts sound like they're in one room. Everything sums on a mix bus with headroom, then goes through the
// mastering chain in platform/audio-engine.js.
//
// strip: input → layer → low cut → tone (low-pass, for sweeps) → fader → pan (auto-pan LFO) → mix bus
//                                                                         ├→ reverb send → reverb → low cut → mix bus
//                                                                         └→ delay send → delay ⟲ (darker each repeat) → mix bus
// The layer gain is for adaptive music: a part fades in and out with gameplay intensity without touching its fader,
// which ducking moves. The delay time wobbles slowly (a modulated delay), so the echoes shimmer a little.
import { audioEngine } from '../platform/audio-engine.js';
import { reverbImpulse } from '../lib/impulse.js';

export const dbToGain = (db)=> 10 ** (db / 20);

const MIX_BUS_DB = -3;          // headroom before the master chain
const REVERB = { seconds: 2.2, decay: 3, lowCut: 250 };            // lowCut keeps the low end out of the reverb
const DELAY = { beats: 0.75, feedback: 0.35, tone: 3500, wobble: { rate: 0.3, seconds: 0.003 } };   // a dotted eighth; tone darkens the repeats
const OPEN_TONE = 20000;         // Hz; the tone filter's resting cutoff, until automation moves it

let impulse = null;             // built once; every song's reverb shares it

/** @param {{ tempo: number }} opts */
export function createMixer({ tempo })
{
    const ctx = audioEngine.context;
    if (!impulse || impulse.sampleRate !== ctx.sampleRate)
    {
        const channels = reverbImpulse(ctx.sampleRate, REVERB);
        impulse = new AudioBuffer({ length: channels[0].length, numberOfChannels: 2, sampleRate: ctx.sampleRate });
        channels.forEach((d, i)=> impulse.copyToChannel(d, i));
    }
    const nodes = [], lfos = [];
    const node = (n)=> (nodes.push(n), n);
    // a slow sine into a parameter, on top of its own value
    const lfo = (param, rate, depth)=>
    {
        const osc = node(new OscillatorNode(ctx, { frequency: rate }));
        osc.connect(node(new GainNode(ctx, { gain: depth }))).connect(param);
        osc.start();
        lfos.push(osc);
    };

    const bus = node(new GainNode(ctx, { gain: dbToGain(MIX_BUS_DB) }));
    bus.connect(audioEngine.output);

    const reverbIn = node(new GainNode(ctx));
    reverbIn.connect(node(new ConvolverNode(ctx, { buffer: impulse })))
        .connect(node(new BiquadFilterNode(ctx, { type: 'highpass', frequency: REVERB.lowCut })))
        .connect(bus);

    const delayIn = node(new GainNode(ctx));
    const delay = node(new DelayNode(ctx, { delayTime: Math.min(4, DELAY.beats * 60 / tempo), maxDelayTime: 4 }));
    const dark = node(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: DELAY.tone }));
    delayIn.connect(delay).connect(dark).connect(node(new GainNode(ctx, { gain: DELAY.feedback }))).connect(delay);
    dark.connect(bus);
    lfo(delay.delayTime, DELAY.wobble.rate, DELAY.wobble.seconds);

    return {
        /**
         * @param {{ volumeDb?: number, pan?: number, lowCut?: number, reverb?: number, delay?: number,
         *   autoPan?: { rate: number, depth: number } }} strip  reverb and delay are send levels, 0..1
         */
        channel({ volumeDb = -6, pan = 0, lowCut = 20, reverb = 0, delay: delaySend = 0, autoPan = null } = {})
        {
            const input = node(new GainNode(ctx));
            const layer = node(new GainNode(ctx));
            const tone = node(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: OPEN_TONE, Q: 0 }));
            const level = dbToGain(volumeDb);
            const fader = node(new GainNode(ctx, { gain: level }));
            const panner = node(new StereoPannerNode(ctx, { pan }));
            const reverbSend = node(new GainNode(ctx, { gain: reverb }));
            const delaySendGain = node(new GainNode(ctx, { gain: delaySend }));
            input.connect(layer).connect(node(new BiquadFilterNode(ctx, { type: 'highpass', frequency: lowCut })))
                .connect(tone).connect(fader).connect(panner).connect(bus);
            panner.connect(reverbSend).connect(reverbIn);
            panner.connect(delaySendGain).connect(delayIn);
            if (autoPan) lfo(panner.pan, autoPan.rate, autoPan.depth);
            return { input, layer, tone, fader, reverbSend, delaySend: delaySendGain, level };
        },
        // a quick fade so nothing clicks, then everything is disconnected, tails included
        dispose(fade = 0.08)
        {
            const now = ctx.currentTime;
            bus.gain.cancelScheduledValues(now);
            bus.gain.setValueAtTime(bus.gain.value, now);
            bus.gain.linearRampToValueAtTime(0, now + fade);
            setTimeout(()=> { for (const o of lfos) o.stop(); for (const n of nodes) n.disconnect(); }, fade * 1000 + 50);
        },
    };
}
