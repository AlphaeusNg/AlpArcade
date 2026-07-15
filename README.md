# 🕹️ AlpArcade

Browser mini-games by **Alphaeus Ng** — local + optional global scoreboard, Web Audio SFX, powerups, and difficulty ramps.

**Play:** https://alphaeusng.github.io/AlpArcade/

**Portfolio:** https://alphaeusng.github.io/

### Games
Tic-Tac-Toe · Space Shooter · Snake · Reaction Lab · Memory Match · Target Tap

### Daily & achievements
- **Daily challenge** — one seeded target per UTC day (local completion flag).
- **Achievements** — unlocks stored in `localStorage` (no account required).

### Scoreboard
- **Local:** player tag, XP, personal bests — `localStorage` with export/import codes. No account needed to play.
- **Cloud (optional):** Global leaderboards via Firebase. **Google sign-in only** to post. One best per user per game (anti-spam). Filter boards by cabinet on the lobby and in-game.

### Version stamp
Footer shows `vYYYY.MM.DD.N · AlpArcade` from `js/version.js`.  
**Bump `id` every deploy** so you can tell whether GitHub Pages has the latest commit.

### Enable global scoreboard (Firebase free tier)

1. Create a Firebase project at https://console.firebase.google.com
2. **Firestore** → create database · publish `firestore.rules`
3. **Firestore indexes** — composite on `scores`: `game` ASC + `rankScore` DESC (see `firestore.indexes.json`, or click the console link on first filtered query)
4. **Authentication** → Sign-in method → enable **Google**
5. Authorized domains: `alphaeusng.github.io`, `localhost`
6. Edit `js/firebase-config.js`: `enabled: true` + web config keys
7. Commit & push

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
- **Scores:** export/import a base64 code (device-local); **Share to cloud** when online
