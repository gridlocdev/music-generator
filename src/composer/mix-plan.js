// How a song's mix is set up and how it moves: each part's channel strip, automation keyframes (a tone filter that
// follows energy and sweeps into builds, reverb that grows in quiet sections and swells across phrases, delay throws
// on the lead's phrase endings), and the kick hits the bass and pad duck under. A genre's `mix` (genre-data.js) sets
// how wet it is and how dark: a dry funk band, a gospel choir in a church, dub's delay, lo-fi's muffled tape.
// Pure, like compose(); to-project.js bakes it into a project's channel strips and automation lanes.
import { beatToSeconds } from '../lib/tempo-map.js';
import { valueAt } from '../daw/automation.js';
import { SECTIONS } from './composer-data.js';
import { MIX, DUCK, MOVEMENT, EXPRESSION } from './performance-data.js';
import { genreProfile } from './plan.js';

/** @typedef {import('../daw/project.js').Keyframe} Keyframe */

/** @param {import('./compose.js').Score} score */
export function planMix(score)
{
    const secs = (b)=> beatToSeconds(score.tempoMap, b);
    const kicks = [...new Set((score.tracks.find(t => t.role === 'drums')?.notes ?? [])
        .filter(n => DUCK.keys.includes(n.key)).map(n => n.beat))].sort((a, b)=> a - b);
    // a dip has to come back up before the next one starts
    const ducks = [];
    for (const b of kicks) if (!ducks.length || secs(b) - secs(ducks.at(-1)) >= DUCK.seconds) ducks.push(b);
    const reverb = reverbScale(score);
    const swells = swellFrames(score, reverb);
    const bright = toneFrames(score, false), swept = toneFrames(score, true);
    /** @type {Keyframe[]} */
    const open = [{ beat: 0, value: MOVEMENT.sweep.open, curve: 'set' }];
    const lead = score.tracks.find(t => t.role === 'lead');
    const G = genreProfile(score.genre).mix ?? {};
    // a genre's tone is a ceiling on every part's filter: lo-fi's tape never opens all the way
    const capped = (frames)=> G.tone ? frames.map(f => ({ ...f, value: Math.min(f.value, G.tone) })) : frames;
    return {
        ducks,
        tracks: score.tracks.map(t =>
        {
            const plain = MIX[t.role] ?? MIX.chords;
            const strip = { ...plain, reverb: plain.reverb * (G.reverb ?? 1), delay: plain.delay * (G.delay ?? 1) };
            const scale = MOVEMENT.swell.roles.includes(t.role) ? swells : reverb;
            return {
                strip,
                duck: ducks.length ? DUCK.db[t.role] ?? 0 : 0,
                /** @type {{ tone: Keyframe[], reverb: Keyframe[], delay: Keyframe[] | null }} */
                frames: {
                    tone: capped(MOVEMENT.sweep.roles.includes(t.role) ? swept : MOVEMENT.brightness.roles.includes(t.role) ? bright : open),
                    reverb: scale.map(f => ({ ...f, value: f.value * strip.reverb })),
                    delay: MOVEMENT.throw.roles.includes(t.role) && strip.delay > 0 && lead ? throwFrames(score, t, strip.delay) : null,
                },
            };
        }),
    };
}

// The tone filter's cutoff follows each section's energy, eased in over its first bar: a quiet verse is darker than
// the chorus. With sweeps, it also closes at the start of each build and opens across it.
/** @returns {Keyframe[]} */
function toneFrames(score, sweeps)
{
    const { low, high } = MOVEMENT.brightness, S = MOVEMENT.sweep;
    const cutoff = (energy)=> low * (high / low) ** energy;
    /** @type {Keyframe[]} */
    const frames = [{ beat: 0, value: cutoff(score.sections[0].energy), curve: 'set' }];
    score.sections.forEach((s, i)=>
    {
        const next = score.sections[i + 1], end = s.beat + s.beats;
        const from = !sweeps ? null
            : SECTIONS[s.type]?.build ? s.beat
            : next?.type === 'chorus' && next.energy - s.energy >= S.rise ? Math.max(s.beat, end - S.bars * s.beatsPerBar)
            : null;
        const v = cutoff(s.energy);
        if (from !== s.beat && i > 0) frames.push({ beat: s.beat, value: frames.at(-1).value, curve: 'set' }, { beat: s.beat + Math.min(s.beatsPerBar, s.beats), value: v, curve: 'exp' });
        if (from === null) return;
        frames.push(
            { beat: from, value: from === s.beat ? frames.at(-1).value : v, curve: 'set' },
            { beat: Math.min(end, from + 1), value: S.closed, curve: 'exp' },
            { beat: end, value: cutoff(next?.energy ?? s.energy), curve: 'exp' });
    });
    return frames;
}

// a multiplier for every reverb send, eased in over the first bar of each section
/** @returns {Keyframe[]} */
function reverbScale(score)
{
    const r = MOVEMENT.reverb;
    const scale = (s, i)=> SECTIONS[s.type]?.ending && i === score.sections.length - 1 ? r.ending
        : SECTIONS[s.type]?.contrast ? r.contrast
        : s.energy < r.quietBelow ? r.quiet : 1;
    /** @type {Keyframe[]} */
    const frames = [{ beat: 0, value: scale(score.sections[0], 0), curve: 'set' }];
    score.sections.forEach((s, i)=>
    {
        const prev = frames.at(-1).value, v = scale(s, i);
        if (i === 0 || v === prev) return;
        frames.push({ beat: s.beat, value: prev, curve: 'set' }, { beat: s.beat + Math.min(s.beatsPerBar, s.beats), value: v, curve: 'linear' });
    });
    return frames;
}

// the reverb scale, rising by MOVEMENT.swell.amount across each phrase and settling back as the next begins
/** @returns {Keyframe[]} */
function swellFrames(score, reverb)
{
    const { amount, bars } = MOVEMENT.swell;
    /** @type {Keyframe[]} */
    const frames = [];
    for (const s of score.sections)
        for (let p = s.beat; p < s.beat + s.beats - 1e-9; p += bars * s.beatsPerBar)
        {
            const end = Math.min(s.beat + s.beats, p + bars * s.beatsPerBar);
            const base = valueAt(reverb, p + 1e-6), settle = Math.min(end, p + 0.5);
            if (frames.length) frames.push({ beat: p, value: frames.at(-1).value, curve: 'set' });
            else frames.push({ beat: p, value: base, curve: 'set' });
            frames.push({ beat: settle, value: base, curve: 'linear' }, { beat: end, value: valueAt(reverb, end - 1e-6) * amount, curve: 'linear' });
        }
    return frames;
}

// delay throws: the send stays low, and opens on the last note of each of the part's phrases so only it echoes
/** @returns {Keyframe[]} */
function throwFrames(score, track, send)
{
    const T = MOVEMENT.throw, bars = EXPRESSION.phrase.bars;
    const low = send * T.base, high = send * T.peak;
    const last = new Map();
    for (const n of track.notes)
    {
        const s = score.sections.findLast(s => s.beat <= n.beat + 1e-9) ?? score.sections[0];
        const id = `${s.beat}:${Math.floor((n.beat - s.beat) / (bars * s.beatsPerBar))}`;
        if (!last.has(id) || last.get(id).beat < n.beat) last.set(id, n);
    }
    /** @type {Keyframe[]} */
    const frames = [{ beat: 0, value: low, curve: 'set' }];
    for (const n of [...last.values()].sort((a, b)=> a.beat - b.beat))
    {
        if (n.beat < frames.at(-1).beat) continue;
        frames.push({ beat: n.beat, value: high, curve: 'set' }, { beat: n.beat + n.beats, value: high, curve: 'set' }, { beat: n.beat + n.beats + 0.5, value: low, curve: 'linear' });
    }
    return frames;
}
