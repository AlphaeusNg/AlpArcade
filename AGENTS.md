# AGENTS.md — AlpArcade

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

Game modules: `js/games/<id>.js` — **lazy-loaded** when a cabinet opens (`js/app.js`).

## Structure

```text
index.html
css/style.css
js/
  app.js            # Lobby, routing, HUD, help, phone header hide
  music.js          # Spotify bg music: autoplay + left dock
  audio.js          # SFX / mute
  scores.js         # Local scores, XP, export/import
  cloud-scores.js   # Firebase global boards
  firebase-config.js
  achievements.js
  daily.js
  version.js        # SITE_VERSION — bump every deploy
  games/*.js
assets/
manifest.webmanifest
firestore.rules  firestore.indexes.json  FIRESTORE_SETUP.md
```

## Music

- Default autoplay: **Lofi Beats** (`data-playlist="lofi"`), or last station in `localStorage` key `alparcade-bg-music`.
- Inline player in `#bg-music`; docks **bottom-left** when section off-screen or a game is open.
- Stop clears storage for that session path (next visit defaults again unless restored earlier).

## Phone UX

- Sticky `.topbar` gets `.is-scroll-hidden` on scroll-down (≤720px) to free space; returns on scroll-up / near top / `:focus-within`.
- External nav links (`.nav-extra`) hidden on small screens.

## Cloud scores (optional)

- Free play never requires an account.
- Posting to global board: **Google sign-in only** (see `FIRESTORE_SETUP.md`).
- Config: `js/firebase-config.js` (`enabled` + web keys).
- One best per user per game; indexes in `firestore.indexes.json`.

## Commands

```bash
cd /home/alph/projects/AlpArcade
python3 -m http.server 8080
# http://127.0.0.1:8080/

node --check js/app.js
node --check js/music.js
node --check js/scores.js
# etc.
```

## Conventions

- No framework / bundler.
- Bump `js/version.js` → `SITE_VERSION.id` on every deploy (`YYYY.MM.DD.N`).
- Match existing teal/dark arcade aesthetic; keep lobby dense on phone.
- Prefer small, named helpers; keep game modules self-contained.
- Don’t break lazy-load contract: register games so `app.js` can dynamic-load them.

## Related links in UI

Portfolio, VerseKeep, Biblical Truth, Source — external; don’t hardcode wrong GitHub user/paths.

## Deploy

GitHub Pages: **Settings → Pages → `main` / root**.

```bash
git add -A && git status
git commit -m "Describe arcade change"
git push origin main
```

## Agent checklist

1. Stay inside this repo for game/music/score changes.
2. If portfolio *wording/link* about the arcade changes, edit `alphaeusng.github.io` separately.
3. Test at least lobby + one game path + music dock after UI changes.
4. Bump version; push this remote only.
