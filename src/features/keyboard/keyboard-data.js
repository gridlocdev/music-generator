// Content only: ranges, defaults and colors for the playable keyboard. Imports nothing.
export const FIRST_KEY = 36;            // C2, the lowest key drawn
export const LAST_KEY = 96;             // C7, the highest key drawn
export const OCTAVE_MIN = 1;            // octave range the computer keys can shift through
export const OCTAVE_MAX = 7;
export const DEFAULTS = { library: '', bank: 0, program: 0, octave: 4, volume: 0.8 };
export const KEY_VELOCITY = 100;        // computer keys have no velocity; mouse velocity comes from where you click
export const MOUSE_VELOCITY = [40, 127];        // top of a key → bottom
export const SUSTAIN_CC = 64;           // MIDI controller number of the sustain pedal

// white key size in world units; black keys are a fraction of it
export const WHITE = { w: 1, h: 6 };
export const BLACK = { w: 0.62, h: 3.8 };
export const COLORS = {
    white: [0.93, 0.92, 0.9],
    black: [0.12, 0.11, 0.16],
    pressed: [0.45, 0.8, 1],
    pressedBlack: [0.25, 0.55, 0.85],
    mapped: [1, 0.78, 0.4],             // bar over the keys the computer keyboard plays
    label: [0.35, 0.33, 0.4],
};
