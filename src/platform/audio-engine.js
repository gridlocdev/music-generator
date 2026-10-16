// The Web Audio context and master volume. Browsers start audio suspended until a user gesture,
// so the first key press or click anywhere resumes it.
let ctx = null;
let master = null;

export const audioEngine = {
    get context() { return ctx ??= create(); },
    get output() { this.context; return /** @type {GainNode} */ (master); },
    get volume() { return master?.gain.value ?? 1; },
    set volume(v) { this.output.gain.value = v; },
};

function create()
{
    const c = new AudioContext({ latencyHint: 'interactive' });
    master = c.createGain();
    master.connect(c.destination);
    const resume = ()=> { if (c.state !== 'running') c.resume(); };
    for (const type of ['keydown', 'pointerdown']) addEventListener(type, resume, { capture: true });
    return c;
}
