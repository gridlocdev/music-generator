// Songs written as specs for compose(). Content only, imports nothing.
// Format: docs/COMPOSING.md, "The song spec". Any field left out comes from the emotion's defaults.
export const SONGS = [
    {
        id: 'first-light',
        title: 'First Light',
        emotion: 'hopeful',
        key: 'D', tempo: 100,
        form: 'ABCABC',
        lift: true,                 // last chorus up a whole step
        sections: {
            verse: { progression: 'I V vi IV' },
            pre: { progression: 'ii IV V:2', register: 2 },
            // the hook, written by hand: scale degrees, ':' gives beats. Strong beats sit on chord tones.
            chorus: {
                progression: 'IV I V vi',
                melody: '6:1.5 5:0.5 4 6 | 8:2 5 3 | 5 7 9:1.5 8:0.5 | 6:3 r | '
                      + '6:1.5 5:0.5 4 6 | 10:2 8 5 | 9 8 7 9 | 8:4',
            },
        },
    },
    {
        id: 'rain-on-glass',
        title: 'Rain on Glass',
        emotion: 'melancholy',
        form: 'ballad',
        sections: {
            verse: { progression: 'i VI III VII', contour: 'fall' },
            chorus: { progression: 'VI VII i i VI VII III V', register: 4 },
            bridge: { progression: 'iv i VI V', mute: ['drums'] },
        },
    },
    {
        id: 'lanterns',
        title: 'Lanterns Over the Water',
        emotion: 'mysterious',
        key: 'E',
        form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
        sections: {
            intro: { bars: 8 },
            verse: { contour: 'valley' },
            bridge: { progression: 'v VII IV i', contour: 'rise', energy: 0.62 },
        },
    },
    {
        id: 'clockwork-picnic',
        title: 'Clockwork Picnic',
        emotion: 'playful',
        key: 'F',
        form: 'ABAC',
        sections: {
            A: { melody: '1 3 5 6:0.5 5:0.5 | 3:0.5 4:0.5 6 8:2 | 6:0.5 5:0.5 4 2 4 | 5:3 r | 1 3 5 6:0.5 5:0.5 | 6 8 10:2 | 9 8:0.5 6:0.5 4 2 | 7:3 r' },
        },
    },
    {
        id: 'iron-banner',
        title: 'Iron Banner',
        emotion: 'heroic',
        key: 'C', tempo: 112,
        form: 'pop',
        lift: true,
        sections: {
            chorus: { progression: 'I V vi IV I bVII IV V', register: 4 },
            bridge: { progression: 'vi iii IV V', mute: ['drums'] },
        },
    },
    {
        id: 'small-hours',
        title: 'Small Hours',
        emotion: 'tender',
        form: 'ballad',
        sections: {
            verse: { melody: '3:2 2 | 1:2 6, | 2:2 4 | 5:3 | 3:2 2 | 1:2 3 | 2:1.5 1:0.5 7, | 1:3' },
        },
    },
    {
        id: 'red-line',
        title: 'Red Line',
        emotion: 'angry',
        form: 'pop',
        sections: { bridge: { progression: 'iv iv VI V', energy: 0.8 } },
    },
    {
        id: 'still-water',
        title: 'Still Water',
        emotion: 'serene',
    },
];
