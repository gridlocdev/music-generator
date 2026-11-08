// The desktop app: one window running the UI built into dist/ from this checkout, served over app://game/ instead of
// file://, so modules and the mic's worklet load. It may use the microphone without asking each time (macOS asks
// once, for the app), projects save straight into projects/, and the settings are kept in a file in the app's
// data folder. Run it with `just app`; with --dev (`just dev`) the window reloads whenever dist/ is rebuilt.
import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell, systemPreferences } from 'electron';
import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { projectRequest } from '../tools/project-files.mjs';
import { installMenus } from './menus.js';

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

// ---------------------------------------------------------------- menus, files and the Finder
installMenus(ipcMain, { headless: HEADLESS });
/** a path inside the checkout, or null */
const inside = (rel, folder = '')=>
{
    const file = path.resolve(ROOT, folder, String(rel));
    return file.startsWith(path.join(ROOT, folder) + path.sep) ? file : null;
};
// a doc of the checkout opens in its own app; a project or take shows in the Finder
ipcMain.handle('shell:open', async (e, rel)=> { const file = inside(rel); if (file?.endsWith('.md')) await shell.openPath(file); });
ipcMain.handle('shell:reveal', (e, rel)=> { const file = inside(rel, 'projects'); if (file) shell.showItemInFolder(file); });
// an exported file goes where the user picks
ipcMain.handle('file:save', async (e, name, bytes)=>
{
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), path.basename(String(name))) });
    if (canceled || !filePath) return '';
    await fs.writeFile(filePath, Buffer.from(bytes));
    return filePath;
});
// a file to import: picked by the user, read here, handed to the page as its name and bytes
ipcMain.handle('file:open', async (e, title, extensions)=>
{
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: String(title), properties: ['openFile'],
        filters: [{ name: String(title), extensions: [...extensions].map(String) }] });
    if (canceled || !filePaths[0]) return null;
    return { name: path.basename(filePaths[0]), bytes: new Uint8Array(await fs.readFile(filePaths[0])) };
});
// stems go in a new folder the user names; the page then writes its files into that folder and nowhere else
let chosenFolder = '';
ipcMain.handle('file:chooseFolder', async (e, name)=>
{
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, { title: 'Export each track into a new folder', buttonLabel: 'Export',
        defaultPath: path.join(app.getPath('documents'), path.basename(String(name))) });
    if (canceled || !filePath) return '';
    await fs.mkdir(filePath, { recursive: true });
    chosenFolder = filePath;
    return filePath;
});
ipcMain.handle('file:writeInFolder', async (e, name, bytes)=>
{
    if (!chosenFolder) throw new Error('no folder chosen');
    const file = path.join(chosenFolder, path.basename(String(name)));
    await fs.writeFile(file, Buffer.from(bytes));
    return file;
});

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
        icon: path.join(ROOT, 'assets', 'icon', 'icon.png'),   // Windows and Linux; the macOS app's comes from its bundle
        backgroundColor: '#18181c',     // the page's background, so the window never flashes white
        autoHideMenuBar: true,
        show: false,
        webPreferences: { preload: path.join(ROOT, 'electron', 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false,
            backgroundThrottling: !HEADLESS },
    });
    if (HEADLESS) win.webContents.setAudioMuted(true);
    else win.once('ready-to-show', ()=> win.show());
    // web links open in the browser, never in the app's window; nothing else (file:, custom schemes) is opened
    win.webContents.setWindowOpenHandler(({ url })=>
    {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
    // the page holds the close while the project has unsaved changes: ask
    win.webContents.on('will-prevent-unload', (e)=>
    {
        const choice = dialog.showMessageBoxSync(win, { type: 'warning', buttons: ['Close Without Saving', 'Cancel'], defaultId: 1, cancelId: 1,
            message: 'Close without saving?', detail: 'The project has changes that are not saved.' });
        if (choice === 0) e.preventDefault();
    });
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
    // saving projects and takes into projects/, then files from this checkout only
    protocol.handle('app', async (request)=>
    {
        const { pathname } = new URL(request.url);
        const answer = await projectRequest(ROOT, request.method, pathname, async ()=> new Uint8Array(await request.arrayBuffer()))
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
