// One takeover of player control at a time (minigame, cutscene, vehicle). end() always cleans up.
// An activity: { name, update(), cleanup?(), cam? }
const listeners = new Set();
let current = null;

export const activity = {
    get current() { return current; },
    start(a)
    {
        if (current) this.end();
        current = a;
        for (const fn of listeners) fn(current);
    },
    // ends the current activity, whether it finished or was interrupted
    end()
    {
        const a = current;
        if (!a) return;
        current = null;
        a.cleanup?.();
        for (const fn of listeners) fn(null);
    },
    update() { current?.update(); },
    // player/ subscribes here to restore normal control when an activity ends
    onChange(fn) { listeners.add(fn); return ()=> listeners.delete(fn); },
};
