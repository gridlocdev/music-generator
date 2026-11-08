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
    {
        id: 'clocktower-core', title: 'Clocktower Core', genre: 'Boss fight',
        story: 'The heart of the tower: a clockwork guardian among grinding brass gears, its pendulum as long as a bridge. '
            + 'Every phase you win knocks a gear loose, and the clock runs faster and stranger until midnight.',
        sound: 'chip', emotion: 'tense', key: 'D', mode: 'minor', tempo: 152, groove: 'rock', arp: 'tracker',
        style: { dim7: 0.05, earCandy: 0.6, syncopation: 0.35 },   // cinematic, the emotion's, with more ear candy and push
        legato: 0.75, dynamics: 0.85, push: 3, ritardando: true,
        band: { lead: 86, counter: 87, arp: 82, chords: null, pad: 90, bass: 33, drums: 2 },   // NES pulses, a thin ticking arp, the sample channel's bass and kit
        form: ['intro', 'verse', 'pre', 'chorus', 'post', 'link', 'A', 'breakdown', 'build', 'drop', 'outro'],
        names: { verse: 'Phase one', pre: 'Gears slip', chorus: 'Clockwork Heart', post: 'Tick, tock', link: 'A gear breaks loose',
            A: 'Phase two', breakdown: 'Time stops', build: 'Mainspring', drop: 'Overclock', outro: 'Midnight' },
        sections: {
            // five beats to the bar: a clock that doesn't tick evenly, over a tolling tonic and the Neapolitan
            intro: { meter: '5/4', progression: 'i bII i bII', pedal: 1, mute: ['drums'], energy: 0.45 },
            verse: { progression: 'i VI iv V', counter: 'contrary', density: 1.2 },
            // the gears slip a half beat every bar, and the chords come twice as fast
            pre: { meter: '7/8', progression: 'iv V bVI V', energy: 0.7 },
            chorus: { progression: 'i VI III VII i VI iv V', endOn: 'dominant', energy: 0.88,
                melody: '1:0.5 3:0.5 5 3:0.5 5:0.5 8 | 8:0.5 6:0.5 8 6:0.5 8:0.5 10 | 10:0.5 9:0.5 10:0.5 12:0.5 10 7 | 9:1.5 7:0.5 9:2 | 1:0.5 3:0.5 5 3:0.5 5:0.5 8 | 8:0.5 6:0.5 8 6:0.5 8:0.5 10 | 11:0.5 10:0.5 8:0.5 6:0.5 8 4 | 5:0.5 #7:0.5 9:0.5 #7:0.5 5:2' },
            post: { progression: 'bVI bVII i i', counter: 'harmony' },
            // a minor third up and into phrygian: 2 + 3 + 2, the escapement catching
            A: { meter: '7/4c', transpose: 3, mode: 'phrygian', progression: 'i bII i VII', answer: true, energy: 0.8 },
            // the pendulum stops mid-swing: a music-box waltz, alone
            breakdown: { meter: '3/4', transpose: 3, progression: 'VI bII VI V', texture: 'solo', energy: 0.35 },
            build: { progression: 'iv V', bars: 4, tempo: 164 },
            // the hook again, a whole step up and at full speed
            drop: { progression: 'i VI III VII i VI V i', transpose: 2, tempo: 176, feel: 'double', bars: 8,
                melody: '1:0.5 3:0.5 5 3:0.5 5:0.5 8 | 8:0.5 6:0.5 8 6:0.5 8:0.5 10 | 10:0.5 9:0.5 10:0.5 12:0.5 10 7 | 9:1.5 7:0.5 9:2 | 1:0.5 3:0.5 5 3:0.5 5:0.5 8 | 8:0.5 6:0.5 8 6:0.5 8:0.5 10 | 9:0.5 #7:0.5 5 #7:0.5 9:0.5 12 | 8:3 r' },
            outro: { meter: '5/4', transpose: 2, tempo: 176, progression: 'iv V i:2' },
        },
        scenes: {
            intro: 'TICK… TOCK… The great clock face opens.',
            verse: 'The pendulum sweeps the floor. Jump it.',
            pre: 'The gears slip a tooth.',
            chorus: 'Its heart is exposed: hit it!',
            link: 'CLANG. A gear falls into the dark.',
            A: 'Phase two: the hands spin backwards.',
            breakdown: 'Time stops. Only the music box plays.',
            build: 'The mainspring winds tighter…',
            drop: 'OVERCLOCK! Everything at double speed.',
            outro: 'The clock strikes twelve. And stops.',
        },
    },
    {
        id: 'lanterns-on-the-lake', title: 'Lanterns on the Lake', genre: 'Love theme',
        story: 'A festival at dusk: paper lanterns drift over a lake, and two travellers keep ending up at the same rail. '
            + 'A dance, a misunderstanding, and one lantern launched by two pairs of hands.',
        sound: 'chip', emotion: 'tender', key: 'Eb', mode: 'major', tempo: 84, groove: 'waltz', arp: 'updown',
        style: { scoops: 0.4, earCandy: 0.35 },   // gentle, the emotion's, with more slides into notes and a little more sparkle
        legato: 0.9, dynamics: 0.55, lift: true, ritardando: true,
        band: { lead: 83, counter: 85, arp: 46, chords: null, pad: 90, bass: 38, drums: 0 },   // hollow square and soft triangle, a harp-like pluck
        form: ['intro', 'verse', 'pre', 'chorus', 'verse', 'pre', 'chorus', 'bridge', 'chorus', 'outro'],
        names: { verse: 'Across the rail', pre: 'Closer', chorus: 'Under the lanterns', bridge: 'The wind', outro: 'One lantern' },
        sections: {
            // a music box: the pluck and the lead alone, rising into a suspended dominant
            intro: { progression: 'Imaj7 IVmaj7 Imaj7 V7sus4', mute: ['drums', 'bass'] },
            // the borrowed minor iv: the sigh of a glance held a moment too long
            verse: { progression: 'Imaj7 iii7 IVmaj7 iv', mute: ['drums'] },
            // the bass climbs a step a bar toward the chorus
            pre: { progression: 'ii iii IV V7sus4', counter: 'contrary' },
            // the lanterns rise in arpeggios, a sequence a sixth apart, over a Pachelbel bass walking down
            chorus: { progression: 'I V/7 vi iii IV I/3 V7 I', counter: 'harmony',
                melody: '3 5 8 | 7:2 5 | 6 8 10 | 10:2 7 | 8:1.5 6:0.5 4 | 5 3 5 | 9:2 7 | 8:3' },
            // the wind takes their lantern: C minor, and the two voices talk over each other
            bridge: { progression: 'i VI iv V', transpose: -3, mode: 'minor', answer: true, mute: ['drums'] },
            // the amen with the borrowed iv, slowing to a stop
            outro: { progression: 'IV iv I:2', mute: ['drums'] },
        },
        scenes: {
            intro: 'Dusk. The first lanterns are lit.',
            'verse 1': 'Across the rail, a stranger is watching the same lantern.',
            'pre 1': 'A step closer. Then another.',
            'chorus 1': 'Under the lanterns, a dance.',
            'verse 2': 'Names, and a laugh over a burnt lantern.',
            'chorus 2': 'The whole lake glows.',
            bridge: 'A gust of wind. Their lantern tears free, and a word comes out wrong.',
            'chorus 3': 'One more lantern, launched together.',
            outro: 'It rises until it is a star.',
        },
    },
];
