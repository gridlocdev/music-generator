import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL, ZONES, BLEND, COINS, GUARDS, ALCOVE, EXIT, PLAYER, SONG, STINGS } from '../../src/features/adventure/adventure-data.js';
import { zoneAt, intensityAt, walk, atSecret, guardAt } from '../../src/features/adventure/level.js';
import { GAME_SONGS } from '../../src/features/composer/game-songs-data.js';
import { STINGERS } from '../../src/features/composer/adaptive-data.js';
import { compose } from '../../src/features/composer/compose.js';

test('zones run in order across the level, getting more intense', ()=>
{
    assert.equal(ZONES[0].from, 0);
    for (let i = 1; i < ZONES.length; i++)
    {
        assert.ok(ZONES[i].from - ZONES[i - 1].from > 2 * BLEND, ZONES[i].name);
        assert.ok(ZONES[i].intensity > ZONES[i - 1].intensity, ZONES[i].name);
    }
    assert.ok(ZONES.at(-1).from < EXIT.x && EXIT.x < LEVEL.length);
});

test('intensity blends smoothly across zone boundaries and matches each zone in its middle', ()=>
{
    for (let x = 0; x < LEVEL.length; x += 0.25) assert.ok(Math.abs(intensityAt(x + 0.25) - intensityAt(x)) <= 0.25 / (2 * BLEND) + 1e-9, `jump at ${x}`);
    for (const [i, z] of ZONES.entries())
        if (ZONES[i + 1]) assert.equal(intensityAt((z.from + ZONES[i + 1].from) / 2), z.intensity);
    assert.equal(zoneAt(EXIT.x), ZONES.at(-1));
});

test('walking stays in the corridor, and the alcove opens only where it is', ()=>
{
    const r = PLAYER.radius;
    assert.deepEqual(walk({ x: 10, y: 0 }, 0, 99), { x: 10, y: LEVEL.half - r });
    assert.deepEqual(walk({ x: 10, y: 0 }, -99, -99), { x: r, y: -LEVEL.half + r });
    const inside = walk({ x: (ALCOVE.from + ALCOVE.to) / 2, y: 0 }, 0, 99);
    assert.ok(atSecret(inside), 'the alcove is deep enough to find the secret');
    assert.equal(walk(inside, 10, 0).x, inside.x, 'no walking sideways through the alcove’s walls');
    assert.ok(!atSecret(walk({ x: 20, y: 0 }, 0, 99)));
});

test('everything is inside the corridor, and every cue exists', ()=>
{
    for (const [x, y] of COINS) assert.ok(x > 0 && x < LEVEL.length && Math.abs(y) < LEVEL.half);
    for (const g of GUARDS) for (let t = 0; t < 5; t += 0.1) assert.ok(Math.abs(guardAt(g, t).y) < LEVEL.half);
    for (const kind of Object.values(STINGS)) assert.ok(STINGERS[kind], kind);
    const spec = GAME_SONGS.find(s => s.id === SONG);
    assert.ok(spec?.loop, 'the level plays a looping song');
    const score = compose(spec);
    for (const z of ZONES.filter(z => z.queue)) assert.ok(score.sections.some(s => s.label === z.queue.section), z.queue.section);
});
