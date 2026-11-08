// The app's state, as signals: what components read, and what the actions in document.js, player.js, recording.js
// and live.js change.
import { signal, computed, effect } from '@preact/signals';
import { storage } from '../platform/storage.js';
import { dbToGain } from '../audio/mixer.js';
import { soundfontLibrary } from '../audio/soundfont-library.js';
import { emptyProject, history } from '../daw/project.js';

// ── settings, saved between runs ─────────────────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
    library: '',            // the SoundFont library; '' is the first
    volume: 0.8,            // master volume
    octave: 4,              // musical typing's octave
    project: '',            // the project last opened, by folder name
    browserTab: 'projects', // 'projects' | 'instruments' | 'takes'
    browserOpen: true,
    editorTab: 'roll',      // 'roll' | 'mixer'
    editorHeight: 300,      // px
    grid: 0.25,             // the piano roll's snap, in beats
    click: true,            // a click while recording, after the count-in
    metronome: false,       // a click while playing
    follow: true,           // the arrangement scrolls to keep the playhead in view while playing
    ghosts: true,           // the piano roll shows the other tracks' notes faintly
};

export const settings = signal(DEFAULTS);

export const setSettings = (patch)=> { settings.value = { ...settings.value, ...patch }; };

export async function loadSettings()
{
    const saved = await storage.load();
    settings.value = { ...DEFAULTS, ...saved };
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

// ── the project ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** the project and its undo history */
export const hist = signal(history(emptyProject()));
export const project = computed(()=> hist.value.present);
/** its folder in projects/, or '' when it has never been saved */
export const projectName = signal('');
/** the project as last saved or opened, to tell whether there are changes to save */
export const saved = signal(hist.value.present);
export const dirty = computed(()=> project.value !== saved.value);
/** the projects in projects/, as last listed */
/** the ids of the SoundFont libraries on this machine */
export const installedLibraries = signal(/** @type {string[]} */ ([]));
/** the library being downloaded, and how far along */
export const libraryDownload = signal(/** @type {{ id: string, fraction: number } | null} */ (null));
export const projectList = signal(/** @type {{ name: string, title: string }[]} */ ([]));

/** the track the editor shows and musical typing plays, by id */
export const selected = signal(/** @type {string|null} */ (null));
/** the clip selected in the arrangement: { track, clip } ids */
export const selectedClip = signal(/** @type {{ track: string, clip: string }|null} */ (null));
/** a stretch of the chord track picked to whistle a chord for: { beat, beats } */
export const chordRange = signal(/** @type {{ beat: number, beats: number }|null} */ (null));

/** selected notes, as 'clipId:index': an edit that moves notes to other indexes clears it */
export const picked = signal(/** @type {Set<string>} */ (new Set()));

export const selectedTrack = computed(()=> project.value.tracks.find(t => t.id === selected.value) ?? null);

/** the fader's bottom, which is silence */
export const FADER_FLOOR_DB = -40;

/** each track's gain and pan for the player: muted and un-soloed tracks, and faders at the bottom, are silent */
export const mix = computed(()=>
{
    const tracks = project.value.tracks;
    const soloed = tracks.some(t => t.mixer.solo);
    return tracks.map(({ mixer: m })=> ({ gain: m.mute || (soloed && !m.solo) || m.volumeDb <= FADER_FLOOR_DB ? 0 : dbToGain(m.volumeDb), pan: m.pan }));
});

// ── the transport ────────────────────────────────────────────────────────────────────────────────────────────────────

export const playing = signal(false);
/** the playhead, in beats */
export const beat = signal(0);
/** what's loading or what went wrong, shown in the transport */
export const status = signal('');
/** while playing: each track's level (peak 0..1) and the master's, for the mixer's meters */
export const levels = signal(/** @type {{ tracks: number[], master: number }} */ ({ tracks: [], master: 0 }));
