// Draws the test level from above: the corridor's zones, the alcove, coins, pacing guards, the exit and you.
// The camera follows you along the corridor and fits its height to the space under the control bars.
import { vec2, rgb, drawRect, drawCircle, mainCanvasSize, setCameraPos, setCameraScale } from '../../platform/engine.js';
import { LEVEL, ZONES, GUARDS, GUARD, ALCOVE, EXIT, PLAYER } from './adventure-data.js';
import { guardAt } from './level.js';

const MARGIN = 2;               // world units of wall shown above and below
const WALL = rgb(0.07, 0.065, 0.09), COIN = rgb(1, 0.82, 0.3), GUARD_COLOR = rgb(0.95, 0.35, 0.35);
const YOU = rgb(0.55, 0.85, 1), EXIT_COLOR = rgb(0.5, 0.95, 0.6), ALCOVE_FLOOR = rgb(0.25, 0.22, 0.32);

/**
 * @param {{ player: { x: number, y: number }, time: number, coins: { x: number, y: number, taken: boolean }[], safeUntil: number }} s
 * @param {number} top  pixels the control bars cover at the top of the canvas
 */
export function drawLevel(s, top)
{
    const W = mainCanvasSize.x, H = mainCanvasSize.y;
    const height = 2 * LEVEL.half + ALCOVE.depth + 2 * MARGIN;
    const scale = Math.max(1, (H - top) / height);
    const viewW = W / scale;
    const camX = Math.min(Math.max(s.player.x, viewW / 2), Math.max(viewW / 2, LEVEL.length - viewW / 2));
    // centre the corridor and alcove in the space below the bars
    setCameraScale(scale);
    setCameraPos(vec2(camX, ALCOVE.depth / 2 + top / 2 / scale));

    const box = (x0, x1, y0, y1, c)=> drawRect(vec2((x0 + x1) / 2, (y0 + y1) / 2), vec2(x1 - x0, y1 - y0), c);
    box(-viewW, LEVEL.length + viewW, -LEVEL.half - MARGIN - 50, LEVEL.half + ALCOVE.depth + MARGIN + 50, WALL);
    ZONES.forEach((z, i)=> box(z.from, ZONES[i + 1]?.from ?? LEVEL.length, -LEVEL.half, LEVEL.half, rgb(...z.floor)));
    box(ALCOVE.from, ALCOVE.to, LEVEL.half, LEVEL.half + ALCOVE.depth, ALCOVE_FLOOR);
    box(EXIT.x, LEVEL.length, -LEVEL.half, LEVEL.half, EXIT_COLOR.scale(0.5, 1));
    // a line at each zone boundary, where the music starts to change
    for (const z of ZONES.slice(1)) box(z.from - 0.05, z.from + 0.05, -LEVEL.half, LEVEL.half, rgb(1, 1, 1, 0.12));

    for (const c of s.coins) if (!c.taken) drawCircle(vec2(c.x, c.y + 0.15 * Math.sin(s.time * 4 + c.x)), 0.8, COIN);
    for (const g of GUARDS) { const p = guardAt(g, s.time); drawCircle(vec2(p.x, p.y), GUARD.radius * 2, GUARD_COLOR); }
    // you blink while a guard's hit still protects you
    const safe = s.time < s.safeUntil;
    if (!safe || Math.floor(s.time * 10) % 2) drawCircle(vec2(s.player.x, s.player.y), PLAYER.radius * 2, YOU);
}
