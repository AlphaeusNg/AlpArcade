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
    shooter: { label: "Space Shooter", higherIsBetter: true, unit: "wave" },
    snake: { label: "Snake", higherIsBetter: true, unit: "eaten" },
    reaction: { label: "Reaction Lab", higherIsBetter: false, unit: "ms" },
    memory: { label: "Memory Match", higherIsBetter: true, unit: "level" },
    tapper: { label: "Target Tap", higherIsBetter: true, unit: "hits" },
    jubeat: { label: "Pulse Grid", higherIsBetter: true, unit: "score" },
    breaker: { label: "Circuit Breaker", higherIsBetter: true, unit: "row" },
  };

  /** Visible board stat per cabinet. Native `score` is still stored for later ranking changes. */
  const HEADLINE = {
    tictactoe: { key: "wins", unit: "wins" },
    shooter: { key: "wave", unit: "wave" },
    snake: { key: "eaten", unit: "eaten" },
    reaction: { key: "ms", unit: "ms" },
    memory: { key: "level", unit: "level" },
    tapper: { key: "hits", unit: "hits" },
    jubeat: { key: "score", unit: "score" },
    breaker: { key: "row", unit: "row" },
  };

  const RUN_STAT_KEYS = [
    "score", "wave", "level", "row", "eaten", "eatenTotal", "hits", "misses",
    "bestCombo", "rounds", "combo", "result", "difficulty", "streak", "wins",
    "losses", "draws", "song", "difficultyId", "rank", "fullCombo", "excellent",
    "great", "good", "miss", "accuracy", "cleared", "board", "mode", "chain",
    "diff", "marker", "length", "foodsThisLevel", "legacyPts", "restarted",
    "abandoned",
  ];

  const REWARD_SCALES = {
    shooter: 900,
    snake: 160,
    memory: 300,
    tapper: 300,
    breaker: 900,
  };

  /**
   * Native scores above these cannot be produced by the current cabinets.
   * Space Shooter wave 179 is ~25k pts (the old cap dropped those runs).
   * Pre-balance 1,000,060 still sits above the shooter/breaker ceilings.
   */
  const FAIR_NATIVE_MAX = {
    tictactoe: 1000,
    shooter: 500000,
    snake: 8000,
    memory: 20000,
    tapper: 8000,
    breaker: 500000,
    jubeat: 1000000,
    reaction: 60000,
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

  function statNumber(value, fallback = 0) {
    return nonNegativeNumber(value, fallback, { integer: true });
  }

  function collectRunStats(gameId, score, meta = {}, highScores = {}) {
    const source = isRecord(meta) ? meta : {};
    const stats = { score: Math.max(0, Number(score) || 0) };
    for (const key of RUN_STAT_KEYS) {
      if (source[key] === undefined || key === "score") continue;
      if (typeof source[key] === "string") stats[key] = source[key].slice(0, 64);
      else if (typeof source[key] === "boolean") stats[key] = source[key];
      else if (Number.isFinite(Number(source[key]))) stats[key] = Number(source[key]);
    }
    if (gameId === "tictactoe") {
      const hs = highScores.tictactoe || {};
      stats.wins = statNumber(hs.wins);
      stats.losses = statNumber(hs.losses);
      stats.draws = statNumber(hs.draws);
      stats.streak = statNumber(source.streak);
      if (source.result) stats.result = String(source.result).slice(0, 16);
      if (source.difficulty) stats.difficulty = String(source.difficulty).slice(0, 16);
    }
    if (gameId === "snake") {
      stats.eaten = statNumber(source.eaten, source.foods);
      stats.level = Math.max(1, statNumber(source.level, 1));
    }
    if (gameId === "shooter") stats.wave = Math.max(1, statNumber(source.wave, 1));
    if (gameId === "breaker") stats.row = Math.max(1, statNumber(source.row, 1));
    if (gameId === "memory") stats.level = Math.max(1, statNumber(source.level, 1));
    if (gameId === "tapper") {
      stats.hits = statNumber(source.hits);
      stats.misses = statNumber(source.misses);
      stats.rounds = statNumber(source.rounds);
      stats.bestCombo = statNumber(source.bestCombo);
      if (source.diff) stats.diff = String(source.diff).slice(0, 16);
    }
    if (gameId === "reaction") stats.ms = Math.max(0, Number(score) || 0);
    return stats;
  }

  function headlineSpec(gameId) {
    return HEADLINE[gameId] || { key: "score", unit: GAMES[gameId]?.unit || "pts" };
  }

  function headlineFromStats(gameId, stats, highScores = {}) {
    const spec = headlineSpec(gameId);
    if (gameId === "tictactoe") return statNumber(highScores.tictactoe?.wins);
    const value = stats?.[spec.key];
    if (value == null || !Number.isFinite(Number(value))) return 0;
    return Number(value);
  }

  function formatHeadlineValue(gameId, value, stats = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    if (gameId === "tictactoe") return `${number} win${number === 1 ? "" : "s"}`;
    if (gameId === "snake") return `${number} eaten`;
    if (gameId === "shooter") return `Wave ${number}`;
    if (gameId === "breaker") return `Row ${number}`;
    if (gameId === "memory") return `Level ${number}`;
    if (gameId === "tapper") return `${number} hit${number === 1 ? "" : "s"}`;
    if (gameId === "reaction") return `${number} ms`;
    if (gameId === "jubeat") return number.toLocaleString();
    if (stats.eaten != null) return `${stats.eaten} eaten`;
    return String(number);
  }

  function summarizeRun(gameId, score, meta = {}, highScores = {}) {
    const stats = collectRunStats(gameId, score, meta, highScores);
    const spec = headlineSpec(gameId);
    const headline = headlineFromStats(gameId, stats, highScores);
    return {
      stats,
      headline,
      headlineKey: spec.key,
      headlineUnit: spec.unit,
      label: formatHeadlineValue(gameId, headline, stats),
    };
  }

  function formatRun(gameId, score, extra = {}) {
    const stats = isRecord(extra.stats) ? extra.stats : (isRecord(extra.meta) ? extra.meta : extra);
    const spec = headlineSpec(gameId);
    let value = extra.headline;
    if (!Number.isFinite(Number(value))) value = stats?.[spec.key];
    if (!Number.isFinite(Number(value)) && (spec.key === "score" || spec.key === "ms" || spec.key === "wins")) {
      value = score;
    }
    if (Number.isFinite(Number(value)) && (Number(value) > 0 || spec.key === "ms" || gameId === "tictactoe")) {
      return formatHeadlineValue(gameId, value, stats);
    }
    if (gameId === "reaction") return score == null ? "—" : `${score} ms`;
    if (score) return `${score} pts`;
    return "—";
  }

  function liftHeadlineBests(hs, gameId, stats, { career = false } = {}) {
    if (!hs || !stats) return false;
    let improved = false;
    function lift(key) {
      const next = Number(stats[key]);
      if (!Number.isFinite(next) || next <= Number(hs[key] || 0)) return;
      hs[key] = next;
      improved = true;
    }
    if (gameId === "shooter") lift("wave");
    if (gameId === "snake") {
      lift("eaten");
      lift("level");
      if (career) {
        hs.eatenTotal = Number(hs.eatenTotal || 0) + Number(stats.eaten || 0);
      }
    }
    if (gameId === "memory") lift("level");
    if (gameId === "tapper") {
      lift("hits");
      lift("rounds");
      lift("bestCombo");
    }
    if (gameId === "breaker") lift("row");
    if (gameId === "tictactoe") lift("streak");
    return improved;
  }

  function formatBest(gameId, highScore) {
    const hs = isRecord(highScore) ? highScore : {};
    if (gameId === "tictactoe") {
      const wins = statNumber(hs.wins);
      return wins ? `${wins} win${wins === 1 ? "" : "s"}` : "No wins yet";
    }
    if (gameId === "reaction") {
      return hs.best != null ? `${hs.best} ms` : "No runs yet";
    }
    const spec = headlineSpec(gameId);
    const headline = spec.key === "score" ? hs.best : hs[spec.key];
    if (headline == null || Number(headline) <= 0) {
      if (hs.best > 0) return `${hs.best} pts`;
      return "No runs yet";
    }
    return formatHeadlineValue(gameId, headline, hs);
  }

  function defaultState() {
    return {
      playerName: "Player",
      xp: 0,
      gamesPlayed: 0,
      highScores: {
        tictactoe: { best: 0, wins: 0, losses: 0, draws: 0, streak: 0 },
        shooter: { best: 0, wave: 0 },
        snake: { best: 0, eaten: 0, eatenTotal: 0, level: 0 },
        reaction: { best: null },
        memory: { best: 0, level: 0 },
        tapper: { best: 0, hits: 0, rounds: 0, bestCombo: 0 },
        jubeat: { best: 0, songs: {} },
        breaker: { best: 0, row: 0 },
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

  function fairNativeScore(gameId, value) {
    const number = validRunScore(gameId, value);
    if (number == null) return null;
    const max = FAIR_NATIVE_MAX[gameId];
    if (max != null && number > max) return null;
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
          streak: nonNegativeNumber(incoming.streak, 0, { integer: true }),
        };
      } else if (gameId === "reaction") {
        const reactionBest = incoming.best == null
          ? null
          : fairNativeScore("reaction", incoming.best);
        normalized[gameId] = { best: reactionBest };
      } else if (gameId === "jubeat") {
        const jubeatBest = fairNativeScore("jubeat", incoming.best);
        normalized[gameId] = {
          best: jubeatBest == null ? 0 : jubeatBest,
          songs: normalizeJubeatSongBests(incoming.songs),
        };
      } else {
        const best = fairNativeScore(gameId, incoming.best);
        const row = { best: best == null ? 0 : best };
        if (gameId === "shooter") row.wave = nonNegativeNumber(incoming.wave, 0, { integer: true });
        if (gameId === "snake") {
          row.eaten = nonNegativeNumber(incoming.eaten, 0, { integer: true });
          row.eatenTotal = nonNegativeNumber(incoming.eatenTotal, 0, { integer: true });
          row.level = nonNegativeNumber(incoming.level, 0, { integer: true });
        }
        if (gameId === "memory") row.level = nonNegativeNumber(incoming.level, 0, { integer: true });
        if (gameId === "tapper") {
          row.hits = nonNegativeNumber(incoming.hits, 0, { integer: true });
          row.rounds = nonNegativeNumber(incoming.rounds, 0, { integer: true });
          row.bestCombo = nonNegativeNumber(incoming.bestCombo, 0, { integer: true });
        }
        if (gameId === "breaker") row.row = nonNegativeNumber(incoming.row, 0, { integer: true });
        normalized[gameId] = row;
      }
    }
    return normalized;
  }

  function normalizeScoreEntry(entry, { history = false } = {}) {
    if (!isRecord(entry) || !GAMES[entry.game]) return null;
    const score = fairNativeScore(entry.game, entry.score);
    if (score == null) return null;
    const meta = isRecord(entry.meta) ? entry.meta : {};
    const calculatedPoints = arcadePointsForRun(entry.game, score, meta);
    const storedPoints = nonNegativeNumber(entry.arcadePoints, calculatedPoints, { integer: true });
    const arcadePoints = Math.max(5, Math.min(100, storedPoints || calculatedPoints));
    const stats = collectRunStats(entry.game, score, isRecord(entry.stats) ? { ...meta, ...entry.stats } : meta);
    const spec = headlineSpec(entry.game);
    const headline = nonNegativeNumber(
      entry.headline,
      headlineFromStats(entry.game, stats),
      { integer: true }
    );
    const normalized = {
      ...entry,
      game: entry.game,
      score,
      player: typeof entry.player === "string"
        ? entry.player.trim().slice(0, 16) || "Player"
        : "Player",
      at: nonNegativeNumber(entry.at, 0, { integer: true }),
      arcadePoints,
      stats,
      headline,
      headlineKey: typeof entry.headlineKey === "string" ? entry.headlineKey.slice(0, 16) : spec.key,
      headlineUnit: typeof entry.headlineUnit === "string" ? entry.headlineUnit.slice(0, 16) : spec.unit,
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
    for (const entry of [...history, ...hallOfFame]) {
      const current = highScores[entry.game];
      if (!current) continue;
      const g = GAMES[entry.game];
      const stats = entry.stats || collectRunStats(entry.game, entry.score, entry.meta);
      if (entry.game === "jubeat") {
        recordJubeatBest(highScores.jubeat, entry.score, entry.meta);
        if (entry.score > Number(current.best || 0)) current.best = entry.score;
        continue;
      }
      if (g.higherIsBetter) {
        if (entry.score > Number(current.best || 0)) current.best = entry.score;
      } else if (current.best == null || entry.score < Number(current.best)) {
        current.best = entry.score;
      }
      liftHeadlineBests(current, entry.game, stats, { career: false });
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
    const num = fairNativeScore(gameId, score);
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
    const stats = collectRunStats(gameId, num, meta, state.highScores);
    if (liftHeadlineBests(hs, gameId, stats, { career: true })) isHighScore = true;
    state.highScores[gameId] = hs;
    if (gameId === "snake") stats.eatenTotal = hs.eatenTotal;
    if (gameId === "tictactoe") {
      stats.wins = hs.wins;
      stats.losses = hs.losses;
      stats.draws = hs.draws;
    }
    const summary = summarizeRun(gameId, num, { ...meta, ...stats }, state.highScores);

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
      stats: summary.stats,
      headline: summary.headline,
      headlineKey: summary.headlineKey,
      headlineUnit: summary.headlineUnit,
    };
    state.history.unshift(entry);
    state.history = state.history.slice(0, MAX_HISTORY);

    // Hall of fame — keep best scores (for reaction, invert ranking later when sorting)
    state.hallOfFame.push({
      game: gameId,
      score: num,
      stats: summary.stats,
      headline: summary.headline,
      headlineKey: summary.headlineKey,
      headlineUnit: summary.headlineUnit,
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

  function formatScore(gameId, score, extra) {
    if (extra && typeof extra === "object") return formatRun(gameId, score, extra);
    return formatRun(gameId, score, {});
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
        const localFair = fairNativeScore(gameId, localBest);
        if (localFair == null && Number(localBest || 0) > 0) {
          localHs.best = 0;
          changed = true;
        }
        const normalizedRemoteBest = fairNativeScore(gameId, remoteBest);
        if (normalizedRemoteBest != null && normalizedRemoteBest > Number(localHs.best ?? 0)) {
          localHs.best = normalizedRemoteBest;
          changed = true;
        }
        if (liftHeadlineBests(localHs, gameId, remoteHs, { career: false })) changed = true;
        if (gameId === "snake") {
          const remoteTotal = nonNegativeNumber(remoteHs.eatenTotal, 0, { integer: true });
          if (remoteTotal > Number(localHs.eatenTotal || 0)) {
            localHs.eatenTotal = remoteTotal;
            changed = true;
          }
        }
      } else {
        // lower is better
        const localFair = fairNativeScore(gameId, localBest);
        if (localBest != null && localFair == null) {
          localHs.best = null;
          changed = true;
        }
        const normalizedRemoteBest = fairNativeScore(gameId, remoteBest);
        if (
          normalizedRemoteBest != null &&
          (localHs.best == null || normalizedRemoteBest < Number(localHs.best))
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
    HEADLINE,
    FAIR_NATIVE_MAX,
    getState,
    setPlayerName,
    mergeHighScores,
    fairNativeScore,
    getJubeatBests,
    submitScore,
    arcadePointsForRun,
    summarizeRun,
    formatRun,
    formatBest,
    formatScore,
    getLevel,
    xpToReachLevel,
    resetAll,
    exportCode,
    importCode,
  };
})(window);
