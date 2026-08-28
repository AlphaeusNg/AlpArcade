# AlpArcade

Browser mini-games with a local scoreboard (and an optional global one). No account needed to play.

**[Play AlpArcade](https://alphaeusng.github.io/AlpArcade/)** · [Portfolio](https://alphaeusng.github.io/)

The live site *is* the demo. Open it, click a cabinet, play.

![AlpArcade lobby](readme-assets/alparcade.png)

## What you get

Cabinets on the lobby (free first, then Lv 5 / 10 / 15 unlocks):

| Cabinet | What it is |
| --- | --- |
| Tic-Tac-Toe | Beat the AI |
| Snake | Levels and hazards |
| Circuit Breaker | Brick breaker |
| Target Tap | Hit the glow, combos |
| Reaction Lab | Millisecond timing, decoys |
| Space Shooter | Waves and powerups |
| Memory Match | Hearts and boards |
| Pulse Grid | 4x4 rhythm |

Daily challenge is one seeded target per **Singapore (SGT)** day. Badges, a local player tag, and personal bests stay on this device. Optional Google sign-in posts one best per game to the cloud board.

## Try it

1. Open **[the live arcade](https://alphaeusng.github.io/AlpArcade/)**.
2. Click **Tic-Tac-Toe** (free) and play a round against the AI.
3. Press **Esc** to return to the lobby. **P** pauses Snake and Space Shooter.
4. Open **Scores** to see local XP and bests. Export/import a code if you want to move them. **Save with Google** only if you want the optional global board.

More controls: Snake/Shooter use WASD or arrows. Reaction Lab: wait for green, then tap. Pulse Grid: keys `1–4`, `QWER`, `ASDF`, `ZXCV` when the shutter closes.

## Stack

Zero-build static HTML, CSS, and JS. GitHub Pages from `main` / root. Footer version comes from `js/version.js` (`vYYYY.MM.DD.N`). Bump `id` on every deploy so you can tell Pages has the new commit.

## Develop

```bash
python3 -m http.server 8080
# http://127.0.0.1:8080/

npm ci --ignore-scripts
npm test
npx playwright install chromium
npm run test:browser
```

After a requested change is complete and tests pass, commit and push to `origin/main` unless you were asked to keep the work local.

### Local vs cloud scores

- **Local:** tag, XP, personal bests in `localStorage`, with export/import codes. If a device write is denied, progress still shows for the visit and the arcade explains how to make it durable.
- **Cloud (optional):** Firebase + Google sign-in, one best per user per game. Setup lives under `firebase/` and `js/firebase-config.js`. See [`firebase/README.md`](./firebase/README.md).

Players never have to sign up. Cloud errors stay expanded until minimized, with a selectable diagnostic and **Copy error**.

### GitHub Pages

Repo **Settings → Pages → Deploy from branch → `main` / root**. Remove a broken custom domain if the free `github.io` URL should work.
