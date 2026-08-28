# AGENTS.md — AlpArcade

Visitor-facing docs live in [README.md](README.md). This file is for agents and local workflow.

**Live:** https://alphaeusng.github.io/AlpArcade/  
**Repo:** https://github.com/AlphaeusNg/AlpArcade  
**Local:** `/home/alph/projects/AlpArcade`  
**Hub:** `/home/alph/projects/AGENTS.md`  
**Portfolio:** https://alphaeusng.github.io/ · `/home/alph/projects/alphaeusng.github.io`

## Purpose

Zero-build browser mini-games (“pass the time”) with local progress, optional global scoreboard, Web Audio SFX, background Spotify music, daily challenge, and achievements.

## Games (cabinets)

| id | Game |
|---|---|
| `tictactoe` | Tic-Tac-Toe vs AI |
| `shooter` | Space Shooter |
| `snake` | Snake |
| `reaction` | Reaction Lab |
| `memory` | Memory Match |
| `tapper` | Target Tap |
| `breaker` | Circuit Breaker |
| `jubeat` | Pulse Grid (rhythm · Lv 15 · local BGM) |

Game modules: `js/games/<id>.js` — **lazy-loaded** when a cabinet opens (`js/app.js`).

## Structure

```text
index.html
css/
  base.css            # Tokens, reset, shared shell primitives
  lobby.css           # Lobby, profile, scores, music dock
  play.css            # Shared cabinet play chrome
  games.css           # Main game surfaces
  responsive.css      # Ordered viewport adaptations
  features.css        # Daily, achievements, easter eggs
  game-controls.css   # Late-loaded touch controls
  error.css           # Root 404 document
js/
  app.js              # Lobby, routing, HUD, help, scroll-direction header hide
  firebase-config.js  # runtime web keys (loaded by index.html)
  version.js          # SITE_VERSION — bump every deploy
  core/               # SFX, local scores, stable game viewport
  features/           # Achievements, daily challenge, music dock
  services/           # Firebase global boards + account sync
  games/*.js
firebase/             # backend infra only (not served as app logic)
  README.md
  firestore.rules
  firestore.indexes.json
firebase.json         # CLI entry (repo root — standard)
.firebaserc
assets/
manifest.webmanifest
```

GitHub Pages requires `index.html` and `404.html` at the repository root.

## Music

- Default autoplay: **Lofi Beats** (`data-playlist="lofi"`), or last station in `localStorage` key `alparcade-bg-music`.
- **Left-edge dock** (`#bg-music`): vertical tab opens/closes the panel; open state in `alparcade-music-ui-v5`.
- Player shell stays **inside the dock slot only** (no free-float / drag). Closing the panel does not stop audio. Nav **Music** toggles the dock.

## Header UX

- Sticky `.topbar` gets `.is-scroll-hidden` on scroll-down at every viewport size; it returns on scroll-up / near top / `:focus-within`.
- External nav links (`.nav-extra`) hidden on small screens.
- Last-run recap on the daily card can Share a `#play/<id>` cabinet link and Replay that game.

## Persistence honesty

If a device write is denied, current-visit score, achievement, and daily-challenge progress still show for the visit, and the arcade explains how to make them durable. A denied factory reset is reported instead of claiming retained XP, scores, badges, or daily progress were removed. Signed-in factory reset distinguishes failed cloud deletion from a non-fatal username-retention warning and never replaces either outcome with a false clean-slate message.

Unlock notices: dismissible three-second achievement banner stays in play chrome, never over the game surface.

## Cloud scores (optional)

- Free play never requires an account.
- Posting / sync: **Google sign-in**. While signed in, hide Sign-in CTA; auto-sync personal bests (`scores`) + full progress (`progress/{uid}`: XP, high scores, achievements).
- Guests still get an opt-in “save with Google” modal on strong personal bests.
- Factory reset (signed in) can wipe local + cloud account data (username kept by default).
- **Infra:** `firebase/` · **Runtime keys:** `js/firebase-config.js`
- After rule changes, re-publish: `npx firebase-tools deploy --only firestore:rules`
- Cloud errors stay expanded until the player minimizes them. The diagnostic is selectable and has **Copy error**. Each unique displayed error sends one privacy-limited `exception` event to Firebase Analytics (or queues it locally while offline). Reports omit player names, emails, scores, and URL query strings.

### Firebase setup (free tier)

Project `alparcade-cb87c`. Authorized domains: `alphaeusng.github.io`, `localhost`, `127.0.0.1`.

1. Firestore: create database, publish `firebase/firestore.rules`
2. Deploy `firebase/firestore.indexes.json`
3. Authentication → Google sign-in
4. Confirm `js/firebase-config.js` has `enabled: true` + web config keys
5. From repo root: `npx firebase-tools deploy --only firestore:rules,firestore:indexes`

See `firebase/README.md`.

## Commands

```bash
cd /home/alph/projects/AlpArcade
npm ci --ignore-scripts
npm test
npx playwright install chromium
npm run test:browser
python3 -m http.server 8080
# http://127.0.0.1:8080/
```

## Tests

Unit suite: GitHub Actions policy, JS syntax, HTML/local asset references, CSS block balance, GitHub Pages root entrypoints, shared audio/music hydration/error/toast behavior, Pulse Grid timing/scoring, score rewards, persistence, ranking, cloud-merge validation, Unicode import/export. Daily coverage fixes the clock at SGT rollover and checks deterministic targets plus idempotent completion. A fake-DOM loader fixture verifies lazy cabinet scripts recover after errors/timeouts without duplicating concurrent requests.

Playwright smoke: open Tic-Tac-Toe, play through the AI response, return to lobby; check URL, cleanup, focus, runtime-error behavior, achievement/score/daily storage-denial fallbacks, and truthful factory-reset handling. External Firebase, font, music, and donation requests are stubbed. Browser dependency is test-only; the deployed arcade stays plain HTML/CSS/JS.

## Conventions

- No framework / bundler.
- Bump `js/version.js` → `SITE_VERSION.id` on every deploy (`YYYY.MM.DD.N`). Footer shows `vYYYY.MM.DD.N · AlpArcade`.
- Match existing teal/dark arcade aesthetic; keep lobby dense on phone.
- Prefer small, named helpers; keep game modules self-contained.
- Don’t break lazy-load contract: register games so `app.js` can dynamic-load them.
- After a requested change is complete and tests pass, commit and push to `origin/main` unless asked to keep the work local.

## Related links in UI

Keep the header and footer focused: Portfolio is the only cross-project link.
Source code belongs in the footer, not the header.

## Deploy

GitHub Pages: **Settings → Pages → `main` / root**. Remove a broken custom domain if the free `github.io` URL should work.

```bash
git add -A && git status
git commit -m "Describe arcade change"
git push origin main
```

## Agent checklist

1. Stay inside this repo for game/music/score changes.
2. If portfolio *wording/link* about the arcade changes, edit `alphaeusng.github.io` separately.
3. Run the browser smoke for the lobby + game path after UI changes; check the music dock manually when touched.
4. Bump version; push this remote only.
5. Firebase rules/indexes: edit under `firebase/`; deploy from this root (or combined rules from portfolio if vault shares the project).
