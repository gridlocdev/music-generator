// The song plan, made before any note: the form as a list of sections, each with its key, mode, meter, energy,
// cadence, harmonic rhythm, texture and arrangement; the energy curve with one clear climax; the tempo map; the loop.
// Later passes only read it. Pure and deterministic, like compose().
import { pitchClass, MODES } from '../../lib/music-theory.js';
import { EMOTIONS, FORMS, SECTIONS, REPEAT_LIFT } from './composer-data.js';
import { GROOVES, ARPS, COMPING } from './patterns-data.js';
import { STYLES, VARIATION, CURVE, TEMPO, METER_CHANGE } from './song-craft-data.js';
import { GENRES } from './genre-data.js';
import { clamp } from './meter.js';
import { meterOf, nativeMeter } from './meter-patterns.js';

/**
 * @param {object} spec  see docs/COMPOSING.md, "The song spec"
 */
export function planSong(spec)
{
    const emotion = spec.emotion ?? 'hopeful';
    const feel = EMOTIONS[emotion];
    if (!feel) throw new Error(`unknown emotion: ${emotion}`);
    // the spec's own choice, else its genre's, else its emotion's
    const genre = genreProfile(spec.genre);
    const choose = (field)=> spec[field] ?? genre[field] ?? feel[field];
    const mode = choose('mode');
    if (!MODES[mode]) throw new Error(`unknown mode: ${mode}`);
    const keyName = spec.key ?? feel.key;
    const grooveName = choose('groove');
    const groove = GROOVES[grooveName];
    if (!groove) throw new Error(`unknown groove: ${grooveName}`);
    const arp = ARPS[choose('arp')];
    if (!arp) throw new Error(`unknown arpeggio: ${spec.arp}`);
    let form = Array.isArray(spec.form) ? spec.form : FORMS[choose('form')];
    if (!form) throw new Error(`unknown form: ${spec.form}`);
    // a game loop: the intro plays once, the rest repeats, and there's no outro
    const loop = !!spec.loop;
    if (loop) { form = [...form]; while (form.length > 1 && SECTIONS[form.at(-1)]?.ending) form.pop(); }
    const style = styleOf(spec.style ?? genre.style, feel.style);
    const band = { ...feel.band, ...spec.band };
    if (band.drums !== null && grooveName === 'none') band.drums = null;

    const song = {
        tonic: pitchClass(keyName), mode, tempo: spec.tempo ?? feel.tempo,
        legato: choose('legato'),
        dynamics: spec.dynamics ?? feel.dynamics,
        power: choose('power') ?? false,
        arp, groove, grooveName, style, genre,
        swing: choose('swing') ?? groove.swing ?? style.swing ?? 0,
        swingSub: spec.swingSub ?? 0.5,
        seed: String(spec.seed ?? spec.title ?? spec.id ?? 'song'),
        flats: /b/.test(keyName) || keyName === 'F' || (/minor|dorian|phrygian|aeolian|locrian/i.test(mode) && ['D', 'G', 'C', 'F'].includes(keyName)),
    };

    const songMeter = spec.meter ?? nativeMeter(groove);
    const seen = {};
    const lastChorus = form.lastIndexOf('chorus');
    let beat = 0, transpose = 0;
    const sections = form.map((type, index)=>
    {
        const base = SECTIONS[type];
        if (!base) throw new Error(`unknown section: ${type}`);
        const over = spec.sections?.[type] ?? {};
        const n = seen[type] = (seen[type] ?? -1) + 1;
        const lifted = !!spec.lift && index === lastChorus && n > 0;
        if (lifted) transpose += spec.lift === true ? 2 : spec.lift;
        const meter = meterOf(over.meter ?? base.meter ?? songMeter);
        const bars = over.bars ?? base.bars;
        const from = base.progressionFrom;
        const progressions = genre.progressions ?? feel.progressions;
        const progression = over.progression ?? progressions[type] ?? base.progression
            ?? spec.sections?.[from]?.progression ?? progressions[from] ?? progressions.verse;
        const s = {
            ...song, type, n, index, base, over, bars, beat, meter, beatsPerBar: meter.beats, beats: bars * meter.beats,
            energy: clamp((over.energy ?? base.energy) + REPEAT_LIFT * n, 0, 1),
            tonic: song.tonic + transpose + (over.transpose ?? 0), mode: over.mode ?? mode, lifted, progression,
            comp: over.comp ?? choose('comp'),
        };
        if (!COMPING[s.comp]) throw new Error(`unknown comp: ${s.comp}`);
        beat += s.beats;
        return s;
    });
    const climax = shapeEnergy(sections, beat);

    sections.forEach((s, i)=>
    {
        const prev = sections[i - 1], next = sections[i + 1];
        const { base, over } = s;
        const v = VARIATION[Math.min(s.n, VARIATION.length - 1)];
        s.climax = s === climax;
        s.ending = !!base.ending && !next && !loop;
        s.meterChange = !!prev && prev.meter.name !== s.meter.name;
        s.simpleBars = s.meterChange ? METER_CHANGE.simpleBars : 0;
        // a fill announces whatever comes next: more energy, a build's arrival, a new meter, a new key, or the loop's top
        s.fill = next ? next.energy > s.energy + 0.05 || !!base.build || next.meter.name !== s.meter.name || next.lifted : loop;
        // two choruses in a row: the first ends deceptively, delaying the payoff; a loop's last bar leads back to its first
        s.endOn = 'endOn' in over ? over.endOn
            : loop && !next ? 'dominant'
            : next?.type === s.type && base.endOn === 'tonic' ? 'deceptive'
            : base.endOn ?? null;
        s.harmonicRhythm = over.harmonicRhythm ?? (over.progression ? 1 : base.harmonicRhythm ?? 1);
        s.fullness = over.fullness ?? base.fullness ?? s.energy;
        s.mute = [...(base.mute ?? []), ...(over.mute ?? [])].filter(r => !over.unmute?.includes(r));
        s.breath = next && over.breath !== false ? over.breath ?? base.breath ?? null : null;
        s.answer = over.answer ?? base.answer ?? false;
        s.feel = over.feel ?? base.feel ?? null;
        s.texture = over.texture ?? 'homophonic';
        s.pedal = over.pedal ?? null;
        s.entries = i === 0 && (over.entries ?? base.entries ?? false);
        s.exits = s.ending && (over.exits ?? base.exits ?? false);
        s.vary = { lastBar: !!v.lastBar, octave: !!v.octave };
        s.counter = over.counter ?? (s.climax ? 'harmony' : v.counter ?? 'guide');
        s.label = label(s.type, s.n, form, spec.names);
        s.scene = spec.scenes?.[s.label.toLowerCase()] ?? spec.scenes?.[`${s.type} ${s.n + 1}`] ?? spec.scenes?.[s.type] ?? '';
    });

    return {
        song, sections, band, feel, emotion, keyName, loop: loop ? { from: sections.find(s => s.type !== 'intro')?.beat ?? 0, to: beat } : null,
        tempoMap: tempoMap(spec, song.tempo, sections, beat), beats: beat,
    };
}

/** a genre's profile (genre-data.js) from its name, case and spacing aside: 'Bossa nova' is bossa-nova; else an empty one */
export const genreProfile = (name)=> GENRES[String(name ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')] ?? {};

function styleOf(given, fallback)
{
    if (typeof given === 'string' && !STYLES[given]) throw new Error(`unknown style: ${given}`);
    const own = typeof given === 'string' ? STYLES[given] : given ?? {};
    return { ...STYLES.plain, ...STYLES[typeof given === 'string' ? given : fallback], ...own };
}

// the climax is the loudest section starting inside CURVE.window (the later one on a tie); nothing else reaches it
function shapeEnergy(sections, total)
{
    const [lo, hi] = CURVE.window;
    const inside = sections.filter(s => s.beat / total >= lo && s.beat / total <= hi);
    const climax = (inside.length ? inside : sections).reduce((best, s)=> s.energy >= best.energy ? s : best);
    for (const s of sections) if (s !== climax) s.energy = Math.min(s.energy, Math.max(0, climax.energy - CURVE.margin));
    return climax;
}

/** where the energy curve peaks (a fraction of the song) and how many dips give it contrast */
export function energyShape(sections)
{
    const total = sections.reduce((t, s)=> t + s.beats, 0);
    const peak = sections.reduce((best, s)=> s.energy > best.energy ? s : best);
    const dips = sections.filter((s, i)=> i > 0 && sections[i - 1].energy - s.energy >= CURVE.dip).length;
    return { peak: (peak.beat + peak.beats / 2) / total, dips };
}

// the song's tempo, pushed a little from the climax on, a section's own tempo where it has one, and a ritardando
// over an ending's last bars
function tempoMap(spec, tempo, sections, end)
{
    const push = spec.push ?? TEMPO.push;
    const climax = sections.find(s => s.climax);
    /** @type {import('../../lib/tempo-map.js').TempoSegment[]} */
    const map = [{ beat: 0, bpm: tempo }];
    for (const s of sections)
    {
        const bpm = (s.over.tempo ?? tempo) + (climax && s.index >= climax.index ? push : 0);
        if (bpm !== map.at(-1).bpm) map.push({ beat: s.beat, bpm });
    }
    const last = sections.at(-1);
    if (last.ending && spec.ritardando !== false)
    {
        const r = TEMPO.ritardando;
        const from = Math.max(last.beat, end - r.bars * last.beatsPerBar);
        const bpm = map.at(-1).bpm;
        if (map.at(-1).beat === from) map.pop();
        map.push({ beat: from, bpm, to: bpm * r.to }, { beat: end, bpm: bpm * r.to });
    }
    return map;
}

// 'Verse 2'; a spec's names override the defaults, e.g. { A: 'Blues chorus' }
function label(type, n, form, own = {})
{
    const count = form.filter(t => t === type).length;
    return (own[type] ?? SECTIONS[type].name ?? `Section ${type}`) + (count > 1 ? ` ${n + 1}` : '');
}
