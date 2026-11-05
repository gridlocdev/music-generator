// Every feature, in build/update order. Adding a feature = one import and one entry here.
import keyboard from './keyboard/index.js';
import composer from './composer/index.js';
import adventure from './adventure/index.js';
import sketchpad from './sketchpad/index.js';

export const features = [
    keyboard,
    composer,
    adventure,
    sketchpad,
];
