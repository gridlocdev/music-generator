#!/usr/bin/env node
// Coupling report for vanilla-JS browser games.
//
//   node coupling-report.mjs [projectDir] [--src src] [--strict] [--json]
//
// Global-script projects (no import/export): maps each file's top-level names to the files that use them,
// and lists dependency cycles between files. Use it to plan a split into modules.
// ES-module projects: checks every relative import against the layer rules and reports upward imports,
// feature-to-feature imports, private imports (past another folder's index.js), cycles and files outside any layer.
// --strict exits 1 when violations (ESM) or file cycles (global scripts) are found.
//
// Layers can be overridden with <projectDir>/architecture.json:
//   { "src": "src", "layers": [["lib"], ["platform"], ["game"], ["world", "player", "render", "ui", "audio"], ["features"]],
//     "featuresDir": "features" }
// Files directly in src/ (main.js) and features/index.js sit above every layer.

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (f)=> args.includes(f);
const opt = (f)=> { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i)=> !a.startsWith('--') && args[i - 1] !== '--src');
const root = path.resolve(positional[0] ?? '.');

let config = {};
const configPath = path.join(root, 'architecture.json');
if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const srcDir = path.join(root, opt('--src') ?? config.src ?? 'src');
const layers = config.layers ?? [['lib'], ['platform'], ['game'], ['world', 'player', 'render', 'ui', 'audio'], ['features']];
const featuresDir = config.featuresDir ?? 'features';

if (!fs.existsSync(srcDir)) { console.error(`no source folder at ${srcDir} (use --src)`); process.exit(2); }

function walk(dir)
{
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true }))
    {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else if (/\.(m?js)$/.test(e.name)) out.push(p);
    }
    return out;
}
const files = walk(srcDir).sort();
const rel = (p)=> path.relative(srcDir, p).split(path.sep).join('/');
const source = new Map(files.map(f => [f, fs.readFileSync(f, 'utf8')]));
const lineCount = (f)=> source.get(f).replace(/\n$/, '').split('\n').length;

// strip comments and single-line string literals so names inside them don't count as uses
const stripCode = (s)=> s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, '""');

// strongly connected components (Tarjan); returns the ones with more than one file
function cycles(nodes, edges)
{
    let index = 0; const idx = new Map(), low = new Map(), stack = [], on = new Set(), out = [];
    const visit = (v)=>
    {
        idx.set(v, index); low.set(v, index); index++; stack.push(v); on.add(v);
        for (const w of edges.get(v) ?? [])
        {
            if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
            else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
        }
        if (low.get(v) === idx.get(v))
        {
            const c = []; let w;
            do { w = stack.pop(); on.delete(w); c.push(w); } while (w !== v);
            if (c.length > 1) out.push(c.sort());
        }
    };
    for (const n of nodes) if (!idx.has(n)) visit(n);
    return out;
}

const isModule = [...source.values()].some(s => /^\s*(import\s[\s\S]*?from\s|import\s*['"]|export\s)/m.test(s));
const report = isModule ? moduleReport() : globalReport();

if (flag('--json')) console.log(JSON.stringify(report, null, 2));
process.exit(flag('--strict') && report.failing ? 1 : 0);

// ---------------------------------------------------------------- global scripts
function globalReport()
{
    const decl = /^(?:async\s+)?(const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm;
    const defs = new Map();     // file -> Map(name -> kind)
    const owner = new Map();    // name -> file
    for (const f of files)
    {
        const m = new Map();
        for (const [, kind, name] of source.get(f).matchAll(decl)) { m.set(name, kind); if (!owner.has(name)) owner.set(name, f); }
        defs.set(f, m);
    }
    const code = new Map(files.map(f => [f, stripCode(source.get(f))]));
    const esc = (n)=> n.replace(/\$/g, '\\$');
    const uses = new Map();     // user -> Map(definer -> [names])
    for (const user of files)
    {
        const m = new Map();
        for (const [name, definer] of owner)
        {
            if (definer === user || defs.get(user).has(name)) continue;
            if (new RegExp(`(?<![\\w$.])${esc(name)}(?![\\w$])`).test(code.get(user)))
            {
                if (!m.has(definer)) m.set(definer, []);
                m.get(definer).push(name);
            }
        }
        uses.set(user, m);
    }
    const edges = new Map(files.map(f => [f, [...uses.get(f).keys()]]));
    const cyc = cycles(files, edges);
    const incoming = (f)=> files.filter(u => uses.get(u).has(f)).length;

    if (!flag('--json'))
    {
        console.log(`Global-script project: ${files.length} files in ${rel(srcDir) || path.basename(srcDir)}/, no ES modules.\n`);
        console.log('file                         lines  globals  mutable  uses files  used by');
        for (const f of files)
        {
            const d = defs.get(f), mut = [...d.values()].filter(k => k === 'let' || k === 'var').length;
            console.log(`${rel(f).padEnd(28)} ${String(lineCount(f)).padStart(5)}  ${String(d.size).padStart(7)}  ${String(mut).padStart(7)}  ${String(uses.get(f).size).padStart(10)}  ${String(incoming(f)).padStart(7)}`);
        }
        console.log('\nWhat each file takes from the others (names shown up to 6):');
        for (const f of files)
        {
            const m = uses.get(f);
            if (!m.size) continue;
            console.log(`\n${rel(f)}`);
            for (const [d, names] of [...m].sort((a, b)=> b[1].length - a[1].length))
                console.log(`  <- ${rel(d).padEnd(24)} ${String(names.length).padStart(3)}  ${names.slice(0, 6).join(', ')}${names.length > 6 ? ', ...' : ''}`);
        }
        const shared = files.flatMap(f => [...defs.get(f)].filter(([, k])=> k === 'let' || k === 'var').map(([n])=> [n, f]))
            .map(([n, f])=> [n, f, files.filter(u => uses.get(u).get(f)?.includes(n)).length]).filter(x => x[2] > 0)
            .sort((a, b)=> b[2] - a[2]);
        if (shared.length)
        {
            console.log('\nMutable globals read or written by other files (candidates for game/ state or contracts):');
            for (const [n, f, c] of shared.slice(0, 20)) console.log(`  ${n.padEnd(22)} in ${rel(f).padEnd(22)} used by ${c} file(s)`);
        }
        console.log(cyc.length ? `\nDependency cycles (${cyc.length}):` : '\nNo dependency cycles between files.');
        for (const c of cyc) console.log(`  ${c.map(rel).join(' <-> ')}`);
        const big = files.filter(f => lineCount(f) > 400);
        if (big.length) console.log(`\nLarge files (>400 lines, check for grab bags): ${big.map(f => `${rel(f)} (${lineCount(f)})`).join(', ')}`);
    }
    return {
        mode: 'global',
        files: files.map(f => ({ file: rel(f), lines: lineCount(f), globals: [...defs.get(f).keys()],
            uses: Object.fromEntries([...uses.get(f)].map(([d, n])=> [rel(d), n])) })),
        cycles: cyc.map(c => c.map(rel)),
        failing: cyc.length > 0,
    };
}

// ---------------------------------------------------------------- ES modules
function moduleReport()
{
    const tierOf = new Map(layers.flatMap((names, t)=> names.map(n => [n, t])));
    const top = layers.length;
    const place = (f)=>
    {
        const parts = rel(f).split('/');
        if (parts.length === 1) return { tier: top, layer: '(root)' };
        if (parts[0] === featuresDir && parts.length === 2) return { tier: top, layer: `${featuresDir}/${parts[1]}` };
        const t = tierOf.get(parts[0]);
        return { tier: t, layer: parts[0], feature: parts[0] === featuresDir ? parts[1] : undefined };
    };
    const importRe = /(?:^|[\s;])(?:import|export)\s*(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
    const edges = new Map(), problems = [], unlayered = new Set();
    for (const f of files)
    {
        const out = [];
        for (const m of stripComments(source.get(f)).matchAll(importRe))
        {
            const spec = m[1] ?? m[2];
            if (!spec.startsWith('.')) continue;
            let target = path.resolve(path.dirname(f), spec);
            if (!source.has(target) && source.has(target + '.js')) target += '.js';
            if (!source.has(target)) continue;      // outside src (engine in node_modules, etc.)
            out.push(target);
            const a = place(f), b = place(target);
            if (a.tier === undefined) unlayered.add(a.layer);
            if (b.tier === undefined) { unlayered.add(b.layer); continue; }
            if (a.tier === undefined) continue;
            if (b.tier > a.tier) problems.push({ kind: 'upward import', from: rel(f), to: rel(target), detail: `${a.layer} (tier ${a.tier}) imports ${b.layer} (tier ${b.tier})` });
            else if (a.feature && b.feature && a.feature !== b.feature)
                problems.push({ kind: 'feature imports feature', from: rel(f), to: rel(target), detail: `${a.feature} -> ${b.feature}; use game/events or a registry` });
            else
            {
                const folder = privateFolder(f, target);
                if (folder) problems.push({ kind: 'private import', from: rel(f), to: rel(target), detail: `import ${rel(path.join(folder, 'index.js'))} instead` });
            }
        }
        edges.set(f, out);
    }
    const cyc = cycles(files, edges);
    for (const c of cyc) problems.push({ kind: 'cycle', from: '', to: '', detail: c.map(rel).join(' <-> ') });
    for (const u of unlayered) problems.push({ kind: 'unlayered folder', from: u, to: '', detail: 'not in any layer; add it to architecture.json or move it' });
    const big = files.filter(f => lineCount(f) > 300).map(f => `${rel(f)} (${lineCount(f)})`);

    if (!flag('--json'))
    {
        console.log(`ES-module project: ${files.length} files. Layers, low to high: ${layers.map(l => l.join('|')).join(' -> ')} -> main\n`);
        if (!problems.length) console.log('No layer violations, feature cross-imports or cycles.');
        const byKind = Object.groupBy ? Object.groupBy(problems, p => p.kind) : problems.reduce((g, p)=> ((g[p.kind] ??= []).push(p), g), {});
        for (const [kind, list] of Object.entries(byKind))
        {
            console.log(`${kind} (${list.length}):`);
            for (const p of list) console.log(`  ${[[p.from, p.to].filter(Boolean).join(' -> '), p.detail].filter(Boolean).join('  ')}`);
            console.log();
        }
        if (big.length) console.log(`Files over 300 lines (consider splitting): ${big.join(', ')}`);
    }
    return { mode: 'module', problems, largeFiles: big, failing: problems.length > 0 };
}

// the outermost folder holding `target` that has an index.js and doesn't contain `from`:
// importing anything but that index reaches into the folder's private files
function privateFolder(from, target)
{
    const folders = [];
    for (let d = path.dirname(target); d.startsWith(srcDir + path.sep); d = path.dirname(d)) folders.unshift(d);
    for (const d of folders)
    {
        if (from.startsWith(d + path.sep)) continue;
        const index = path.join(d, 'index.js');
        if (source.has(index) && target !== index) return d;
    }
    return null;
}

function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/.*$/gm, '$1'); }
