/**
 * Cloud scoreboard + signed-in progress sync.
 * - Guests: local only; optional Google to post.
 * - Signed in: hide Google sign-in; auto-sync scores + achievements to Firestore.
 */
(function (global) {
  "use strict";

  const SCORES = "scores";
  const PLAYERS = "players";
  const PROGRESS = "progress";
  const GLOBAL_LIMIT = 25;
  const GAME_IDS = ["tictactoe", "shooter", "snake", "reaction", "memory", "tapper"];

  let db = null;
  let auth = null;
  let ready = false;
  let status = "off"; // off | connecting | online | error
  let lastError = "";
  let unsub = null;
  let initPromise = null;
  /** @type {firebase.User | null} */
  let user = null;
  /** @type {{ username: string, email?: string } | null} */
  let profile = null;
  /** @type {string} 'all' | gameId */
  let leaderboardGame = "all";
  /** @type {Array<object>} */
  let leaderboard = [];
  /** @type {Set<Function>} */
  const listeners = new Set();

  function cfg() {
    return global.ARCADE_FIREBASE_CONFIG || {};
  }

  function firebaseOptions() {
    const c = cfg();
    return {
      apiKey: c.apiKey,
      authDomain: c.authDomain,
      projectId: c.projectId,
      storageBucket: c.storageBucket,
      messagingSenderId: c.messagingSenderId,
      appId: c.appId,
    };
  }

  function isConfigured() {
    const c = cfg();
    return !!(
      c.enabled &&
      c.apiKey &&
      c.apiKey !== "YOUR_API_KEY" &&
      c.projectId &&
      c.projectId !== "YOUR_PROJECT_ID"
    );
  }

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(getState());
      } catch (err) {
        console.warn("[ArcadeCloud] listener error", err);
      }
    });
  }

  function setStatus(next, errMsg) {
    if (typeof errMsg === "string") lastError = errMsg;
    if (next === "online") lastError = "";
    status = next;
    notify();
  }

  function getState() {
    return {
      status,
      leaderboard,
      leaderboardGame,
      online: status === "online",
      lastError,
      configured: isConfigured(),
      ready,
      user,
      profile,
      signedIn: !!(user && user.uid),
      hasUsername: !!(profile && profile.username),
      email: user?.email || null,
      displayName: profile?.username || user?.displayName || null,
    };
  }

  function friendlyError(err) {
    const code = err?.code || err?.name || "";
    const msg = err?.message || String(err || "unknown error");
    if (/auth\/popup-closed-by-user/i.test(code + msg)) {
      return "Sign-in cancelled";
    }
    if (/auth\/operation-not-allowed/i.test(code + msg)) {
      return "Enable Google sign-in in Firebase Authentication.";
    }
    if (/permission-denied|PERMISSION_DENIED|Missing or insufficient/i.test(code + msg)) {
      return (
        "Firestore permission-denied. Publish the FIXED rules from firebase/firestore.rules " +
        "(validScoreWrite must take scoreId as an argument). Confirm project alparcade-cb87c; " +
        "turn App Check enforcement OFF if enabled. See firebase/README.md."
      );
    }
    if (/failed-precondition|requires an index/i.test(code + msg)) {
      return "Firestore index needed for per-game boards — deploy firebase/firestore.indexes.json or open the console link.";
    }
    if (/offline|network|Failed to fetch|unavailable/i.test(code + msg)) {
      return "Network error reaching Firebase.";
    }
    if (/api-key|invalid-api-key|API_KEY/i.test(code + msg)) {
      return "Invalid Firebase API key in js/firebase-config.js.";
    }
    return (code ? code + ": " : "") + (msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
  }

  function rankScore(gameId, score) {
    const g = global.ArcadeScores?.GAMES?.[gameId];
    if (g && g.higherIsBetter === false) return 10000 - Number(score);
    return Number(score);
  }

  function isBetter(gameId, next, prev) {
    const g = global.ArcadeScores?.GAMES?.[gameId];
    if (prev == null || !Number.isFinite(Number(prev))) return true;
    if (g && g.higherIsBetter === false) return Number(next) < Number(prev);
    return Number(next) > Number(prev);
  }

  function scoreDocId(uid, gameId) {
    return `${uid}_${gameId}`;
  }

  function sanitizeUsername(name) {
    return String(name || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 16);
  }

  function mapScoreDoc(doc) {
    const d = doc.data() || {};
    return {
      id: doc.id,
      game: d.game,
      score: d.score,
      player: d.playerName || "Player",
      at: d.updatedAt?.toMillis?.() || d.clientAt || 0,
      userId: d.userId || null,
    };
  }

  async function init() {
    if (!isConfigured()) {
      setStatus("off", "Cloud disabled — set enabled:true in js/firebase-config.js");
      return false;
    }
    if (ready && db) {
      setStatus(status === "error" ? "online" : status || "online");
      return true;
    }
    if (initPromise) return initPromise;

    initPromise = (async () => {
      if (typeof firebase === "undefined") {
        setStatus("error", "Firebase SDK not loaded (check network / CDN).");
        return false;
      }

      setStatus("connecting");
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(firebaseOptions());
        }
        db = firebase.firestore();
        auth = firebase.auth();

        auth.onAuthStateChanged(async (u) => {
          user = u;
          if (u) {
            try {
              profile = await loadProfile(u.uid);
            } catch (err) {
              console.warn("[ArcadeCloud] profile load", err);
              profile = null;
            }
            // Full local ↔ cloud merge when session becomes signed-in
            try {
              await syncAccountProgress({ reason: "auth" });
            } catch (err) {
              console.warn("[ArcadeCloud] auth sync failed", err);
            }
          } else {
            profile = null;
          }
          notify();
        });

        // Restore existing session without forcing sign-in
        user = auth.currentUser;
        if (user) {
          profile = await loadProfile(user.uid);
        }

        ready = true;
        setStatus("online");
        subscribeLeaderboard(leaderboardGame);

        if (user) {
          try {
            await syncAccountProgress({ reason: "boot" });
          } catch (err) {
            console.warn("[ArcadeCloud] boot sync failed", err);
          }
        }
        return true;
      } catch (err) {
        console.warn("[ArcadeCloud] init failed", err);
        ready = false;
        setStatus("error", friendlyError(err));
        return false;
      } finally {
        initPromise = null;
      }
    })();

    return initPromise;
  }

  async function loadProfile(uid) {
    if (!db || !uid) return null;
    const snap = await db.collection(PLAYERS).doc(uid).get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    if (!d.username) return null;
    return { username: d.username, email: d.email || null };
  }

  function subscribeLeaderboard(gameId) {
    leaderboardGame = gameId && GAME_IDS.includes(gameId) ? gameId : "all";
    if (!db) return;

    if (unsub) {
      try {
        unsub();
      } catch {
        /* ignore */
      }
      unsub = null;
    }

    try {
      let q;
      if (leaderboardGame === "all") {
        q = db.collection(SCORES).orderBy("rankScore", "desc").limit(GLOBAL_LIMIT);
      } else {
        q = db
          .collection(SCORES)
          .where("game", "==", leaderboardGame)
          .orderBy("rankScore", "desc")
          .limit(GLOBAL_LIMIT);
      }

      unsub = q.onSnapshot(
        (snap) => {
          leaderboard = snap.docs.map(mapScoreDoc);
          if (status !== "online") setStatus("online");
          else notify();
        },
        (err) => {
          console.warn("[ArcadeCloud] leaderboard snapshot", err);
          setStatus("error", "Leaderboard: " + friendlyError(err));
        }
      );
    } catch (err) {
      console.warn("[ArcadeCloud] subscribe failed", err);
      setStatus("error", friendlyError(err));
    }
  }

  function setLeaderboardGame(gameId) {
    const next = gameId && GAME_IDS.includes(gameId) ? gameId : "all";
    if (next === leaderboardGame && unsub) {
      notify();
      return;
    }
    subscribeLeaderboard(next);
  }

  function getLeaderboard(gameId) {
    if (!gameId || gameId === "all" || gameId === leaderboardGame) {
      return leaderboard.slice();
    }
    // Stale filter: return empty; caller should setLeaderboardGame
    return leaderboard.filter((e) => e.game === gameId);
  }

  async function signInWithGoogle() {
    if (!ready || !auth) {
      const ok = await init();
      if (!ok || !auth) throw new Error(lastError || "Cloud offline");
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const result = await auth.signInWithPopup(provider);
      user = result.user;
      profile = await loadProfile(user.uid);
      notify();
      return getState();
    } catch (err) {
      const message = friendlyError(err);
      if (!/cancelled/i.test(message)) setStatus("error", message);
      throw new Error(message);
    }
  }

  async function signOut() {
    if (!auth) return;
    await auth.signOut();
    user = null;
    profile = null;
    notify();
  }

  /**
   * First-time username. Super short: 2–16 chars.
   * Prefill suggestion from local player tag or Google name.
   */
  async function setUsername(rawName) {
    // Always prefer live auth user
    user = auth?.currentUser || user;
    if (!user || !db) throw new Error("Sign in first");
    const username = sanitizeUsername(rawName);
    if (username.length < 1) throw new Error("Username needs at least 1 character");
    if (username.length > 16) throw new Error("Username max 16 characters");

    try {
      await user.getIdToken(true);
    } catch {
      /* continue with existing session */
    }

    try {
      await db.collection(PLAYERS).doc(user.uid).set(
        {
          username,
          email: user.email || "",
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("[ArcadeCloud] setUsername failed", err, {
        uid: user.uid,
        email: user.email,
        providers: user.providerData?.map((p) => p.providerId),
      });
      throw new Error(friendlyError(err));
    }

    profile = { username, email: user.email || null };

    try {
      global.ArcadeScores?.setPlayerName?.(username);
    } catch {
      /* ignore */
    }

    notify();
    return profile;
  }

  function suggestUsername() {
    const local = global.ArcadeScores?.getState?.()?.playerName;
    if (local && local !== "Player") return sanitizeUsername(local);
    if (user?.displayName) return sanitizeUsername(user.displayName.split(" ")[0] || user.displayName);
    if (user?.email) return sanitizeUsername(user.email.split("@")[0]);
    return "Player";
  }

  /**
   * Upsert one score for the signed-in user (Google only).
   * Doc id = {uid}_{game} → one row per user per cabinet.
   */
  async function submitCloudScore(gameId, score, meta = {}, opts = {}) {
    if (!isConfigured()) return { ok: false, reason: "off", message: "Cloud not configured" };
    if (!GAME_IDS.includes(gameId)) {
      return { ok: false, reason: "bad-game", message: "Unknown game" };
    }

    if (!ready || !db) {
      const ok = await init();
      if (!ok || !db) return { ok: false, reason: "offline", message: lastError || "Cloud offline" };
    }

    // Only trust live Auth — a stale cached user writes as unauthenticated → permission-denied
    const live = auth?.currentUser;
    if (!live?.uid) {
      user = null;
      return { ok: false, reason: "auth-required", message: "Sign in with Google to save" };
    }
    user = live;

    const googleOk = user.providerData?.some((p) => p.providerId === "google.com");
    if (!googleOk) {
      return { ok: false, reason: "auth-required", message: "Use Google sign-in to save scores" };
    }

    // Reload profile if missing
    if (!profile?.username) {
      try {
        profile = await loadProfile(user.uid);
      } catch {
        /* ignore */
      }
    }
    if (!profile?.username) {
      return { ok: false, reason: "username-required", message: "Pick a username first" };
    }

    const num = Number(score);
    if (!Number.isFinite(num) || num < 0) {
      return { ok: false, reason: "bad-score", message: "Invalid score" };
    }

    // Firestore rules accept number; keep finite plain numbers only
    const scoreVal = Math.round(num * 1000) / 1000;
    const rankVal = Number(rankScore(gameId, scoreVal));
    if (!Number.isFinite(rankVal)) {
      return { ok: false, reason: "bad-score", message: "Invalid rank score" };
    }

    const uid = String(user.uid);
    const docId = scoreDocId(uid, gameId);
    const ref = db.collection(SCORES).doc(docId);

    try {
      // Hard-fail if token cannot be refreshed — otherwise Firestore sees no auth
      try {
        await user.getIdToken(true);
      } catch (tokenErr) {
        return {
          ok: false,
          reason: "auth-required",
          message: "Session expired — sign in with Google again",
          err: tokenErr,
          code: tokenErr?.code || null,
        };
      }

      const existing = await ref.get();
      if (existing.exists) {
        const old = existing.data() || {};
        if (!isBetter(gameId, scoreVal, old.score) && !opts.force) {
          return {
            ok: true,
            reason: "not-better",
            message: "Your cloud best is already equal or better",
            improved: false,
          };
        }
        if (opts.force && !isBetter(gameId, scoreVal, old.score)) {
          return {
            ok: true,
            reason: "not-better",
            message: "Cloud already has your best",
            improved: false,
          };
        }
      }

      const now = Date.now();
      // Flat payload only — fields the rules validate (+ harmless client clocks)
      const payload = {
        game: String(gameId),
        playerName: String(profile.username).trim().slice(0, 16),
        score: scoreVal,
        rankScore: rankVal,
        userId: uid,
        clientAt: now,
        timestamp: now,
      };

      await ref.set(payload);
      if (status !== "online") setStatus("online");
      return { ok: true, message: "Saved to cloud", improved: true };
    } catch (err) {
      const code = err?.code || "";
      const message = friendlyError(err);
      // One clear error line — avoid spamming the console on batch posts
      if (opts.quiet) {
        /* batch caller logs once */
      } else {
        console.warn("[ArcadeCloud] write failed:", message, {
          gameId,
          docId,
          code: code || null,
          projectId: cfg().projectId,
        });
      }
      setStatus("error", message);
      return {
        ok: false,
        reason: /permission-denied|insufficient/i.test(code + message)
          ? "permission-denied"
          : "write-error",
        message,
        err,
        code: code || null,
      };
    }
  }

  function sanitizeMeta(meta) {
    if (!meta || typeof meta !== "object") return {};
    const out = {};
    for (const [k, v] of Object.entries(meta)) {
      if (["string", "number", "boolean"].includes(typeof v)) {
        out[k] = typeof v === "string" ? v.slice(0, 64) : v;
      }
    }
    return out;
  }

  function collectLocalProgressPayload() {
    const scores = global.ArcadeScores?.getState?.() || {};
    const unlocked = global.ArcadeAchievements?.getUnlockedMap?.() || {};
    return {
      username: profile?.username || scores.playerName || "Player",
      playerName: scores.playerName || profile?.username || "Player",
      xp: Number(scores.xp) || 0,
      gamesPlayed: Number(scores.gamesPlayed) || 0,
      highScores: scores.highScores || {},
      achievements: unlocked,
      clientAt: Date.now(),
    };
  }

  /**
   * Merge cloud progress into local storage (best-of scores, union achievements).
   */
  function applyCloudProgressLocally(cloud) {
    if (!cloud || typeof cloud !== "object") return { merged: false };

    if (cloud.highScores && global.ArcadeScores?.mergeHighScores) {
      global.ArcadeScores.mergeHighScores(cloud.highScores, {
        xp: cloud.xp,
        gamesPlayed: cloud.gamesPlayed,
        playerName: cloud.playerName || cloud.username,
      });
    }
    if (cloud.achievements && global.ArcadeAchievements?.mergeUnlocked) {
      global.ArcadeAchievements.mergeUnlocked(cloud.achievements);
    }
    return { merged: true };
  }

  async function fetchProgress(uid) {
    if (!db || !uid) return null;
    const snap = await db.collection(PROGRESS).doc(uid).get();
    if (!snap.exists) return null;
    return snap.data() || null;
  }

  async function writeProgress(payload) {
    const live = auth?.currentUser;
    if (!live?.uid || !db) throw new Error("Sign in first");
    const uid = live.uid;
    const name = sanitizeUsername(payload.username || payload.playerName || profile?.username || "Player");
    const body = {
      username: name,
      playerName: name,
      xp: Math.max(0, Math.floor(Number(payload.xp) || 0)),
      gamesPlayed: Math.max(0, Math.floor(Number(payload.gamesPlayed) || 0)),
      highScores: payload.highScores || {},
      achievements:
        payload.achievements && typeof payload.achievements === "object" ? payload.achievements : {},
      clientAt: Date.now(),
      userId: uid,
    };
    await live.getIdToken(true);
    await db.collection(PROGRESS).doc(uid).set(body, { merge: true });

    // Keep players/{uid} username in sync for leaderboard display
    if (name && (!profile?.username || profile.username !== name)) {
      try {
        await db.collection(PLAYERS).doc(uid).set(
          { username: name, email: live.email || "", updatedAt: Date.now() },
          { merge: true }
        );
        profile = { username: name, email: live.email || null };
      } catch {
        /* non-fatal */
      }
    }
    return body;
  }

  /**
   * Push every local personal best to the public scores collection.
   */
  async function pushAllBestsToScores() {
    const state = global.ArcadeScores?.getState?.();
    if (!state?.highScores) return { pushed: 0 };
    let pushed = 0;
    for (const gameId of GAME_IDS) {
      const best = state.highScores[gameId]?.best;
      if (best == null) continue;
      const g = global.ArcadeScores?.GAMES?.[gameId];
      if (g?.higherIsBetter && Number(best) <= 0 && gameId !== "tictactoe") continue;
      if (!g?.higherIsBetter && !Number.isFinite(Number(best))) continue;
      const result = await submitCloudScore(gameId, Number(best), { sync: true }, {
        force: true,
        isHighScore: true,
        quiet: true,
      });
      if (result?.ok && result.improved !== false) pushed += 1;
      if (result?.reason === "permission-denied" || result?.reason === "auth-required") {
        return { pushed, stopped: true, message: result.message };
      }
    }
    return { pushed };
  }

  /**
   * Full account sync: pull cloud → merge local → write progress + public bests.
   * Safe to call often; designed for signed-in sessions only.
   */
  let syncLock = null;
  async function syncAccountProgress(opts = {}) {
    if (syncLock) return syncLock;
    syncLock = (async () => {
      const live = auth?.currentUser;
      if (!live?.uid || !db) return { ok: false, reason: "auth-required" };

      user = live;
      if (!profile?.username) {
        try {
          profile = await loadProfile(live.uid);
        } catch {
          /* ignore */
        }
      }
      // Auto-provision username from local/Google so sync can proceed
      if (!profile?.username) {
        try {
          await setUsername(suggestUsername());
        } catch (err) {
          return { ok: false, reason: "username-required", message: friendlyError(err) };
        }
      }

      try {
        await live.getIdToken(true);
        const remote = await fetchProgress(live.uid);
        if (remote) applyCloudProgressLocally(remote);

        const payload = collectLocalProgressPayload();
        await writeProgress(payload);
        const bests = await pushAllBestsToScores();
        if (status !== "online") setStatus("online");
        notify();
        return {
          ok: true,
          reason: opts.reason || "sync",
          bestsPushed: bests.pushed || 0,
          message: bests.stopped ? bests.message : "Progress synced",
        };
      } catch (err) {
        const message = friendlyError(err);
        console.warn("[ArcadeCloud] syncAccountProgress", message);
        setStatus("error", message);
        return { ok: false, reason: "sync-error", message };
      }
    })();

    try {
      return await syncLock;
    } finally {
      syncLock = null;
    }
  }

  /**
   * After a run while signed in: update public best if needed + full progress doc.
   */
  async function saveRunToCloud(gameId, score, meta = {}, opts = {}) {
    const live = auth?.currentUser;
    if (!live?.uid) return { ok: false, reason: "auth-required" };
    user = live;

    if (!profile?.username) {
      try {
        profile = await loadProfile(live.uid);
      } catch {
        /* ignore */
      }
    }
    if (!profile?.username) {
      try {
        await setUsername(suggestUsername());
      } catch {
        return { ok: false, reason: "username-required", message: "Pick a username first" };
      }
    }

    const scoreResult = await submitCloudScore(gameId, score, meta, {
      force: !!opts.force,
      isHighScore: !!opts.isHighScore,
      quiet: true,
    });

    try {
      const payload = collectLocalProgressPayload();
      await writeProgress(payload);
    } catch (err) {
      return {
        ok: false,
        reason: "progress-error",
        message: friendlyError(err),
        scoreResult,
      };
    }

    return {
      ok: scoreResult?.ok !== false,
      scoreResult,
      message: scoreResult?.message || "Saved to your account",
    };
  }

  async function loadLeaderboard(gameId = null, limit = GLOBAL_LIMIT) {
    if (!ready || !db) {
      await init();
      if (!db) return [];
    }
    try {
      let q;
      if (gameId && GAME_IDS.includes(gameId)) {
        q = db.collection(SCORES).where("game", "==", gameId).orderBy("rankScore", "desc").limit(limit);
      } else {
        q = db.collection(SCORES).orderBy("rankScore", "desc").limit(limit);
      }
      const snap = await q.get();
      return snap.docs.map(mapScoreDoc);
    } catch (err) {
      console.warn("[ArcadeCloud] loadLeaderboard failed", err);
      setStatus("error", friendlyError(err));
      return [];
    }
  }

  function getDiagnostics() {
    const c = cfg();
    const u = auth?.currentUser || user;
    return {
      configured: isConfigured(),
      enabled: !!c.enabled,
      projectId: c.projectId || null,
      authDomain: c.authDomain || null,
      sdkLoaded: typeof firebase !== "undefined",
      status,
      ready,
      lastError,
      uid: u?.uid || null,
      email: u?.email || null,
      providers: u?.providerData?.map((p) => p.providerId) || [],
      username: profile?.username || null,
      leaderboardGame,
      hallCount: leaderboard.length,
      expectedDocExample: u?.uid ? scoreDocId(u.uid, "snake") : null,
    };
  }

  /** Dev helper: window.ArcadeCloud.probeWrite() from the console */
  async function probeWrite() {
    user = auth?.currentUser || user;
    const diag = getDiagnostics();
    console.log("[ArcadeCloud] probe diagnostics", diag);
    if (!user) return { ok: false, message: "Not signed in", diag };
    if (!profile?.username) {
      try {
        await setUsername(suggestUsername());
      } catch (e) {
        return { ok: false, message: "Username write failed: " + e.message, diag: getDiagnostics() };
      }
    }
    return submitCloudScore("snake", 1, { probe: true }, { force: true, isHighScore: true });
  }

  // Back-compat alias
  function getGlobalHall() {
    return leaderboard.slice();
  }

  function getStatus() {
    return status;
  }

  function getLastError() {
    return lastError;
  }

  function onChange(fn) {
    if (typeof fn === "function") listeners.add(fn);
    return () => listeners.delete(fn);
  }

  global.ArcadeCloud = {
    init,
    isConfigured,
    signInWithGoogle,
    signOut,
    setUsername,
    suggestUsername,
    submitCloudScore,
    saveRunToCloud,
    syncAccountProgress,
    loadLeaderboard,
    setLeaderboardGame,
    getLeaderboard,
    getGlobalHall,
    getStatus,
    getLastError,
    getDiagnostics,
    getState,
    probeWrite,
    onChange,
    GAME_IDS,
  };
})(window);
