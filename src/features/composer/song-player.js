// Plays a composed score through the SoundFont synth: loads each part's instrument, then schedules notes
// a little ahead on the audio clock, so timing doesn't depend on the frame rate.
import { audioEngine } from '../../platform/audio-engine.js';
import { SOUNDFONTS } from '../../audio/soundfont-catalog-data.js';
import { loadSoundFont, findPreset, createInstrument } from '../../audio/soundfont.js';
import { MIX } from './composer-data.js';

const LOOKAHEAD = 0.3;          // seconds of notes handed to Web Audio ahead of time
const TICK_MS = 50;             // how often more notes are scheduled
const LEAD_IN = 0.25;           // seconds between pressing play and the first beat

const presets = SOUNDFONTS.flatMap(font => font.presets.map(p => ({ ...p, url: font.url })));

/** the catalog entry for a part: its exact bank/program, or the same program on any bank, or the first preset */
export function presetFor(bank, program)
{
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
    const fonts = new Map(await Promise.all(urls.map(async u => [u, await loadSoundFont(u, (loaded, total)=> { progress.set(u, loaded / total); report(); })])));
    return entries.map(entry =>
    {
        const font = fonts.get(entry.url);
        const preset = findPreset(font, entry.bank, entry.program);
        if (!preset) throw new Error(`no preset ${entry.bank}:${entry.program} in ${entry.url}`);
        return { font, preset, entry };
    });
}

/**
 * Starts playing. Returns a handle with the current position in beats and stop().
 * @param {import('./compose.js').Score} score
 * @param {{ font: any, preset: any }[]} band  from loadBand, one per track
 */
export function playScore(score, band)
{
    const ctx = audioEngine.context;
    const spb = 60 / score.tempo;
    const start = ctx.currentTime + LEAD_IN;
    const instruments = score.tracks.map((t, i)=>
    {
        const inst = createInstrument(band[i].font, band[i].preset);
        inst.output.gain.value = MIX[t.role] ?? 1;
        return inst;
    });

    // note-offs sort before note-ons at the same time, so a repeated key is released before it restarts
    const events = score.tracks.flatMap((t, i)=> t.notes.flatMap(n => [
        { time: start + n.beat * spb, on: true, i, key: n.key, vel: n.vel },
        { time: start + (n.beat + n.beats) * spb, on: false, i, key: n.key, vel: 0 },
    ])).sort((a, b)=> a.time - b.time || +a.on - +b.on);

    let next = 0;
    const schedule = ()=>
    {
        const until = ctx.currentTime + LOOKAHEAD;
        for (; next < events.length && events[next].time < until; next++)
        {
            const e = events[next];
            if (e.on) instruments[e.i].noteOn(e.key, e.vel, e.time);
            else instruments[e.i].noteOff(e.key, false, e.time);
        }
    };
    schedule();
    const timer = setInterval(schedule, TICK_MS);
    let stopped = false;

    return {
        /** position in beats; negative during the lead-in */
        get beat() { return (ctx.currentTime - start) / spb; },
        get done() { return stopped || ctx.currentTime > start + score.seconds + 2; },
        stop()
        {
            if (stopped) return;
            stopped = true;
            clearInterval(timer);
            for (const inst of instruments) inst.dispose();
        },
    };
}
