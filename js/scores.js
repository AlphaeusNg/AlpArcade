/**
 * Arcade score system — localStorage only (works on static GitHub Pages).
 * Tracks player name, per-game highs, XP, history, and a hall-of-fame board.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "alphaeus-arcade-v1";
  const MAX_HISTORY = 40;
  const MAX_HALL = 15;

  /** @type {Record<string, { label: string, higherIsBetter: boolean, unit: string }>} */
  const GAMES = {
    tictactoe: { label: "Tic-Tac-Toe", higherIsBetter: true, unit: "wins" },
    shooter: { label: "Space Shooter", higherIsBetter: true, unit: "pts" },
    snake: { label: "Snake", higherIsBetter: true, unit: "pts" },
    reaction: { label: "Reaction Lab", higherIsBetter: false, unit: "ms" },
    memory: { label: "Memory Match", higherIsBetter: true, unit: "pts" },
  };

  function defaultState() {
    return {
      playerName: "Player",
      xp: 0,
      gamesPlayed: 0,
      highScores: {
        tictactoe: { best: 0, wins: 0, losses: 0, draws: 0 },
        shooter: { best: 0 },
        snake: { best: 0 },
        reaction: { best: null },
        memory: { best: 0 },
      },
      history: [],
      hallOfFame: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      return { ...defaultState(), ...data, highScores: { ...defaultState().highScores, ...(data.highScores || {}) } };
    } catch {
      return defaultState();
    }
  }

  function save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getState() {
    return load();
  }

  function setPlayerName(name) {
    const state = load();
    state.playerName = String(name || "Player").trim().slice(0, 16) || "Player";
    save(state);
    return state.playerName;
  }

  /**
   * Record a finished game.
   * @param {string} gameId
   * @param {number} score
   * @param {object} [meta]
   * @returns {{ isHighScore: boolean, xpGained: number, state: object }}
   */
  function submitScore(gameId, score, meta = {}) {
    const metaInfo = GAMES[gameId];
    if (!metaInfo) throw new Error("Unknown game: " + gameId);

    const state = load();
    const num = Number(score);
    if (!Number.isFinite(num)) return { isHighScore: false, xpGained: 0, state };

    let isHighScore = false;
    const hs = state.highScores[gameId] || { best: metaInfo.higherIsBetter ? 0 : null };

    if (gameId === "tictactoe") {
      if (meta.result === "win") hs.wins = (hs.wins || 0) + 1;
      if (meta.result === "loss") hs.losses = (hs.losses || 0) + 1;
      if (meta.result === "draw") hs.draws = (hs.draws || 0) + 1;
      hs.best = hs.wins || 0;
      isHighScore = meta.result === "win";
    } else if (metaInfo.higherIsBetter) {
      if (num > (hs.best ?? 0)) {
        hs.best = num;
        isHighScore = true;
      }
    } else {
      // lower is better (reaction)
      if (hs.best == null || num < hs.best) {
        hs.best = num;
        isHighScore = true;
      }
    }
    state.highScores[gameId] = hs;

    // XP: scale by game
    let xpGained = 0;
    if (gameId === "tictactoe") {
      xpGained = meta.result === "win" ? 25 : meta.result === "draw" ? 10 : 5;
    } else if (gameId === "reaction") {
      xpGained = Math.max(5, Math.round(80 - num / 10));
    } else {
      xpGained = Math.max(5, Math.round(num / 10));
    }
    state.xp += xpGained;
    state.gamesPlayed += 1;

    const entry = {
      game: gameId,
      score: num,
      player: state.playerName,
      at: Date.now(),
      meta,
      xp: xpGained,
    };
    state.history.unshift(entry);
    state.history = state.history.slice(0, MAX_HISTORY);

    // Hall of fame — keep best scores (for reaction, invert ranking later when sorting)
    state.hallOfFame.push({
      game: gameId,
      score: num,
      player: state.playerName,
      at: Date.now(),
    });
    state.hallOfFame = rankHall(state.hallOfFame).slice(0, MAX_HALL);

    save(state);
    return { isHighScore, xpGained, state };
  }

  function rankHall(list) {
    return [...list].sort((a, b) => {
      const ga = GAMES[a.game];
      const gb = GAMES[b.game];
      // Prefer higher XP-like scores: normalize roughly
      const scoreA = ga?.higherIsBetter === false ? 10000 - a.score : a.score;
      const scoreB = gb?.higherIsBetter === false ? 10000 - b.score : b.score;
      return scoreB - scoreA;
    });
  }

  function formatScore(gameId, score) {
    const g = GAMES[gameId];
    if (!g) return String(score);
    if (gameId === "reaction") return score == null ? "—" : `${score} ms`;
    return `${score} ${g.unit}`;
  }

  function getLevel(xp) {
    // Soft curve
    let level = 1;
    let need = 50;
    let remaining = xp;
    while (remaining >= need) {
      remaining -= need;
      level += 1;
      need = Math.floor(need * 1.35);
    }
    return { level, progress: remaining, next: need };
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    return defaultState();
  }

  function exportCode() {
    const json = JSON.stringify(load());
    return btoa(unescape(encodeURIComponent(json)));
  }

  function importCode(code) {
    try {
      const json = decodeURIComponent(escape(atob(String(code).trim())));
      const data = JSON.parse(json);
      if (!data || typeof data !== "object") throw new Error("bad");
      save({ ...defaultState(), ...data });
      return load();
    } catch {
      throw new Error("Invalid score code");
    }
  }

  global.ArcadeScores = {
    GAMES,
    getState,
    setPlayerName,
    submitScore,
    formatScore,
    getLevel,
    resetAll,
    exportCode,
    importCode,
  };
})(window);
