/**
 * Arcade score system — localStorage + optional Firebase cloud mirror.
 * Tracks player name, per-game highs, XP, history, and a hall-of-fame board.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "alphaeus-arcade-v1";
  const MAX_HISTORY = 40;
  const MAX_HALL = 15;
  const JUBEAT_DIFFICULTIES = ["easy", "medium", "extreme"];
  const SAVE_ERROR_MESSAGE =
    "Progress couldn't be saved on this device — enable site storage to keep this visit's XP and scores.";
  const RESET_ERROR_MESSAGE =
    "Score data couldn't be reset — enable site storage and try again.";
  let sessionState = null;
  let saveFailureNotified = false;

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
        jubeat: { best: 0, songs: {} },
        breaker: { best: 0 },
      },
      history: [],
      hallOfFame: [],
    };
  }

  function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function nonNegativeNumber(value, fallback = 0, { integer = false, positive = false } = {}) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || (positive && number <= 0)) return fallback;
    return integer ? Math.floor(number) : number;
  }

  function validRunScore(gameId, value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return null;
    if (gameId === "reaction" && number <= 0) return null;
    return number;
  }

  function normalizedJubeatSongId(value) {
    const id = typeof value === "string" ? value.trim() : "";
    return /^[a-z0-9][a-z0-9_-]{0,47}$/i.test(id) ? id : "";
  }

  function normalizedJubeatDifficulty(value) {
    const key = String(value || "").trim().toLowerCase();
    if (key === "easy" || key === "e" || key === "basic") return "easy";
    if (key === "medium" || key === "m" || key === "advanced") return "medium";
    if (["hard", "h", "extreme", "ex"].includes(key)) return "extreme";
    return "";
  }

  function normalizeJubeatSongBests(value) {
    if (!isRecord(value)) return {};
    const normalized = {};
    for (const [rawSongId, rawBests] of Object.entries(value).slice(0, 64)) {
      const songId = normalizedJubeatSongId(rawSongId);
      if (!songId || !isRecord(rawBests)) continue;
      const bests = {};
      for (const difficulty of JUBEAT_DIFFICULTIES) {
        const score = nonNegativeNumber(rawBests[difficulty], 0);
        if (score > 0) bests[difficulty] = score;
      }
      if (Object.keys(bests).length) normalized[songId] = bests;
    }
    return normalized;
  }

  function recordJubeatBest(highScore, score, meta = {}) {
    const songId = normalizedJubeatSongId(meta.song);
    const difficulty = normalizedJubeatDifficulty(meta.difficultyId || meta.difficulty);
    if (!songId || !difficulty) return false;
    highScore.songs = normalizeJubeatSongBests(highScore.songs);
    const songBests = highScore.songs[songId] || {};
    if (score <= Number(songBests[difficulty] || 0)) return false;
    songBests[difficulty] = score;
    highScore.songs[songId] = songBests;
    return true;
  }

  function normalizeHighScores(value) {
    const base = defaultState().highScores;
    const source = isRecord(value) ? value : {};
    const normalized = {};
    for (const gameId of Object.keys(base)) {
      const incoming = isRecord(source[gameId]) ? source[gameId] : {};
      if (gameId === "tictactoe") {
        const wins = nonNegativeNumber(incoming.wins, 0, { integer: true });
        normalized[gameId] = {
          best: wins,
          wins,
          losses: nonNegativeNumber(incoming.losses, 0, { integer: true }),
          draws: nonNegativeNumber(incoming.draws, 0, { integer: true }),
        };
      } else if (gameId === "reaction") {
        normalized[gameId] = {
          best: incoming.best == null
            ? null
            : nonNegativeNumber(incoming.best, null, { positive: true }),
        };
      } else if (gameId === "jubeat") {
        normalized[gameId] = {
          best: nonNegativeNumber(incoming.best, 0),
          songs: normalizeJubeatSongBests(incoming.songs),
        };
      } else {
        normalized[gameId] = { best: nonNegativeNumber(incoming.best, 0) };
      }
    }
    return normalized;
  }

  function normalizeScoreEntry(entry, { history = false } = {}) {
    if (!isRecord(entry) || !GAMES[entry.game]) return null;
    const score = validRunScore(entry.game, entry.score);
    if (score == null) return null;
    const meta = isRecord(entry.meta) ? entry.meta : {};
    const calculatedPoints = arcadePointsForRun(entry.game, score, meta);
    const storedPoints = nonNegativeNumber(entry.arcadePoints, calculatedPoints, { integer: true });
    const arcadePoints = Math.max(5, Math.min(100, storedPoints || calculatedPoints));
    const normalized = {
      ...entry,
      game: entry.game,
      score,
      player: typeof entry.player === "string"
        ? entry.player.trim().slice(0, 16) || "Player"
        : "Player",
      at: nonNegativeNumber(entry.at, 0, { integer: true }),
      arcadePoints,
    };
    if (history) {
      normalized.meta = meta;
      normalized.xp = nonNegativeNumber(entry.xp, arcadePoints, { integer: true });
    }
    return normalized;
  }

  function normalizeScoreEntries(value, options) {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => normalizeScoreEntry(entry, options))
      .filter(Boolean);
  }

  function normalizeState(data) {
    if (!isRecord(data)) return defaultState();
    const base = defaultState();
    const history = normalizeScoreEntries(data.history, { history: true }).slice(0, MAX_HISTORY);
    const hallOfFame = rankHall(
      normalizeScoreEntries(data.hallOfFame)
    ).slice(0, MAX_HALL);
    const highScores = normalizeHighScores(data.highScores);
    for (const entry of history) {
      if (entry.game === "jubeat") recordJubeatBest(highScores.jubeat, entry.score, entry.meta);
    }
    return {
      ...base,
      playerName:
        typeof data.playerName === "string" ? data.playerName.trim().slice(0, 16) || "Player" : base.playerName,
      xp: nonNegativeNumber(data.xp, 0, { integer: true }),
      gamesPlayed: nonNegativeNumber(data.gamesPlayed, 0, { integer: true }),
      highScores,
      history,
      hallOfFame,
    };
  }

  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return normalizeState(JSON.parse(raw));
    } catch {
      return defaultState();
    }
  }

  function load() {
    return sessionState ? normalizeState(sessionState) : loadPersisted();
  }

  function reportSaveFailure(error) {
    if (saveFailureNotified) return;
    saveFailureNotified = true;
    console.warn("[ArcadeScores] save failed", error);
    try {
      if (typeof global.CustomEvent === "function" && typeof global.dispatchEvent === "function") {
        global.dispatchEvent(new global.CustomEvent("arcade:score-save-error", {
          detail: { message: SAVE_ERROR_MESSAGE },
        }));
      }
    } catch {
      /* The in-session fallback still works if event delivery is unavailable. */
    }
  }

  function save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      sessionState = null;
      saveFailureNotified = false;
      return true;
    } catch (error) {
      sessionState = normalizeState(state);
      reportSaveFailure(error);
      return false;
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
    const num = validRunScore(gameId, score);
    if (num == null) {
      return { isHighScore: false, xpGained: 0, arcadePoints: 0, state };
    }

    let isHighScore = false;
    const hs = state.highScores[gameId] || { best: metaInfo.higherIsBetter ? 0 : null };

    if (gameId === "tictactoe") {
      if (meta.result === "win") hs.wins = (hs.wins || 0) + 1;
      if (meta.result === "loss") hs.losses = (hs.losses || 0) + 1;
      if (meta.result === "draw") hs.draws = (hs.draws || 0) + 1;
      hs.best = hs.wins || 0;
      isHighScore = meta.result === "win";
    } else if (gameId === "jubeat") {
      const overallRecord = num > Number(hs.best || 0);
      if (overallRecord) hs.best = num;
      isHighScore = recordJubeatBest(hs, num, meta) || overallRecord;
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

  function levelNeedMultiplier(level) {
    return level < 12 ? 1.28 : level < 30 ? 1.14 : 1.08;
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
      need = Math.max(40, Math.floor(need * levelNeedMultiplier(level)));
    }
    return { level, progress: remaining, next: need };
  }

  /** XP still needed to reach targetLevel. 0 if already there. */
  function xpToReachLevel(xp, targetLevel) {
    const target = Math.max(1, Math.floor(Number(targetLevel) || 1));
    const { level, progress, next } = getLevel(xp);
    if (level >= target) return 0;
    let remaining = Math.max(0, next - progress);
    let need = next;
    let lv = level;
    while (lv + 1 < target) {
      lv += 1;
      need = Math.max(40, Math.floor(need * levelNeedMultiplier(lv)));
      remaining += need;
    }
    return remaining;
  }

  function resetAll() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionState = null;
      saveFailureNotified = false;
    } catch (error) {
      throw new Error(RESET_ERROR_MESSAGE, { cause: error });
    }
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
        const rw = nonNegativeNumber(remoteHs.wins, 0, { integer: true });
        if (rw > lw) {
          localHs.wins = rw;
          localHs.best = rw;
          changed = true;
        }
        const remoteLosses = nonNegativeNumber(remoteHs.losses, 0, { integer: true });
        if (remoteLosses > (Number(localHs.losses) || 0)) {
          localHs.losses = remoteLosses;
          changed = true;
        }
        const remoteDraws = nonNegativeNumber(remoteHs.draws, 0, { integer: true });
        if (remoteDraws > (Number(localHs.draws) || 0)) {
          localHs.draws = remoteDraws;
          changed = true;
        }
      } else if (gameId === "jubeat") {
        const normalizedRemoteBest = validRunScore(gameId, remoteBest);
        if (normalizedRemoteBest != null && normalizedRemoteBest > Number(localBest ?? 0)) {
          localHs.best = normalizedRemoteBest;
          changed = true;
        }
        const remoteSongs = normalizeJubeatSongBests(remoteHs.songs);
        localHs.songs = normalizeJubeatSongBests(localHs.songs);
        for (const [songId, bests] of Object.entries(remoteSongs)) {
          const localSong = localHs.songs[songId] || {};
          for (const difficulty of JUBEAT_DIFFICULTIES) {
            if (Number(bests[difficulty] || 0) > Number(localSong[difficulty] || 0)) {
              localSong[difficulty] = bests[difficulty];
              changed = true;
            }
          }
          if (Object.keys(localSong).length) localHs.songs[songId] = localSong;
        }
      } else if (g.higherIsBetter) {
        const normalizedRemoteBest = validRunScore(gameId, remoteBest);
        if (normalizedRemoteBest != null && normalizedRemoteBest > Number(localBest ?? 0)) {
          localHs.best = normalizedRemoteBest;
          changed = true;
        }
      } else {
        // lower is better
        const normalizedRemoteBest = validRunScore(gameId, remoteBest);
        if (
          normalizedRemoteBest != null &&
          (localBest == null || normalizedRemoteBest < Number(localBest))
        ) {
          localHs.best = normalizedRemoteBest;
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
      save(normalizeState(merged));
      return load();
    } catch {
      throw new Error("Invalid score code");
    }
  }

  function getJubeatBests(songId) {
    const id = normalizedJubeatSongId(songId);
    const stored = id ? load().highScores.jubeat?.songs?.[id] : null;
    return Object.fromEntries(
      JUBEAT_DIFFICULTIES.map((difficulty) => [difficulty, Number(stored?.[difficulty]) || 0])
    );
  }

  global.ArcadeScores = {
    GAMES,
    getState,
    setPlayerName,
    mergeHighScores,
    getJubeatBests,
    submitScore,
    arcadePointsForRun,
    formatScore,
    getLevel,
    xpToReachLevel,
    resetAll,
    exportCode,
    importCode,
  };
})(window);
