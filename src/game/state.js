// Game mode and the save. Each feature owns one slice; nothing else writes it.
import { storage } from '../platform/storage.js';

const SAVE_KEY = 'soundfont-player-save-v1';
storage.keys.push(SAVE_KEY);

/** @type {Record<string, any>} */
let data = {};

export const state = {
    mode: 'title',          // 'title' | 'play'
    load()
    {
        try { data = JSON.parse(storage.get(SAVE_KEY) ?? '{}') ?? {}; } catch { data = {}; }
        migrate(data);
    },
    // returns the live slice object, filling in missing defaults in place,
    // so every caller gets the same object and writes are never lost
    slice(name, defaults = {})
    {
        const s = data[name] ??= {};
        for (const [k, v] of Object.entries(defaults)) if (!(k in s)) s[k] = structuredClone(v);
        return s;
    },
    write() { storage.set(SAVE_KEY, JSON.stringify(data)); },
    // slices held by features still point at the old data, so reload the page after forgetting
    forget() { data = {}; storage.set(SAVE_KEY, null); },
};

// move old save shapes into slices so existing players keep their progress
function migrate(d)
{
    // e.g. if (d.oldField && !d.myFeature) { d.myFeature = { value: d.oldField }; delete d.oldField; }
}
