// The browser for tools/export.mjs: Electron with no window on screen, loading the export page it's given.
// Quits when the page's window closes; tools/export.mjs ends it once the page is done.
import { app, BrowserWindow } from 'electron';

app.dock?.hide();
app.whenReady().then(()=>
{
    // a hidden window's timers would be throttled, and the render pauses on them
    const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
    win.webContents.on('console-message', (e)=> { if (e.level === 'error') console.error(e.message); });
    win.loadURL(process.argv.at(-1));
    win.on('closed', ()=> app.quit());
});
