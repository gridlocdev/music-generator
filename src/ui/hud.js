// The HTML layer over the canvas: short toasts.
const $ = (id)=> /** @type {HTMLElement} */ (document.getElementById(id));
let toastTimer = 0;

export function toast(text)
{
    $('toast').textContent = text;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=> $('toast').hidden = true, 2500);
}

export const hud = {
    build({ events })
    {
        // features announce things through events; the HUD decides how to show them
        events.on('notice', ({ text })=> toast(text));
    },
};
