// Transcribes a whistled melody into the composer's scale-degree notation, ready for a section's `melody:`.
//   node tools/whistle.mjs take.wav --tempo 60 [--meter 3/4] [--key Eb] [--mode major] [--json out.json]
//   node tools/whistle.mjs scratch/lanterns-hook            (every audio file in the folder)
//   node tools/whistle.mjs chords.wav --tempo 60 --chords   (an arpeggio take: its progression)
// --tempo is the tempo you whistled at, roughly; it can be slower than the song's, since the notation counts beats.
// Without --key it guesses the key and shows the runners-up. Needs ffmpeg for anything but plain .wav.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { trackPitch } from '../src/lib/pitch-track.js';
import { transcribe, guessKeys, toNotation, vibratoSummary } from '../src/lib/transcribe.js';
import { guessChords, chordKey, toProgression } from '../src/lib/chord-guess.js';
import { pitchClass } from '../src/lib/music-theory.js';
import { noteName } from '../src/lib/notes.js';

const RATE = 22050;
const args = process.argv.slice(2);
const opt = (name, fallback = null)=> { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const tempo = Number(opt('tempo'));
const meter = opt('meter', '4/4');
const keyName = opt('key'), modeName = opt('mode');
const jsonOut = opt('json');
const chordsAt = args.indexOf('--chords');
const asChords = chordsAt >= 0 && !!args.splice(chordsAt, 1);
if (!args.length || !(tempo > 0))
{
    console.error('usage: node tools/whistle.mjs file-or-folder… --tempo <bpm you whistled at> [--chords] [--meter 3/4] [--key Eb] [--mode major] [--json out.json]');
    process.exit(1);
}
const beatsPerBar = Number(meter.split('/')[0]) * (meter.endsWith('/8') ? 0.5 : 1);

const AUDIO = /\.(wav|m4a|mp3|aiff?|caf|ogg|flac|webm)$/i;
const files = args.flatMap(a => statSync(a).isDirectory() ? readdirSync(a).filter(f => AUDIO.test(f)).sort().map(f => join(a, f)) : [a]);

const all = [];
for (const file of files)
{
    const ff = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
    if (ff.status !== 0) { console.error(`${file}: ${ff.stderr}`); continue; }
    const samples = new Float32Array(ff.stdout.buffer, ff.stdout.byteOffset, ff.stdout.length >> 2);
    const frames = trackPitch(samples, RATE);
    const t = transcribe(frames, { tempo });
    if (!t.notes.length) { console.log(`── ${basename(file)}: no whistled notes found\n`); continue; }
    const guesses = guessKeys(t.notes);
    const given = keyName ? { key: keyName, tonic: pitchClass(keyName), mode: modeName ?? 'major' } : null;
    if (asChords)
    {
        // an arpeggio take: the chords decide between keys the notes alone can't tell apart
        const { key, chords } = given ? { key: given, chords: guessChords(t.notes, { ...given, beatsPerBar }) } : chordKey(t.notes, guesses, beatsPerBar);
        const progression = toProgression(chords, beatsPerBar);
        console.log(`── ${basename(file)}: ${chords.length} chords over ${t.notes.length} notes, whistled at ≈ ${Math.round(t.tempo)} bpm`);
        console.log(`  key: ${key.key} ${key.mode}${given ? '' : `   (also ${guesses.filter(g => g !== key).slice(0, 3).map(g => `${g.key} ${g.mode}`).join(', ')})`}`);
        for (const c of chords)
            console.log(`  bar ${(c.beat / beatsPerBar + 1).toFixed(c.beat % beatsPerBar ? 1 : 0).padEnd(4)} ${c.symbol.padEnd(9)} or ${c.others.map(o => o.symbol).join(', ')}`);
        console.log(`  progression: '${progression}',\n`);
        all.push({ file: basename(file), key: `${key.key} ${key.mode}`, tempo: t.tempo, progression, chords, notes: t.notes });
        continue;
    }
    const key = given ?? guesses[0];
    const melody = toNotation(t.notes, { tonic: key.tonic, mode: key.mode, beatsPerBar });
    const vib = vibratoSummary(t.notes);
    const range = [Math.min(...t.notes.map(n => n.key)), Math.max(...t.notes.map(n => n.key))];
    const offCents = t.notes.filter(n => Math.abs(n.cents) > 30);
    console.log(`── ${basename(file)}: ${t.notes.length} notes ${noteName(range[0])}–${noteName(range[1])}, whistled at ≈ ${Math.round(t.tempo)} bpm, `
        + `${Math.round(t.offset * 100) >= 0 ? '+' : ''}${Math.round(t.offset * 100)} cents from A440`);
    console.log(`  key: ${key.key} ${key.mode}${keyName ? '' : `   (also ${guesses.slice(1, 4).map(g => `${g.key} ${g.mode}`).join(', ')})`}`);
    if (vib) console.log(`  vibrato on ${vib.notes} notes: ${vib.rate} Hz, ±${vib.cents} cents   → the song's style: { vibrato: { rate: ${vib.rate}, cents: ${vib.cents} } }`);
    if (offCents.length) console.log(`  unsure (> 30 cents off the note): ${offCents.map(n => `beat ${n.beat} ${noteName(n.key)} ${n.cents > 0 ? '+' : ''}${n.cents}`).join(', ')}`);
    console.log(`  melody: '${melody}',\n`);
    all.push({ file: basename(file), key: `${key.key} ${key.mode}`, keys: guesses.slice(0, 4), tempo: t.tempo, offset: t.offset, vibrato: vib, melody, notes: t.notes });
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all, null, 1));
