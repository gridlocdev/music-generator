// Gives the game a file-backed save through the hook src/platform/storage.js looks for. Nothing else is exposed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gameStorage', {
    load: ()=> ipcRenderer.invoke('save:load'),
    write: (all)=> ipcRenderer.invoke('save:write', all),
});
