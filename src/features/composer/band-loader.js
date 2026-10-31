// Finds and loads the instruments a score's parts play: each part's SoundFont preset from the current library, and
// the .sf2 files they live in, downloaded once and shared.
import { soundfontLibrary } from '../../audio/soundfont-library.js';
import { loadSoundFont, findPreset } from '../../audio/soundfont.js';

/** the catalog entry for a part: its exact bank/program, or the same program on any bank, or the first preset */
export function presetFor(bank, program)
{
    const presets = soundfontLibrary.presets();
    return presets.find(p => p.bank === bank && p.program === program)
        ?? presets.find(p => (p.bank >= 127) === (bank >= 127) && p.program === program)
        ?? presets.find(p => (p.bank >= 127) === (bank >= 127))
        ?? presets[0];
}

/**
 * Downloads every .sf2 file the score's parts need. Resolves to one { font, preset, entry } per track.
 * @param {import('./compose.js').Score} score
 * @param {(text: string)=> void} onStatus
 */
export async function loadBand(score, onStatus)
{
    const entries = score.tracks.map(t => presetFor(t.bank, t.program));
    const urls = [...new Set(entries.map(e => e.url))];
    const progress = new Map(urls.map(u => [u, 0]));
    const report = ()=> onStatus(`Loading ${urls.length} SoundFont file${urls.length > 1 ? 's' : ''}… ${Math.floor([...progress.values()].reduce((a, b)=> a + b, 0) / urls.length * 100)}%`);
    report();
    const fonts = new Map(await Promise.all(urls.map(async u => /** @type {[string, any]} */ ([u, await loadSoundFont(u, (loaded, total)=> { progress.set(u, loaded / total); report(); })]))));
    return entries.map(entry =>
    {
        const font = fonts.get(entry.url);
        const preset = findPreset(font, entry.bank, entry.program);
        if (!preset) throw new Error(`no preset ${entry.bank}:${entry.program} in ${entry.url}`);
        return { font, preset, entry };
    });
}
