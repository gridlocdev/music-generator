// The Web Audio context, master volume and mastering chain. Browsers start audio suspended until a user gesture,
// so the first key press or click anywhere resumes it.
//
// master volume → a little air (high shelf) → glue compressor → peak limiter → output
// The limiter is a DynamicsCompressor, not a true brickwall, so there's no makeup gain: songs peak around −6 dB,
// which leaves room for anything played on top.
let ctx = null;
let master = null;

const AIR = { frequency: 8000, gain: 1.5 };
const GLUE = { threshold: -18, ratio: 2.5, knee: 6, attack: 0.03, release: 0.25 };
const LIMITER = { threshold: -2, ratio: 20, knee: 0, attack: 0.002, release: 0.08 };
const OUTPUT_GAIN = 0.95;

export const audioEngine = {
    get context() { return ctx ??= create(); },
    get output() { this.context; return /** @type {GainNode} */ (master); },
    get volume() { return master?.gain.value ?? 1; },
    set volume(v) { this.output.gain.value = v; },
};

function create()
{
    // 'interactive', not 'playback': the keyboard needs low latency, and songs are scheduled ahead anyway
    const c = new AudioContext({ latencyHint: 'interactive' });
    master = new GainNode(c);
    master
        .connect(new BiquadFilterNode(c, { type: 'highshelf', ...AIR }))
        .connect(new DynamicsCompressorNode(c, GLUE))
        .connect(new DynamicsCompressorNode(c, LIMITER))
        .connect(new GainNode(c, { gain: OUTPUT_GAIN }))
        .connect(c.destination);
    const resume = ()=> { if (c.state !== 'running') c.resume(); };
    for (const type of ['keydown', 'pointerdown']) addEventListener(type, resume, { capture: true });
    return c;
}
