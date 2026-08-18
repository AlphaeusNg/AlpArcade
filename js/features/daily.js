/**
 * Daily challenge — deterministic target per Singapore calendar day (SGT, UTC+8).
 */
(function (global) {
  "use strict";

  const KEY = "alparcade-daily-v1";
  const SAVE_ERROR_MESSAGE =
    "Daily challenge progress couldn't be saved on this device — enable site storage to keep it after this visit.";
  const RESET_ERROR_MESSAGE =
    "Daily challenge progress couldn't be reset — enable site storage and try again.";
  const TZ = "Asia/Singapore"; // SGT year-round (no DST)
  let sessionProgress = null;
  let saveFailureNotified = false;
  const GAMES = ["snake", "shooter", "reaction", "memory", "tapper", "tictactoe", "jubeat", "breaker"];
  const FALLBACK_ORDER = ["snake", "tictactoe", "breaker", "tapper", "reaction", "shooter", "memory", "jubeat"];
  const UNLOCK_LEVELS = { reaction: 5, shooter: 5, memory: 10, jubeat: 15 };

  /**
   * YYYY-MM-DD for the calendar day in Singapore time.
   * At 00:33 SGT this is the new SGT date, not the still-previous UTC date.
   */
  function dayKey(d = new Date()) {
    try {
      // en-CA formats as YYYY-MM-DD
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    } catch {
      // Fallback: fixed UTC+8 offset (SGT has no DST)
      const shifted = new Date(d.getTime() + 8 * 60 * 60 * 1000);
      return shifted.toISOString().slice(0, 10);
    }
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function challengeFor(date = new Date()) {
    const key = dayKey(date);
    const h = hash("alparcade-daily-" + key);
    const game = GAMES[h % GAMES.length];
    const targets = {
      snake: 40 + (h % 60),
      shooter: 200 + (h % 400),
      reaction: 280 - (h % 80), // lower is better — beat this ms
      memory: 80 + (h % 120),
      tapper: 80 + (h % 140),
      tictactoe: 1, // win once
      jubeat: 650000 + (h % 250000),
      breaker: 200 + (h % 500),
    };
    return {
      day: key,
      game,
      target: targets[game],
      label: global.ArcadeScores?.GAMES?.[game]?.label || game,
      higherIsBetter: game !== "reaction",
      timezone: "SGT",
    };
  }

  function normalizeProgress(data) {
    if (!isRecord(data)) return {};
    const normalized = {};
    for (const [day, entry] of Object.entries(data)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isRecord(entry) || entry.done !== true) continue;
      const score = Number(entry.score);
      normalized[day] = {
        done: true,
        score: Number.isFinite(score) ? score : 0,
        at: Number(entry.at) || 0,
      };
    }
    return normalized;
  }

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return {};
      return normalizeProgress(JSON.parse(raw));
    } catch {
      return {};
    }
  }

  function loadProgress() {
    return sessionProgress ? normalizeProgress(sessionProgress) : loadPersisted();
  }

  function reportSaveFailure(error) {
    if (saveFailureNotified) return;
    saveFailureNotified = true;
    console.warn("[ArcadeDaily] save failed", error);
    try {
      if (typeof global.CustomEvent === "function" && typeof global.dispatchEvent === "function") {
        global.dispatchEvent(new global.CustomEvent("arcade:daily-save-error", {
          detail: { message: SAVE_ERROR_MESSAGE },
        }));
      }
    } catch {
      /* The in-session fallback still works if event delivery is unavailable. */
    }
  }

  function saveProgress(data) {
    const next = normalizeProgress(data);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      sessionProgress = null;
      saveFailureNotified = false;
      return true;
    } catch (error) {
      sessionProgress = next;
      reportSaveFailure(error);
      return false;
    }
  }

  function isComplete(day = dayKey()) {
    const p = loadProgress();
    return !!p[day]?.done;
  }

  function markAttempt(gameId, score, meta = {}) {
    const ch = challengeFor();
    if (gameId !== ch.game) return { completed: false, challenge: ch };
    let ok = false;
    if (gameId === "tictactoe") {
      ok = meta.result === "win";
    } else if (gameId === "reaction") {
      ok = Number(score) > 0 && Number(score) <= ch.target;
    } else {
      ok = Number(score) >= ch.target;
    }
    if (!ok) return { completed: false, challenge: ch };

    const p = loadProgress();
    if (!p[ch.day]?.done) {
      p[ch.day] = { done: true, score: Number(score), at: Date.now() };
      saveProgress(p);
      global.ArcadeAchievements?.unlock?.("daily");
      return { completed: true, firstTime: true, challenge: ch };
    }
    return { completed: true, firstTime: false, challenge: ch };
  }

  function formatTarget(ch) {
    if (!ch) return "";
    if (ch.game === "reaction") return `≤ ${ch.target} ms`;
    if (ch.game === "tictactoe") return "Win a match";
    return `≥ ${ch.target} pts`;
  }

  function unlockLevelFor(gameId) {
    return UNLOCK_LEVELS[gameId] || 0;
  }

  function gameLabel(gameId) {
    return global.ArcadeScores?.GAMES?.[gameId]?.label || gameId;
  }

  /**
   * First free / unlocked cabinet the hero button can actually open.
   * Prefers Snake, then other always-free cabinets, then the nearest unlocked gate.
   */
  function fallbackPlayable(isUnlocked) {
    const check = typeof isUnlocked === "function" ? isUnlocked : () => true;
    for (const id of FALLBACK_ORDER) {
      if (check(id)) return id;
    }
    return "snake";
  }

  /**
   * Today's challenge plus a guaranteed playable cabinet for the lobby CTA.
   * When the assigned game is locked, `playGame` is Snake (or nearest unlocked).
   */
  function playableChallenge(opts = {}) {
    const ch = challengeFor(opts.date);
    const isUnlocked = typeof opts.isUnlocked === "function" ? opts.isUnlocked : () => true;
    const locked = !isUnlocked(ch.game);
    if (!locked) {
      return {
        ...ch,
        playGame: ch.game,
        playLabel: ch.label,
        locked: false,
        unlockLevel: 0,
        fallback: null,
      };
    }
    const fallback = fallbackPlayable(isUnlocked);
    return {
      ...ch,
      playGame: fallback,
      playLabel: gameLabel(fallback),
      locked: true,
      unlockLevel: unlockLevelFor(ch.game),
      fallback,
    };
  }

  function resetAll() {
    try {
      localStorage.removeItem(KEY);
    } catch (error) {
      throw new Error(RESET_ERROR_MESSAGE, { cause: error });
    }
    sessionProgress = null;
    saveFailureNotified = false;
    return {};
  }

  global.ArcadeDaily = {
    challengeFor,
    playableChallenge,
    fallbackPlayable,
    unlockLevelFor,
    isComplete,
    markAttempt,
    formatTarget,
    dayKey,
    TZ,
    resetAll,
  };
})(window);
