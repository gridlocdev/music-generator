// Stingers: short cues for game events, written in the key and mode of whatever section is playing, so they fit the
// music under them. Pure; song-player.js plays them on the next beat.
import { degreeToKey } from '../../lib/music-theory.js';
import { STINGERS } from './adaptive-data.js';
import { parseMelody } from './notation.js';

/**
 * @param {string} kind  a STINGERS key
 * @param {number} tonic  pitch class of the section's key
 * @param {string} mode
 * @returns {{ key: number, beat: number, beats: number, vel: number }[]}  beats from the stinger's start
 */
export function stingNotes(kind, tonic, mode)
{
    const s = STINGERS[kind];
    if (!s) throw new Error(`unknown stinger: ${kind}`);
    if (s.semitones)
    {
        let t = 0;
        return s.semitones.map(([up, beats])=> { const n = { key: 60 + tonic + up, beat: t, beats, vel: s.vel }; t += beats; return n; });
    }
    return parseMelody(s.notes).notes.map(n => ({ key: degreeToKey(tonic, mode, n.degree, 5, n.accidental), beat: n.beat, beats: n.beats, vel: s.vel }));
}

/** the part whose instrument plays a stinger: the first of its roles the song has */
export const stingRole = (kind, roles)=> STINGERS[kind].roles.find(r => roles.includes(r)) ?? roles[0];
