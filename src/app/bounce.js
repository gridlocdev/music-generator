// Export as Audio File: the project, or a stretch of it, played into an offline context, faster than it would play,
// and saved as a stereo WAV: the mix, or each track on its own into a folder (stems, all the same length). It plays
// as Play would (instruments, mixer, automation, Humanize) but once through, with no loop.
import { signal } from '@preact/signals';
import { loadInstruments } from '../daw/instruments.js';
import { playProject, LEAD_IN } from '../daw/player.js';
import { projectEnd } from '../daw/project.js';
import { beatToSeconds } from '../lib/tempo-map.js';
import { encodeWavChannels, normalize, peakOf } from '../lib/wav.js';
import { audioEngine } from '../platform/audio-engine.js';
import { appMenu } from '../platform/app-menu.js';
import { project, projectName, mix, status } from './store.js';
import { stop } from './player.js';

/** whether the Export dialog is open */
export const exportDialog = signal(false);

export const TAIL = 3;          // seconds after the last beat, for reverb and release
const PEAK_DB = -1;             // a normalized export's peak

/** a file name without the characters a file system won't take */
const fileName = (s)=> s.replace(/[/\\:*?"<>|]/g, '-').trim() || 'untitled';

/** the stretch `from`–`to` (beats) played with `gains`, then `tail` seconds: two channels */
async function render(p, instruments, from, to, tail, gains)
{
    const seconds = LEAD_IN + beatToSeconds(p.tempoMap, to) - beatToSeconds(p.tempoMap, from) + tail;
    let handle = null;
    const buffer = await audioEngine.render(seconds, ()=>
    {
        let tick = ()=> {};
        handle = playProject(p, instruments, { from, until: to, mix: gains, ticker: (ms, fn)=> { tick = fn; return ()=> {}; } });
        return ()=> tick();
    });
    try { handle?.stop(); } catch { /* its nodes went with the offline context */ }
    const skip = Math.round(LEAD_IN * buffer.sampleRate);
    return { channels: [0, 1].map(c => buffer.getChannelData(c).slice(skip)), rate: buffer.sampleRate };
}

/**
 * exports the project as audio
 * @param {{ range?: { from: number, to: number } | null, stems?: boolean, normalized?: boolean, tail?: number }} [options]
 *   range: the beats to export (the whole project without one); stems: each audible track into a folder of its own
 *   files rather than the mix; normalized: the loudest peak brought to −1 dB (for stems, one gain for them all, so
 *   they keep their balance); tail: seconds after the end, for reverb and release
 */
export async function bounce({ range = null, stems = false, normalized = false, tail = TAIL } = {})
{
    stop();
    const p = { ...project.value, loop: null };
    const name = fileName(projectName.value || p.title || 'untitled');
    const from = range?.from ?? 0, to = range?.to ?? projectEnd(p);
    const gains = mix.value;
    try
    {
        const instruments = await loadInstruments(p.tracks, text => { status.value = text; });
        if (!stems)
        {
            status.value = 'Bouncing…';
            const { channels, rate } = await render(p, instruments, from, to, tail, gains);
            const file = await appMenu.saveFile(`${name}.wav`, encodeWavChannels(normalized ? normalize(channels, PEAK_DB) : channels, rate));
            status.value = file ? `Exported ${file}` : '';
            return;
        }
        // a track is exported if it is heard and has a clip in the range
        const audible = p.tracks.map((t, i)=> i).filter(i => gains[i]?.gain > 0 && p.tracks[i].clips.some(c => c.start < to && c.start + c.beats > from && c.notes.length && !c.mute));
        if (!audible.length) { status.value = 'No track to export: none is heard in that range'; return; }
        const folder = await appMenu.chooseFolder(`${name} stems`);
        if (!folder) { status.value = ''; return; }
        // every stem is rendered before any is written, so normalizing can use one gain for them all
        const rendered = [];
        for (const [n, i] of audible.entries())
        {
            status.value = `Bouncing ${p.tracks[i].name} (${n + 1} of ${audible.length})…`;
            rendered.push({ i, ...await render(p, instruments, from, to, tail, gains.map((g, k)=> k === i ? g : { ...g, gain: 0 })) });
        }
        const peak = normalized ? Math.max(...rendered.map(r => peakOf(r.channels))) : 0;
        const used = new Set();
        for (const { i, channels, rate } of rendered)
        {
            let file = `${name} - ${fileName(p.tracks[i].name)}`;
            for (let k = 2; used.has(file); k++) file = `${name} - ${fileName(p.tracks[i].name)} ${k}`;
            used.add(file);
            await appMenu.writeInFolder(`${file}.wav`, encodeWavChannels(normalized ? normalize(channels, PEAK_DB, peak) : channels, rate));
        }
        status.value = `Exported ${rendered.length} tracks to ${folder}`;
    }
    catch (e) { status.value = `Couldn't export: ${e.message}`; }
}
