// Song spec → multi-instrument score. Pure and deterministic: the same spec always gives the same notes.
// Every choice is made by a rule from composer-data.js and patterns-data.js; where rules tie, a hash of the
// song and position decides, so nothing is random. docs/COMPOSING.md describes the method and the spec format.
import { pitchClass, degreeToKey, parseProgression, chordName } from '../../lib/music-theory.js';
import { EMOTIONS, FORMS, SECTIONS, REPEAT_LIFT, ARRANGEMENT, ROLES, ROLE_NAMES, MELODY_OCTAVE } from './composer-data.js';
import { GROOVES, ARPS } from './patterns-data.js';
import { chordTimeline, velocity, applySwing, clamp } from './meter.js';
import { writeMelody, notatedMelody } from './melody.js';
import { writeChords, writePad, writeArp, writeCounter, writeBass, writeDrums } from './parts.js';

export { parseMelody } from './melody.js';

/**
 * @typedef {{ key: number, beat: number, beats: number, vel: number }} Note
 * @typedef {{ role: string, name: string, program: number, bank: number, notes: Note[] }} Track
 * @typedef {{ title: string, emotion: string, key: string, mode: string, tempo: number, beatsPerBar: number,
 *   beats: number, seconds: number, tracks: Track[],
 *   sections: { type: string, label: string, beat: number, beats: number, energy: number }[],
 *   chords: { beat: number, beats: number, name: string }[] }} Score
 */

/**
 * @param {object} spec  see docs/COMPOSING.md, "The song spec"
 * @returns {Score}
 */
export function compose(spec)
{
    const emotion = spec.emotion ?? 'hopeful';
    const feel = EMOTIONS[emotion];
    if (!feel) throw new Error(`unknown emotion: ${emotion}`);
    const mode = spec.mode ?? feel.mode;
    const keyName = spec.key ?? feel.key;
    const groove = GROOVES[spec.groove ?? feel.groove];
    if (!groove) throw new Error(`unknown groove: ${spec.groove}`);
    const grooveName = spec.groove ?? feel.groove;
    const form = Array.isArray(spec.form) ? spec.form : FORMS[spec.form ?? feel.form];
    if (!form) throw new Error(`unknown form: ${spec.form}`);
    const band = { ...feel.band, ...spec.band };
    if (band.drums !== null && grooveName === 'none') band.drums = null;

    const song = {
        tonic: pitchClass(keyName),
        mode,
        beatsPerBar: groove.beats,
        tempo: spec.tempo ?? feel.tempo,
        legato: spec.legato ?? feel.legato,
        dynamics: spec.dynamics ?? feel.dynamics,
        power: spec.power ?? feel.power ?? false,
        comp: spec.comp ?? feel.comp,
        arp: ARPS[spec.arp ?? feel.arp],
        groove, grooveName,
        seed: String(spec.seed ?? spec.title ?? spec.id ?? 'song'),
        flats: /b/.test(keyName) || keyName === 'F' || (/minor|dorian|phrygian/i.test(mode) && ['D', 'G', 'C', 'F'].includes(keyName)),
    };

    /** @type {Track[]} */
    const tracks = ROLES.filter(r => band[r] != null).map(role => ({
        role, name: ROLE_NAMES[role], program: band[role], bank: role === 'drums' ? 128 : 0, notes: [],
    }));
    const track = Object.fromEntries(tracks.map(t => [t.role, t]));

    const sections = [], chords = [];
    const seen = {}, themes = {};
    const memory = { chords: null, pad: null, arp: null, bass: 40, counter: null };
    const lastChorus = form.lastIndexOf('chorus');
    let beat = 0, transpose = 0;

    form.forEach((type, index)=>
    {
        const base = SECTIONS[type];
        if (!base) throw new Error(`unknown section: ${type}`);
        const over = spec.sections?.[type] ?? {};
        const n = seen[type] = (seen[type] ?? -1) + 1;
        if (spec.lift && index === lastChorus && n > 0) transpose += spec.lift === true ? 2 : spec.lift;

        const bars = over.bars ?? base.bars;
        const energy = clamp((over.energy ?? base.energy) + REPEAT_LIFT * n, 0, 1);
        const nextType = form[index + 1];
        const nextEnergy = nextType ? (spec.sections?.[nextType]?.energy ?? SECTIONS[nextType]?.energy ?? 0) : 0;
        const tonic = song.tonic + transpose;
        const progression = parseProgression(over.progression ?? feel.progressions[type] ?? feel.progressions.verse, tonic, mode);
        const timeline = chordTimeline(progression, bars, song.beatsPerBar, beat);

        const sec = {
            ...song, type, n, bars, energy, tonic, beat, timeline, base,
            fill: !!nextType && (nextEnergy > energy + 0.05 || !!base.build),
            ending: !!base.ending && index === form.length - 1,
        };
        sections.push({ type, label: label(type, n, form), beat, beats: bars * song.beatsPerBar, energy });
        for (const c of timeline) chords.push({ beat: c.beat, beats: c.beats, name: chordName(c.chord, song.flats) });

        // melody: written once per section type (and variant), then replayed, so choruses are recognisable
        const melodyCfg = over.melody === false ? null : base.melody && { ...base.melody, contour: over.contour ?? feel.contour?.[type] ?? base.melody.contour, ...pick(over, ['register', 'density']) };
        if (track.lead && (melodyCfg || typeof over.melody === 'string'))
        {
            const variant = type === 'chorus' || type === 'post' ? 0 : n;
            const id = `${type}:${variant}`;
            themes[id] ??= typeof over.melody === 'string'
                ? notatedMelody(over.melody, bars * song.beatsPerBar)
                : writeMelody(sec, melodyCfg, variant);
            for (const m of themes[id])
                track.lead.notes.push({
                    key: degreeToKey(tonic, mode, m.degree, MELODY_OCTAVE, m.accidental),
                    beat: beat + m.beat, beats: m.beats * (m.last ? 1 : song.legato),
                    vel: velocity(song, 'lead', energy, m.beat),
                });
        }

        const on = (role)=> track[role] && energy >= ARRANGEMENT[role] && over.mute?.includes(role) !== true;
        if (on('counter') && !sec.ending) writeCounter(sec, track.counter, memory);
        if (on('arp') && !sec.ending) writeArp(sec, track.arp, memory);
        if (on('chords')) writeChords(sec, track.chords, memory);
        if (track.pad && over.mute?.includes('pad') !== true) writePad(sec, track.pad, memory);
        if (on('bass')) writeBass(sec, track.bass, memory, form[index + 1] ? null : tonic);
        if (track.drums && (energy >= ARRANGEMENT.drums || sec.ending) && over.mute?.includes('drums') !== true) writeDrums(sec, track.drums);

        beat += bars * song.beatsPerBar;
    });

    const swing = spec.swing ?? feel.swing ?? groove.swing ?? 0;
    if (swing) for (const t of tracks) for (const note of t.notes) applySwing(note, swing);
    for (const t of tracks) t.notes.sort((a, b)=> a.beat - b.beat || a.key - b.key);

    return {
        title: spec.title ?? spec.id ?? 'Untitled', emotion, key: keyName, mode, tempo: song.tempo,
        beatsPerBar: song.beatsPerBar, beats: beat, seconds: beat * 60 / song.tempo,
        tracks: tracks.filter(t => t.notes.length), sections, chords,
    };
}

const pick = (o, keys)=> Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

function label(type, n, form)
{
    const names = { intro: 'Intro', verse: 'Verse', pre: 'Pre-chorus', chorus: 'Chorus', post: 'Post-chorus', bridge: 'Bridge', outro: 'Outro' };
    const count = form.filter(t => t === type).length;
    return (names[type] ?? `Section ${type}`) + (count > 1 ? ` ${n + 1}` : '');
}

/** a short text summary of a score: sections, chords and each part's range and note count */
export function describe(score)
{
    const lines = [`${score.title} — ${score.emotion}, ${score.key} ${score.mode}, ${score.tempo} bpm, ${score.beatsPerBar}/4, ${score.seconds.toFixed(0)} s`];
    for (const s of score.sections)
    {
        const names = score.chords.filter(c => c.beat >= s.beat && c.beat < s.beat + s.beats).map(c => c.name);
        lines.push(`  ${s.label.padEnd(14)} bar ${String(s.beat / score.beatsPerBar + 1).padStart(3)}  energy ${s.energy.toFixed(2)}  ${names.join(' ')}`);
    }
    for (const t of score.tracks)
    {
        const keys = t.notes.map(n => n.key);
        lines.push(`  ${t.name.padEnd(14)} program ${t.bank === 128 ? 'kit ' : ''}${t.program}, ${t.notes.length} notes, keys ${Math.min(...keys)}–${Math.max(...keys)}`);
    }
    return lines.join('\n');
}
