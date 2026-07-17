/**
 * Local achievements for AlpArcade — unlocks stored in localStorage.
 * Some achievements unlock premium cabinets (see UNLOCKS).
 */
(function (global) {
  "use strict";

  const KEY = "alparcade-achievements-v1";

  const DEFS = [
    { id: "first-run", title: "Insert Coin", blurb: "Finish any game once", icon: "🪙" },
    { id: "level-5", title: "Cabinet Regular", blurb: "Reach player level 5", icon: "📶" },
    { id: "level-10", title: "Arcade Ace", blurb: "Reach player level 10", icon: "🏆" },
    { id: "level-15", title: "Floor Legend", blurb: "Reach player level 15", icon: "⭐" },
    { id: "level-20", title: "High Roller", blurb: "Reach player level 20 · unlocks Circuit Breaker", icon: "💎" },
    { id: "level-25", title: "Neon Immortal", blurb: "Reach player level 25", icon: "👑" },
    { id: "level-50", title: "No Cap", blurb: "Reach player level 50 · unlocks Pulse Grid", icon: "♾️" },
    { id: "ttt-win", title: "Three in a Row", blurb: "Win a Tic-Tac-Toe match", icon: "⭕" },
    { id: "snake-50", title: "Ssssolid", blurb: "Score 50+ in Snake", icon: "🐍" },
    { id: "snake-150", title: "Long Boi", blurb: "Score 150+ in Snake", icon: "🐉" },
    { id: "shooter-500", title: "Ace Pilot", blurb: "Score 500+ in Space Shooter", icon: "🚀" },
    { id: "reaction-250", title: "Lightning", blurb: "Reaction under 250 ms", icon: "⚡" },
    { id: "reaction-200", title: "Alien Reflexes", blurb: "Reaction under 200 ms", icon: "👽" },
    { id: "memory-200", title: "Card Shark", blurb: "Score 200+ in Memory", icon: "🧠" },
    { id: "tapper-100", title: "Whack Happy", blurb: "Score 100+ in Target Tap", icon: "🎯" },
    { id: "tapper-300", title: "Grid God", blurb: "Score 300+ in Target Tap", icon: "✨" },
    { id: "jubeat-5k", title: "Panel Poet", blurb: "Score 5000+ on a Pulse Grid chart", icon: "🎹" },
    { id: "jubeat-20k", title: "Jubeat Heart", blurb: "Score 20000+ on EXTREME", icon: "💜" },
    { id: "jubeat-exc", title: "All Excellent-ish", blurb: "100+ EXCELLENT judges in one chart", icon: "✨" },
    { id: "breaker-800", title: "Brick Layer", blurb: "Score 800+ in Circuit Breaker", icon: "🧱" },
    { id: "five-games", title: "Tour the Floor", blurb: "Play 5 different cabinets", icon: "🕹️" },
    { id: "streak-10", title: "On a Roll", blurb: "Complete 10 runs total", icon: "🔥" },
    { id: "salmon", title: "Salmon Mode", blurb: "Unlock the salmon easter egg", icon: "🍣" },
    { id: "daily", title: "Daily Driver", blurb: "Complete today's daily challenge", icon: "📅" },
    { id: "cloud-post", title: "On the Board", blurb: "Post a score to the global board", icon: "☁️" },
  ];

  /**
   * Games gated behind achievements (or player level as fallback).
   * Base cabinets have no entry here → always free.
   */
  const UNLOCKS = {
    jubeat: {
      label: "Pulse Grid",
      blurb: "4×4 rhythm panels — jubeat vibes · real song BGM",
      icon: "🎹",
      requireAchievement: "level-50",
      requireLevel: 50,
    },
    breaker: {
      label: "Circuit Breaker",
      blurb: "Brick breaker · power-ups",
      icon: "🧱",
      requireAchievement: "level-20",
      requireLevel: 20,
    },
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { unlocked: {}, seen: {} };
      const data = JSON.parse(raw);
      return {
        unlocked: data.unlocked && typeof data.unlocked === "object" ? data.unlocked : {},
        seen: data.seen && typeof data.seen === "object" ? data.seen : {},
      };
    } catch {
      return { unlocked: {}, seen: {} };
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }

  function unlock(id) {
    const state = load();
    if (state.unlocked[id]) return null;
    const def = DEFS.find((d) => d.id === id);
    if (!def) return null;
    state.unlocked[id] = Date.now();
    save(state);
    try {
      if (global.ArcadeCloud?.getState?.()?.signedIn) {
        global.ArcadeCloud.syncAccountProgress?.({ reason: "achievement" });
      }
    } catch {
      /* ignore */
    }
    return def;
  }

  function isUnlocked(id) {
    return !!load().unlocked[id];
  }

  function getUnlockedMap() {
    return { ...load().unlocked };
  }

  function mergeUnlocked(cloudMap) {
    if (!cloudMap || typeof cloudMap !== "object") return [];
    const state = load();
    const added = [];
    for (const [id, at] of Object.entries(cloudMap)) {
      if (!DEFS.some((d) => d.id === id)) continue;
      const ts = Number(at) || Date.now();
      if (!state.unlocked[id]) {
        state.unlocked[id] = ts;
        added.push(id);
      } else if (ts > 0 && ts < state.unlocked[id]) {
        state.unlocked[id] = ts;
      }
    }
    if (added.length) save(state);
    return added;
  }

  function list() {
    const state = load();
    return DEFS.map((d) => ({
      ...d,
      unlocked: !!state.unlocked[d.id],
      at: state.unlocked[d.id] || null,
    }));
  }

  function count() {
    const state = load();
    return {
      have: Object.keys(state.unlocked).length,
      total: DEFS.length,
    };
  }

  function playerLevel() {
    const xp = global.ArcadeScores?.getState?.()?.xp || 0;
    return global.ArcadeScores?.getLevel?.(xp)?.level || 1;
  }

  /** Whether a cabinet may be opened (locked premium games). */
  function isGameUnlocked(gameId) {
    const gate = UNLOCKS[gameId];
    if (!gate) return true;
    if (gate.requireAchievement && isUnlocked(gate.requireAchievement)) return true;
    if (gate.requireLevel && playerLevel() >= gate.requireLevel) return true;
    return false;
  }

  function unlockRequirement(gameId) {
    const gate = UNLOCKS[gameId];
    if (!gate) return null;
    if (isGameUnlocked(gameId)) return null;
    return {
      ...gate,
      message: gate.requireLevel
        ? `Reach Lv ${gate.requireLevel} to unlock`
        : "Achievement required",
    };
  }

  function listLockedGames() {
    return Object.entries(UNLOCKS).map(([id, g]) => ({
      id,
      ...g,
      unlocked: isGameUnlocked(id),
    }));
  }

  /**
   * Evaluate after a run. Returns newly unlocked defs.
   */
  function evaluateAfterRun(gameId, score, meta = {}) {
    const fresh = [];
    const push = (id) => {
      const d = unlock(id);
      if (d) fresh.push(d);
    };

    push("first-run");

    const st = global.ArcadeScores?.getState?.();
    if (st) {
      const { level } = global.ArcadeScores.getLevel(st.xp);
      if (level >= 5) push("level-5");
      if (level >= 10) push("level-10");
      if (level >= 15) push("level-15");
      if (level >= 20) push("level-20");
      if (level >= 25) push("level-25");
      if (level >= 50) push("level-50");
      if (st.gamesPlayed >= 10) push("streak-10");

      const played = new Set((st.history || []).map((h) => h.game));
      played.add(gameId);
      if (played.size >= 5) push("five-games");
    }

    if (gameId === "tictactoe" && meta.result === "win") push("ttt-win");
    if (gameId === "snake") {
      if (score >= 50) push("snake-50");
      if (score >= 150) push("snake-150");
    }
    if (gameId === "shooter" && score >= 500) push("shooter-500");
    if (gameId === "reaction") {
      if (score > 0 && score < 250) push("reaction-250");
      if (score > 0 && score < 200) push("reaction-200");
    }
    if (gameId === "memory" && score >= 200) push("memory-200");
    if (gameId === "tapper") {
      if (score >= 100) push("tapper-100");
      if (score >= 300) push("tapper-300");
    }
    if (gameId === "jubeat") {
      if (score >= 5000) push("jubeat-5k");
      if (score >= 20000) push("jubeat-20k");
      if ((meta.excellent || 0) >= 100) push("jubeat-exc");
    }
    if (gameId === "breaker" && score >= 800) push("breaker-800");

    return fresh;
  }

  global.ArcadeAchievements = {
    DEFS,
    UNLOCKS,
    list,
    count,
    unlock,
    isUnlocked,
    getUnlockedMap,
    mergeUnlocked,
    evaluateAfterRun,
    isGameUnlocked,
    unlockRequirement,
    listLockedGames,
  };
})(window);
