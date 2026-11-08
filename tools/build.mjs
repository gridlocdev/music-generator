// Bundles the app's UI (src/app/main.jsx and everything it imports) into dist/app.js for the desktop app to load.
//   node tools/build.mjs           build once
//   node tools/build.mjs --check   bundle without writing, to find errors (`just check`)
//   node tools/build.mjs --watch   rebuild on every change; the app reloads its window when dist/ changes (`just dev`)
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = {
    entryPoints: [path.join(root, 'src/app/main.jsx')],
    outfile: path.join(root, 'dist/app.js'),
    bundle: true,
    format: 'esm',
    target: 'chrome140',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    sourcemap: 'linked',
    logLevel: 'info',
};

if (process.argv.includes('--watch'))
{
    const ctx = await esbuild.context(options);
    await ctx.watch();
}
else if (process.argv.includes('--check')) await esbuild.build({ ...options, write: false, logLevel: 'warning' });
else await esbuild.build(options);
