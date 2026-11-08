// The piano roll for the selected track: every clip's notes, the chords above, velocity below and the playhead.
//
// Click empty space in a clip to draw a note (outside a clip, a bar's clip is made for it) and drag to set its
// length; drag a note to move it, its right edge to resize it; Shift-click adds to the selection, Shift-drag on empty
// space picks the notes in a rectangle; other tracks' notes show faintly behind; Delete removes,
// ↑ ↓ transpose (Shift: an octave), Cmd+A selects the clip's notes. Drag in the velocity strip to set velocity.
// Right-click a note or the background for more. Everything snaps to the grid picked in the toolbar; hold Alt to place
// freely. The wheel scrolls (Shift: across), Cmd/Ctrl + wheel zooms.
import { useEffect } from 'preact/hooks';
import { project, selected, selectedTrack, picked } from '../store.js';
import { useCanvas } from './canvas.js';
import { view } from './roll-view.js';
import { drawRoll } from './roll-draw.js';
import { wheel, down, hover, menu } from './roll-input.js';
import { RollToolbar } from './RollToolbar.jsx';
import { RollPlayhead } from './RollPlayhead.jsx';

function Roll()
{
    const p = project.value;
    const track = selectedTrack.value;
    // a new track: the view moves to its notes
    useEffect(()=>
    {
        const keys = track ? track.clips.flatMap(c => c.notes.map(n => n.key)) : [];
        const mid = keys.length ? Math.round((Math.min(...keys) + Math.max(...keys)) / 2) : 66;
        view.value = { ...view.value, low: mid - 12 };
        picked.value = new Set();
    }, [track?.id]);

    const ref = useCanvas((g, w, h)=> drawRoll(g, w, h, p, track));
    return (
        <div class="roll" onWheel={wheel} onPointerDown={(e)=> down(e, p, track)} onPointerMove={(e)=> hover(e, track)}
            onContextMenu={(e)=> menu(e, track)}><canvas ref={ref} /><RollPlayhead /></div>
    );
}

export function PianoRoll()
{
    selected.value;
    return (
        <>
            <RollToolbar />
            <Roll />
        </>
    );
}
