// Runs on the audio thread: passes the microphone's samples to the page in blocks, each with the context frame it
// started on, so a take lines up with anything scheduled on the same AudioContext (the click). Loaded by mic.js.
const BLOCK = 2048;

class MicTap extends AudioWorkletProcessor
{
    constructor()
    {
        super();
        this.buffer = new Float32Array(BLOCK);
        this.filled = 0;
        this.start = 0;
    }
    process(inputs)
    {
        const input = inputs[0][0];
        if (!input) return true;
        if (this.filled === 0) this.start = currentFrame;
        this.buffer.set(input, this.filled);
        this.filled += input.length;
        if (this.filled + 128 > BLOCK)
        {
            this.port.postMessage({ frame: this.start, samples: this.buffer.slice(0, this.filled) });
            this.filled = 0;
        }
        return true;
    }
}
registerProcessor('mic-tap', MicTap);
