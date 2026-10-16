// The one file that imports and configures the engine. Swap this for another engine's ESM build.
// 'littlejsengine' resolves through the import map in index.html, and to the package's types in editors.
// ESM bindings are read-only: configure through the engine's setters, not by assignment.
import * as E from 'littlejsengine';

E.setShowSplashScreen(false);
E.setCanvasClearColor(E.rgb(.08, .07, .12));
E.setDebugWatermark(false);
E.setDebugKey('Backquote');            // Esc stops a song and leaves the instrument list; ` opens the debug overlay
E.setInputWASDEmulateDirection(false);  // W and S are piano keys, not arrows
E.setSoundEnable(false);            // all sound is the SoundFont synth in audio/, on its own AudioContext

export function startEngine({ init, update, updatePost, render = ()=>{}, renderPost = ()=>{} })
{
    E.engineInit(init, update, updatePost, render, renderPost);
}

// re-export what the rest of the game uses, so only this file knows the engine.
// `export ... from` keeps live bindings, so values the engine reassigns (mousePos, mainCanvasSize) stay current.
export {
    vec2, rgb, drawRect, drawText, keyIsDown, keyWasPressed,
    mousePos, mouseIsDown, mouseWasPressed, mouseWasReleased, mainCanvasSize,
    setCameraPos, setCameraScale,
} from 'littlejsengine';
