# Firebase — AlpArcade

Infra for the **global scoreboard** (Firestore + Google Auth).  
Runtime web config stays at [`../js/firebase-config.js`](../js/firebase-config.js) (loaded by the static site).

| Path | Role |
|------|------|
| `firestore.rules` | Security rules for `scores`, `players`, `progress` |
| `firestore.indexes.json` | Composite index: `scores` · `game` ASC + `rankScore` DESC |
| `../firebase.json` | Firebase CLI entry (repo root) |
| `../.firebaserc` | Default project `alparcade-cb87c` |
| `../js/firebase-config.js` | Public web SDK keys (`enabled`, project id, …) |

## Project

- **Firebase project:** `alparcade-cb87c`
- **Live app:** https://alphaeusng.github.io/AlpArcade/
- Writes need **Google sign-in**. Play works fully offline/local without an account.

> **Important:** `git push` does **not** publish rules. Deploy with the CLI or paste in the console.

## Deploy rules / indexes

From the **AlpArcade repo root**:

```bash
cd /home/alph/projects/AlpArcade
# once per machine
npx firebase-tools login

npx firebase-tools deploy --only firestore:rules
npx firebase-tools deploy --only firestore:indexes
```

### Console alternative

1. [Firestore → Rules](https://console.firebase.google.com/project/alparcade-cb87c/firestore/rules)
2. Paste entire [`firestore.rules`](./firestore.rules)
3. **Publish**

Rules must use `validScoreWrite(scoreId)` (**pass scoreId**), include **`tapper`**, and
`signedIn()` only — do **not** require `sign_in_provider == 'google.com'`.

## Fix “Missing or insufficient permissions”

### Root cause we hit (Jul 2026)

Rules used `scoreId` **inside** `validScoreWrite()` without taking it as a parameter.
In Firestore rules, path wildcards are **not** in scope inside top-level functions, so the write check always failed even when Google auth worked (username saves could succeed while scores failed).

**Fix:** `validScoreWrite(scoreId)` and `allow create: if validScoreWrite(scoreId);`

### Checklist

1. Confirm console project is **`alparcade-cb87c`**
2. Paste the **current** [`firestore.rules`](./firestore.rules) (with `validScoreWrite(scoreId)`) and **Publish**
3. **App Check** → turn **enforcement OFF** for Cloud Firestore if you have not wired App Check tokens
4. **Authentication → Google** enabled  
   Authorized domains: `alphaeusng.github.io`, `localhost`, `127.0.0.1`
5. Hard-refresh the arcade, sign in, run:

```js
await ArcadeCloud.probeWrite()
ArcadeCloud.getDiagnostics()
```

| Result | Meaning |
|--------|---------|
| `ok: true` | Writes work |
| `permission-denied` | Rules not published to this project, or App Check enforced |

### Rules playground

Path: `scores/{YOUR_UID}_snake` · Auth: your UID · create fields:

`game: "snake"`, `playerName: "Test"`, `score: 1`, `rankScore: 1`, `userId: "{YOUR_UID}"`

## Shared project with Seeking Biblical Truth

If the vault editor uses the **same** Firebase project, deploy the **combined** rules from:

`/home/alph/projects/alphaeusng.github.io/firebase/`

Those rules include arcade `scores`/`players` **and** `vaultNotes`. Deploying only this arcade-only file would drop vault write access.
