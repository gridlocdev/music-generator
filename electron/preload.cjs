// Gives the app a file-backed settings store (src/platform/storage.js) and the native menus, a save dialog and the
// Finder (src/platform/app-menu.js). Nothing else is exposed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appStorage', {
    load: ()=> ipcRenderer.invoke('save:load'),
    write: (all)=> ipcRenderer.invoke('save:write', all),
});

contextBridge.exposeInMainWorld('appMenu', {
    setBar: (menus)=> ipcRenderer.send('menu:bar', menus),
    popup: (items)=> ipcRenderer.send('menu:popup', items),
    typing: (on)=> ipcRenderer.send('menu:typing', on),
    onPick: (fn)=> { ipcRenderer.on('menu:pick', (e, id)=> fn(id)); },
    open: (rel)=> ipcRenderer.invoke('shell:open', rel),
    reveal: (rel)=> ipcRenderer.invoke('shell:reveal', rel),
    openFile: (title, extensions)=> ipcRenderer.invoke('file:open', title, extensions),
    saveFile: (name, bytes)=> ipcRenderer.invoke('file:save', name, bytes),
    chooseFolder: (name)=> ipcRenderer.invoke('file:chooseFolder', name),
    writeInFolder: (name, bytes)=> ipcRenderer.invoke('file:writeInFolder', name, bytes),
});
