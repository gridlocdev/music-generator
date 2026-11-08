// The desktop app: one window running the UI built into dist/ from this checkout, served over app://game/ instead of
// file://, so modules and the mic's worklet load. It may use the microphone without asking each time (macOS asks
// once, for the app), the whistle track saves straight into ideas/, and the settings are kept in a file in the app's
// data folder. Run it with `just app`; with --dev (`just dev`) the window reloads whenever dist/ is rebuilt.
import { app, BrowserWindow, ipcMain, net, protocol, session, shell, systemPreferences } from 'electron';
import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ideasRequest } from '../tools/ideas-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'app://game';
// --headless: for automated tests: no window on screen, no Dock icon, no sound, no microphone prompt, and settings
// kept apart from the real ones
const HEADLESS = process.argv.includes('--headless');
if (HEADLESS) app.setPath('userData', path.join(os.tmpdir(), 'music-generator-headless'));
const SAVE_FILE = ()=> path.join(app.getPath('userData'), 'save.json');

app.setName('Music Generator');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

// ---------------------------------------------------------------- saving
// The app hands over all its settings on every change; write it to a temporary file and swap it in,
// so a crash mid-write never leaves half a save.
let writing = Promise.resolve();
function writeSave(all)
{
    const file = SAVE_FILE(), temp = file + '.tmp';
    writing = writing.then(async ()=>
    {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(temp, JSON.stringify(all));
        await fs.rename(temp, file);
    }).catch((e)=> console.error('could not save', e));
    return writing;
}
ipcMain.handle('save:load', async ()=>
{
    try { return JSON.parse(await fs.readFile(SAVE_FILE(), 'utf8')); }
    catch { return {}; }    // a first run, or a save that could not be read
});
ipcMain.handle('save:write', (event, all)=> writeSave(all));

// ---------------------------------------------------------------- the microphone
// The app's own page may record audio, and nothing else: no camera, no screen, no other origin.
function allowMicrophone()
{
    const ours = (url)=> typeof url === 'string' && url.startsWith(ORIGIN + '/');
    session.defaultSession.setPermissionRequestHandler((contents, permission, grant, details)=>
    {
        const audioOnly = permission === 'media' && (details.mediaTypes ?? []).every(t => t === 'audio');
        grant(audioOnly && ours(details.requestingUrl));
    });
    session.defaultSession.setPermissionCheckHandler((contents, permission, origin, details)=>
        permission === 'media' && details.mediaType !== 'video' && ours(`${origin}/`));
}

// ---------------------------------------------------------------- window
function createWindow()
{
    const win = new BrowserWindow({
        width: 1280, height: 800, minWidth: 800, minHeight: 500,
        title: app.name,
        backgroundColor: '#18181c',     // the page's background, so the window never flashes white
        autoHideMenuBar: true,
        show: false,
        webPreferences: { preload: path.join(ROOT, 'electron', 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false,
            backgroundThrottling: !HEADLESS },
    });
    if (HEADLESS) win.webContents.setAudioMuted(true);
    else win.once('ready-to-show', ()=> win.show());
    // links open in the browser, never in the app's window
    win.webContents.setWindowOpenHandler(({ url })=> { shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', (e, url)=> { if (!url.startsWith(ORIGIN + '/')) e.preventDefault(); });
    // F11 (and Ctrl+Cmd+F on macOS) toggles fullscreen
    win.webContents.on('before-input-event', (e, input)=>
    {
        if (input.type === 'keyDown' && (input.key === 'F11' || (input.key === 'f' && input.control && input.meta)))
        {
            win.setFullScreen(!win.isFullScreen());
            e.preventDefault();
        }
    });
    win.loadURL(`${ORIGIN}/index.html`);
    if (process.argv.includes('--dev')) reloadOnBuild(win);
}

// `just dev`: esbuild rewrites dist/ on every change; reload once it settles
function reloadOnBuild(win)
{
    let timer = 0;
    const watcher = watch(path.join(ROOT, 'dist'), ()=>
    {
        clearTimeout(timer);
        timer = setTimeout(()=> win.webContents.reloadIgnoringCache(), 150);
    });
    win.on('closed', ()=> watcher.close());
}

app.whenReady().then(async ()=>
{
    // the whistle track's saves into ideas/, then files from this checkout only
    protocol.handle('app', async (request)=>
    {
        const { pathname } = new URL(request.url);
        const answer = await ideasRequest(ROOT, request.method, pathname, async ()=> new Uint8Array(await request.arrayBuffer()))
            .catch((e)=> ({ status: 500, body: String(e) }));
        if (answer)
        {
            if (answer.saved) console.log(`saved ${answer.saved}`);
            return new Response(answer.body ?? null, { status: answer.status, headers: { 'content-type': answer.type ?? 'text/plain' } });
        }
        const file = path.join(ROOT, decodeURIComponent(pathname));
        if (!file.startsWith(ROOT + path.sep)) return new Response('not found', { status: 404 });
        return net.fetch(pathToFileURL(file).toString());
    });
    allowMicrophone();
    // macOS asks once whether the app may use the microphone; the answer is remembered in System Settings
    if (process.platform === 'darwin' && !HEADLESS) await systemPreferences.askForMediaAccess('microphone');
    if (HEADLESS) app.dock?.hide();
    createWindow();
    app.on('activate', ()=> { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
// finish any save in progress before quitting
app.on('window-all-closed', ()=> { writing.finally(()=> app.quit()); });
