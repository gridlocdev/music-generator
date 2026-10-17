// A test level for adaptive music: walk a dungeon corridor while the composer's music follows the game. Intensity rises
// zone by zone (vertical layering), coins, guards, a hidden alcove and the exit fire stingers, and the arena switches
// the song to its second phase at the next bar (horizontal resequencing). It drives the music only through events
// (music:play, music:intensity, music:sting, music:queue, music:stop), so it knows nothing of the composer.
import { input } from '../../platform/input.js';
import { timeDelta } from '../../platform/engine.js';
import { SONG, PLAYER, STINGS, COINS, GUARDS, GUARD, EXIT } from './adventure-data.js';
import { zoneAt, intensityAt, walk, atSecret, touching, guardAt } from './level.js';
import { drawLevel } from './level-view.js';

const INTENSITY_STEP = 0.05;    // intensity is sent when it moves this much, not every frame

let bar;                         // this feature's controls: { root, button, status }
let scene = null;                // the level while it's being played

function start({ activity, events })
{
    const s = scene = {
        player: { x: PLAYER.start, y: 0 }, time: 0, coins: COINS.map(([x, y])=> ({ x, y, taken: false })),
        sent: -1, zone: null, safeUntil: 0, secret: false, exitAt: null, parts: [], log: [],
        offs: [],
    };
    const say = (text)=> { s.log = [text, ...s.log].slice(0, 3); show(); };
    const sting = (what)=> { events.emit('music:sting', STINGS[what]); say(`♪ ${STINGS[what]}`); };
    s.offs.push(
        events.on('music:status', ({ text })=> { s.loading = text; show(); }),
        events.on('music:started', ({ title, parts })=> { s.title = title; s.parts = parts; s.sent = -1; show(); }));
    events.emit('music:play', { song: SONG });

    activity.start({
        name: 'adventure',
        update()
        {
            if (input.cancel()) { activity.end(); return; }
            const dt = timeDelta;
            s.time += dt;
            const move = input.move();
            if (s.exitAt === null) s.player = walk(s.player, move.x * PLAYER.speed * dt, move.y * PLAYER.speed * dt);

            // the music follows where you are
            const x = intensityAt(s.player.x);
            if (s.title && Math.abs(x - s.sent) >= INTENSITY_STEP) { s.sent = Math.round(x / INTENSITY_STEP) * INTENSITY_STEP; events.emit('music:intensity', s.sent); show(); }
            const zone = zoneAt(s.player.x);
            if (zone !== s.zone)
            {
                if (zone.queue && s.title) { events.emit('music:queue', zone.queue); say(`→ ${zone.queue.section} at the next ${zone.queue.at}`); }
                s.zone = zone;
                show();
            }

            for (const c of s.coins)
                if (!c.taken && touching(s.player, c, PLAYER.radius + 0.5)) { c.taken = true; sting('coin'); }
            if (s.time > s.safeUntil)
                for (const g of GUARDS)
                    if (touching(s.player, guardAt(g, s.time), PLAYER.radius + GUARD.radius))
                    {
                        sting('hit');
                        s.player = walk(s.player, -GUARD.knockback, 0);
                        s.safeUntil = s.time + GUARD.safeSeconds;
                        break;
                    }
            if (!s.secret && atSecret(s.player)) { s.secret = true; sting('secret'); }
            if (s.exitAt === null && s.player.x >= EXIT.x) { s.exitAt = s.time; sting('exit'); say('Level complete'); }
            if (s.exitAt !== null && s.time - s.exitAt > EXIT.closeSeconds) activity.end();
        },
        cleanup()
        {
            for (const off of s.offs) off();
            events.emit('music:stop');
            if (scene === s) scene = null;
            document.body.classList.remove('adventure');
            show();
        },
    });
    document.body.classList.add('adventure');
    show();
}

// the bar's status: the zone, the intensity, which parts it lets through, and the last few events
function show()
{
    bar.button.textContent = scene ? '■ Leave level' : '▶ Adaptive music test level';
    if (!scene) { bar.status.textContent = ''; return; }
    const s = scene;
    if (s.loading || !s.title) { bar.status.textContent = s.loading || 'Starting the music…'; return; }
    const on = s.parts.filter(p => s.sent >= p.from).map(p => p.name);
    const coins = s.coins.filter(c => c.taken).length;
    bar.status.textContent = `${s.zone?.name ?? ''} · intensity ${s.sent.toFixed(2)}: ${on.join(', ')} · coins ${coins}/${s.coins.length}`
        + (s.log.length ? ` · ${s.log.join(' · ')}` : '') + '   (arrows or WASD to walk · Esc leaves)';
}

export default {
    id: 'adventure',
    build(ctx)
    {
        const root = document.createElement('div');
        root.id = 'adventure-bar';
        root.innerHTML = '<button type="button"></button> <span role="status"></span>';
        document.getElementById('top').append(root);
        bar = { root, button: root.querySelector('button'), status: root.querySelector('span') };
        bar.button.onclick = ()=>
        {
            bar.button.blur();
            if (ctx.activity.current?.name === 'adventure') ctx.activity.end();
            else start(ctx);
        };
        show();
    },
    render({ activity })
    {
        if (activity.current?.name !== 'adventure' || !scene) return;
        drawLevel(scene, bar.root.getBoundingClientRect().bottom);
    },
};
