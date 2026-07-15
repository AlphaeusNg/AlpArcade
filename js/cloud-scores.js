/**
 * Cloud scoreboard — Firestore + anonymous auth.
 * Mirrors local high-score moments to a global Hall of Fame.
 * Degrades gracefully when Firebase is disabled or offline.
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
  let unsub = null;
  let lastSubmitAt = 0;
  /** @type {Array<object>} */
  let globalHall = [];
  /** @type {Set<Function>} */
  const listeners = new Set();

  function cfg() {
    return global.ARCADE_FIREBASE_CONFIG || {};
  }

  function isConfigured() {
    const c = cfg();
    return !!(c.enabled && c.apiKey && c.apiKey !== "YOUR_API_KEY" && c.projectId && c.projectId !== "YOUR_PROJECT_ID");
  }

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn({ status, globalHall, online: status === "online" });
      } catch (err) {
        console.warn("[ArcadeCloud] listener error", err);
      }
    });
  }

  function setStatus(next) {
    if (status === next) return;
    status = next;
    notify();
  }

  function rankScore(gameId, score) {
    const g = global.ArcadeScores?.GAMES?.[gameId];
    if (g && g.higherIsBetter === false) return 10000 - Number(score);
    return Number(score);
  }

  function playerLabel() {
    const name = global.ArcadeScores?.getState?.()?.playerName || "Player";
    const uid = auth?.currentUser?.uid;
    if (uid) return { playerName: name, userId: uid };
    return { playerName: name, userId: null };
  }

  async function init() {
    if (!isConfigured()) {
      setStatus("off");
      return false;
    }
    if (typeof firebase === "undefined") {
      console.warn("[ArcadeCloud] Firebase SDK not loaded");
      setStatus("error");
      return false;
    }
    if (ready) return true;

    setStatus("connecting");
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(cfg());
      }
      db = firebase.firestore();
      auth = firebase.auth();

      await auth.signInAnonymously();
      ready = true;
      setStatus("online");
      subscribeGlobal();
      return true;
    } catch (err) {
      console.warn("[ArcadeCloud] init failed", err);
      ready = false;
      setStatus("error");
      return false;
    }
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
            if (status !== "online") setStatus("online");
            else notify();
          },
          (err) => {
            console.warn("[ArcadeCloud] snapshot error", err);
            setStatus("error");
          }
        );
    } catch (err) {
      console.warn("[ArcadeCloud] subscribe failed", err);
      setStatus("error");
    }
  }

  /**
   * Push a score to Firestore (best-effort). Prefer high scores to limit writes.
   * @param {string} gameId
   * @param {number} score
   * @param {object} [meta]
   * @param {{ force?: boolean, isHighScore?: boolean }} [opts]
   */
  async function submitCloudScore(gameId, score, meta = {}, opts = {}) {
    if (!ready || !db) return { ok: false, reason: "offline" };
    const num = Number(score);
    if (!Number.isFinite(num)) return { ok: false, reason: "bad-score" };

    // Default: only auto-push high scores / wins; "force" for manual share
    if (!opts.force && !opts.isHighScore && meta.result !== "win") {
      return { ok: false, reason: "skipped" };
    }

    const now = Date.now();
    if (!opts.force && now - lastSubmitAt < MIN_SUBMIT_GAP_MS) {
      return { ok: false, reason: "rate-limit" };
    }
    lastSubmitAt = now;

    const { playerName, userId } = playerLabel();
    const payload = {
      game: gameId,
      playerName: String(playerName).slice(0, 16),
      score: num,
      rankScore: rankScore(gameId, num),
      userId: userId || null,
      meta: sanitizeMeta(meta),
      clientAt: now,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    };

    try {
      await db.collection(COLLECTION).add(payload);
      return { ok: true };
    } catch (err) {
      console.warn("[ArcadeCloud] write failed", err);
      setStatus("error");
      return { ok: false, reason: "write-error", err };
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

  /**
   * One-shot leaderboard load (optional game filter).
   * Note: game filter + orderBy score needs a composite index in Firestore.
   */
  async function loadLeaderboard(gameId = null, limit = GLOBAL_LIMIT) {
    if (!ready || !db) return [];
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
      return [];
    }
  }

  function getGlobalHall() {
    return globalHall.slice();
  }

  function getStatus() {
    return status;
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
    onChange,
  };
})(window);
