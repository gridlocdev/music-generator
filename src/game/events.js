// Tiny pub/sub for occasional happenings (collected, entered, unlocked). Not for per-frame work.
const handlers = new Map();

export const events = {
    on(name, fn) { (handlers.get(name) ?? handlers.set(name, new Set()).get(name)).add(fn); return ()=> handlers.get(name).delete(fn); },
    emit(name, data) { for (const fn of handlers.get(name) ?? []) fn(data); },
};
