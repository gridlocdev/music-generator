// The sketchpad's defaults, how a take is read as it comes in, the click, and the band a sketch is heard with.

export const DEFAULTS = {
    tempo: 70,              // the tempo you whistle at: slower than the song is fine, the notation counts beats
    songTempo: 96,          // the tempo the sketch plays back at
    meter: '4/4',
    click: true,            // keep clicking after the count-in
    name: 'sketch',         // the ideas/ folder a sketch is saved to
};

export const METERS = ['4/4', '3/4', '2/4', '6/8'];

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
    behindBeats: 1,         // notes are read up to this many beats behind the playhead: the smoothing needs 1/6 s past a note
};

// a soft, low tick: under the pitch tracker's 300 Hz, so a click the mic hears through speakers isn't read as a note
export const CLICK = { hz: 190, accentHz: 250, seconds: 0.05, gain: 0.5, accentGain: 0.8 };

// the band a sketch is heard with: the whistle as a flute, piano chords, a bass, no drums
export const SKETCH_BAND = { lead: 73, counter: null, arp: null, chords: 0, pad: 89, bass: 33, drums: null };
export const SKETCH_EMOTION = 'tender';

// the view
export const VIEW = {
    gutter: 46,             // px of note names at the left
    chordStrip: 26,         // px of chord names above the lanes
    liveSeconds: 8,         // seconds shown while recording
    range: [64, 98],        // MIDI keys shown before a take says otherwise (E4–D7, a whistle's usual range)
    minLanes: 18,
};
