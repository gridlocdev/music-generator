// Plays a project through the SoundFont synth: a channel strip per track in a mixer, then its notes (through each
// track's MIDI FX, fx.js) and automation, scheduled a little ahead on the audio clock through the tempo map, so
// timing doesn't depend on the frame rate.
//
// Playback is a chain of segments: each plays from one beat until the end or the loop's end, where the next takes
// over seamlessly at the loop's start, one pass further on so the MIDI FX can vary it. Reverb and delay tails carry
// over the loop point, because nothing is pre-rendered.
import { audioEngine } from '../platform/audio-engine.js';
import { startTicker } from '../platform/ticker.js';
import { createInstrument } from '../audio/soundfont.js';
import { createMixer, dbToGain } from '../audio/mixer.js';
import { beatToSeconds, secondsToBeat } from '../lib/tempo-map.js';
import { trackNotes, projectEnd, isDrums } from './project.js';
import { performProject } from './fx.js';
import { valueAt } from './automation.js';

const LOOKAHEAD = 0.2;          // seconds of notes handed to Web Audio ahead of time
const TICK_MS = 25;             // how often more notes are scheduled
const LEAD_IN = 0.25;           // seconds between pressing play and the first beat
const SWITCH_LEAD = 0.5;        // seconds before the loop's end that the next pass takes over, for its early notes
const PICKUP_BEATS = 1;         // how far before its grid a played note can sound (anticipation, drift)
const GLIDE_SECONDS = 0.08;     // a slide from one note into the next
const DUCK = { seconds: 0.1, attack: 0.01 };     // a duck's dip and recovery

/**
 * Starts playing. Returns a handle: the position in beats, seek(beat), setMix(channels) and stop().
 * @param {import('./project.js').Project} project
 * @param {{ font: any, preset: any }[]} instrumentsOf  from loadInstruments, one per track
 * @param {{ from?: number, mix?: { gain: number, pan: number }[] }} [opts]  from: the beat to start at;
 *   mix: each track's gain and pan to start with (see setMix)
 */
export function playProject(project, instrumentsOf, { from = 0, mix = null } = {})
{
    const ctx = audioEngine.context;
    const map = project.tempoMap;
    const secs = (b)=> beatToSeconds(map, b);
    const tracks = project.tracks;
    const mixer = createMixer({ tempo: map[0].bpm });
    const strips = tracks.map(t => mixer.channel({ volumeDb: 0, pan: t.mixer.pan, lowCut: t.mixer.lowCut,
        reverb: t.mixer.sends.reverb, delay: t.mixer.sends.delay, autoPan: t.mixer.autoPan }));
    strips.forEach((s, i)=> { s.user.gain.value = dbToGain(tracks[i].mixer.volumeDb); });
    const makeInstruments = ()=> instrumentsOf.map((b, i)=> createInstrument(b.font, b.preset, strips[i].input));
    let instruments = makeInstruments();

    // one performance per pass round a loop, each with its own small details; built the first time it's needed
    const passes = new Map();
    const passData = (pass)=>
    {
        if (!passes.has(pass))
        {
            const { tracks: played, events: fxEvents } = performProject(project, pass);
            // note-offs sort before note-ons on the same beat, so a repeated key is released before it restarts.
            // A held note has no off: the next note glides on from it.
            const events = played.flatMap((notes, i)=> notes.flatMap(n => [
                { beat: n.beat, on: true, i, n },
                ...(n.held ? [] : [{ beat: n.beat + n.beats, on: false, i, n }]),
            ])).sort((a, b)=> a.beat - b.beat || +a.on - +b.on);
            passes.set(pass, { played, events, fx: [...fxEvents].sort((a, b)=> a.beat - b.beat) });
            if (passes.size > 3) passes.delete(passes.keys().next().value);
        }
        return passes.get(pass);
    };

    // each track's ducks: the beats of its source track's notes on the duck's keys, far enough apart to come back up
    const ducks = tracks.map(t =>
    {
        const d = t.mixer.duck, source = d && tracks.find(s => s.id === d.from);
        if (!source) return [];
        const out = [];
        for (const b of [...new Set(trackNotes(source).filter(n => d.keys.includes(n.key)).map(n => n.beat))].sort((a, b)=> a - b))
            if (!out.length || secs(b) - secs(out.at(-1)) >= DUCK.seconds) out.push(b);
        return out;
    });
    const duckBeats = [...new Set(ducks.flat())].sort((a, b)=> a - b);

    // A segment plays from beat `from`, starting at audio time `at`, until beat `until`: the notes whose grid (where
    // they belong, before anticipation and drift) is in [from, until), even those that sound just before `from`.
    const end = project.loop?.to ?? projectEnd(project);
    let seg = { at: ctx.currentTime + LEAD_IN, from: Math.max(0, Math.min(end, from)), until: end, pass: 0 };
    const segments = [seg];
    const timeOf = (s, beat)=> s.at + secs(beat) - secs(s.from);
    const current = ()=> segments.findLast(s => s.at <= ctx.currentTime) ?? segments[0];
    const beatNow = (t = ctx.currentTime)=> { const s = segments.findLast(x => x.at <= t) ?? segments[0]; return secondsToBeat(map, secs(s.from) + t - s.at); };

    const duck = (beat, at)=> strips.forEach((s, i)=>
    {
        if (!ducks[i].length || !ducks[i].includes(beat)) return;
        const g = s.fader.gain, db = tracks[i].mixer.duck.db;
        g.setValueAtTime(1, at);
        g.linearRampToValueAtTime(dbToGain(-db), at + DUCK.attack);
        g.linearRampToValueAtTime(1, at + DUCK.seconds);
    });

    // automation lanes are few keyframes, so a segment's are all scheduled when it begins
    const automate = (s)=>
    {
        strips.forEach((strip, i)=>
        {
            const lanes = tracks[i].automation;
            const params = [[strip.tone.frequency, lanes.tone], [strip.reverbSend.gain, lanes.reverb], [strip.delaySend.gain, lanes.delay]];
            for (const [param, keyframes] of params)
            {
                if (!keyframes?.length) continue;
                // just after s.at, so the last segment's ramp ending at s.at isn't dropped short of its target
                param.cancelScheduledValues(s.at + 0.001);
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

    // MIDI FX events that aren't notes: tape stops, and a delay send swelling
    const fxEvent = (e, s)=>
    {
        const at = timeOf(s, e.beat);
        if (e.kind === 'tapeStop') for (const inst of instruments) inst.tapeStop(at - e.seconds, e.seconds, e.rate);
        if (e.kind === 'sendSwell')
        {
            const i = tracks.findIndex(t => t.id === e.track);
            if (i < 0) return;
            const g = strips[i].delaySend.gain, base = tracks[i].mixer.sends.delay;
            g.setValueAtTime(base, at);
            g.linearRampToValueAtTime(e.send, at + (timeOf(s, e.beat + e.beats) - at) * 0.5);
            g.linearRampToValueAtTime(base, timeOf(s, e.beat + e.beats + 1));
        }
    };

    const sounding = new Map();       // `${track}:${key}` → { i, key }, notes on and not yet off
    let next = 0, nextDuck = 0, nextFx = 0, stopped = false;
    const indexFrom = (list, beat, get)=> { const k = list.findIndex(x => get(x) >= beat - 1e-9); return k < 0 ? list.length : k; };
    const begin = (s)=>
    {
        const data = passData(s.pass);
        next = indexFrom(data.events, s.from - PICKUP_BEATS, e => e.beat);
        nextDuck = indexFrom(duckBeats, s.from, b => b);
        nextFx = indexFrom(data.fx, s.from, e => e.beat);
        automate(s);
    };
    begin(seg);

    const schedule = ()=>
    {
        if (stopped) return;    // a tick already queued when playback stopped
        const horizon = ctx.currentTime + LOOKAHEAD;
        for (;;)
        {
            const data = passData(seg.pass);
            // near the loop's end, hand over everything up to it, so the next pass can start early for its pickups
            const boundary = timeOf(seg, seg.until);
            const switching = !!project.loop && boundary - SWITCH_LEAD < horizon;
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
                if (e.n.glideFrom === undefined || !inst.glide(e.n.glideFrom, e.n.key, at, GLIDE_SECONDS)) inst.noteOn(e.n.key, e.n.vel, at, e.n);
                else sounding.delete(`${e.i}:${e.n.glideFrom}`);
                sounding.set(id, { i: e.i, key: e.n.key });
            }
            for (; nextDuck < duckBeats.length && duckBeats[nextDuck] < seg.until - 1e-9 && timeOf(seg, duckBeats[nextDuck]) < limit; nextDuck++)
                duck(duckBeats[nextDuck], timeOf(seg, duckBeats[nextDuck]));
            // a tape stop starts winding down its own length before its beat
            const lead = (e)=> e.kind === 'tapeStop' ? e.seconds : 0;
            for (; nextFx < data.fx.length && data.fx[nextFx].beat < seg.until - 1e-9 && timeOf(seg, data.fx[nextFx].beat) - lead(data.fx[nextFx]) < limit; nextFx++)
                fxEvent(data.fx[nextFx], seg);

            // the loop's end: carry on from its start, one pass further on
            if (!switching) break;
            for (const { i, key } of sounding.values()) instruments[i].noteOff(key, false, boundary);
            sounding.clear();
            seg = { at: boundary, from: project.loop.from, until: end, pass: seg.pass + 1 };
            segments.push(seg);
            if (segments.length > 4) segments.shift();
            begin(seg);
        }
    };
    schedule();
    const stopTicker = startTicker(TICK_MS, schedule);

    const handle = {
        /** position in beats; negative during the lead-in */
        get beat() { return beatNow(); },
        get done() { return stopped || (!project.loop && ctx.currentTime > timeOf(seg, end) + 2); },
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
            const now = ctx.currentTime;
            seg = { at: now, from: beat, until: end, pass: current().pass };
            segments.length = 0;
            segments.push(seg);
            for (const s of strips) { s.fader.gain.cancelScheduledValues(0); s.fader.gain.setValueAtTime(1, now); }
            begin(seg);
            passData(seg.pass).played.forEach((notes, i)=>
            {
                if (isDrums(tracks[i])) return;     // a hit restarted mid-ring would sound like a new one
                for (const n of notes)
                    if (n.grid < beat && n.beat < beat && n.beat + n.beats > beat) { instruments[i].noteOn(n.key, n.vel, now, n); sounding.set(`${i}:${n.key}`, { i, key: n.key }); }
            });
            schedule();
        },
        /**
         * The mixer's settings, one per track: gain (0 mutes) and pan (−1..1). Glides there over a few milliseconds
         * so nothing clicks.
         * @param {{ gain: number, pan: number }[]} channels
         */
        setMix(channels)
        {
            const now = ctx.currentTime;
            channels.forEach((c, i)=>
            {
                const s = strips[i];
                if (!s || !c) return;
                s.user.gain.setTargetAtTime(c.gain, now, 0.01);
                s.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, c.pan)), now, 0.01);
            });
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
    if (mix) for (const [i, c] of mix.entries()) if (strips[i] && c) { strips[i].user.gain.value = c.gain; strips[i].panner.pan.value = Math.max(-1, Math.min(1, c.pan)); }
    return handle;
}
