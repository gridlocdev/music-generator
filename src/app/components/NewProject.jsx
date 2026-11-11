// File → New: an empty project, or one the composer writes from a feeling, a genre or one of its songs. The composer
// picks by a seed, so one choice always writes the same song; a seed of your own (or a rolled one) writes another in
// the same style, named after it so it can be written again.
import { useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { CATALOG } from '../../composer/catalog.js';
import { EMOTIONS } from '../../composer/composer-data.js';
import { GENRES } from '../../composer/genre-data.js';
import { newProject } from '../document.js';

/** whether the dialog is open */
export const dialog = signal(false);

const KINDS = [['empty', 'Empty'], ['feeling', 'Feeling'], ['genre', 'Genre'], ['song', 'Song']];
const cap = (s)=> `${s[0].toUpperCase()}${s.slice(1)}`;
const SONGS = CATALOG.filter(c => c.group !== 'Feelings');

/** a short seed, easy to read back and type in again */
export const rollSeed = ()=> Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');

function make(kind, choice, form, seed)
{
    if (kind === 'empty') return newProject({ title: form.title || 'Untitled', bpm: form.bpm, sig: form.sig, bars: form.bars });
    const song = kind === 'song' ? SONGS.find(s => s.id === choice) : null;
    const name = song ? song.spec.title ?? song.label : cap(choice);
    const spec = song ? song.spec : kind === 'feeling' ? { id: choice, emotion: choice } : { id: choice, genre: choice };
    // no seed: the song as it always comes out; a seed: another one, titled with it
    return seed ? newProject({ title: `${name} #${seed}`, spec: { ...spec, seed } }) : newProject({ title: name, spec });
}

export function NewProject()
{
    const [kind, setKind] = useState('empty');
    const [choice, setChoice] = useState('');
    const [form, setForm] = useState({ title: 'Untitled', bpm: 120, sig: '4/4', bars: 16 });
    const [seed, setSeed] = useState('');
    if (!dialog.value) return null;
    const options = kind === 'feeling' ? Object.keys(EMOTIONS).map(e => [e, cap(e)])
        : kind === 'genre' ? Object.keys(GENRES).map(g => [g, cap(g)])
        : kind === 'song' ? SONGS.map(s => [s.id, `${s.group} · ${s.label}`]) : [];
    const pick = choice && options.some(o => o[0] === choice) ? choice : options[0]?.[0] ?? '';
    const close = ()=> { dialog.value = false; };
    const create = ()=> { close(); make(kind, pick, form, seed.trim()); };
    return (
        <div class="dialog-back" onPointerDown={(e)=> e.target === e.currentTarget && close()}>
            <div class="dialog" role="dialog" aria-label="New project" onKeyDown={(e)=> { if (e.key === 'Escape') close(); if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) create(); }}>
                <h2>New project</h2>
                <div class="tabs">
                    {KINDS.map(([id, label])=> <button class={kind === id ? 'on' : ''} onClick={()=> setKind(id)}>{label}</button>)}
                </div>
                {kind === 'empty' ? (
                    <div class="form">
                        <label>Title <input value={form.title} onInput={(e)=> setForm({ ...form, title: e.currentTarget.value })} /></label>
                        <label>Tempo <input type="number" min="20" max="300" value={form.bpm} onInput={(e)=> setForm({ ...form, bpm: Number(e.currentTarget.value) || 120 })} /></label>
                        <label>Meter <input value={form.sig} onInput={(e)=> setForm({ ...form, sig: e.currentTarget.value })} /></label>
                        <label>Bars <input type="number" min="1" max="512" value={form.bars} onInput={(e)=> setForm({ ...form, bars: Number(e.currentTarget.value) || 16 })} /></label>
                    </div>
                ) : (
                    <div class="list">
                        {options.map(([id, label])=> <div class={`item ${id === pick ? 'on' : ''}`} onClick={()=> setChoice(id)} onDblClick={()=> { setChoice(id); close(); make(kind, id, form, seed.trim()); }}>{label}</div>)}
                    </div>
                )}
                {kind !== 'empty' && (
                    <div class="seed">
                        <label>Seed <input value={seed} placeholder="none: the usual one" spellcheck={false} onInput={(e)=> setSeed(e.currentTarget.value)} /></label>
                        <button title="A random seed: another song in the same style" onClick={()=> setSeed(rollSeed())}>Roll</button>
                    </div>
                )}
                <p class="hint">{kind === 'empty' ? 'A project with no tracks yet.' : seed.trim()
                    ? `Another take, written from seed ${seed.trim()}: its own key, chords and melody. The same seed writes it again.`
                    : 'The composer writes it: notes in clips, a mix, and Humanize on each track for the feel. Roll a seed for another one.'}</p>
                <div class="actions">
                    <button onClick={close}>Cancel</button>
                    <button class="primary" onClick={create}>Create</button>
                </div>
            </div>
        </div>
    );
}
