/**
 * Daily challenge — deterministic target per Singapore calendar day (SGT, UTC+8).
 */
(function (global) {
  "use strict";

  const KEY = "alparcade-daily-v1";
  const TZ = "Asia/Singapore"; // SGT year-round (no DST)
  const GAMES = ["snake", "shooter", "reaction", "memory", "tapper", "tictactoe", "jubeat", "breaker"];

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
      jubeat: 8000 + (h % 12000),
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

  function loadProgress() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }

  function saveProgress(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* ignore */
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

  function resetAll() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return {};
  }

  global.ArcadeDaily = {
    challengeFor,
    isComplete,
    markAttempt,
    formatTarget,
    dayKey,
    TZ,
    resetAll,
  };
})(window);
