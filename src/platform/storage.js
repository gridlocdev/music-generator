// The app's saved settings: one JSON object, kept by the desktop app in a file in its data folder (electron/main.js,
// through window.appStorage from electron/preload.cjs). Load once at start; save hands over the whole object.
const backend = /** @type {any} */ (globalThis).appStorage;

export const storage = {
    /** @returns {Promise<Record<string, any>>} */
    async load()
    {
        try { return (await backend.load()) ?? {}; }
        catch (e) { console.warn('could not load settings', e); return {}; }
    },
    save(all)
    {
        try { return backend.write(all); }
        catch (e) { console.warn('could not save settings', e); }
    },
};
