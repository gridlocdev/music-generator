// Gives the app a file-backed settings store through the hook src/platform/storage.js looks for. Nothing else is exposed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appStorage', {
    load: ()=> ipcRenderer.invoke('save:load'),
    write: (all)=> ipcRenderer.invoke('save:write', all),
});
