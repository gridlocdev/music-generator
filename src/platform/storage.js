// A string key/value table filled once at boot. The backend is localStorage, unless the page defines window.gameStorage
// before the game loads (the desktop app does, to save to a file):
//   window.gameStorage = { load: async (keys)=> ({ key: value, ... }), write: (table, changedKey)=> {} }
// write gets the whole table on every change, so a file backend can write it out in one go.
const table = {};

const localStorageBackend = {
    async load(keys)
    {
        const out = {};
        for (const k of keys) { try { const v = localStorage.getItem(k); if (v != null) out[k] = v; } catch {} }
        return out;
    },
    write(all, key) { try { all[key] == null ? localStorage.removeItem(key) : localStorage.setItem(key, all[key]); } catch {} },
};

export const storage = {
    backend: /** @type {any} */ (globalThis).gameStorage ?? localStorageBackend,
    keys: [],
    async init()
    {
        try { Object.assign(table, await this.backend.load(this.keys)); }
        catch (e) { console.warn('could not load the save', e); }
    },
    get(k) { return table[k] ?? null; },
    // returns whatever the backend returns, so a reset can wait for a file write to finish
    set(k, v)
    {
        if (v == null) delete table[k]; else table[k] = String(v);
        try { return this.backend.write({ ...table }, k); }
        catch (e) { console.warn('could not save', e); }
    },
};
