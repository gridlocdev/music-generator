// The app's state, as signals: what components read, and what the actions in player.js, sketchpad.js and live.js change.
import { signal, computed, effect } from '@preact/signals';
import { storage } from '../platform/storage.js';
import { dbToGain } from '../audio/mixer.js';
import { soundfontLibrary } from '../audio/soundfont-library.js';
import { DEFAULTS as SKETCH_DEFAULTS } from '../sketch/sketchpad-data.js';

// ── settings, saved between runs ─────────────────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
    library: '',            // the SoundFont library; '' is the first
    volume: 0.8,            // master volume
    octave: 4,              // musical typing's octave
    songId: '',             // the song last opened
    browserTab: 'songs',    // 'songs' | 'instruments' | 'ideas'
    browserOpen: true,
    editorTab: 'roll',      // 'roll' | 'mixer'
    editorHeight: 300,      // px
    sketch: SKETCH_DEFAULTS,
};

export const settings = signal(DEFAULTS);

/** shallow-merges a change into the settings (and into settings.sketch with { sketch: { … } }) */
export function setSettings(patch)
{
    const s = settings.value;
    settings.value = { ...s, ...patch, sketch: { ...s.sketch, ...patch.sketch } };
}

export async function loadSettings()
{
    const saved = await storage.load();
    settings.value = { ...DEFAULTS, ...saved, sketch: { ...SKETCH_DEFAULTS, ...saved.sketch } };
    soundfontLibrary.select(settings.value.library);
    // written a moment after the last change, so dragging a fader isn't a file write per pixel
    let timer = 0;
    effect(()=>
    {
        const all = settings.value;
        clearTimeout(timer);
        timer = setTimeout(()=> storage.save(all), 300);
    });
}

// ── the song in the arrangement ──────────────────────────────────────────────────────────────────────────────────────

/** @type {import('@preact/signals').Signal<{ id: string, label: string, story?: string, spec: object, score: any } | null>} */
export const song = signal(null);

/**
 * One per score track: the mixer's settings and an instrument picked to replace the song's own.
 * @typedef {{ name: string, role: string, bank: number, program: number, override: { bank: number, program: number, name: string } | null,
 *   mute: boolean, solo: boolean, volumeDb: number, pan: number }} Track
 * @type {import('@preact/signals').Signal<Track[]>}
 */
export const tracks = signal([]);

/** changes one track's settings */
export function setTrack(i, patch)
{
    tracks.value = tracks.value.map((t, k)=> k === i ? { ...t, ...patch } : t);
}

/** the fader's bottom, which is silence */
export const FADER_FLOOR_DB = -40;

/** each track's gain and pan for the player: muted and un-soloed tracks, and faders at the bottom, are silent */
export const mix = computed(()=>
{
    const soloed = tracks.value.some(t => t.solo);
    return tracks.value.map(t => ({ gain: t.mute || (soloed && !t.solo) || t.volumeDb <= FADER_FLOOR_DB ? 0 : dbToGain(t.volumeDb), pan: t.pan }));
});

/** the track the editor shows and musical typing plays: 'whistle' or a score track's index */
export const selected = signal(/** @type {'whistle' | number} */ ('whistle'));

// ── the transport ────────────────────────────────────────────────────────────────────────────────────────────────────

export const playing = signal(false);
/** the playhead, in beats */
export const beat = signal(0);
/** what's loading or what went wrong, shown in the transport */
export const status = signal('');
