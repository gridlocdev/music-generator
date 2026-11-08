// The shortcuts the page answers: the plain keys (which must still type in a text field), and the Cmd ones too where
// there's no menu bar.
import { appMenu } from '../platform/app-menu.js';
import { typing } from '../platform/keys.js';
import { COMMANDS, busy } from './commands.js';

const CODES = { Space: 'Space', Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight', End: 'End', '=': 'Equal', '-': 'Minus', Return: 'Enter', ',': 'Comma', '.': 'Period', Escape: 'Escape', Backspace: 'Backspace' };
const codeOf = (key)=> CODES[key] ?? (/^\d$/.test(key) ? `Digit${key}` : `Key${key}`);

function parse(keys, id)
{
    const parts = keys.split('+');
    return { code: codeOf(parts.at(-1)), shift: parts.includes('Shift'), alt: parts.includes('Alt'), cmd: parts.includes('CmdOrCtrl'), id };
}

/** the shortcuts the page answers: the plain keys, and the Cmd ones too where there's no menu bar */
const KEYS = Object.entries(COMMANDS).flatMap(([id, c])=> [c.shown && parse(c.shown, id), !appMenu.native && c.accelerator && parse(c.accelerator, id)]).filter(Boolean);

/** answers a key the menu bar doesn't: true when it did something */
export function handleKey(e)
{
    if (busy()) return false;
    const code = e.code === 'Delete' ? 'Backspace' : e.code, cmd = e.metaKey || e.ctrlKey;
    const k = KEYS.find(x => x.code === code && x.shift === e.shiftKey && x.alt === e.altKey && x.cmd === cmd);
    // a text field keeps its own keys, and its own undo, copy and paste
    if (!k || (typing() && (!k.cmd || COMMANDS[k.id].text))) return false;
    if (e.repeat && !['up', 'down', 'octaveUp', 'octaveDown', 'nudgeLeft', 'nudgeRight', 'prevBar', 'nextBar'].includes(k.id)) return false;
    const c = COMMANDS[k.id];
    if (c.enabled && !c.enabled()) return false;
    c.run();
    return true;
}
