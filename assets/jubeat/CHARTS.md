# Pulse Grid chart provenance

Pulse Grid uses the standard BASIC / ADVANCED / EXTREME jubeat charts, exposed
in the UI as Easy / Medium / Extreme. The packed browser data lives in
`js/games/jubeat-chart-data.js`; every chart entry links to its complete
`sonicy_memo` transcription.

| Song | BPM | Levels | Notes |
|---|---:|---|---|
| I'm so Happy | 181 | 4 / 8 / 10.2 | 265 / 529 / 806 |
| ALBIDA | 185 | 5 / 7 / 10.1 | 332 / 584 / 731 |
| FLOWER | 173 | 6 / 9.7 / 10.5 | 477 / 828 / 939 |
| Evans | 185 | 6 / 8 / 10.6 | 414 / 491 / 805 |
| only my railgun | 143 | 3 / 6 / 8 | 219 / 392 / 558 |

The memo's empty first measure is visual preroll, so measure 2 is normalized to
audio beat zero. Chords are stored as 16-panel bitmasks at 24 ticks per beat.
Automated tests lock every decoded chart by note count, first/last landmark, and
SHA-256 snapshot.

Normal-speed numbered/handclap checks:

- I'm so Happy EXT: https://www.youtube.com/watch?v=YIqx3tkcbMQ
- ALBIDA EXT: https://www.youtube.com/watch?v=RZ3NTzlDIFw
- FLOWER EXT: https://www.youtube.com/watch?v=FDynjlvepS4
- Evans EXT: https://www.youtube.com/watch?v=RlUhC7heqh4
- only my railgun EXT: https://www.youtube.com/watch?v=HrOO9GU2Q8U

The bundled I'm so Happy, ALBIDA, FLOWER, and Evans audio arrangements match
their chart guides. The I'm so Happy asset is the 1:40 arcade edit rebuilt from
the existing extended master at its exact 181 BPM section boundaries; the old
continuous 4:07 arrangement must not be restored because its section order does
not match the chart.

The available only my railgun asset is a different cover and is deliberately
not used with the fripSide arcade chart. Players can load their own exact 1:42
game cut through a device-local object URL; the file is never uploaded or saved
by AlpArcade.
