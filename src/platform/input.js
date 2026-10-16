// Raw keys → named actions, so game code never names a key.
// Two rows of the computer keyboard play like a piano: A S D F G H J K L ; ' are white keys,
// W E  T Y U  O P the black keys between them (same layout as most DAWs).
import { keyIsDown, keyWasPressed } from './engine.js';

// key code → semitones above the current octave's C
const NOTE_KEYS = {
    KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9,
    KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};
const LABELS = Object.fromEntries(Object.entries(NOTE_KEYS).map(([code, n])=>
    [n, code === 'Semicolon' ? ';' : code === 'Quote' ? "'" : code.slice(3)]));
const entries = Object.entries(NOTE_KEYS);

export const input = {
    // semitone offsets whose keys went down this frame, and whether one is still held
    notesPressed() { return entries.filter(([c])=> keyWasPressed(c)).map(([, n])=> n); },
    noteHeld(offset) { return entries.some(([c, n])=> n === offset && keyIsDown(c)); },
    noteLabel(offset) { return LABELS[offset] ?? ''; },
    octaveStep() { return +keyWasPressed('KeyX') - +keyWasPressed('KeyZ'); },
    focusInstruments() { return keyWasPressed('KeyI'); },
    instrumentStep() { return +keyWasPressed('ArrowDown') - +keyWasPressed('ArrowUp'); },
    sustain() { return keyIsDown('Space'); },
};
