// Web MIDI input: any connected keyboard, including ones plugged in later.
// Listeners get { type: 'noteon' | 'noteoff', key, velocity } or { type: 'cc', controller, value }.
const listeners = new Set();

export const midi = {
    available: 'requestMIDIAccess' in navigator,
    on(fn) { listeners.add(fn); return ()=> listeners.delete(fn); },
    /**
     * Asks for MIDI access and listens to every input. onInputs gets the input count now and whenever
     * a device is plugged in or removed. Resolves false when MIDI is unavailable or the user declined.
     * @param {(count: number)=> void} [onInputs]
     */
    async init(onInputs)
    {
        if (!this.available) return false;
        try
        {
            const access = await navigator.requestMIDIAccess();
            const attach = ()=>
            {
                let count = 0;
                access.inputs.forEach(input => { input.onmidimessage = onMessage; count++; });
                onInputs?.(count);
            };
            attach();
            access.onstatechange = attach;
            return true;
        }
        catch { return false; }
    },
};

function onMessage({ data })
{
    const [status, a, b] = data;
    const type = status & 0xf0;
    const msg = type === 0x90 && b > 0 ? { type: 'noteon', key: a, velocity: b }
        : type === 0x80 || type === 0x90 ? { type: 'noteoff', key: a, velocity: 0 }
        : type === 0xb0 ? { type: 'cc', controller: a, value: b }
        : null;
    if (msg) for (const fn of listeners) fn(msg);
}
