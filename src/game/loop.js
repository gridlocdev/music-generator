// Runs registered systems and features in order. main.js wires this into the engine callbacks.
import { state } from './state.js';
import { events } from './events.js';
import { activity } from './activity.js';

const systems = [];
const ctx = { state, events, activity };

export const loop = {
    // add systems (ui...) and features, in the order they should build and update
    use(list) { systems.push(...list); },
    build() { for (const s of systems) s.build?.(ctx); },
    update()
    {
        for (const s of systems) s.update?.(ctx);
        activity.update();
    },
    updatePost() { for (const s of systems) s.updatePost?.(ctx); },
    render() { for (const s of systems) s.render?.(ctx); },
    // collect an optional hook from every system, e.g. sections('summary') for a pause menu
    sections(hook) { return systems.map(s => s[hook]?.(ctx)).filter(Boolean); },
};
