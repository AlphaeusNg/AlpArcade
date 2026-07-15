# Publish Firestore rules (fixes “permission denied” on score post)

The live Firebase project only accepts the rules you **Publish** in the console. Pushing git does **not** update rules automatically.

## Steps (2 minutes)

1. Open [Firebase Console](https://console.firebase.google.com/) → project **`alparcade-cb87c`**
2. **Build → Firestore Database → Rules**
3. Open this repo file: [`firestore.rules`](./firestore.rules)
4. **Select all** in the Rules editor → **paste** the full file contents
5. Click **Publish**
6. Wait a few seconds → hard-refresh AlpArcade → sign in with Google → **Post bests** again

## Optional: composite index (per-game leaderboard)

**Firestore → Indexes → Composite → Create**

| Field | Order |
|-------|--------|
| `game` | Ascending |
| `rankScore` | Descending |

Collection: `scores` · Query scope: Collection

Or click the link in the browser console if a query says “requires an index”.

## Auth checklist

- **Authentication → Sign-in method → Google** = enabled  
- **Authorized domains** includes `alphaeusng.github.io` and `localhost`
