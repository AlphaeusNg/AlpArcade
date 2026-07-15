/**
 * Cloud scoreboard — Firestore + anonymous auth.
 * Mirrors local high-score moments to a global Hall of Fame.
 * Surfaces clear errors when offline / misconfigured / denied.
 */
(function (global) {
  "use strict";

  const COLLECTION = "scores";
  const GLOBAL_LIMIT = 25;
  const MIN_SUBMIT_GAP_MS = 2500;

  let db = null;
  let auth = null;
  let ready = false;
  let status = "off"; // off | connecting | online | error
  let lastError = "";
  let unsub = null;
  let lastSubmitAt = 0;
  let initPromise = null;
  /** @type {Array<object>} */
  let globalHall = [];
  /** @type {Set<Function>} */
  const listeners = new Set();

  function cfg() {
    return global.ARCADE_FIREBASE_CONFIG || {};
  }

  /** Strip non-Firebase keys (enabled, etc.) before initializeApp. */
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
    if (status === next && !errMsg) {
      notify();
      return;
    }
    status = next;
    notify();
  }

  function getState() {
    return {
      status,
      globalHall,
      online: status === "online",
      lastError,
      configured: isConfigured(),
      ready,
    };
  }

  function friendlyError(err) {
    const code = err?.code || err?.name || "";
    const msg = err?.message || String(err || "unknown error");
    if (/auth\/operation-not-allowed|ADMIN_ONLY_OPERATION/i.test(code + msg)) {
      return "Anonymous sign-in is disabled in Firebase Authentication.";
    }
    if (/permission-denied|PERMISSION_DENIED|Missing or insufficient/i.test(code + msg)) {
      return "Firestore permission denied — publish firestore.rules for collection scores.";
    }
    if (/failed-precondition|requires an index/i.test(code + msg)) {
      return "Firestore needs an index (open the error link in the browser console).";
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

  async function ensureAuthUser() {
    if (!auth) throw new Error("Auth not initialized");
    if (auth.currentUser) return auth.currentUser;
    const cred = await auth.signInAnonymously();
    return cred.user;
  }

  function playerLabel(user) {
    const name = global.ArcadeScores?.getState?.()?.playerName || "Player";
    const uid = user?.uid || auth?.currentUser?.uid || null;
    return { playerName: name, userId: uid };
  }

  async function init() {
    if (!isConfigured()) {
      setStatus("off", "Cloud disabled — set enabled:true in js/firebase-config.js");
      return false;
    }
    if (ready && status === "online") return true;
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

        await ensureAuthUser();
        ready = true;
        setStatus("online");
        subscribeGlobal();
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

  function subscribeGlobal() {
    if (!db || unsub) return;
    try {
      unsub = db
        .collection(COLLECTION)
        .orderBy("rankScore", "desc")
        .limit(GLOBAL_LIMIT)
        .onSnapshot(
          (snap) => {
            globalHall = snap.docs.map((doc) => {
              const d = doc.data() || {};
              return {
                id: doc.id,
                game: d.game,
                score: d.score,
                player: d.playerName || "Player",
                at: d.timestamp?.toMillis?.() || d.clientAt || 0,
                userId: d.userId || null,
              };
            });
            setStatus("online");
          },
          (err) => {
            console.warn("[ArcadeCloud] snapshot error", err);
            setStatus("error", "Leaderboard listen failed: " + friendlyError(err));
          }
        );
    } catch (err) {
      console.warn("[ArcadeCloud] subscribe failed", err);
      setStatus("error", friendlyError(err));
    }
  }

  /**
   * Push a score to Firestore.
   * @param {string} gameId
   * @param {number} score
   * @param {object} [meta]
   * @param {{ force?: boolean, isHighScore?: boolean }} [opts]
   */
  async function submitCloudScore(gameId, score, meta = {}, opts = {}) {
    if (!isConfigured()) return { ok: false, reason: "off", message: "Cloud not configured" };

    if (!ready || !db || status !== "online") {
      const ok = await init();
      if (!ok || !db) {
        return { ok: false, reason: "offline", message: lastError || "Cloud offline" };
      }
    }

    const num = Number(score);
    if (!Number.isFinite(num)) return { ok: false, reason: "bad-score", message: "Invalid score" };

    if (!opts.force && !opts.isHighScore && meta.result !== "win") {
      return { ok: false, reason: "skipped", message: "Not a high score" };
    }

    const now = Date.now();
    if (!opts.force && now - lastSubmitAt < MIN_SUBMIT_GAP_MS) {
      return { ok: false, reason: "rate-limit", message: "Too fast — wait a moment" };
    }

    let user;
    try {
      user = await ensureAuthUser();
    } catch (err) {
      const message = friendlyError(err);
      setStatus("error", message);
      return { ok: false, reason: "auth-error", message };
    }

    if (!user?.uid) {
      return { ok: false, reason: "auth-error", message: "No signed-in user (Anonymous auth?)" };
    }

    lastSubmitAt = now;
    const { playerName, userId } = playerLabel(user);
    const payload = {
      game: gameId,
      playerName: String(playerName).slice(0, 16),
      score: num,
      rankScore: rankScore(gameId, num),
      userId,
      meta: sanitizeMeta(meta),
      clientAt: now,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    };

    try {
      await db.collection(COLLECTION).add(payload);
      if (status !== "online") setStatus("online");
      return { ok: true, message: "Posted" };
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
      let q = db.collection(COLLECTION).orderBy("rankScore", "desc").limit(limit);
      if (gameId) {
        q = db
          .collection(COLLECTION)
          .where("game", "==", gameId)
          .orderBy("rankScore", "desc")
          .limit(limit);
      }
      const snap = await q.get();
      return snap.docs.map((doc) => {
        const d = doc.data() || {};
        return {
          id: doc.id,
          game: d.game,
          score: d.score,
          player: d.playerName || "Player",
          at: d.timestamp?.toMillis?.() || d.clientAt || 0,
        };
      });
    } catch (err) {
      console.warn("[ArcadeCloud] loadLeaderboard failed", err);
      setStatus("error", friendlyError(err));
      return [];
    }
  }

  function getGlobalHall() {
    return globalHall.slice();
  }

  function getStatus() {
    return status;
  }

  function getLastError() {
    return lastError;
  }

  /** Human-readable checklist for the UI / console. */
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
      uid: auth?.currentUser?.uid || null,
      hallCount: globalHall.length,
    };
  }

  function onChange(fn) {
    if (typeof fn === "function") listeners.add(fn);
    return () => listeners.delete(fn);
  }

  global.ArcadeCloud = {
    init,
    isConfigured,
    submitCloudScore,
    loadLeaderboard,
    getGlobalHall,
    getStatus,
    getLastError,
    getDiagnostics,
    getState,
    onChange,
  };
})(window);
