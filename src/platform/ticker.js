// A steady interval for scheduling audio ahead of time. The timer runs in a Worker: a background tab slows the
// page's own setInterval to about once a second, which would starve a song's lookahead, but leaves workers alone.
const SOURCE = 'let id; onmessage = (e)=> { clearInterval(id); if (e.data) id = setInterval(()=> postMessage(0), e.data); };';

/** calls fn every `ms` milliseconds until the returned stop function is called */
export function startTicker(ms, fn)
{
    let worker = null;
    try
    {
        const url = URL.createObjectURL(new Blob([SOURCE], { type: 'text/javascript' }));
        worker = new Worker(url);
        URL.revokeObjectURL(url);
    }
    catch { worker = null; }
    if (!worker)
    {
        const id = setInterval(fn, ms);
        return ()=> clearInterval(id);
    }
    worker.onmessage = ()=> fn();
    worker.postMessage(ms);
    return ()=> worker.terminate();
}
