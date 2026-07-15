# 🕹️ AlpArcade

Browser mini-games by **Alphaeus Ng** — local + optional global scoreboard, Web Audio SFX, powerups, and difficulty ramps.

**Play:** https://alphaeusng.github.io/AlpArcade/

**Portfolio:** https://alphaeusng.github.io/

### Games
Tic-Tac-Toe · Space Shooter · Snake · Reaction Lab · Memory Match

### Scoreboard
- **Local:** player tag, XP, personal bests, hall of fame — `localStorage` with export/import codes
- **Cloud (optional):** Online Hall of Fame via Firebase Firestore + anonymous auth. High scores sync live across devices when configured.

### Version stamp
Footer shows `vYYYY.MM.DD.N · AlpArcade` from `js/version.js`.  
**Bump `id` every deploy** so you can tell whether GitHub Pages has the latest commit.

### Enable global scoreboard (Firebase free tier)

1. Create a Firebase project at https://console.firebase.google.com
2. **Firestore** → create database (production mode recommended)
3. Paste rules from `firestore.rules` into Firestore → Rules → Publish
4. **Authentication** → Sign-in method → enable **Anonymous**
5. Project settings → Your apps → Web app → copy config
6. Edit `js/firebase-config.js`: set `enabled: true` and paste your config keys
7. Commit & push — GitHub Pages updates automatically

Until `enabled` is true, everything stays fully offline/local.

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
