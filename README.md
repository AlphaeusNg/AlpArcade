# 🕹️ AlpArcade

Browser mini-games by **Alphaeus Ng** — local + optional global scoreboard, Web Audio SFX, powerups, and difficulty ramps.

**Play:** https://alphaeusng.github.io/AlpArcade/

**Portfolio:** https://alphaeusng.github.io/

### Games

Tic-Tac-Toe · Space Shooter · Snake · Reaction Lab · Memory Match · Target Tap · Circuit Breaker · Pulse Grid

### Daily & achievements

- **Daily challenge** — one seeded target per **Singapore (SGT)** calendar day (local completion flag).
- **Achievements** — unlocks stored in `localStorage` (no account required). If device storage is unavailable, unlocks remain visible for the visit and the arcade explains how to make them durable.
- **Unlock notice** — dismissible three-second achievement banner stays in play chrome, never over the game surface.

### Scoreboard

- **Local:** player tag, XP, personal bests — `localStorage` with export/import codes. No account needed to play.
- **Cloud (optional):** Global leaderboards via Firebase. **Google sign-in** to post. One best per user per game (anti-spam). Filter boards by cabinet on the lobby and in-game.

### Version stamp

Footer shows `vYYYY.MM.DD.N · AlpArcade` from `js/version.js`.  
**Bump `id` every deploy** so you can tell whether GitHub Pages has the latest commit.

### Repository workflow

After a requested change is complete and tests pass, commit it and push directly
to `origin/main`. Do not wait for a separate permission or follow-up request to
push unless the user explicitly asks to keep the work local.

### Enable global scoreboard (Firebase free tier)

All **backend/infra** lives under **`firebase/`**. Runtime web keys stay in `js/firebase-config.js` (loaded by the site).

| Path | Role |
|------|------|
| [`firebase/`](./firebase/) | Rules, indexes, setup docs |
| [`firebase.json`](./firebase.json) + [`.firebaserc`](./.firebaserc) | CLI entry at repo root |
| [`js/firebase-config.js`](./js/firebase-config.js) | Public web SDK config |

1. Create / use Firebase project at https://console.firebase.google.com (`alparcade-cb87c`)
2. **Firestore** → create database · publish [`firebase/firestore.rules`](./firebase/firestore.rules)
3. **Indexes** — deploy [`firebase/firestore.indexes.json`](./firebase/firestore.indexes.json)
4. **Authentication** → Sign-in method → enable **Google**
5. Authorized domains: `alphaeusng.github.io`, `localhost`, `127.0.0.1`
6. Confirm `js/firebase-config.js` has `enabled: true` + web config keys
7. From repo root:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

See [`firebase/README.md`](./firebase/README.md).

Players never must sign up to play. After a run they can **Save with Google**, pick a username once, and post.

Cloud errors stay expanded until the player minimizes them. The diagnostic
block is selectable and has a **Copy error** action. Each unique displayed
error also sends one privacy-limited `exception` event to Firebase Analytics
(or queues it locally while offline); view counts under **Firebase Console →
Analytics → Events**. Reports omit player names, emails, scores, and URL query
strings.

### Stack

Zero-build static site: plain HTML/CSS/JS. No framework, no bundler. Works on GitHub Pages.

### Frontend structure

GitHub Pages requires `index.html` and `404.html` at the repository root. Their runtime dependencies are grouped by responsibility:

```text
css/
  base.css lobby.css play.css games.css
  responsive.css features.css game-controls.css error.css
js/
  app.js firebase-config.js version.js
  core/ features/ services/ games/ (including core/script-loader.js)
assets/
  icon.svg jubeat/
```

### Local preview

```bash
python3 -m http.server 8080
# open http://127.0.0.1:8080/
```

### Tests

```bash
npm ci --ignore-scripts
npm test
npx playwright install chromium
npm run test:browser
```

The unit suite checks the GitHub Actions policy, JavaScript syntax,
HTML/local asset references, CSS block balance, GitHub Pages root entrypoints,
shared audio/music hydration/error/toast behavior, and Pulse Grid timing/scoring invariants. It
also executes score rewards, persistence, ranking, cloud-merge validation, and
Unicode import/export. It runs locally and in GitHub Actions on every `main`
push and pull request. Daily coverage fixes the clock at SGT rollover boundaries
and verifies deterministic targets and idempotent completion persistence. A
fake-DOM loader fixture verifies lazy cabinet scripts recover after errors and
timeouts without duplicating concurrent requests.

The locked Playwright smoke opens Tic-Tac-Toe in a real Chromium page, plays
through the AI response, returns to the lobby, and checks URL, cleanup, focus,
runtime-error behavior, and the achievement storage-denial fallback. External Firebase, font, music, and donation
requests are stubbed so the workflow stays deterministic and offline-safe. The
browser dependency is test-only; the deployed arcade remains plain HTML/CSS/JS.

### Enable GitHub Pages

Repo **Settings → Pages → Deploy from branch → `main` / root**  
(Remove any broken custom domain so the free `github.io` URL works.)

### Controls

- **Lobby:** click a cabinet · Esc returns from a game
- **Snake / Shooter:** WASD or arrows · P pause · tab-hide auto-pauses
- **Reaction:** click/tap the pad · wait for green
- **Pulse Grid:** hit panels when the shutter closes · keys 1–4 QWER ASDF ZXCV
- **Scores:** export/import a base64 code (device-local); **Share to cloud** when online
