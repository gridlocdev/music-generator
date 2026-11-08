// A canvas that redraws itself: `draw` runs inside a signal effect, so it runs again whenever a signal it read
// changes, whenever the component renders (new props), and whenever the canvas is resized. Drawing is in CSS
// pixels; the backing store follows the screen's density.
import { useEffect, useRef } from 'preact/hooks';
import { effect, signal } from '@preact/signals';

/**
 * @param {(g: CanvasRenderingContext2D, w: number, h: number)=> void} draw
 * @returns {import('preact').RefObject<HTMLCanvasElement>}
 */
export function useCanvas(draw)
{
    const ref = useRef(/** @type {HTMLCanvasElement|null} */ (null));
    const drawRef = useRef(draw);
    drawRef.current = draw;
    const rendered = useRef(signal(0)).current;
    useEffect(()=> { rendered.value++; });
    useEffect(()=>
    {
        const canvas = ref.current;
        if (!canvas) return;
        const size = signal({ w: 0, h: 0 });
        const observer = new ResizeObserver(()=>
        {
            const r = canvas.getBoundingClientRect();
            size.value = { w: Math.round(r.width), h: Math.round(r.height) };
        });
        observer.observe(canvas);
        const stop = effect(()=>
        {
            const { w, h } = size.value;
            rendered.value;
            if (!w || !h) return;
            const dpr = devicePixelRatio || 1;
            const W = Math.round(w * dpr), H = Math.round(h * dpr);     // a fractional density (1.25) would resize every time
            if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
            const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            g.clearRect(0, 0, w, h);
            drawRef.current(g, w, h);
        });
        return ()=> { stop(); observer.disconnect(); };
    }, []);
    return ref;
}

/** a track's colour as CSS, from its role's rgb 0..1 */
export const rgba = ([r, g, b], a = 1)=> `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
