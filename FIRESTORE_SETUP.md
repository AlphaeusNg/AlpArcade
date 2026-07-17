# Fix “Firestore blocked the write” (verify checklist)

**Important:** `git push` does **not** update Firebase rules. You must **Publish** rules (console or CLI).

## 1. Confirm project

App project: **`alparcade-cb87c`** (`js/firebase-config.js`).

Firebase Console top bar must show **alparcade-cb87c**.

## 2. Publish rules (pick one)

### Option A — Console (no CLI)

1. [Firestore → Rules](https://console.firebase.google.com/project/alparcade-cb87c/firestore/rules)
2. Select all → delete
3. Paste entire [`firestore.rules`](./firestore.rules) from this repo
4. **Publish**

### Option B — CLI (after `firebase login`)

```bash
cd /home/alph/projects/AlpArcade
npx firebase-tools deploy --only firestore:rules
# optional indexes:
npx firebase-tools deploy --only firestore:indexes
```

Uses `.firebaserc` → project `alparcade-cb87c` and `firebase.json`.

After publish, rules must contain `function signedIn()` / `validScoreWrite()` and **include `tapper`**.  
They must **not** require `sign_in_provider == 'google.com'` (that broke many sessions).

## 3. App Check (hidden killer)

**Build → App Check**

If Firestore **enforcement is ON** and this site doesn’t send App Check tokens → every write is `permission-denied`.

→ Turn **enforcement OFF** for Cloud Firestore (or wire App Check later).

## 4. Auth

- **Authentication → Google** enabled  
- Authorized domains: `alphaeusng.github.io`, `localhost`, **`127.0.0.1`** (if you preview on that host)

## 5. Browser probe

1. Hard-refresh https://alphaeusng.github.io/AlpArcade/ (footer `v2026.07.16.10+`)
2. DevTools → Console  
3. Sign in with Google  
4. Run:

```js
await ArcadeCloud.probeWrite()
```

| Result | Meaning |
|--------|---------|
| `ok: true` | Fixed — use **Post bests** |
| `permission-denied` | Rules not published to this project, or App Check enforced |

```js
ArcadeCloud.getDiagnostics()
```

Check `projectId`, `uid`, `username`.

## 6. Rules playground

Firestore → Rules → Playground:

- Path: `scores/{YOUR_UID}_snake`  
- Auth: yes, your UID  
- Create with fields: `game: "snake"`, `playerName: "Test"`, `score: 1`, `rankScore: 1`, `userId: "{YOUR_UID}"`  

## Code fixes already in repo

- Simplified rules (`signedIn()` only)  
- Flat score payload, token refresh before write  
- `ArcadeCloud.probeWrite()` console helper  

