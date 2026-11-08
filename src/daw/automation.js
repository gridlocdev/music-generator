// Automation lanes: keyframes a value moves through. Pure.

/**
 * a keyframed value at a beat, interpolated the way Web Audio ramps it
 * @param {import('./project.js').Keyframe[]} frames
 * @param {number} beat
 */
export function valueAt(frames, beat)
{
    const i = frames.findLastIndex(f => f.beat <= beat);
    if (i < 0) return frames[0].value;
    const a = frames[i], b = frames[i + 1];
    if (!b || b.curve === 'set' || b.beat <= a.beat) return a.value;
    const p = (beat - a.beat) / (b.beat - a.beat);
    return b.curve === 'exp' ? a.value * (b.value / a.value) ** p : a.value + (b.value - a.value) * p;
}
