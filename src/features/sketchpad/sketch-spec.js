// A sketch (the melody take's notes and the chords over it) as the composer reads it: a section's `melody:` and
// `progression:`, a playable spec to hear it with, and text to paste into a song. Pure.
import { toNotation, vibratoSummary } from '../../lib/transcribe.js';
import { toProgression } from '../../lib/chord-guess.js';
import { SKETCH_BAND, SKETCH_EMOTION } from './sketchpad-data.js';

/** quarter-note beats per bar: 6/8 is three */
export const beatsPerBar = (meter)=> Number(meter.split('/')[0]) * (meter.endsWith('/8') ? 0.5 : 1);

const end = (list)=> Math.max(0, ...list.map(x => x.beat + x.beats));

/**
 * @param {{ key: { key: string, tonic: number, mode: string }, meter: string,
 *   melody?: { beat: number, beats: number, key: number, vibrato?: object|null }[],
 *   chords?: { beat: number, beats: number, symbol: string }[] }} sketch
 * @returns {{ melody?: string, progression?: string, bars: number, vibrato?: { rate: number, cents: number } }}
 */
export function sketchSection({ key, meter, melody = [], chords = [] })
{
    const bpb = beatsPerBar(meter);
    const section = { bars: Math.max(1, Math.ceil(Math.max(end(melody), end(chords)) / bpb - 1e-6)) };
    if (melody.length) section.melody = toNotation(melody, { tonic: key.tonic, mode: key.mode, beatsPerBar: bpb });
    if (chords.length) section.progression = toProgression(chords, bpb);
    const vib = melody.length ? vibratoSummary(melody) : null;
    if (vib) section.vibrato = { rate: vib.rate, cents: vib.cents };
    return section;
}

/** a song of one section, to hear the sketch */
export function sketchSpec({ name = 'Sketch', key, tempo, meter, section })
{
    const { vibrato, ...body } = section;
    return {
        id: 'sketch', title: name, emotion: SKETCH_EMOTION, key: key.key, mode: key.mode, tempo, meter,
        band: SKETCH_BAND, form: ['verse'], style: { ornaments: 0, ...(vibrato && { vibrato }) },
        sections: { verse: body },
    };
}

/** the lines to paste into a song in a *-songs-data.js file */
export function sketchText({ name = 'sketch', key, tempo, meter, section, whistledAt })
{
    const fields = [`key: '${key.key}'`, `mode: '${key.mode}'`, `tempo: ${tempo}`, ...(meter !== '4/4' ? [`meter: '${meter}'`] : [])];
    const body = [
        section.progression && `progression: '${section.progression}'`,
        section.melody && `melody: '${section.melody}'`,
    ].filter(Boolean).join(',\n        ');
    return [
        `// ${name}: whistled at ${whistledAt} bpm, ${section.bars} bar${section.bars === 1 ? '' : 's'}`,
        `${fields.join(', ')},`,
        ...(section.vibrato ? [`style: { vibrato: { rate: ${section.vibrato.rate}, cents: ${section.vibrato.cents} } },`] : []),
        'sections: {',
        `    verse: {\n        ${body},\n    },`,
        '},',
    ].join('\n');
}
