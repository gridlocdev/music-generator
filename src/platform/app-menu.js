// The native menus: the menu bar and right-click menus, built by the desktop app (electron/menus.js) from plain items
// handed over through window.appMenu. An item's action stays here; the desktop app sends back its id when it's picked.
//
// An item is '-' (a separator) or { label, run?, accelerator?, shown?, enabled?, checked?, radio?, submenu?, text?,
// role? }: `accelerator` is a shortcut the menu answers itself (Cmd+S); `shown` is one the page answers (Space), only
// written beside the label; `text` ('undo', 'copy', …) does the text field's own edit instead while one has focus;
// `role` is one of Electron's built-in items. In the menu bar an item's id is its `id`, so tests can click it.
const backend = /** @type {any} */ (globalThis).appMenu;

let bar = new Map(), popped = new Map(), next = 0;

/** items as plain objects with ids, their actions kept in `actions` */
function plain(items, actions, prefix)
{
    return items.filter(x => x).map(x =>
    {
        if (x === '-') return { type: 'separator' };
        const { run, submenu, ...rest } = x;
        const id = rest.id ?? `${prefix}${next++}`;
        if (run) actions.set(id, run);
        return { ...rest, id, ...(submenu && { submenu: plain(submenu, actions, prefix) }) };
    });
}

backend?.onPick((id)=> (bar.get(id) ?? popped.get(id))?.());

export const appMenu = {
    /** whether there are native menus (the desktop app): without them the page answers the Cmd shortcuts too */
    native: !!backend,
    /** the menu bar: [{ label, submenu: items }] */
    setBar(menus)
    {
        const actions = new Map();
        const template = plain(menus, actions, 'bar');
        bar = actions;
        backend?.setBar(template);
    },
    /** a right-click menu at the pointer */
    popup(items)
    {
        popped = new Map();
        backend?.popup(plain(items, popped, 'pop'));
    },
    /** whether a text field has focus, so the Edit menu's items act on it */
    typing(on) { backend?.typing(on); },
    /** opens a file of the checkout (a doc) in its app, or shows one in projects/ in the Finder */
    open: (rel)=> backend?.open(rel),
    reveal: (rel)=> backend?.reveal(rel),
    /** asks where to save a file, and saves it; resolves to the path, or '' when cancelled */
    saveFile: (name, bytes)=> backend?.saveFile(name, bytes) ?? Promise.resolve(''),
    /** asks for a new folder to save several files in; resolves to its path, or '' when cancelled */
    chooseFolder: (name)=> backend?.chooseFolder(name) ?? Promise.resolve(''),
    /** saves a file in the folder chosen last */
    writeInFolder: (name, bytes)=> backend?.writeInFolder(name, bytes),
};
