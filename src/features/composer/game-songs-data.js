// Songs for a game: loops, a boss that changes meter, a leitmotif heard in two moods, a build and drop, a blues.
// Content only, imports nothing. Format: docs/COMPOSING.md, "The song spec"; the game-music fields are in
// "Adaptive music". Play a loop and move the Intensity slider, fire a stinger, or skip to the next section.
export const GAME_SONGS = [
    {
        id: 'heroes-road', title: 'Hero’s Road', genre: 'Overworld',
        story: 'The hero’s theme on the open road: four notes that climb and turn, in bold mixolydian.',
        emotion: 'heroic', key: 'D', mode: 'mixolydian', tempo: 112, motif: 'hero', form: 'verseChorus', style: 'cinematic', lift: 1,
        sections: {
            verse: { progression: 'I VII IV I' },
            pre: { progression: 'IV V' },
            chorus: { progression: 'I VII IV I IV V I I' },
            bridge: { progression: 'vi IV VII V', contour: 'rise' },
            outro: { progression: 'IV VII I:2' },
        },
        scenes: {
            intro: 'Dawn over the hills. The theme, half-heard.',
            'verse 1': 'The road winds down to the river.',
            'chorus 1': 'The whole valley opens out below.',
            bridge: 'A storm on the ridge. The theme, upside down.',
            'chorus 4': 'Over the pass, and the castle in sight.',
        },
    },
    {
        id: 'heroes-rest', title: 'Hero’s Rest', genre: 'Lament',
        story: 'The same theme after the battle was lost: slow, aeolian, rolling in six-eight.',
        emotion: 'melancholy', key: 'D', mode: 'aeolian', tempo: 72, meter: '6/8', motif: 'hero', form: 'ballad', style: 'cinematic',
        band: { lead: 42, counter: 40, arp: 46, chords: null, pad: 49, bass: 32, drums: 48 },
        sections: {
            verse: { progression: 'i VI III VII' },
            chorus: { progression: 'iv i VI V' },
            bridge: { progression: 'VI VII i i', texture: 'solo' },     // the cello alone
            outro: { progression: 'iv V I:2' },                          // a Picardy third: hope, at the very end
        },
        scenes: {
            intro: 'Rain on the battlefield.',
            'verse 1': 'They carry the banner home, folded.',
            bridge: 'One voice, the theme slowed to a walk.',
            outro: 'Morning. Someone picks up the sword.',
        },
    },
    {
        id: 'the-warden', title: 'The Warden', genre: 'Boss fight',
        story: 'Phase one circles you in four. When the shield breaks, phase two lurches into seven. Loops until you win.',
        emotion: 'tense', key: 'E', mode: 'harmonicMinor', tempo: 150, groove: 'rock', loop: true, style: 'cinematic', motif: 'shadow',
        form: ['intro', 'verse', 'pre', 'chorus', 'link', 'bridge', 'chorus'],
        names: { verse: 'Phase one', pre: 'Shield cracks', chorus: 'Phase two', link: 'Stagger', bridge: 'Shield down' },
        sections: {
            intro: { progression: 'i i', entries: false },
            verse: { progression: 'i VI iv V' },
            pre: { progression: 'iv V' },
            chorus: { meter: '7/4', progression: 'i bII', energy: 0.9 },    // the Neapolitan, over 4 + 3
            bridge: { progression: 'VI bII V V', feel: 'half' },
        },
    },
    {
        id: 'neon-drop', title: 'Neon Drop', genre: 'EDM',
        story: 'A rooftop at 2 a.m. The build takes the floor away for two beats; the drop gives it all back.',
        emotion: 'joyful', key: 'F', mode: 'minor', tempo: 126, groove: 'dance', form: 'edm', style: 'electronic', arp: 'sixteenths', comp: 'upbeats',
        band: { lead: 81, counter: 62, arp: 80, chords: 90, pad: 95, bass: 38, drums: 26 },
        sections: {
            // offbeat chords alone, so the ear hears them as the beat; then the kick lands on the true one
            intro: { progression: 'i VI', mute: ['drums', 'bass'], entries: false, bars: 8, energy: 0.35 },
            build: { progression: 'iv VI VII VII' },
            drop: { progression: 'i VI III VII' },
            breakdown: { progression: 'VI VII', counter: 'contrary' },
            outro: { progression: 'VI VII i:2' },
        },
    },
    {
        id: 'crossroads', title: 'Crossroads at Midnight', genre: 'Blues',
        story: 'Three choruses of twelve bars, each a little further down the road than the last.',
        emotion: 'melancholy', key: 'A', mode: 'major', tempo: 96, groove: 'swing', swing: 0.67, comp: 'offbeat', form: 'blues', style: 'jazzy',
        band: { lead: 65, counter: 57, arp: null, chords: 0, pad: null, bass: 32, drums: 32 },
        sections: {
            intro: { progression: 'V7 IV7 I7 V7', energy: 0.45 },
            outro: { progression: 'IV7 I7:2' },
        },
    },
    {
        id: 'mossy-caverns', title: 'Mossy Caverns', genre: 'Exploration loop',
        story: 'Water drips somewhere ahead. Turn the intensity down to explore; turn it up when something stirs.',
        emotion: 'mysterious', key: 'C', mode: 'dorian', tempo: 92, loop: true, arp: 'threes', motif: 'village',
        form: ['intro', 'verse', 'chorus', 'verse', 'bridge', 'chorus'],
        sections: {
            verse: { progression: 'i IV i IV' },
            chorus: { progression: 'III IV i i' },
        },
    },
];
