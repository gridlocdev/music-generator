// Song spec → multi-instrument score. Pure and deterministic: the same spec always gives the same notes.
// Every choice is made by a rule from the *-data.js tables; where rules tie, a hash of the song and position decides,
// so nothing is random. docs/COMPOSING.md describes the method and the spec format.
//
// The pipeline, top down:
//   1. song plan (plan.js): form, keys, meters, energy curve, cadences, tempo map, loop; and the motif (melody.js)
//   2. section plan (harmony.js): the chords at the section's harmonic rhythm, ended on its cadence, passing chords
//   3. phrases: the melody from the motif, call and response, harmony voices, then the parts (parts.js)
//   4. arrangement and rhythm passes (arrange.js, syncopation.js)
// Detail and feel that a player adds (ghost notes, scoops, swing, ear candy) come later, in perform.js.
import { degreeToKey, chordName, chordPitchClasses, pitchName } from '../../lib/music-theory.js';
import { beatToSeconds } from '../../lib/tempo-map.js';
import { ARRANGEMENT, ROLES, ROLE_NAMES, MELODY_OCTAVE } from './composer-data.js';
import { velocity, mod } from './meter.js';
import { planSong, energyShape } from './plan.js';
import { sectionChords, callAndResponse, cadenceChord } from './harmony.js';
import { writeMelody, songMotif } from './melody.js';
import { varyMelody, repeatPhrases } from './melody-repeats.js';
import { notatedMelody } from './notation.js';
import { writeChords, writePad, writeArp, writeCounter, writeBass, writeDrums } from './parts.js';
import { arrangeSection } from './arrange.js';
import { syncopate } from './syncopation.js';

export { parseMelody } from './notation.js';

/**
 * @typedef {{ key: number, beat: number, beats: number, vel: number, anticipates?: number }} Note
 *   anticipates: the beat a note pulled a sixteenth early belongs on
 * @typedef {{ role: string, name: string, program: number, bank: number, notes: Note[] }} Track
 * @typedef {{ type: string, label: string, beat: number, beats: number, energy: number, scene: string,
 *   beatsPerBar: number, meter: string, tonic: number, mode: string, climax: boolean }} Section
 * @typedef {{ title: string, genre: string, story: string, emotion: string, key: string, mode: string, tempo: number, beatsPerBar: number,
 *   beats: number, seconds: number, tracks: Track[], sections: Section[],
 *   chords: { beat: number, beats: number, name: string, tones: number[] }[],
 *   tempoMap: import('../../lib/tempo-map.js').TempoSegment[], loop: { from: number, to: number } | null,
 *   flats: boolean, swing: number, swingSub: number, style: object, seed: string, motif: number[] }} Score
 *   flats: the key is spelled with flats
 */

/**
 * @param {object} spec  see docs/COMPOSING.md, "The song spec"
 * @returns {Score}
 */
export function compose(spec)
{
    const plan = planSong(spec);
    const { song, band, feel } = plan;
    const motif = songMotif(spec, plan);

    /** @type {Track[]} */
    const tracks = ROLES.filter(r => band[r] != null).map(role => ({
        role, name: ROLE_NAMES[role], program: band[role], bank: role === 'drums' ? 128 : 0, notes: [],
    }));
    const track = Object.fromEntries(tracks.map(t => [t.role, t]));

    const sections = [], chords = [], themes = {};
    const memory = { chords: null, pad: null, arp: null, bass: 40, counter: null };

    plan.sections.forEach((sec, index)=>
    {
        const { type, over, base } = sec;
        // a hand-written melody keeps its own ending: no cadence it doesn't fit
        const written = typeof over.melody === 'string' ? notatedMelody(over.melody, sec.beats) : null;
        if (written?.length && sec.endOn)
        {
            const last = written.at(-1);
            if (!chordPitchClasses(cadenceChord(sec)).includes(mod(degreeToKey(sec.tonic, sec.mode, last.degree, MELODY_OCTAVE, last.accidental), 12))) sec.endOn = null;
        }
        const timeline = sec.timeline = sectionChords(sec);
        sections.push({
            type, label: sec.label, beat: sec.beat, beats: sec.beats, energy: sec.energy, scene: sec.scene,
            beatsPerBar: sec.beatsPerBar, meter: sec.meter.name, tonic: mod(sec.tonic, 12), mode: sec.mode, climax: sec.climax,
        });
        for (const c of timeline) chords.push({ beat: c.beat, beats: c.beats, name: chordName(c.chord, song.flats), tones: chordPitchClasses(c.chord) });
        const marks = tracks.map(t => t.notes.length);

        // melody: written once per section type (and variant), then replayed; a composed one varies on repeats,
        // a hand-written one is played as written every time
        let lead = [];
        const melodyCfg = over.melody === false ? null : base.melody && { ...base.melody, contour: over.contour ?? feel.contour?.[type] ?? base.melody.contour, ...pick(over, ['register', 'density']) };
        if (track.lead && (melodyCfg || typeof over.melody === 'string'))
        {
            const variant = ['chorus', 'post', 'drop'].includes(type) ? 0 : sec.n;
            const id = `${type}:${variant}`;
            themes[id] ??= written ?? repeatPhrases(writeMelody(sec, melodyCfg, variant, motif, timeline), sec, timeline);
            lead = (written ? themes[id] : varyMelody(themes[id], sec, timeline)).map(m => ({
                key: degreeToKey(sec.tonic, sec.mode, m.degree, MELODY_OCTAVE, m.accidental),
                beat: sec.beat + m.beat, beats: m.beats * (m.last ? 1 : song.legato),
                vel: velocity(sec, 'lead', sec.energy, m.beat),
            }));
        }
        let answers = null;
        if (lead.length && sec.answer && track.counter && !sec.mute.includes('counter'))
            ({ lead, counter: answers } = callAndResponse(lead, sec, timeline));
        track.lead?.notes.push(...lead);

        // which parts play: by fullness, unless muted; a solo is the melody alone (or the pad, with no melody);
        // polyphony brings the countermelody in whatever the fullness
        const on = (role)=> !!track[role] && !sec.mute.includes(role)
            && (sec.texture === 'solo' ? role === 'pad' && !lead.length
                : role === 'drums' ? sec.fullness >= ARRANGEMENT.drums || sec.ending
                : sec.fullness >= ARRANGEMENT[role] || (role === 'counter' && sec.texture === 'polyphonic'));
        if (answers) track.counter.notes.push(...answers);
        else if (on('counter') && !sec.ending) writeCounter(sec, track.counter, memory, lead);
        if (on('arp') && !sec.ending) writeArp(sec, track.arp, memory);
        if (on('chords')) writeChords(sec, track.chords, memory);
        if (on('pad')) writePad(sec, track.pad, memory);
        if (on('bass')) writeBass(sec, track.bass, memory, plan.sections[index + 1] ? null : sec.tonic);
        if (on('drums')) writeDrums(sec, track.drums);
        arrangeSection(sec, tracks, marks);
    });

    syncopate(tracks, plan.sections, song);
    for (const t of tracks) t.notes.sort((a, b)=> a.beat - b.beat || a.key - b.key);

    return {
        title: spec.title ?? spec.id ?? 'Untitled', genre: spec.genre ?? '', story: spec.story ?? '', emotion: plan.emotion,
        key: plan.keyName, mode: song.mode, tempo: song.tempo,
        beatsPerBar: plan.sections[0].beatsPerBar, beats: plan.beats, seconds: beatToSeconds(plan.tempoMap, plan.beats),
        tracks: tracks.filter(t => t.notes.length), sections, chords,
        flats: song.flats, tempoMap: plan.tempoMap, loop: plan.loop, swing: song.swing, swingSub: song.swingSub, style: song.style, seed: song.seed,
        motif: motif.notes.map(n => motif.start + n.step),
    };
}

const pick = (o, keys)=> Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

/**
 * The beat to jump to from `beat` when stepping through sections: +1 the next section's start, -1 this
 * section's start, or the previous section's when within `grace` beats of this one's start (like a track skip).
 * Returns null past the last section.
 */
export function sectionSeek(sections, beat, step, grace = 0)
{
    const i = Math.max(0, sections.findLastIndex(s => s.beat <= beat));
    if (step > 0) return sections[i + 1]?.beat ?? null;
    return beat - sections[i].beat > grace ? sections[i].beat : sections[Math.max(0, i - 1)].beat;
}

/** a short text summary of a score: sections, chords, the energy curve and each part's range and note count */
export function describe(score)
{
    const meters = new Set(score.sections.map(s => s.meter));
    const tempos = score.tempoMap.length > 1 ? `${score.tempo}–${Math.round(Math.max(...score.tempoMap.map(t => t.bpm)))} bpm` : `${score.tempo} bpm`;
    const lines = [`${score.title} — ${score.genre ? `${score.genre}, ` : ''}${score.emotion}, ${score.key} ${score.mode}, ${tempos}, ${[...meters].join(' ')}, ${score.seconds.toFixed(0)} s${score.loop ? ', loops' : ''}`];
    let bar = 1;
    for (const s of score.sections)
    {
        const names = score.chords.filter(c => c.beat >= s.beat && c.beat < s.beat + s.beats).map(c => c.name);
        const meter = s.meter !== score.sections[0].meter ? ` ${s.meter}` : '';
        const key = s.tonic !== score.sections[0].tonic || s.mode !== score.mode ? ` (${pitchName(s.tonic, score.flats)} ${s.mode})` : '';
        lines.push(`  ${s.label.padEnd(14)} bar ${String(bar).padStart(3)}  ${'█'.repeat(Math.round(s.energy * 10)).padEnd(10, '·')} ${s.energy.toFixed(2)}${s.climax ? ' peak' : '     '}${meter}${key}  ${names.join(' ')}`);
        if (s.scene) lines.push(`  ${''.padEnd(14)} “${s.scene}”`);
        bar += Math.round(s.beats / s.beatsPerBar);
    }
    const shape = energyShape(score.sections);
    lines.push(`  energy peaks ${Math.round(shape.peak * 100)}% of the way in, ${shape.dips} dip${shape.dips === 1 ? '' : 's'}${shape.dips ? '' : ' (no contrast: add a quieter section)'}`);
    if (score.story) lines.splice(1, 0, `  ${score.story}`);
    for (const t of score.tracks)
    {
        const keys = t.notes.map(n => n.key);
        lines.push(`  ${t.name.padEnd(14)} program ${t.bank === 128 ? 'kit ' : ''}${t.program}, ${t.notes.length} notes, keys ${Math.min(...keys)}–${Math.max(...keys)}`);
    }
    return lines.join('\n');
}
