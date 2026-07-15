/**
 * Cloud scoreboard — Google Auth only, one best per user per game.
 * Play offline freely; save to cloud only when the player opts in after a run.
 */
(function (global) {
  "use strict";

  const SCORES = "scores";
  const PLAYERS = "players";
  const GLOBAL_LIMIT = 25;
  const GAME_IDS = ["tictactoe", "shooter", "snake", "reaction", "memory"];

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
      return "Firestore permission denied — publish the latest firestore.rules (Google-only writes).";
    }
    if (/failed-precondition|requires an index/i.test(code + msg)) {
      return "Firestore index needed for per-game boards — open the console link to create it.";
    }
    if (/offline|network|Failed to fetch|unavailable/i.test(code + msg)) {
      return "Network error reaching Firebase.";
    }
    if (/api-key|invalid-api-key|API_KEY/i.test(code + msg)) {
      return "Invalid Firebase API key in firebase-config.js.";
    }
    return msg.length > 140 ? msg.slice(0, 140) + "…" : msg;
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
    if (!user || !db) throw new Error("Sign in first");
    const username = sanitizeUsername(rawName);
    if (username.length < 2) throw new Error("Username needs at least 2 characters");
    if (username.length > 16) throw new Error("Username max 16 characters");

    await db
      .collection(PLAYERS)
      .doc(user.uid)
      .set(
        {
          username,
          email: user.email || null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    profile = { username, email: user.email || null };

    // Keep local arcade tag in sync for friendliness
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

    if (!user) {
      return { ok: false, reason: "auth-required", message: "Sign in with Google to save" };
    }

    const googleOk = user.providerData?.some((p) => p.providerId === "google.com");
    if (!googleOk) {
      return { ok: false, reason: "auth-required", message: "Use Google sign-in to save scores" };
    }

    if (!profile?.username) {
      return { ok: false, reason: "username-required", message: "Pick a username first" };
    }

    const num = Number(score);
    if (!Number.isFinite(num) || num < 0) {
      return { ok: false, reason: "bad-score", message: "Invalid score" };
    }

    const ref = db.collection(SCORES).doc(scoreDocId(user.uid, gameId));
    try {
      const existing = await ref.get();
      if (existing.exists) {
        const old = existing.data() || {};
        if (!opts.force && !isBetter(gameId, num, old.score)) {
          return {
            ok: true,
            reason: "not-better",
            message: "Your cloud best is already equal or better",
            improved: false,
          };
        }
        // When force-sharing local bests, keep the better of the two
        if (opts.force && !isBetter(gameId, num, old.score)) {
          return {
            ok: true,
            reason: "not-better",
            message: "Cloud already has your best",
            improved: false,
          };
        }
      }

      const now = Date.now();
      const payload = {
        game: gameId,
        playerName: profile.username,
        score: num,
        rankScore: rankScore(gameId, num),
        userId: user.uid,
        meta: sanitizeMeta(meta),
        clientAt: now,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      };

      await ref.set(payload, { merge: true });
      if (status !== "online") setStatus("online");
      return { ok: true, message: "Saved to cloud", improved: true };
    } catch (err) {
      console.warn("[ArcadeCloud] write failed", err);
      const message = friendlyError(err);
      setStatus("error", message);
      return { ok: false, reason: "write-error", message, err };
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
    return {
      configured: isConfigured(),
      enabled: !!c.enabled,
      projectId: c.projectId || null,
      sdkLoaded: typeof firebase !== "undefined",
      status,
      ready,
      lastError,
      uid: user?.uid || null,
      username: profile?.username || null,
      leaderboardGame,
      hallCount: leaderboard.length,
    };
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
    loadLeaderboard,
    setLeaderboardGame,
    getLeaderboard,
    getGlobalHall,
    getStatus,
    getLastError,
    getDiagnostics,
    getState,
    onChange,
    GAME_IDS,
  };
})(window);
