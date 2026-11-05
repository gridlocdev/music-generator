// Mono 16-bit PCM WAV files, to save whistled takes. Pure.

/** @param {Float32Array} samples -1..1  @returns {Uint8Array} */
export function encodeWav(samples, rate)
{
    const n = samples.length, out = new Uint8Array(44 + n * 2), v = new DataView(out.buffer);
    const text = (at, s)=> [...s].forEach((c, i)=> v.setUint8(at + i, c.charCodeAt(0)));
    text(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); text(8, 'WAVE');
    text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    text(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 0x7fff), true);
    return out;
}
