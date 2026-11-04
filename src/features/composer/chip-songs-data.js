// Chiptune songs in different moods: each plays the chip instruments (sound: 'chip') and picks its own from
// audio/chip-instruments-data.js, from the raw NES pulses and triangle to the softer modern voices and the sample
// channel's bass and kit. Content only, imports nothing. Format: docs/COMPOSING.md, "The song spec".
//
// Chip programs: leads 80 pulse 25%, 81 saw, 82 thin pulse 12.5%, 83 hollow square, 84 PWM, 85 soft triangle,
// 86/87 raw NES pulse 25%/50%; 46 pluck; 90 PWM pad; bass 38 NES triangle, 39 pulse, 33 DPCM; kits 0 chip, 1 NES, 2 DPCM.
export const CHIP_SONGS = [
    {
        id: 'meadow-dash', title: 'Meadow Dash', genre: 'Overworld',
        story: 'World 1-1. Blue sky, a row of question blocks, and nothing to fear yet. Run right.',
        sound: 'chip', emotion: 'joyful', key: 'G', mode: 'major', tempo: 144, groove: 'rock', comp: 'eighths', arp: 'chip',
        legato: 0.7, dynamics: 0.75, loop: true,
        band: { lead: 86, counter: 87, arp: 87, chords: null, pad: null, bass: 38, drums: 1 },   // the bare 2A03
        form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge'],
        sections: {
            intro: { progression: 'I IV V I' },
            verse: { progression: 'I vi IV V', contour: 'plateau', density: 1.3 },
            chorus: { progression: 'IV V iii vi IV V I I', answer: true },
            bridge: { progression: 'vi IV ii V', energy: 0.55, contour: 'rise' },
        },
        scenes: {
            intro: 'PRESS START.',
            'verse 1': 'Stomp, stomp, coin.',
            'chorus 1': 'A pipe! Down we go… no, onwards.',
            bridge: 'A row of floating platforms over a pit.',
        },
    },
    {
        id: 'crystal-depths', title: 'Crystal Depths', genre: 'Dungeon',
        story: 'A cave lit by glowing crystals. Something drips; something else breathes. Explore carefully.',
        sound: 'chip', emotion: 'mysterious', key: 'E', mode: 'phrygian', tempo: 100, groove: 'halftime', comp: 'sustain', arp: 'threes',
        legato: 0.6, dynamics: 0.55, loop: true,
        band: { lead: 82, counter: 85, arp: 46, chords: null, pad: 90, bass: 38, drums: 1 },
        form: ['intro', 'verse', 'chorus', 'verse', 'bridge', 'chorus'],
        sections: {
            intro: { progression: 'i II i II', mute: ['drums'] },
            verse: { progression: 'i II VII i', contour: 'valley', density: 0.8 },
            chorus: { progression: 'iv II i VII', counter: 'contrary' },
            bridge: { progression: 'VI VII i i', energy: 0.35, texture: 'solo' },
        },
        scenes: {
            intro: 'The torch gutters out. The crystals glow on their own.',
            bridge: 'A narrow ledge over black water.',
        },
    },
    {
        id: 'save-point-lullaby', title: 'Save Point Lullaby', genre: 'Save room',
        story: 'A small room with a glowing book, a bed, and no monsters. The music box plays while you rest.',
        sound: 'chip', emotion: 'serene', key: 'F', mode: 'major', tempo: 76, groove: 'waltz', comp: 'waltz', arp: 'updown',
        legato: 0.95, dynamics: 0.4, ritardando: true,
        band: { lead: 85, counter: 83, arp: 46, chords: null, pad: 90, bass: 38, drums: null },  // soft modern voices, no drums
        form: 'AABA',
        sections: {
            intro: { progression: 'I IV I V' },
            A: { progression: 'I vi IV V', contour: 'arch' },
            B: { progression: 'IV iii ii V', counter: 'harmony' },
            outro: { progression: 'IV V I:2' },
        },
        scenes: {
            intro: 'HP restored.',
            B: 'Outside, the rain. Inside, the fire.',
            outro: 'Game saved.',
        },
    },
    {
        id: 'neon-skyway', title: 'Neon Skyway', genre: 'Shoot-’em-up',
        story: 'Stage 4: a city of light at full throttle. Enemy waves from every side, and the boss is somewhere ahead.',
        sound: 'chip', emotion: 'tense', key: 'A', mode: 'minor', tempo: 168, groove: 'dance', comp: 'upbeats', arp: 'tracker',
        legato: 0.7, dynamics: 0.85, push: 4,
        band: { lead: 84, counter: 81, arp: 80, chords: null, pad: null, bass: 39, drums: 0 },  // PWM and saw over the modern kit
        form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'breakdown', 'chorus', 'outro'],
        sections: {
            intro: { progression: 'i i VI VII', energy: 0.65 },
            verse: { progression: 'i VII VI VII', density: 1.5, contour: 'plateau' },
            chorus: { progression: 'VI VII i i VI VII V V' },
            breakdown: { progression: 'iv iv VI V', energy: 0.45 },
            outro: { progression: 'VI VII i:2', energy: 0.8 },
        },
        scenes: {
            intro: 'LAUNCH.',
            'chorus 1': 'Wave after wave.',
            breakdown: 'Into the tunnel. Weapons charging.',
            'chorus 3': 'Full power!',
            outro: 'WARNING: BOSS APPROACHING.',
        },
    },
    {
        id: 'pixel-bazaar', title: 'Pixel Bazaar', genre: 'Town',
        story: 'The market square: a shopkeeper who won’t haggle, a cat on a barrel, and a potion you can’t afford.',
        sound: 'chip', emotion: 'playful', key: 'Bb', mode: 'major', tempo: 112, groove: 'bounce', swing: 0.62, comp: 'offbeat', arp: 'broken',
        legato: 0.6, dynamics: 0.65, loop: true,
        band: { lead: 87, counter: 82, arp: 46, chords: null, pad: null, bass: 33, drums: 2 },  // the sample channel's bass and kit
        form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge'],
        sections: {
            intro: { progression: 'I vi ii V' },
            verse: { progression: 'I vi ii V', answer: true },
            chorus: { progression: 'IV iv I vi ii V I I' },
            bridge: { progression: 'iii vi ii V', energy: 0.5 },
        },
        scenes: {
            intro: 'Welcome! Buy something, will ya?',
            bridge: 'The cat knocks over a barrel.',
        },
    },
    {
        id: 'continue-question', title: 'Continue?', genre: 'Game over',
        story: 'The screen goes dark, the countdown starts at nine, and the hero lies still. One more try?',
        sound: 'chip', emotion: 'melancholy', key: 'D', mode: 'harmonicMinor', tempo: 68, groove: 'ballad', comp: 'sustain', arp: 'tracker',
        legato: 0.9, dynamics: 0.45, ritardando: true,
        band: { lead: 80, counter: 85, arp: 83, chords: null, pad: 90, bass: 38, drums: null },
        form: ['intro', 'verse', 'chorus', 'outro'],
        sections: {
            intro: { progression: 'i iv V i', texture: 'solo' },
            verse: { progression: 'i VI iv V', contour: 'fall' },
            chorus: { progression: 'iv i VI V', energy: 0.6 },
            outro: { progression: 'iv V I:2', energy: 0.3 },
        },
        scenes: {
            intro: 'GAME OVER',
            verse: 'Nine… eight… seven…',
            chorus: 'The hero’s hand twitches.',
            outro: 'CONTINUE? ▶ YES',
        },
    },
];
