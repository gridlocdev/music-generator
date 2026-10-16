// Boot only. New features register in features/index.js, never here.
import { startEngine } from './platform/engine.js';
import { storage } from './platform/storage.js';
import { state } from './game/state.js';
import { loop } from './game/loop.js';
import { hud } from './ui/hud.js';
import { features } from './features/index.js';

await storage.init();
state.load();
state.mode = 'play';
loop.use([...features, hud]);
startEngine({
    init: ()=> loop.build(),
    update: ()=> loop.update(),
    updatePost: ()=> loop.updatePost(),
    render: ()=> loop.render(),
});
