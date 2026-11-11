// The menu bar: the commands grouped into File, Edit, Track, Transport, View and Help, kept enabled, checked and
// listed as the app changes.
import { effect } from '@preact/signals';
import { appMenu } from '../platform/app-menu.js';
import { typing } from '../platform/keys.js';
import { projectName, projectList } from './store.js';
import { openProject, watchProjects } from './document.js';
import { item, snapItems } from './commands.js';

function menuBar()
{
    const open = projectList.value.map(x => ({ label: x.title, radio: true, checked: x.name === projectName.value, run: ()=> openProject(x.name) }));
    return [
        { label: 'File', submenu: [item('new'), item('open'), { label: 'Open Project', submenu: open.length ? open : [{ label: 'No projects', enabled: false }] }, '-',
            item('save'), item('saveAs'), item('revert'), '-', item('importMidi'), item('exportAudio'), item('exportMidi'), item('reveal')] },
        { label: 'Edit', submenu: [item('undo'), item('redo'), '-', item('cut'), item('copy'), item('paste'), item('duplicate'), item('delete'), '-',
            item('selectAll'), item('deselect'), '-', item('split'), item('join'), item('muteClip'), '-',
            item('quantize'), item('humanize'), { label: 'Snap', submenu: snapItems() }, '-',
            item('up'), item('down'), item('octaveUp'), item('octaveDown'), item('nudgeLeft'), item('nudgeRight'), '-',
            item('doubleSpeed'), item('halfSpeed'), item('reverse'), '-', item('insertBars'), item('deleteBars')] },
        { label: 'Track', submenu: [item('newTrack'), item('duplicateTrack'), item('renameTrack'), item('instrument'), '-',
            item('mute'), item('solo'), '-', item('trackUp'), item('trackDown'), '-', item('deleteTrack')] },
        { label: 'Transport', submenu: [item('play'), item('record'), '-', item('start'), item('end'), item('prevBar'), item('nextBar'), item('prevMarker'), item('nextMarker'), '-',
            item('loop'), item('loopSelection'), item('metronome'), item('click'), '-', item('addMarker'), item('tempo'), item('meter'), '-', item('newFromMelody')] },
        { label: 'View', submenu: [item('browser'), '-', item('roll'), item('mixer'), '-', item('zoomIn'), item('zoomOut'), item('fit'), '-',
            item('follow'), item('ghosts'), { role: 'togglefullscreen' }, '-',
            { label: 'Developer', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] }] },
        { label: 'Help', submenu: [item('composing'), item('readme')] },
    ];
}

/** keeps the menu bar's items enabled, checked and listed as the app changes, a moment after it does */
export function startMenus()
{
    let timer = 0;
    effect(()=>
    {
        const bar = menuBar();
        clearTimeout(timer);
        timer = setTimeout(()=> appMenu.setBar(bar), 60);
    });
    const focusChanged = ()=> appMenu.typing(typing());
    addEventListener('focusin', focusChanged);
    addEventListener('focusout', ()=> setTimeout(focusChanged));
    watchProjects();
}
