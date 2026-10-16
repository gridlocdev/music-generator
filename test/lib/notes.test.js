import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteName, isBlackKey, octaveC } from '../../src/lib/notes.js';

test('names middle C C4', ()=> assert.equal(noteName(60), 'C4'));
test('names sharps', ()=> assert.equal(noteName(61), 'C#4'));
test('knows black keys', ()=> assert.deepEqual([60, 61, 62, 63, 64, 65, 66].map(isBlackKey), [false, true, false, true, false, false, true]));
test('octave 4 starts at middle C', ()=> assert.equal(octaveC(4), 60));
