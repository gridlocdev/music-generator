// Plays a composed score through the SoundFont synth: loads each part's instrument, gives each part a channel
// strip in a mixer, then schedules the performed notes (perform.js) and the mix's automation (mix-plan.js)
// a little ahead on the audio clock, through the song's tempo map, so timing doesn't depend on the frame rate.
//
// For games, playback is a chain of segments: each plays the score from one beat until a boundary, where the next
// takes over seamlessly. A loop is a segment ending at the loop's end and the next starting at its top, one pass
// further on so its details differ; queue() switches section at the next bar or phrase; setIntensity() fades parts
// in and out (vertical layering); sting() plays a cue on the next beat, in key. Reverb and delay tails carry over
// any boundary, because nothing is pre-rendered.
import { audioEngine } from '../../platform/audio-engine.js';
import { startTicker } from '../../platform/ticker.js';
import { SOUNDFONTS } from '../../audio/soundfont-catalog-data.js';
import { loadSoundFont, findPreset, createInstrument } from '../../audio/soundfont.js';
import { createMixer, dbToGain } from '../../audio/mixer.js';
import { beatToSeconds, secondsToBeat, bpmAt } from '../../lib/tempo-map.js';
import { EXPRESSION, DUCK, MIX, AUTO_PAN } from './performance-data.js';
import { LAYERS, LAYER_FADE_BARS, EAR_CANDY } from './adaptive-data.js';
import { perform } from './perform.js';
import { planMix, valueAt } from './mix-plan.js';
import { planEarCandy } from './ear-candy.js';
import { stingNotes, stingRole } from './stingers.js';
import { barAt, sectionAt } from './meter.js';

const LOOKAHEAD = 0.2;          // seconds of notes handed to Web Audio ahead of time
const TICK_MS = 25;             // how often more notes are scheduled
const LEAD_IN = 0.25;           // seconds between pressing play and the first beat
const SWITCH_LEAD = 0.5;        // seconds before a loop or jump that the next segment takes over, for its early notes
const PICKUP_BEATS = 1;         // how far before its grid a performed note can sound (anticipation, drift)

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
 * Starts playing. Returns a handle: the current position in beats, seek(beat), queue(section, at), setIntensity(x),
 * sting(kind) and stop().
 * @param {import('./compose.js').Score} score
 * @param {{ font: any, preset: any }[]} band  from loadBand, one per track
 */
export function playScore(score, band)
{
    const ctx = audioEngine.context;
    const map = score.tempoMap;
    const secs = (b)=> beatToSeconds(map, b);
    const plan = planMix(score);
    const mixer = createMixer({ tempo: score.tempo });
    const strips = plan.tracks.map((t, i)=> mixer.channel({ ...t.strip, autoPan: AUTO_PAN[score.tracks[i].role] }));
    const stingStrip = mixer.channel(MIX.sting);
    const makeInstruments = ()=> band.map((b, i)=> createInstrument(b.font, b.preset, strips[i].input));
    let instruments = makeInstruments();
    const roles = score.tracks.map(t => t.role);
    const stingers = new Map();       // role → an instrument of that part's preset, on the sting strip

    // one performance per pass round a loop, each with its own small details; built the first time it's needed
    const passes = new Map();
    const passData = (pass)=>
    {
        if (!passes.has(pass))
        {
            const candy = planEarCandy(score, pass);
            const performed = perform(score, pass, candy);
            // note-offs sort before note-ons on the same beat, so a repeated key is released before it restarts.
            // A held note has no off: the next note glides on from it.
            const events = performed.flatMap((notes, i)=> notes.flatMap(n => [
                { beat: n.beat, on: true, i, n },
                ...(n.held ? [] : [{ beat: n.beat + n.beats, on: false, i, n }]),
            ])).sort((a, b)=> a.beat - b.beat || +a.on - +b.on);
            passes.set(pass, { performed, events, candy });
            if (passes.size > 3) passes.delete(passes.keys().next().value);
        }
        return passes.get(pass);
    };

    // A segment plays the score from beat `from`, starting at audio time `at`, until beat `until`: the notes whose grid
    // (where they belong, before anticipation and drift) is in [from, until), even those that sound just before `from`.
    const end = score.loop?.to ?? score.beats;
    let seg = { at: ctx.currentTime + LEAD_IN, from: 0, until: end, pass: 0 };
    const segments = [seg];
    let pending = null;     // { to } : the beat the next segment starts from, when seg.until comes from queue()
    const timeOf = (s, beat)=> s.at + secs(beat) - secs(s.from);
    const current = ()=> segments.findLast(s => s.at <= ctx.currentTime) ?? segments[0];
    const beatNow = (t = ctx.currentTime)=> { const s = segments.findLast(x => x.at <= t) ?? segments[0]; return secondsToBeat(map, secs(s.from) + t - s.at); };

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

    // the sweeps, reverb moves and delay throws are few, so a segment's are all scheduled when it begins
    const automate = (s)=>
    {
        strips.forEach((strip, i)=>
        {
            const { frames } = plan.tracks[i];
            const params = [[strip.tone.frequency, frames.tone], [strip.reverbSend.gain, frames.reverb], [strip.delaySend.gain, frames.delay]];
            for (const [param, keyframes] of params)
            {
                if (!keyframes) continue;
                param.cancelScheduledValues(s.at);
                param.setValueAtTime(valueAt(keyframes, s.from), Math.max(ctx.currentTime, s.at));
                for (const f of keyframes)
                {
                    if (f.beat <= s.from || f.beat > s.until) continue;
                    const t = timeOf(s, f.beat);
                    if (f.curve === 'exp') param.exponentialRampToValueAtTime(f.value, t);
                    else if (f.curve === 'linear') param.linearRampToValueAtTime(f.value, t);
                    else param.setValueAtTime(f.value, t);
                }
            }
        });
    };

    // ear candy that isn't notes: tape stops, and the delay send swelling under a flourish
    const candy = (c, s)=>
    {
        const at = timeOf(s, c.beat);
        if (c.kind === 'tapeStop') for (const inst of instruments) inst.tapeStop(at - c.seconds, c.seconds, EAR_CANDY.tapeStop.rate);
        if (c.kind === 'flourish')
        {
            const strip = strips[roles.indexOf(c.role)], g = strip.delaySend.gain;
            const base = plan.tracks[roles.indexOf(c.role)].strip.delay;
            g.setValueAtTime(base, at);
            g.linearRampToValueAtTime(EAR_CANDY.flourish.send, at + (timeOf(s, c.beat + c.beats) - at) * 0.5);
            g.linearRampToValueAtTime(base, timeOf(s, c.beat + c.beats + 1));
        }
    };

    const sounding = new Map();       // `${track}:${key}` → { i, key }, notes on and not yet off
    let next = 0, nextDuck = 0, nextCandy = 0, stopped = false;
    const indexFrom = (list, beat, get)=> { const k = list.findIndex(x => get(x) >= beat - 1e-9); return k < 0 ? list.length : k; };
    const begin = (s)=>
    {
        const data = passData(s.pass);
        next = indexFrom(data.events, s.from - PICKUP_BEATS, e => e.beat);
        nextDuck = indexFrom(plan.ducks, s.from, b => b);
        nextCandy = indexFrom(data.candy, s.from, c => c.beat);
        automate(s);
    };
    begin(seg);

    const schedule = ()=>
    {
        if (stopped) return;    // a tick already queued when the song stopped
        const horizon = ctx.currentTime + LOOKAHEAD;
        for (;;)
        {
            const data = passData(seg.pass);
            // near the segment's end, hand over everything up to it, so the next can start early for its pickups
            const boundary = timeOf(seg, seg.until);
            const to = pending?.to ?? (score.loop ? score.loop.from : null);
            const switching = to !== null && boundary - SWITCH_LEAD < horizon;
            const limit = switching ? Infinity : horizon;
            for (; next < data.events.length; next++)
            {
                const e = data.events[next];
                if (e.beat > seg.until + 1e-9) break;
                if (e.n.grid < seg.from - 1e-9 || e.n.grid > seg.until - 1e-9) continue;    // another segment's note
                const at = timeOf(seg, e.beat);
                if (at >= limit) break;
                const inst = instruments[e.i], id = `${e.i}:${e.n.key}`;
                if (!e.on) { inst.noteOff(e.n.key, false, at); sounding.delete(id); continue; }
                if (e.n.glideFrom === undefined || !inst.glide(e.n.glideFrom, e.n.key, at, EXPRESSION.glide.seconds)) inst.noteOn(e.n.key, e.n.vel, at, e.n);
                else sounding.delete(`${e.i}:${e.n.glideFrom}`);
                sounding.set(id, { i: e.i, key: e.n.key });
            }
            for (; nextDuck < plan.ducks.length && plan.ducks[nextDuck] < seg.until - 1e-9 && timeOf(seg, plan.ducks[nextDuck]) < limit; nextDuck++)
                duck(timeOf(seg, plan.ducks[nextDuck]));
            // a tape stop starts winding down its own length before its beat
            const lead = (c)=> c.kind === 'tapeStop' ? c.seconds : 0;
            for (; nextCandy < data.candy.length && data.candy[nextCandy].beat < seg.until - 1e-9 && timeOf(seg, data.candy[nextCandy].beat) - lead(data.candy[nextCandy]) < limit; nextCandy++)
                candy(data.candy[nextCandy], seg);

            // the segment's end: carry on from the queued beat, or round the loop
            if (!switching) break;
            for (const { i, key } of sounding.values()) instruments[i].noteOff(key, false, boundary);
            sounding.clear();
            const wrapped = !pending;
            pending = null;
            seg = { at: boundary, from: to, until: end, pass: seg.pass + (wrapped ? 1 : 0) };
            segments.push(seg);
            if (segments.length > 4) segments.shift();
            begin(seg);
        }
    };
    schedule();
    const stopTicker = startTicker(TICK_MS, schedule);

    // where the next bar, phrase (4 bars) or section starts, past what's already been handed to Web Audio
    const boundaryAfter = (beat, at)=>
    {
        const i = score.sections.findLastIndex(s => s.beat <= beat + 1e-9);
        if (at === 'section') return score.sections[i + 1]?.beat ?? end;
        const s = score.sections[Math.max(0, i)], bar = barAt(score.sections, beat);
        const bars = at === 'phrase' ? 4 : 1;
        const k = Math.floor((bar.start - s.beat) / s.beatsPerBar / bars + 1e-9) + 1;
        return Math.min(s.beat + s.beats, s.beat + k * bars * s.beatsPerBar);
    };

    return {
        /** position in beats; negative during the lead-in */
        get beat() { return beatNow(); },
        get done() { return stopped || (!score.loop && ctx.currentTime > timeOf(seg, score.beats) + 2); },
        /** the pass round the loop that's playing, from 0 */
        get pass() { return current().pass; },
        /** jumps to a beat now: cuts what's sounding or scheduled, and restarts notes that are held across that beat */
        seek(beat)
        {
            if (stopped) return;
            beat = Math.max(0, Math.min(end, beat));
            for (const inst of instruments) inst.dispose();
            instruments = makeInstruments();
            sounding.clear();
            pending = null;
            const now = ctx.currentTime;
            seg = { at: now, from: beat, until: end, pass: current().pass };
            segments.length = 0;
            segments.push(seg);
            for (const s of strips) { s.fader.gain.cancelScheduledValues(0); s.fader.gain.setValueAtTime(s.level, now); }
            begin(seg);
            passData(seg.pass).performed.forEach((notes, i)=>
            {
                if (score.tracks[i].role === 'drums') return;     // a hit restarted mid-ring would sound like a new one
                for (const n of notes)
                    if (n.grid < beat && n.beat < beat && n.beat + n.beats > beat) { instruments[i].noteOn(n.key, n.vel, now, n); sounding.set(`${i}:${n.key}`, { i, key: n.key }); }
            });
            schedule();
        },
        /**
         * Horizontal resequencing: carries on from a section (its index, label or type) once the music reaches the
         * next bar, phrase or section boundary, rather than cutting in at once.
         * @param {number | string} section
         * @param {'bar' | 'phrase' | 'section'} [at]
         */
        queue(section, at = 'bar')
        {
            const target = typeof section === 'number' ? score.sections[section]
                : score.sections.find(s => s.label.toLowerCase() === String(section).toLowerCase()) ?? score.sections.find(s => s.type === section);
            if (!target || stopped) return false;
            // past what's scheduled and the next segment's early start; if the loop comes round first, the switch happens there
            const from = Math.max(seg.from, beatNow(ctx.currentTime + LOOKAHEAD + SWITCH_LEAD + 0.05));
            seg.until = Math.min(seg.until, boundaryAfter(from, at));
            pending = { to: target.beat };
            return true;
        },
        /**
         * Vertical layering: 0 is calm (pad and bass), 1 is everything; parts fade in or out over a bar (LAYERS).
         * null plays every part, whatever the intensity.
         */
        setIntensity(x)
        {
            const now = ctx.currentTime, b = beatNow();
            const fade = LAYER_FADE_BARS * barAt(score.sections, Math.max(0, b)).beatsPerBar * 60 / bpmAt(map, Math.max(0, b));
            strips.forEach((s, i)=>
            {
                const on = x === null || x >= (LAYERS[roles[i]] ?? 0);
                const g = s.layer.gain;
                g.cancelScheduledValues(now);
                g.setValueAtTime(g.value, now);
                g.linearRampToValueAtTime(on ? 1 : 0, now + fade);
            });
        },
        /** a stinger on the next beat, in the key of the section playing then */
        sting(kind)
        {
            if (stopped) return;
            // the next beat, in whichever segment is playing then; past its end, the first beat of what follows
            const soon = ctx.currentTime + 0.05;
            const s = segments.findLast(x => x.at <= soon) ?? segments[0];
            let b = Math.ceil(secondsToBeat(map, secs(s.from) + soon - s.at) - 1e-6);
            let at = timeOf(s, b), keyAt = b;
            if (b >= s.until - 1e-9)
            {
                const after = segments[segments.indexOf(s) + 1];
                at = timeOf(s, s.until);
                keyAt = after?.from ?? pending?.to ?? score.loop?.from ?? s.until;
                b = keyAt;
            }
            const section = sectionAt(score.sections, keyAt);
            const notes = stingNotes(kind, section.tonic, section.mode);
            const role = stingRole(kind, roles);
            if (!stingers.has(role)) { const k = roles.indexOf(role); stingers.set(role, createInstrument(band[k].font, band[k].preset, stingStrip.input)); }
            const inst = stingers.get(role), spb = 60 / bpmAt(map, Math.max(0, b));
            for (const n of notes)
            {
                inst.noteOn(n.key, n.vel, at + n.beat * spb);
                inst.noteOff(n.key, false, at + (n.beat + n.beats) * spb);
            }
        },
        stop()
        {
            if (stopped) return;
            stopped = true;
            stopTicker();
            for (const inst of [...instruments, ...stingers.values()]) inst.dispose();
            mixer.dispose();
        },
    };
}
