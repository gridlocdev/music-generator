// The pitch moves a voice makes on top of its note. Each drives the sample's detune (cents), so they add up:
//   vibrato  a wobble that fades in after the note starts, as a player lets it in
//   scoop    start off pitch and slide onto it (the +1 trick; an octave riser; a chip zap from above)
//   arp      a tracker arpeggio: the pitch steps through a chord every few frames, one voice faking a chord
//   fall     the pitch drops away at the end of a note, as a chip lead's falls off a phrase

/**
 * @typedef {{ rate: number, cents: number, delay: number, ramp: number }} Vibrato
 *   pitch wobble in cents at `rate` Hz, starting `delay` seconds into the note and reaching full depth `ramp` later
 * @typedef {{ cents: number, seconds: number }} Scoop
 *   start `cents` off pitch (−100: a semitone low) and slide onto it over `seconds`
 * @typedef {{ steps: number[], seconds: number, until: number }} Arp
 *   semitones over the note to step through, `seconds` each, round and round for `until` seconds
 * @typedef {{ cents: number, seconds: number, at: number }} Fall
 *   from `at` seconds into the note, slide `cents` off pitch (−1200: an octave down) over `seconds`
 * @typedef {{ vibrato?: Vibrato, scoop?: Scoop, arp?: Arp, fall?: Fall }} PitchMoves
 */

/**
 * Starts a voice's pitch moves at time `t`.
 * @param {BaseAudioContext} ctx
 * @param {AudioParam} detune  the voice's source's detune
 * @param {number} t
 * @param {PitchMoves} moves
 * @returns {()=> void}  call when the voice has ended, to stop and detach what's still running
 */
export function startPitchMoves(ctx, detune, t, { vibrato, scoop, arp, fall } = {})
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
    // arpeggio steps and falls: their own source, added to the detune, so a scoop or a slide on the same voice still
    // works; it stops by itself once they're over, so a voice that ends early only has to detach it
    const tracker = arp?.steps.length > 1 ? arp : null;
    let offset = null;
    if (tracker || fall)
    {
        offset = new ConstantSourceNode(ctx, { offset: 0 });
        const o = offset.offset;
        let end = t;
        if (tracker)
        {
            const every = Math.max(tracker.seconds, 0.005);
            end = t + tracker.until;
            for (let i = 0; t + i * every < end; i++) o.setValueAtTime(tracker.steps[i % tracker.steps.length] * 100, t + i * every);
        }
        if (fall)
        {
            o.setValueAtTime(0, t + fall.at);
            o.linearRampToValueAtTime(fall.cents, t + fall.at + fall.seconds);
            end = Math.max(end, t + fall.at + fall.seconds + 1);
        }
        offset.connect(detune);
        offset.start(t);
        offset.stop(end);
    }
    return ()=>
    {
        for (const n of running) { n.stop(); n.disconnect(); }
        offset?.disconnect();
    };
}
