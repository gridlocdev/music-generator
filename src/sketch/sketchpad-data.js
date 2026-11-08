// Recording a whistled take: its count-in and length, how it is read as it comes in, the click, and the band a
// melody is composed for by New from melody.

export const RECORD = {
    countInBars: 1,
    maxSeconds: 180,
    lookahead: 0.25,        // seconds of clicks scheduled ahead
};

// reading a take as it comes in
export const LIVE = {
    gate: 0.004,            // a frame quieter than this, or than gateOfPeak of the take's loudest so far, is silence
    gateOfPeak: 0.06,
    follow: 5,              // voiced frames the note at the playhead is the median of
    firmEvery: 0.25,        // seconds between readings of the notes so far
    readings: 120,          // at most this many readings in a take: a long one is read less often
    behindBeats: 1,         // notes are read up to this many beats behind the playhead: the smoothing needs 1/6 s past a note
};

// a soft, low tick: under the pitch tracker's 300 Hz, so a click the mic hears through speakers isn't read as a note
export const CLICK = { hz: 190, accentHz: 250, seconds: 0.05, gain: 0.5, accentGain: 0.8 };

// the band a sketch is heard with: the whistle as a flute, piano chords, a bass, no drums
export const SKETCH_BAND = { lead: 73, counter: null, arp: null, chords: 0, pad: 89, bass: 33, drums: null };
export const SKETCH_EMOTION = 'tender';
