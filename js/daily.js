/**
 * Daily challenge — deterministic target per UTC day.
 */
(function (global) {
  "use strict";

  const KEY = "alparcade-daily-v1";
  const GAMES = ["snake", "shooter", "reaction", "memory", "tapper", "tictactoe"];

  function dayKey(d = new Date()) {
    return d.toISOString().slice(0, 10); // YYYY-MM-DD UTC
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
    };
    return {
      day: key,
      game,
      target: targets[game],
      label: global.ArcadeScores?.GAMES?.[game]?.label || game,
      higherIsBetter: game !== "reaction",
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

  global.ArcadeDaily = {
    challengeFor,
    isComplete,
    markAttempt,
    formatTarget,
    dayKey,
  };
})(window);
