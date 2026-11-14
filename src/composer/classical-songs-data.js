// Solo piano pieces in the Classical genre (genre-data.js): a left hand under the tune in every section, rubato,
// ornaments, appoggiaturas and the cadential 6/4. Each is original, written in the manner of a composer, not after
// any one of their pieces. Content only, imports nothing. Format: docs/composing.md, "The song spec".
//
// Left hands (ARPS with a `hand`): nocturne (Chopin's wide broken chords, pedalled), oompah (a waltz's bass, chord,
// chord), albertiLow (Mozart's bottom, top, middle, top), octaves (Beethoven's broken octaves in the bass).
export const CLASSICAL_SONGS = [
    {
        id: 'rain-nocturne', title: 'Rain Nocturne', genre: 'Classical',
        story: 'In the manner of Chopin. Rain on a window at night: a song over a rocking left hand that slows and '
            + 'presses on like breathing, a darker middle in the relative minor, and the song again, more ornamented.',
        emotion: 'tender', key: 'Db', mode: 'major', tempo: 58, arp: 'nocturne', style: 'romantic', ritardando: true,
        form: 'ternary',
        names: { A: 'The song', B: 'Storm clouds', outro: 'Dawn' },
        sections: {
            // the left hand alone sets the rocking
            intro: { progression: 'I vi I V7', melody: false },
            // a long-breathed tune that turns and sighs; the cadential 6/4 in bar 7 and a trill on its last 2
            A: { progression: 'I vi ii V7 I IV I/5 I',
                melody: '5:3 4:0.5 3:0.5 | 3:1.5 2:0.5 1 3 | 4:2 6:1.5 5:0.5 | 5:3 r | 8:3 7:0.5 6:0.5 | 6:1.5 5:0.5 4 6 | 5:2 4 2 | 1:3 r' },
            // Bb minor, composed: the rules write its appoggiaturas; it ends on a dominant that leads home
            B: { progression: 'i iv V7 i VI iv ii° V7', transpose: -3, mode: 'harmonicMinor', density: 1.1 },
            // the amen with the borrowed minor iv, the last note held into silence
            outro: { progression: 'I IV iv I', endOn: 'plagal', melody: '5:4 | 6:2 4:2 | b6:2 4:2 | 3:4' },
        },
        scenes: {
            intro: 'Rain begins on the glass.',
            'A 1': 'A candle, and a song half remembered.',
            B: 'Thunder far off; the room darkens.',
            'A 2': 'The song again, as the rain thins.',
            outro: 'Grey light. The rain has stopped.',
        },
    },
    {
        id: 'sonatina-in-c', title: 'Sonatina in C', genre: 'Classical',
        story: 'In the manner of Mozart. A bright, tidy rondo: a theme of scales and arpeggios over an Alberti bass, '
            + 'an episode in G, a stormier one in C minor, and the theme between them each time.',
        emotion: 'joyful', key: 'C', mode: 'major', tempo: 126, arp: 'albertiLow', style: 'classical',
        form: ['A', 'B', 'A', 'C', 'A', 'outro'],
        names: { A: 'Theme', B: 'Episode in G', C: 'Episode in C minor', outro: 'Coda' },
        sections: {
            // up the triad, a turn, down the scale; the cadential 6/4 and its trilled 2 close it
            A: { progression: 'I V7 I V7 I IV I/5 I',
                melody: '1:2 3 5 | 2:1.5 4:0.25 3:0.25 2:2 | 8 7:0.5 6:0.5 5 3 | 4 2 5,:2 | 3:0.5 4:0.5 5:0.5 6:0.5 5 3 | 6:0.5 5:0.5 4:0.5 6:0.5 8:2 | 5:1.5 3:0.5 2:2 | 1:2 r:2' },
            // the dominant key, composed: it closes in G, which is V of the theme's C
            B: { progression: 'I IV V7 I vi ii V7 I', transpose: -5, endOn: 'tonic' },
            // the minor episode: the Alberti bass turns to broken octaves, and it ends on G7 for the theme's return
            C: { progression: 'i iv V7 i VI iv V7 V7', mode: 'harmonicMinor', arp: 'octaves', endOn: 'dominant' },
            // closing arpeggios over I, IV, the 6/4 and V7, and home
            outro: { progression: 'I IV V7 I', melody: '5 3 1 3 | 4 6 8 6 | 5 3 2 4 | 3:2 1:2' },
        },
    },
    {
        id: 'candlelight-waltz', title: 'Candlelight Waltz', genre: 'Classical',
        story: 'In the manner of Chopin\'s waltzes. A ballroom after midnight, the last couple turning: A minor, a '
            + 'kinder middle in C major, and the first tune again, slowing to a stop.',
        emotion: 'melancholy', key: 'A', mode: 'harmonicMinor', tempo: 150, meter: '3/4', arp: 'oompah', style: 'romantic',
        ritardando: true, form: 'ternary',
        names: { A: 'The last dance', B: 'Remembering', outro: 'Candles out' },
        sections: {
            intro: { progression: 'i i V7 V7', melody: false },
            // a held note and a turn each bar; the cadence takes a bar each for i/5 and V7, the leading tone trilled
            A: { progression: 'i iv V7 i iv i/5 V7 i',
                melody: '5:2 4:0.5 3:0.5 | 4:2 3:0.5 4:0.5 | 5:1.5 4:0.5 2 | 3:3 | 8:2 6:0.5 4:0.5 | 5:2 3 | 2:2 #7,:1 | 1:3' },
            // the relative major, composed
            B: { progression: 'I vi IV V7 I vi ii V7', transpose: 3, mode: 'major', density: 1.1 },
            outro: { progression: 'iv i/5 V7 i', melody: '4:3 | 3:3 | 2:3 | 1:3' },
        },
    },
    {
        id: 'storm-sonata', title: 'Storm Sonata', genre: 'Classical',
        story: 'In the manner of Beethoven. A theme that shoots up the C minor chord over broken octaves, a lyrical '
            + 'second theme in E flat, one bar of G7 like a held breath, and the storm again.',
        emotion: 'tense', key: 'C', mode: 'harmonicMinor', tempo: 132, arp: 'octaves', style: 'classical',
        form: ['intro', 'A', 'B', 'link', 'A', 'outro'],
        names: { A: 'First theme', B: 'Second theme', link: 'Held breath', outro: 'Coda' },
        sections: {
            intro: { progression: 'i iv V7 V7', melody: false },
            // a rocket up the triad, an appoggiatura on C that falls to B over G7, the cadential 6/4
            A: { progression: 'i i V7 V7 i iv i/5 i',
                melody: '1:0.5 3:0.5 5:0.5 8:0.5 10:2 | 8:1.5 7:0.5 8:2 | 7,:0.5 2:0.5 4:0.5 7:0.5 9:2 | 8 7 5:2 | 3 5 8 10 | 11:2 8 6 | 8 5 4 2 | 1:2 r:2' },
            // E flat major and the nocturne's wide left hand: the calm between
            B: { progression: 'I vi IV V7 I IV ii V7', transpose: 3, mode: 'major', arp: 'nocturne', energy: 0.5 },
            // one bar of G7 in 4/4, the dominant that brings the storm back
            link: { meter: '4/4', progression: 'V7' },
            outro: { progression: 'i iv V7 i', melody: '8 5 3 1 | 4 6 8 6 | 5:2 7,:2 | 1:4' },
        },
    },
];
