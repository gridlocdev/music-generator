// Questions put to the user in the window (Electron has no window.prompt): a line of text, or yes or no. The Ask
// component shows the one pending.
import { signal } from '@preact/signals';

/** the question showing: { text, value (null for yes/no), yes, resolve } */
export const asking = signal(/** @type {any} */ (null));

/** @returns {Promise<string|null>} the text entered, or null when cancelled */
export const askText = (text, value = '', yes = 'OK')=> new Promise(resolve => { asking.value = { text, value, yes, resolve }; });

/** @returns {Promise<boolean>} */
export const askYes = (text, yes = 'OK')=> new Promise(resolve => { asking.value = { text, value: null, yes, resolve: (v)=> resolve(v !== null) }; });

export function answer(v)
{
    const a = asking.value;
    asking.value = null;
    a?.resolve(v);
}
