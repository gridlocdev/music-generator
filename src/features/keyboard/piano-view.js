// The on-screen piano: key layout, drawing, and which key (and how hard) a point lands on.
import { vec2, rgb, drawRect, drawText, mainCanvasSize, setCameraPos, setCameraScale } from '../../platform/engine.js';
import { isBlackKey, noteName } from '../../lib/notes.js';
import { FIRST_KEY, LAST_KEY, WHITE, BLACK, COLORS, MOUSE_VELOCITY } from './keyboard-data.js';

const color = (c)=> rgb(...c);
const TOP = WHITE.h / 2;

// x center of every key, with white keys one unit apart and black keys on the boundary between two
const keys = [];
{
    const whites = [...Array(LAST_KEY - FIRST_KEY + 1)].filter((_, i)=> !isBlackKey(FIRST_KEY + i)).length;
    let x = -whites / 2;
    for (let key = FIRST_KEY; key <= LAST_KEY; key++)
    {
        const black = isBlackKey(key);
        if (black) keys.push({ key, black, x, y: TOP - BLACK.h / 2, w: BLACK.w, h: BLACK.h });
        else { keys.push({ key, black, x: x + WHITE.w / 2, y: 0, w: WHITE.w, h: WHITE.h }); x += WHITE.w; }
    }
}
const width = keys.filter(k => !k.black).length * WHITE.w;

// fit the keyboard to the window, leaving room above for the mapped-keys bar
export function fitCamera()
{
    setCameraPos(vec2(0, 0.6));
    setCameraScale(Math.min(mainCanvasSize.x / (width + 1), mainCanvasSize.y / (WHITE.h + 6)));
}

/**
 * @param {(key: number)=> boolean} isDown
 * @param {number} mappedFrom  first MIDI key the computer keyboard plays
 * @param {(offset: number)=> string} labelFor  computer key letter for a semitone offset, or ''
 */
export function drawPiano(isDown, mappedFrom, labelFor)
{
    // white keys first so black keys draw over them
    for (const pass of [false, true])
        for (const k of keys)
        {
            if (k.black !== pass) continue;
            const down = isDown(k.key);
            const c = down ? (k.black ? COLORS.pressedBlack : COLORS.pressed) : (k.black ? COLORS.black : COLORS.white);
            drawRect(vec2(k.x, k.y - (down ? 0.06 : 0)), vec2(k.w * (k.black ? 1 : 0.94), k.h), color(c));

            const label = labelFor(k.key - mappedFrom);
            const textColor = color(k.black ? COLORS.white : COLORS.label);
            if (label) drawText(label, vec2(k.x, k.y - k.h / 2 + (k.black ? 0.5 : 1.2)), 0.42, textColor);
            if (!k.black && k.key % 12 === 0) drawText(noteName(k.key), vec2(k.x, -TOP + 0.45), 0.32, textColor);
        }

    // a bar over the keys the computer keyboard currently plays
    const mapped = keys.filter(k => labelFor(k.key - mappedFrom));
    if (mapped.length)
    {
        const left = mapped[0].x - mapped[0].w / 2, right = mapped.at(-1).x + mapped.at(-1).w / 2;
        drawRect(vec2((left + right) / 2, TOP + 0.35), vec2(right - left, 0.18), color(COLORS.mapped));
    }
}

// the key under a world position and a velocity from how far down the key it is, or null
export function keyAt(pos)
{
    // black keys sit on top, so test them first
    const hit = keys.find(k => k.black && inside(k, pos)) ?? keys.find(k => !k.black && inside(k, pos));
    if (!hit) return null;
    const depth = (TOP - pos.y) / hit.h;
    const [lo, hi] = MOUSE_VELOCITY;
    return { key: hit.key, velocity: Math.round(lo + (hi - lo) * Math.min(1, Math.max(0, depth))) };
}

const inside = (k, p)=> Math.abs(p.x - k.x) <= k.w / 2 && Math.abs(p.y - k.y) <= k.h / 2;
