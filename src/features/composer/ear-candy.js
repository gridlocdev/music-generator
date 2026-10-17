// The ear-candy layer: small memorable details at structural points (section starts, the end of every few bars),
// each with a low chance and a cooldown so it never overdoes anything. Pure: a hash of the song and the loop pass
// decides, so each pass round a loop gets different details while the music stays the same.
// perform.js plays the note events (risers, accents, flourishes); song-player.js the tape stops and send swells.
import { hash } from '../../lib/music-theory.js';
import { EAR_CANDY } from './adaptive-data.js';

/**
 * @typedef {{ kind: 'riser', beat: number, roles: string[] }
 *   | { kind: 'accent', beat: number, role: string, key: number }
 *   | { kind: 'flourish', beat: number, beats: number, role: string, keys: number[] }
 *   | { kind: 'tapeStop', beat: number, seconds: number }} Candy
 */

/**
 * @param {import('./compose.js').Score} score
 * @param {number} [pass]  which time round a loop
 * @returns {Candy[]}
 */
export function planEarCandy(score, pass = 0)
{
    const E = EAR_CANDY;
    const chance = E.chance * (score.style?.earCandy ?? 0);
    const roll = (...p)=> hash(score.seed, 'candy', pass, ...p) / 2 ** 32;
    const first = (roles)=> roles.find(r => score.tracks.some(t => t.role === r));
    /** @type {Candy[]} */
    const out = [];

    const points = [];
    score.sections.forEach((s, i)=>
    {
        const prev = score.sections[i - 1];
        if (prev) points.push({ beat: s.beat, s, prev });
        const bars = Math.round(s.beats / s.beatsPerBar);
        for (let b = E.everyBars; b <= bars; b += E.everyBars) points.push({ beat: s.beat + b * s.beatsPerBar, s, bar: true });
    });
    points.sort((a, b)=> a.beat - b.beat || +!!a.bar - +!!b.bar);

    let quietUntil = -Infinity;
    for (const p of points)
    {
        // a change of key always slides in on a riser, chance or not
        const keyChange = !p.bar && p.s.tonic !== p.prev.tonic;
        if (!keyChange && (p.beat < quietUntil || roll(p.beat) >= chance)) continue;
        const options = keyChange ? [riser(p)] : p.bar ? [flourish(p)] : [riser(p), accent(p), tapeStop(p)];
        const usable = options.filter(Boolean);
        if (!usable.length) continue;
        out.push(usable[Math.floor(roll('kind', p.beat) * usable.length)]);
        quietUntil = p.beat + E.cooldownBars * p.s.beatsPerBar;
    }
    return out;

    function riser(p)
    {
        const roles = E.riser.roles.filter(r => score.tracks.some(t => t.role === r));
        return roles.length && (p.s.energy - p.prev.energy >= E.riser.minRise || p.s.tonic !== p.prev.tonic) ? { kind: 'riser', beat: p.beat, roles } : null;
    }
    function accent(p)
    {
        const role = first(E.accent.roles);
        return role && p.s.energy >= E.accent.minEnergy ? { kind: 'accent', beat: p.beat, role, key: (E.accent.octave + 1) * 12 + p.s.tonic } : null;
    }
    function tapeStop(p)
    {
        return E.tapeStop.into.includes(p.s.type) ? { kind: 'tapeStop', beat: p.beat, seconds: E.tapeStop.seconds } : null;
    }
    function flourish(p)
    {
        const role = first(E.flourish.roles);
        const at = p.beat - 1;
        const chord = score.chords.findLast(c => c.beat <= at + 1e-9);
        if (!role || !chord || p.s.type === 'outro') return null;
        const octaves = E.flourish.octaves[Math.floor(roll('oct', p.beat) * E.flourish.octaves.length)];
        const base = 60 + 12 * octaves;
        const keys = [];
        for (let i = 0; keys.length < 1 / E.flourish.step; i++)
        {
            const pc = chord.tones[i % chord.tones.length];
            keys.push(base + ((pc - base) % 12 + 12) % 12 + 12 * Math.floor(i / chord.tones.length));
        }
        return { kind: 'flourish', beat: at, beats: 1, role, keys: keys.sort((a, b)=> a - b) };
    }
}
