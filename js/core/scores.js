/**
 * Arcade score system — localStorage + optional Firebase cloud mirror.
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
    tapper: { label: "Target Tap", higherIsBetter: true, unit: "pts" },
    jubeat: { label: "Pulse Grid", higherIsBetter: true, unit: "score" },
    breaker: { label: "Circuit Breaker", higherIsBetter: true, unit: "pts" },
  };

  const REWARD_SCALES = {
    shooter: 900,
    snake: 160,
    memory: 300,
    tapper: 300,
    breaker: 900,
  };

  function clampArcadePoints(value) {
    return Math.max(5, Math.min(100, Math.round(Number(value) || 0)));
  }

  function endlessGamePoints(score, scale) {
    const nativeScore = Math.max(0, Number(score) || 0);
    return clampArcadePoints(100 * (1 - Math.exp(-nativeScore / scale)));
  }

  /** Convert incomparable native game scores into a common 5–100 reward. */
  function arcadePointsForRun(gameId, score, meta = {}) {
    const nativeScore = Math.max(0, Number(score) || 0);
    if (gameId === "tictactoe") {
      if (meta.result === "loss") return 5;
      if (meta.result === "draw") return 12;
      const difficultyBonus = { easy: 0, medium: 10, hard: 20 }[meta.difficulty] || 0;
      const streakBonus = Math.min(30, Math.max(0, (Number(meta.streak) || 1) - 1) * 5);
      return clampArcadePoints(30 + difficultyBonus + streakBonus);
    }
    if (gameId === "reaction") {
      return clampArcadePoints(10 + Math.max(0, 400 - nativeScore) * 0.3);
    }
    if (gameId === "jubeat") {
      return clampArcadePoints(nativeScore / 10000);
    }
    if (REWARD_SCALES[gameId]) {
      return endlessGamePoints(nativeScore, REWARD_SCALES[gameId]);
    }
    return clampArcadePoints(nativeScore / 10);
  }

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
        tapper: { best: 0 },
        jubeat: { best: 0 },
        breaker: { best: 0 },
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
      if (!data || typeof data !== "object") return defaultState();
      const base = defaultState();
      const highScores = { ...base.highScores };
      if (data.highScores && typeof data.highScores === "object") {
        for (const id of Object.keys(base.highScores)) {
          const incoming = data.highScores[id];
          if (!incoming || typeof incoming !== "object") continue;
          highScores[id] = { ...base.highScores[id], ...incoming };
        }
      }
      return {
        ...base,
        playerName:
          typeof data.playerName === "string" ? data.playerName.trim().slice(0, 16) || "Player" : base.playerName,
        xp: Number.isFinite(Number(data.xp)) ? Math.max(0, Math.floor(Number(data.xp))) : 0,
        gamesPlayed: Number.isFinite(Number(data.gamesPlayed))
          ? Math.max(0, Math.floor(Number(data.gamesPlayed)))
          : 0,
        highScores,
        history: Array.isArray(data.history) ? data.history.slice(0, MAX_HISTORY) : [],
        hallOfFame: Array.isArray(data.hallOfFame)
          ? rankHall(data.hallOfFame).slice(0, MAX_HALL)
          : [],
      };
    } catch {
      return defaultState();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // QuotaExceeded or private-mode storage denial — keep session playable.
      console.warn("[ArcadeScores] save failed", err);
    }
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
   * @returns {{ isHighScore: boolean, xpGained: number, arcadePoints: number, state: object }}
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

    const arcadePoints = arcadePointsForRun(gameId, num, meta);
    const xpGained = arcadePoints;
    state.xp += xpGained;
    state.gamesPlayed += 1;

    const entry = {
      game: gameId,
      score: num,
      player: state.playerName,
      at: Date.now(),
      meta,
      xp: xpGained,
      arcadePoints,
    };
    state.history.unshift(entry);
    state.history = state.history.slice(0, MAX_HISTORY);

    // Hall of fame — keep best scores (for reaction, invert ranking later when sorting)
    state.hallOfFame.push({
      game: gameId,
      score: num,
      player: state.playerName,
      at: Date.now(),
      arcadePoints,
    });
    state.hallOfFame = rankHall(state.hallOfFame).slice(0, MAX_HALL);

    save(state);

    // Cloud save: guests opt-in via UI; signed-in users sync from app.js.

    return { isHighScore, xpGained, arcadePoints, state };
  }

  function rankHall(list) {
    return [...list].sort((a, b) => {
      const scoreA = Number(a.arcadePoints) || arcadePointsForRun(a.game, a.score, a.meta);
      const scoreB = Number(b.arcadePoints) || arcadePointsForRun(b.game, b.score, b.meta);
      return scoreB - scoreA;
    });
  }

  function formatScore(gameId, score) {
    const g = GAMES[gameId];
    if (!g) return String(score);
    if (gameId === "reaction") return score == null ? "—" : `${score} ms`;
    if (gameId === "jubeat") return score == null ? "—" : Number(score).toLocaleString();
    return `${score} ${g.unit}`;
  }

  function getLevel(xp) {
    // Unlimited levels — no hard cap. Curve eases after mid-levels so high ranks stay reachable.
    let level = 1;
    let need = 50;
    let remaining = Math.max(0, Math.floor(Number(xp) || 0));
    // Safety: never infinite-loop on huge XP
    const hardStop = 100000;
    while (remaining >= need && level < hardStop) {
      remaining -= need;
      level += 1;
      // Early: classic ramp · later: gentler growth so levels don't soft-cap
      const mult = level < 12 ? 1.28 : level < 30 ? 1.14 : 1.08;
      need = Math.max(40, Math.floor(need * mult));
    }
    return { level, progress: remaining, next: need };
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    return defaultState();
  }

  /**
   * Merge cloud high scores into local (keep better best per game).
   * Also takes max of xp / gamesPlayed when provided.
   */
  function mergeHighScores(remoteHighScores, meta = {}) {
    const state = load();
    const remote = remoteHighScores && typeof remoteHighScores === "object" ? remoteHighScores : {};
    let changed = false;

    for (const gameId of Object.keys(GAMES)) {
      const g = GAMES[gameId];
      const localHs = state.highScores[gameId] || { ...defaultState().highScores[gameId] };
      const remoteHs = remote[gameId];
      if (!remoteHs || typeof remoteHs !== "object") continue;

      const localBest = localHs.best;
      const remoteBest = remoteHs.best;

      if (gameId === "tictactoe") {
        const lw = Number(localHs.wins) || 0;
        const rw = Number(remoteHs.wins) || 0;
        if (rw > lw) {
          localHs.wins = rw;
          localHs.best = rw;
          changed = true;
        }
        if ((Number(remoteHs.losses) || 0) > (Number(localHs.losses) || 0)) {
          localHs.losses = Number(remoteHs.losses) || 0;
          changed = true;
        }
        if ((Number(remoteHs.draws) || 0) > (Number(localHs.draws) || 0)) {
          localHs.draws = Number(remoteHs.draws) || 0;
          changed = true;
        }
      } else if (g.higherIsBetter) {
        if (remoteBest != null && Number(remoteBest) > Number(localBest ?? 0)) {
          localHs.best = Number(remoteBest);
          changed = true;
        }
      } else {
        // lower is better
        if (
          remoteBest != null &&
          Number.isFinite(Number(remoteBest)) &&
          (localBest == null || Number(remoteBest) < Number(localBest))
        ) {
          localHs.best = Number(remoteBest);
          changed = true;
        }
      }
      state.highScores[gameId] = localHs;
    }

    if (Number.isFinite(Number(meta.xp)) && Number(meta.xp) > state.xp) {
      state.xp = Math.floor(Number(meta.xp));
      changed = true;
    }
    if (Number.isFinite(Number(meta.gamesPlayed)) && Number(meta.gamesPlayed) > state.gamesPlayed) {
      state.gamesPlayed = Math.floor(Number(meta.gamesPlayed));
      changed = true;
    }
    if (
      typeof meta.playerName === "string" &&
      meta.playerName.trim() &&
      (state.playerName === "Player" || !state.playerName)
    ) {
      state.playerName = meta.playerName.trim().slice(0, 16);
      changed = true;
    }

    if (changed) save(state);
    return load();
  }

  /** UTF-8 safe base64 (avoids deprecated escape/unescape). */
  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function fromBase64(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function exportCode() {
    return toBase64(JSON.stringify(load()));
  }

  function importCode(code) {
    try {
      const raw = String(code).trim();
      let json;
      try {
        json = fromBase64(raw);
      } catch {
        // Legacy codes produced with btoa(unescape(encodeURIComponent(...)))
        json = decodeURIComponent(escape(atob(raw)));
      }
      const data = JSON.parse(json);
      if (!data || typeof data !== "object") throw new Error("bad");
      // Only accept known top-level keys from a merged default state.
      const base = defaultState();
      const merged = {
        ...base,
        playerName: typeof data.playerName === "string" ? data.playerName.slice(0, 16) : base.playerName,
        xp: Number.isFinite(Number(data.xp)) ? Math.max(0, Math.floor(Number(data.xp))) : 0,
        gamesPlayed: Number.isFinite(Number(data.gamesPlayed))
          ? Math.max(0, Math.floor(Number(data.gamesPlayed)))
          : 0,
        highScores: { ...base.highScores, ...(data.highScores && typeof data.highScores === "object" ? data.highScores : {}) },
        history: Array.isArray(data.history) ? data.history.slice(0, MAX_HISTORY) : [],
        hallOfFame: Array.isArray(data.hallOfFame) ? data.hallOfFame.slice(0, MAX_HALL) : [],
      };
      save(merged);
      return load();
    } catch {
      throw new Error("Invalid score code");
    }
  }

  global.ArcadeScores = {
    GAMES,
    getState,
    setPlayerName,
    mergeHighScores,
    submitScore,
    arcadePointsForRun,
    formatScore,
    getLevel,
    resetAll,
    exportCode,
    importCode,
  };
})(window);
