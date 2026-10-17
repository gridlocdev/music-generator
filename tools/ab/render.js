// Renders one song offline with one version of the composer, unchanged: render.html?root=/old/&song=<id>[&solo=role].
// The version's own modules are loaded after stand-ins are in place, so it plays exactly as it would live:
//   AudioContext returns an OfflineAudioContext whose currentTime is a clock this page moves;
//   Worker (the player's ticker) ticks only when told to.
// The clock steps through the song a tick at a time, and the player schedules ahead from it as usual, so the whole
// song is scheduled before rendering starts. Voices that would have finished by then get the synth's own onended
// run early (with its disconnects made harmless), so its voice limit counts what it would count live.
// Works in any browser: it needs no OfflineAudioContext.suspend, which Firefox lacks.
// Posts { list } (the song ids) or { wav, stats } back to the page that opened it.
const STEP = 0.025;             // seconds between scheduler ticks, as live
const TAIL = 3;                 // seconds rendered after the song, for the reverb
const RATE = 44100;
const params = new URLSearchParams(location.search);
const root = params.get('root') ?? '/';
const reply = (msg, transfer = [])=> parent.postMessage(msg, '*', transfer);

let offline = null, now = 0;
globalThis.AudioContext = function () { return offline; };

// every sample voice, with when it stops; a stop with no time means the clock's now
const sources = [];
let ending = false;             // while a voice's onended runs early: its disconnects and LFO stops must wait
const { start, stop } = AudioBufferSourceNode.prototype;
AudioBufferSourceNode.prototype.start = function (...a) { sources.push({ node: this, stopAt: Infinity }); return start.apply(this, a); };
AudioBufferSourceNode.prototype.stop = function (when)
{
    const s = sources.findLast(s => s.node === this);
    if (s) s.stopAt = when ?? now;
    return stop.call(this, when);
};
const { disconnect } = AudioNode.prototype, oscStop = OscillatorNode.prototype.stop;
AudioNode.prototype.disconnect = function (...a) { if (!ending) return disconnect.apply(this, a); };
OscillatorNode.prototype.stop = function (...a) { if (!ending) return oscStop.apply(this, a); };
function endVoicesBy(t)
{
    ending = true;
    for (let i = sources.length - 1; i >= 0; i--)
        if (sources[i].stopAt <= t) { const { node } = sources[i]; sources.splice(i, 1); node.onended?.(new Event('ended')); }
    ending = false;
}
const tickers = new Set();
globalThis.Worker = class
{
    constructor() { tickers.add(this); this.onmessage = null; }
    postMessage() {}
    terminate() { tickers.delete(this); }
};

// &compressors=off swaps the master chain's compressors for plain gains, to hear (or measure) the mix without them
if (params.get('compressors') === 'off') globalThis.DynamicsCompressorNode = function (ctx) { return new GainNode(ctx); };

const dir = `${root}src/features/composer/`;
// a song list the version may not have yet (the game songs are newer than some commits)
const optional = async (file)=> (await fetch(dir + file, { method: 'HEAD' })).ok ? import(dir + file) : {};

try
{
    const [{ compose }, player, { EMOTIONS }, ...lists] = await Promise.all([
        import(dir + 'compose.js'), import(dir + 'song-player.js'), import(dir + 'composer-data.js'),
        optional('songs-data.js'), optional('genre-songs-data.js'), optional('game-songs-data.js'),
    ]);
    const groups = ['Written songs', 'Genres', 'Game music'];
    const written = lists.flatMap((m, i)=> Object.values(m).flat().map(spec => ({ spec, group: groups[i] })));
    const feelings = Object.keys(EMOTIONS).map(e => ({ spec: { id: `feel:${e}`, title: e[0].toUpperCase() + e.slice(1), emotion: e }, group: 'Feelings' }));
    const songs = [...written, ...feelings];

    if (params.has('list'))
        reply({ list: songs.map(s => ({ id: s.spec.id, title: s.spec.title, group: s.group, loop: !!s.spec.loop })) });
    else
    {
        const song = songs.find(s => s.spec.id === params.get('song'));
        if (!song) throw new Error(`no song ${params.get('song')} in this version`);
        // a feeling's spec is titled after it, as the game names it; its id isn't part of what's composed
        const spec = song.spec.id.startsWith('feel:') ? { title: song.spec.title, emotion: song.spec.emotion } : song.spec;
        const score = compose(spec);
        // &solo=role,role renders only those parts, to track down which one does something
        if (params.has('solo')) score.tracks = score.tracks.filter(t => params.get('solo').split(',').includes(t.role));
        // a loop plays its intro and two passes round the loop
        const seconds = score.loop ? score.seconds + (score.seconds - secondsAt(score, score.loop.from)) : score.seconds;
        const length = Math.ceil((seconds + 0.25 + TAIL) * RATE);
        offline = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate: RATE });
        Object.defineProperty(offline, 'currentTime', { get: ()=> now });
        // newer versions load instruments in a module of their own
        const loader = await optional('band-loader.js');
        const band = await (loader.loadBand ?? player.loadBand)(score, ()=> {});
        const started = performance.now();
        player.playScore(score, band);
        for (now = STEP; now < length / RATE; now += STEP)
        {
            endVoicesBy(now);
            for (const w of tickers) w.onmessage?.({});
        }
        const buffer = await offline.startRendering();
        const wav = encodeWav(buffer);
        reply({ wav, stats: { ...levels(buffer), seconds: buffer.duration, renderSeconds: (performance.now() - started) / 1000,
            notes: score.tracks.reduce((n, t)=> n + t.notes.length, 0), parts: score.tracks.map(t => t.role) } }, [wav]);
    }
}
catch (e)
{
    reply({ error: `${e}\n${e?.stack ?? ''}` });
}

// seconds from beat 0 to a beat, through the tempo map when the score has one
function secondsAt(score, beat)
{
    if (!score.tempoMap) return beat * 60 / score.tempo;
    let s = 0;
    score.tempoMap.forEach((seg, i)=>
    {
        const end = Math.min(beat, score.tempoMap[i + 1]?.beat ?? Infinity);
        if (end <= seg.beat) return;
        const span = (score.tempoMap[i + 1]?.beat ?? Infinity) - seg.beat, to = seg.to ?? seg.bpm;
        const k = Number.isFinite(span) ? (to - seg.bpm) / span : 0;
        const b = end - seg.beat;
        s += Math.abs(k) < 1e-9 ? b * 60 / seg.bpm : 60 / k * Math.log((seg.bpm + k * b) / seg.bpm);
    });
    return s;
}

// peak and loudness (RMS over the whole song, and the loudest second), in dBFS
function levels(buffer)
{
    const chans = [buffer.getChannelData(0), buffer.getChannelData(1)];
    let peak = 0, sum = 0, loudest = 0;
    const second = buffer.sampleRate;
    for (let i = 0; i < buffer.length; i += second)
    {
        let s = 0;
        const end = Math.min(buffer.length, i + second);
        for (const c of chans) for (let j = i; j < end; j++) { const v = c[j]; s += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
        sum += s;
        loudest = Math.max(loudest, s / ((end - i) * 2));
    }
    const db = (x)=> x > 0 ? Math.round(10 * Math.log10(x) * 10) / 10 : -Infinity;
    return { peakDb: db(peak * peak), rmsDb: db(sum / (buffer.length * 2)), loudestSecondDb: db(loudest) };
}

// 16-bit stereo PCM WAV
function encodeWav(buffer)
{
    const n = buffer.length, out = new ArrayBuffer(44 + n * 4), v = new DataView(out);
    const text = (at, s)=> [...s].forEach((c, i)=> v.setUint8(at + i, c.charCodeAt(0)));
    text(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); text(8, 'WAVE');
    text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, buffer.sampleRate, true); v.setUint32(28, buffer.sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
    text(36, 'data'); v.setUint32(40, n * 4, true);
    const l = buffer.getChannelData(0), r = buffer.getChannelData(1);
    for (let i = 0, at = 44; i < n; i++, at += 4)
    {
        v.setInt16(at, Math.max(-1, Math.min(1, l[i])) * 0x7fff, true);
        v.setInt16(at + 2, Math.max(-1, Math.min(1, r[i])) * 0x7fff, true);
    }
    return out;
}
