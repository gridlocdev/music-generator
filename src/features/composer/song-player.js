// Plays a composed score through the SoundFont synth: loads each part's instrument, gives each part a channel
// strip in a mixer, then schedules the performed notes (perform.js) and the mix's automation (mix-plan.js)
// a little ahead on the audio clock, so timing doesn't depend on the frame rate.
import { audioEngine } from '../../platform/audio-engine.js';
import { startTicker } from '../../platform/ticker.js';
import { SOUNDFONTS } from '../../audio/soundfont-catalog-data.js';
import { loadSoundFont, findPreset, createInstrument } from '../../audio/soundfont.js';
import { createMixer, dbToGain } from '../../audio/mixer.js';
import { EXPRESSION, DUCK } from './composer-data.js';
import { perform } from './perform.js';
import { planMix, valueAt } from './mix-plan.js';

const LOOKAHEAD = 0.2;          // seconds of notes handed to Web Audio ahead of time
const TICK_MS = 25;             // how often more notes are scheduled
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
    const fonts = new Map(await Promise.all(urls.map(async u => /** @type {[string, any]} */ ([u, await loadSoundFont(u, (loaded, total)=> { progress.set(u, loaded / total); report(); })]))));
    return entries.map(entry =>
    {
        const font = fonts.get(entry.url);
        const preset = findPreset(font, entry.bank, entry.program);
        if (!preset) throw new Error(`no preset ${entry.bank}:${entry.program} in ${entry.url}`);
        return { font, preset, entry };
    });
}

/**
 * Starts playing. Returns a handle with the current position in beats, seek(beat) and stop().
 * @param {import('./compose.js').Score} score
 * @param {{ font: any, preset: any }[]} band  from loadBand, one per track
 */
export function playScore(score, band)
{
    const ctx = audioEngine.context;
    const spb = 60 / score.tempo;
    let start = ctx.currentTime + LEAD_IN;
    const plan = planMix(score);
    const mixer = createMixer({ tempo: score.tempo });
    const strips = plan.tracks.map(t => mixer.channel(t.strip));
    const makeInstruments = ()=> band.map((b, i)=> createInstrument(b.font, b.preset, strips[i].input));
    let instruments = makeInstruments();
    const performed = perform(score);

    // times in seconds from the first beat; note-offs sort before note-ons at the same time,
    // so a repeated key is released before it restarts. A held note has no off: the next note glides on from it.
    const events = performed.flatMap((notes, i)=> notes.flatMap(n => [
        { time: n.beat * spb, on: true, i, n },
        ...(n.held ? [] : [{ time: (n.beat + n.beats) * spb, on: false, i, n }]),
    ])).sort((a, b)=> a.time - b.time || +a.on - +b.on);
    const ducks = plan.ducks.map(b => b * spb);

    // the bass and pad dip on each kick, scheduled with the notes
    const duck = (at)=> strips.forEach((s, i)=>
    {
        const db = plan.tracks[i].duck;
        if (!db) return;
        const g = s.fader.gain;
        g.setValueAtTime(s.level, at);
        g.linearRampToValueAtTime(s.level * dbToGain(-db), at + DUCK.attack);
        g.linearRampToValueAtTime(s.level, at + DUCK.seconds);
    });

    // the sweeps and reverb moves are few, so they're all scheduled at once from a beat, and again after a seek
    const automate = (fromBeat)=>
    {
        const now = ctx.currentTime;
        strips.forEach((s, i)=>
        {
            s.fader.gain.cancelScheduledValues(0);
            s.fader.gain.setValueAtTime(s.level, now);
            const { frames } = plan.tracks[i];
            for (const [param, keyframes] of [[s.tone.frequency, frames.tone], [s.reverbSend.gain, frames.reverb]])
            {
                param.cancelScheduledValues(0);
                param.setValueAtTime(valueAt(keyframes, fromBeat), now);
                for (const f of keyframes)
                {
                    if (f.beat <= fromBeat) continue;
                    const t = start + f.beat * spb;
                    if (f.curve === 'exp') param.exponentialRampToValueAtTime(f.value, t);
                    else if (f.curve === 'linear') param.linearRampToValueAtTime(f.value, t);
                    else param.setValueAtTime(f.value, t);
                }
            }
        });
    };
    automate(0);

    let next = 0, nextDuck = 0, stopped = false;
    const schedule = ()=>
    {
        if (stopped) return;    // a tick already queued when the song stopped
        const until = ctx.currentTime + LOOKAHEAD - start;
        for (; next < events.length && events[next].time < until; next++)
        {
            const { on, i, n, time } = events[next];
            const at = start + time, inst = instruments[i];
            if (!on) inst.noteOff(n.key, false, at);
            else if (n.glideFrom === undefined || !inst.glide(n.glideFrom, n.key, at, EXPRESSION.glide.seconds)) inst.noteOn(n.key, n.vel, at, n);
        }
        for (; nextDuck < ducks.length && ducks[nextDuck] < until; nextDuck++) duck(start + ducks[nextDuck]);
    };
    schedule();
    const stopTicker = startTicker(TICK_MS, schedule);

    return {
        /** position in beats; negative during the lead-in */
        get beat() { return (ctx.currentTime - start) / spb; },
        get done() { return stopped || ctx.currentTime > start + score.seconds + 2; },
        /** jumps to a beat: cuts what's sounding or scheduled, and restarts notes that are held across that beat */
        seek(beat)
        {
            if (stopped) return;
            beat = Math.max(0, Math.min(score.beats, beat));
            for (const inst of instruments) inst.dispose();
            instruments = makeInstruments();
            const now = ctx.currentTime;
            start = now - beat * spb;
            const at = beat * spb;
            next = events.findIndex(e => e.time >= at);
            if (next < 0) next = events.length;
            nextDuck = ducks.findIndex(t => t >= at);
            if (nextDuck < 0) nextDuck = ducks.length;
            automate(beat);
            performed.forEach((notes, i)=>
            {
                if (score.tracks[i].role === 'drums') return;     // a hit restarted mid-ring would sound like a new one
                for (const n of notes)
                    if (n.beat < beat && n.beat + n.beats > beat) instruments[i].noteOn(n.key, n.vel, now, n);
            });
            schedule();
        },
        stop()
        {
            if (stopped) return;
            stopped = true;
            stopTicker();
            for (const inst of instruments) inst.dispose();
            mixer.dispose();
        },
    };
}
