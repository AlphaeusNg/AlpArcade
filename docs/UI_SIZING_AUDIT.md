# AlpArcade UI sizing audit

Audited 2026-10-14. Release: `2026.10.14.2`.

## Method

Chromium at 320, 375, 768 and 1280 CSS pixels, including doubled computed text. The sizing project opens the lobby, every cabinet, help, phone touch settings, the music dock, pause dialogs and the Pulse Grid chart editor. `tests/browser/sizing.spec.mjs` checks that the page fits, pause actions stay inside the dialog, chart-step labels are not clipped, and closing the dock leaves the player running.

## Findings and fixes

Narrow headers, lobby rows and game boards could extend past a phone width when labels grew. Flexible tracks and wrapping action rows keep those clusters inside the page.

The Snake board used a fixed pixel height, so a narrowed column could not shrink the canvas. The canvas width still caps the board, and its height follows that width.

Pulse Grid marker buttons stay one row of six at ordinary widths, which the unit gate requires. Below 600px they wrap from a 4.5rem minimum so enlarged labels are not crushed. Chart-editor step buttons size to their beat labels and wrap. The editor shows eight steps at a time; the sizing check activates the last visible step.

## Validation

Unit and static gates passed. Twelve sizing journeys and 33 cabinet journeys passed.
