// The test level's rules, pure: which zone a point is in, the music's intensity there, where the walls are, what touches.
import { LEVEL, ZONES, BLEND, ALCOVE, PLAYER } from './adventure-data.js';

const clamp = (v, lo, hi)=> Math.min(hi, Math.max(lo, v));

/** the zone at an x */
export const zoneAt = (x)=> ZONES.findLast(z => z.from <= x) ?? ZONES[0];

/** the music's intensity at an x: each zone's, blended linearly across BLEND units either side of its boundary */
export function intensityAt(x)
{
    const i = ZONES.indexOf(zoneAt(x));
    const z = ZONES[i], next = ZONES[i + 1];
    if (next && x > next.from - BLEND) return z.intensity + (next.intensity - z.intensity) * (x - (next.from - BLEND)) / (2 * BLEND);
    if (i > 0 && x < z.from + BLEND) return ZONES[i - 1].intensity + (z.intensity - ZONES[i - 1].intensity) * (x - (z.from - BLEND)) / (2 * BLEND);
    return z.intensity;
}

/** a position moved by (dx, dy), kept inside the corridor, or the alcove where it opens off the north wall */
export function walk(pos, dx, dy)
{
    const r = PLAYER.radius;
    const fits = (x)=> x - r >= ALCOVE.from && x + r <= ALCOVE.to;
    // up in the alcove, its side walls stop you: back down into the corridor first
    const above = pos.y > LEVEL.half - r + 1e-9;
    const x = above && !fits(clamp(pos.x + dx, r, LEVEL.length - r)) ? pos.x : clamp(pos.x + dx, r, LEVEL.length - r);
    const top = LEVEL.half + (fits(x) ? ALCOVE.depth : 0) - r;
    return { x, y: clamp(pos.y + dy, -LEVEL.half + r, top) };
}

/** whether a position is at the alcove's back wall */
export const atSecret = (pos)=> pos.y >= LEVEL.half + ALCOVE.depth - PLAYER.radius - 0.5;

export const touching = (a, b, distance)=> (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= distance ** 2;

/** where a guard is at a time: pacing up and down its post */
export const guardAt = (g, t)=> ({ x: g.x, y: g.range * Math.sin(2 * Math.PI * g.rate * t + g.phase) });
