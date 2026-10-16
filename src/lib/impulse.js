// A synthetic reverb impulse response: stereo noise under a decaying envelope. Seeded, so every run
// builds the same room. Pure: returns Float32Arrays for an AudioBuffer or ConvolverNode.

/**
 * @param {number} sampleRate
 * @param {{ seconds?: number, decay?: number, seed?: number }} [opts]  decay: power of the fade (higher dies sooner)
 * @returns {[Float32Array, Float32Array]}
 */
export function reverbImpulse(sampleRate, { seconds = 2.2, decay = 3, seed = 1 } = {})
{
    const length = Math.max(1, Math.round(sampleRate * seconds));
    const channels = /** @type {[Float32Array, Float32Array]} */ ([new Float32Array(length), new Float32Array(length)]);
    let s = (seed >>> 0) || 1;
    // xorshift32: small, fast, and the same everywhere
    const noise = ()=> { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 2 ** 31 - 1; };
    for (const d of channels)
        for (let i = 0; i < length; i++) d[i] = noise() * (1 - i / length) ** decay;
    return channels;
}
