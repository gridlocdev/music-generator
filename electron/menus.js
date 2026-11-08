// The native menus: the page hands over its menu bar and right-click menus as plain items (src/platform/app-menu.js)
// and gets back the id of the item picked. The bar gets the app menu and Window menu macOS expects around it. While a
// text field has focus, Edit items marked `text` do the field's own edit (undo, copy, paste…) instead.
//
// Headless (for automated tests) a right-click menu isn't shown: it's kept as globalThis.contextMenu, for the test to
// click an item of.
import { Menu } from 'electron';

const MAC = process.platform === 'darwin';
const TEXT = new Set(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']);

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {{ headless: boolean }} options
 */
export function installMenus(ipcMain, { headless })
{
    let typing = false;

    const build = (items, contents)=> items.map(x =>
    {
        if (x.type === 'separator') return x;
        if (x.role) return { role: x.role, ...(x.label && { label: x.label }) };
        const checkable = x.checked !== undefined;
        return {
            id: x.id,
            label: x.label,
            enabled: x.enabled ?? true,
            ...(checkable && { type: x.radio ? 'radio' : 'checkbox', checked: x.checked }),
            ...(x.accelerator && { accelerator: x.accelerator }),
            ...(x.shown && { accelerator: x.shown, registerAccelerator: false }),
            ...(x.submenu && { submenu: build(x.submenu, contents) }),
            click: ()=>
            {
                if (x.text && TEXT.has(x.text) && (typing || x.native)) contents[x.text]();
                else contents.send('menu:pick', x.id);
            },
        };
    });

    ipcMain.on('menu:typing', (e, on)=> { typing = !!on; });

    ipcMain.on('menu:bar', (e, menus)=>
    {
        const template = build(menus, e.sender);
        if (MAC) template.unshift({ role: 'appMenu' });
        const help = template.findIndex(m => m.label === 'Help');
        template.splice(help < 0 ? template.length : help, 0, { role: 'windowMenu' });
        Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    });

    ipcMain.on('menu:popup', (e, items)=>
    {
        const menu = Menu.buildFromTemplate(build(items, e.sender));
        if (headless) /** @type {any} */ (globalThis).contextMenu = menu;
        else menu.popup();
    });
}
