// 16-bit PCM WAV files: mono for whistled takes, stereo for a bounced project. Pure.

/** @param {Float32Array} samples -1..1  @returns {Uint8Array} */
export const encodeWav = (samples, rate)=> encodeWavChannels([samples], rate);

/** channels interleaved, each -1..1 and the same length  @param {Float32Array[]} channels  @returns {Uint8Array} */
export function encodeWavChannels(channels, rate)
{
    const k = channels.length, n = channels[0].length, bytes = n * k * 2;
    const out = new Uint8Array(44 + bytes), v = new DataView(out.buffer);
    const text = (at, s)=> [...s].forEach((c, i)=> v.setUint8(at + i, c.charCodeAt(0)));
    text(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); text(8, 'WAVE');
    text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, k, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * k * 2, true); v.setUint16(32, k * 2, true); v.setUint16(34, 16, true);
    text(36, 'data'); v.setUint32(40, bytes, true);
    for (let i = 0, at = 44; i < n; i++)
        for (let c = 0; c < k; c++, at += 2) v.setInt16(at, Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 0x7fff), true);
    return out;
}
