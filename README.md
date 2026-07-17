# 🕹️ AlpArcade

Browser mini-games by **Alphaeus Ng** — local + optional global scoreboard, Web Audio SFX, powerups, and difficulty ramps.

**Play:** https://alphaeusng.github.io/AlpArcade/

**Portfolio:** https://alphaeusng.github.io/

### Games

Tic-Tac-Toe · Space Shooter · Snake · Reaction Lab · Memory Match · Target Tap · Circuit Breaker · Pulse Grid

### Daily & achievements

- **Daily challenge** — one seeded target per **Singapore (SGT)** calendar day (local completion flag).
- **Achievements** — unlocks stored in `localStorage` (no account required).

### Scoreboard

- **Local:** player tag, XP, personal bests — `localStorage` with export/import codes. No account needed to play.
- **Cloud (optional):** Global leaderboards via Firebase. **Google sign-in** to post. One best per user per game (anti-spam). Filter boards by cabinet on the lobby and in-game.

### Version stamp

Footer shows `vYYYY.MM.DD.N · AlpArcade` from `js/version.js`.  
**Bump `id` every deploy** so you can tell whether GitHub Pages has the latest commit.

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

### Stack

Zero-build static site: plain HTML/CSS/JS. No framework, no bundler. Works on GitHub Pages.

### Local preview

```bash
python3 -m http.server 8080
# open http://127.0.0.1:8080/
```

### Enable GitHub Pages

Repo **Settings → Pages → Deploy from branch → `main` / root**  
(Remove any broken custom domain so the free `github.io` URL works.)

### Controls

- **Lobby:** click a cabinet · Esc returns from a game
- **Snake / Shooter:** WASD or arrows · P pause · tab-hide auto-pauses
- **Reaction:** click/tap the pad · wait for green
- **Pulse Grid:** hit panels when the shutter closes · keys 1–4 QWER ASDF ZXCV
- **Scores:** export/import a base64 code (device-local); **Share to cloud** when online
