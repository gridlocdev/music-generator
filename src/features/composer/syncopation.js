// The rhythm pass over a finished score, scaled by the style's syncopation: phrases that start a sixteenth early,
// accents on offbeat sixteenths in the chords and arpeggio, and notes on the arpeggio where an echo of the lead's
// phrase-ending notes would land. The kick and bass stay on the grid, so the pulse stays clear.
import { hash } from '../../lib/music-theory.js';
import { SYNCOPATION } from './song-craft-data.js';
import { STEP, clamp, sectionAt } from './meter.js';

/**
 * @param {{ role: string, notes: object[] }[]} tracks
 * @param {object[]} sections  section plans
 * @param {object} song  the song plan's shared settings (seed, style)
 */
export function syncopate(tracks, sections, song)
{
    const amount = song.style.syncopation;
    if (!amount) return;
    const roll = (...parts)=> hash(song.seed, 'sync', ...parts) / 2 ** 32;
    const track = (role)=> tracks.find(t => t.role === role);
    const lead = track('lead')?.notes.sort((a, b)=> a.beat - b.beat) ?? [];

    // anticipation: a phrase's first note pulled a sixteenth into the bar before; a long note before it gives way
    const phraseStarts = sections.flatMap(s => Array.from({ length: Math.ceil(s.bars / 4) }, (_, k)=> s.beat + k * 4 * s.beatsPerBar));
    for (const p of phraseStarts)
    {
        const i = lead.findIndex(n => n.beat >= p - 1e-9 && n.beat < p + 1 - 1e-9);
        const n = lead[i];
        if (!n || n.beat < STEP || roll('ant', p) >= amount * SYNCOPATION.anticipate) continue;
        const before = lead[i - 1];
        if (before && before.beat + before.beats > n.beat - STEP + 1e-9)
        {
            if (before.beats < 1) continue;
            before.beats = n.beat - STEP - before.beat;
        }
        n.anticipates = n.beat;
        n.beat -= STEP;
        n.beats += STEP;
    }

    // offbeat accents: the "e" and "a" of each beat a little louder, for the parts that can push against the pulse
    for (const role of ['chords', 'arp'])
        for (const n of track(role)?.notes ?? [])
        {
            const frac = n.beat - Math.floor(n.beat);
            if (Math.abs(frac - 0.25) < 1e-6 || Math.abs(frac - 0.75) < 1e-6) n.vel = clamp(Math.round(n.vel + amount * SYNCOPATION.offbeatAccent), 1, 127);
        }

    // echo rhythms: where a dotted-eighth delay of a phrase's last lead note would land, the resting arpeggio plays it,
    // but never where the arrangement wants quiet: an ending, a muted or solo section, a breath, an intro's entries
    const arp = track('arp');
    if (!arp) return;
    const busy = (from, to)=> arp.notes.some(a => a.beat < to && a.beat + a.beats > from);
    const end = sections.at(-1).beat + sections.at(-1).beats;
    const quiet = (from, to)=>
    {
        const s = sectionAt(sections, from);
        if (s !== sectionAt(sections, to - 1e-6)) return true;
        const breath = s.breath ? s.beat + s.beats - s.breath.beats : Infinity;
        return s.ending || s.entries || s.texture === 'solo' || s.mute.includes('arp') || to > breath + 1e-9;
    };
    lead.forEach((n, i)=>
    {
        const next = lead[i + 1];
        if (n.beats < 1 || (next && next.beat < n.beat + 2) || roll('echo', n.beat) >= amount) return;
        const key = n.key < 57 ? n.key + 12 : n.key;
        for (const [after, level] of SYNCOPATION.echo)
        {
            const at = n.beat + after;
            if (at + STEP <= end && !quiet(at, at + STEP) && !busy(at, at + STEP)) arp.notes.push({ key, beat: at, beats: STEP, vel: clamp(Math.round(n.vel * level), 1, 127) });
        }
    });
}
