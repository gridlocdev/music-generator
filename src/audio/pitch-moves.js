// The pitch moves a voice makes on top of its note. Each drives the sample's detune (cents), so they add up:
//   vibrato  a wobble that fades in after the note starts, as a player lets it in
//   scoop    start off pitch and slide onto it (the +1 trick; an octave riser; a chip zap from above)
//   arp      a tracker arpeggio: the pitch steps through a chord every few frames, one voice faking a chord

/**
 * @typedef {{ rate: number, cents: number, delay: number, ramp: number }} Vibrato
 *   pitch wobble in cents at `rate` Hz, starting `delay` seconds into the note and reaching full depth `ramp` later
 * @typedef {{ cents: number, seconds: number }} Scoop
 *   start `cents` off pitch (−100: a semitone low) and slide onto it over `seconds`
 * @typedef {{ steps: number[], seconds: number, until: number }} Arp
 *   semitones over the note to step through, `seconds` each, round and round for `until` seconds
 * @typedef {{ vibrato?: Vibrato, scoop?: Scoop, arp?: Arp }} PitchMoves
 */

/**
 * Starts a voice's pitch moves at time `t`.
 * @param {BaseAudioContext} ctx
 * @param {AudioParam} detune  the voice's source's detune
 * @param {number} t
 * @param {PitchMoves} moves
 * @returns {()=> void}  call when the voice has ended, to stop and detach what's still running
 */
export function startPitchMoves(ctx, detune, t, { vibrato, scoop, arp } = {})
{
    const running = [];
    if (vibrato)
    {
        const lfo = new OscillatorNode(ctx, { frequency: vibrato.rate });
        const depth = new GainNode(ctx, { gain: 0 });
        depth.gain.setValueAtTime(0, t + vibrato.delay);
        depth.gain.linearRampToValueAtTime(vibrato.cents, t + vibrato.delay + vibrato.ramp);
        lfo.connect(depth).connect(detune);
        lfo.start(t);
        running.push(lfo);
    }
    if (scoop)
    {
        detune.setValueAtTime(scoop.cents, t);
        detune.linearRampToValueAtTime(0, t + scoop.seconds);
    }
    let steps = null;
    if (arp?.steps.length > 1)
    {
        // its own source, added to the detune, so a scoop or a slide on the same voice still works; it stops by
        // itself at `until`, so a voice that ends early only has to detach it
        steps = new ConstantSourceNode(ctx, { offset: 0 });
        const end = t + arp.until, every = Math.max(arp.seconds, 0.005);
        for (let i = 0; t + i * every < end; i++) steps.offset.setValueAtTime(arp.steps[i % arp.steps.length] * 100, t + i * every);
        steps.connect(detune);
        steps.start(t);
        steps.stop(end);
    }
    return ()=>
    {
        for (const n of running) { n.stop(); n.disconnect(); }
        steps?.disconnect();
    };
}
