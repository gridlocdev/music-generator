// The desktop app: one window running the UI built into dist/, served over app://game/ instead of file://, so modules
// and the mic's worklet load. It may use the microphone without asking each time (macOS asks once, for the app), and
// the settings are kept in a file in the app's data folder. Run from this checkout (`just app`), projects save
// straight into projects/ and the SoundFonts are those in soundfonts/; with --dev (`just dev`) the window reloads
// whenever dist/ is rebuilt. Either way the window hears when projects/ changes on disk, and lists it again. Installed from a release build, projects live in Documents/Music Generator/projects
// (the written songs copied there on the first run), GeneralUser GS comes with the app and the other SoundFont
// libraries are downloaded into the app's data folder.
import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell, systemPreferences } from 'electron';
import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { projectRequest } from '../tools/project-files.mjs';
import { downloadLibrary } from '../tools/soundfont-download.mjs';
import { LIBRARIES } from '../src/audio/soundfont-catalog-data.js';
import { installMenus } from './menus.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'app://game';
// --headless: for automated tests: no window on screen, no Dock icon, no sound, no microphone prompt, and settings
// kept apart from the real ones
const HEADLESS = process.argv.includes('--headless');
if (HEADLESS)
{
    app.setPath('userData', path.join(os.tmpdir(), 'music-generator-headless'));
    app.setPath('documents', path.join(os.tmpdir(), 'music-generator-headless-documents'));
}
const SAVE_FILE = ()=> path.join(app.getPath('userData'), 'save.json');

// where the files are: the checkout, or an installed release build
const PACKAGED = app.isPackaged;
/** the folder holding projects/ */
const DATA = ()=> PACKAGED ? path.join(app.getPath('documents'), 'Music Generator') : ROOT;
/** the SoundFont folders, searched in order: the ones that came with the app, then the ones downloaded (the last) */
const FONT_DIRS = ()=> PACKAGED ? [path.join(process.resourcesPath, 'soundfonts'), path.join(app.getPath('userData'), 'soundfonts')] : [path.join(ROOT, 'soundfonts')];

/** the file at `rel` inside `base`, or null when `rel` would leave it */
const within = (base, rel)=>
{
    const file = path.resolve(base, String(rel));
    return file.startsWith(base + path.sep) ? file : null;
};
const exists = (file)=> fs.access(file).then(()=> true, ()=> false);
/** where a url of the page (index.html's folder) is on disk: a project, a SoundFont, or a file of the app */
async function fileOf(url)
{
    const rel = decodeURIComponent(url).replace(/^\/+/, '');
    if (rel.startsWith('projects/')) return within(DATA(), rel);
    if (rel.startsWith('soundfonts/'))
    {
        for (const dir of FONT_DIRS())
        {
            const file = within(dir, rel.slice('soundfonts/'.length));
            if (file && await exists(file)) return file;
        }
        return null;
    }
    return within(ROOT, rel);
}

// the first run of an installed build: the written songs, as projects to open
async function seedProjects()
{
    const projects = path.join(DATA(), 'projects');
    if (PACKAGED && !await exists(projects)) await fs.cp(path.join(process.resourcesPath, 'projects'), projects, { recursive: true });
}

// ---------------------------------------------------------------- SoundFont libraries
// the ids of the libraries whose files are all there
ipcMain.handle('soundfonts:installed', async ()=>
    (await Promise.all(LIBRARIES.map(async l => (await Promise.all(l.files.map(f => fileOf(f.url)))).every(Boolean) ? l.id : null))).filter(Boolean));
// a library downloaded into the last SoundFont folder, its progress sent to the page every percent or so
ipcMain.handle('soundfonts:download', async (e, id)=>
{
    let sent = -1;
    await downloadLibrary(String(id), FONT_DIRS().at(-1), { fetch: (url)=> net.fetch(url), progress: (loaded, total)=>
    {
        const now = Math.floor(100 * loaded / total);
        if (now !== sent && !e.sender.isDestroyed()) { sent = now; e.sender.send('soundfonts:progress', String(id), loaded, total); }
    } });
});

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
// a doc of the app opens in its own app; a project or take shows in the Finder
ipcMain.handle('shell:open', async (e, rel)=> { const file = within(ROOT, rel); if (file?.endsWith('.md')) await shell.openPath(file); });
ipcMain.handle('shell:reveal', (e, rel)=> { const file = within(path.join(DATA(), 'projects'), rel); if (file) shell.showItemInFolder(file); });
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
    tellProjectChanges(win);
}

// projects/ changed on disk (`just projects`, a save, a folder copied in): the window lists it again, once it settles
function tellProjectChanges(win)
{
    let timer = 0, watcher = null;
    fs.mkdir(path.join(DATA(), 'projects'), { recursive: true }).then(()=>
    {
        if (win.isDestroyed()) return;
        watcher = watch(path.join(DATA(), 'projects'), { recursive: true }, ()=>
        {
            clearTimeout(timer);
            timer = setTimeout(()=> { if (!win.isDestroyed()) win.webContents.send('projects:changed'); }, 300);
        });
        watcher.on('error', (e)=> console.error('could not watch projects/', e));
    }, (e)=> console.error('could not watch projects/', e));
    win.on('closed', ()=> { clearTimeout(timer); watcher?.close(); });
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
    await seedProjects().catch((e)=> console.error('could not copy the projects', e));
    // saving projects and takes into projects/, then files of the app, its projects and SoundFonts only
    protocol.handle('app', async (request)=>
    {
        const { pathname } = new URL(request.url);
        const answer = await projectRequest(DATA(), request.method, pathname, async ()=> new Uint8Array(await request.arrayBuffer()))
            .catch((e)=> ({ status: 500, body: String(e) }));
        if (answer)
        {
            if (answer.saved) console.log(`saved ${answer.saved}`);
            return new Response(answer.body ?? null, { status: answer.status, headers: { 'content-type': answer.type ?? 'text/plain' } });
        }
        const file = await fileOf(pathname);
        if (!file) return new Response('not found', { status: 404 });
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
