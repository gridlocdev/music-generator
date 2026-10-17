import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beatToSeconds, secondsToBeat, bpmAt, tempoSteps } from '../../src/lib/tempo-map.js';

const close = (a, b, msg)=> assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} ≠ ${b}`);

test('a steady tempo is beats × 60 / bpm, before and after beat 0', ()=>
{
    const map = [{ beat: 0, bpm: 120 }];
    close(beatToSeconds(map, 8), 4);
    close(beatToSeconds(map, -1), -0.5);
    close(secondsToBeat(map, 4), 8);
});

test('tempo changes and ramps add up, and seconds convert back to the same beat', ()=>
{
    const map = [{ beat: 0, bpm: 120 }, { beat: 8, bpm: 60, to: 30 }, { beat: 12, bpm: 30 }];
    close(beatToSeconds(map, 8), 4);
    // a ramp from 60 to 30 over 4 beats: 60/k · ln(30/60) with k = −7.5 bpm per beat
    close(beatToSeconds(map, 12), 4 + 60 / -7.5 * Math.log(0.5));
    close(bpmAt(map, 10), 45);
    for (const b of [0, 3, 8, 9.5, 12, 20]) close(secondsToBeat(map, beatToSeconds(map, b)), b, `beat ${b}`);
    assert.ok(beatToSeconds(map, 12) - beatToSeconds(map, 8) > 4, 'slowing down takes longer than a steady 60');
});

test('ramps become one tempo change per beat for a MIDI file', ()=>
{
    const steps = tempoSteps([{ beat: 0, bpm: 100 }, { beat: 4, bpm: 100, to: 80 }, { beat: 6, bpm: 80 }]);
    assert.deepEqual(steps.map(s => s.beat), [0, 4, 5, 6]);
    close(steps[1].bpm, 95);
    close(steps[3].bpm, 80);
});
