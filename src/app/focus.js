// Which part of the window the editing keys (Delete, arrows, Cmd+A) act on: the last one clicked.
import { signal } from '@preact/signals';

export const focus = signal(/** @type {'arrange'|'chords'|'roll'} */ ('arrange'));
