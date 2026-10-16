// MIDI note numbers: names and piano key colors. Middle C is 60, named C4.
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];

export const noteName = (key)=> NAMES[key % 12] + (Math.floor(key / 12) - 1);
export const isBlackKey = (key)=> BLACK[key % 12];
// MIDI key of C in an octave, so octave 4 → 60
export const octaveC = (octave)=> (octave + 1) * 12;
