import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_KEY, LAST_KEY, OCTAVE_MIN, OCTAVE_MAX, DEFAULTS, MOUSE_VELOCITY, BLACK, WHITE } from '../../src/features/keyboard/keyboard-data.js';

test('the drawn range is a valid MIDI range starting and ending on C', ()=>
{
    assert.ok(FIRST_KEY >= 0 && LAST_KEY <= 127 && FIRST_KEY < LAST_KEY);
    assert.equal(FIRST_KEY % 12, 0);
    assert.equal(LAST_KEY % 12, 0);
});

test('default octave is in range', ()=> assert.ok(DEFAULTS.octave >= OCTAVE_MIN && DEFAULTS.octave <= OCTAVE_MAX));
test('velocities are MIDI velocities', ()=> assert.ok(MOUSE_VELOCITY.every(v => v >= 1 && v <= 127)));
test('black keys are smaller than white keys', ()=> assert.ok(BLACK.w < WHITE.w && BLACK.h < WHITE.h));
