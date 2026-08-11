import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "js/core/scores.js"), "utf8");
const storageKey = "alphaeus-arcade-v1";

function createScores(initial = new Map(), { writesFail = false } = {}) {
  const stored = new Map(initial);
  const events = [];
  const warnings = [];
  let rejectWrites = writesFail;
  const window = {
    CustomEvent: class {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    dispatchEvent: (event) => events.push(event),
  };
  const context = {
    window,
    console: {
      warn: (...args) => warnings.push(args),
    },
    TextEncoder,
    TextDecoder,
    btoa,
    atob,
    localStorage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => {
        if (rejectWrites) throw new Error("storage denied");
        stored.set(key, String(value));
      },
      removeItem: (key) => stored.delete(key),
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return {
    scores: context.window.ArcadeScores,
    stored,
    events,
    warnings,
    setWritesFail: (value) => {
      rejectWrites = value;
    },
  };
}

const { scores, stored } = createScores();
const defaults = scores.getState();
assert.equal(defaults.playerName, "Player");
assert.equal(defaults.xp, 0);
assert.equal(defaults.gamesPlayed, 0);
assert.equal(Object.keys(defaults.highScores).length, 8);

for (const [gameId, score, meta] of [
  ["tictactoe", 1, { result: "win", difficulty: "hard", streak: 20 }],
  ["reaction", 50, {}],
  ["jubeat", 2000000, {}],
  ["snake", 1000000, {}],
]) {
  const points = scores.arcadePointsForRun(gameId, score, meta);
  assert.ok(Number.isInteger(points) && points >= 5 && points <= 100, `${gameId} reward should stay bounded`);
}
assert.ok(
  scores.arcadePointsForRun("reaction", 150) > scores.arcadePointsForRun("reaction", 350),
  "faster reaction times should earn more points",
);

assert.equal(scores.submitScore("snake", 10).isHighScore, true);
assert.equal(scores.submitScore("snake", 5).isHighScore, false);
assert.equal(scores.getState().highScores.snake.best, 10);
assert.equal(scores.submitScore("reaction", 300).isHighScore, true);
assert.equal(scores.submitScore("reaction", 350).isHighScore, false);
assert.equal(scores.submitScore("reaction", 200).isHighScore, true);
assert.equal(scores.getState().highScores.reaction.best, 200);

const beforeInvalid = scores.getState();
const rejectedNegative = scores.submitScore("reaction", -1);
assert.equal(rejectedNegative.xpGained, 0, "negative runs should not earn XP");
assert.equal(rejectedNegative.arcadePoints, 0, "invalid runs should report zero arcade points");
assert.equal(
  scores.getState().gamesPlayed,
  beforeInvalid.gamesPlayed,
  "negative runs should not increment games played",
);
assert.equal(scores.getState().highScores.reaction.best, 200, "negative reaction times cannot become bests");
scores.submitScore("snake", Number.NaN);
assert.equal(scores.getState().gamesPlayed, beforeInvalid.gamesPlayed, "non-finite runs should be ignored");

for (let index = 0; index < 50; index += 1) scores.submitScore("snake", index);
const bounded = scores.getState();
assert.equal(bounded.history.length, 40, "history should retain only the latest 40 runs");
assert.equal(bounded.hallOfFame.length, 15, "hall of fame should retain only 15 entries");
assert.ok(
  bounded.hallOfFame.every((entry, index, list) =>
    index === 0 || entry.arcadePoints <= list[index - 1].arcadePoints),
  "hall of fame should remain ranked by normalized arcade points",
);

const unicodeName = "玩家 Alpaca 🦙";
scores.setPlayerName(unicodeName);
const exportedXp = scores.getState().xp;
const code = scores.exportCode();
scores.resetAll();
const imported = scores.importCode(code);
assert.equal(imported.playerName, unicodeName, "Unicode player names should round-trip through export codes");
assert.equal(imported.xp, exportedXp, "export/import should preserve XP");
assert.throws(() => scores.importCode("not-a-score-code"), /Invalid score code/);

stored.set(storageKey, JSON.stringify({
  playerName: "  Saved Player  ",
  xp: 42,
  gamesPlayed: 3,
  highScores: {
    snake: { best: "75" },
    reaction: { best: "not-a-number" },
    tictactoe: { best: 99, wins: "2", losses: -3, draws: "1" },
  },
  history: [null, { game: "snake", score: "12", player: "Saved Player", at: "10" }],
  hallOfFame: [
    null,
    { game: "snake", score: "75", player: "Saved Player", at: "11" },
    { game: "tictactoe", score: 1, player: "Saved Player", meta: null },
  ],
}));
const hydrated = scores.getState();
assert.equal(hydrated.playerName, "Saved Player");
assert.equal(hydrated.xp, 42, "one malformed nested entry should not discard valid progression");
assert.equal(hydrated.highScores.snake.best, 75, "numeric persisted bests should normalize to numbers");
assert.equal(hydrated.highScores.reaction.best, null, "invalid reaction bests should reset safely");
assert.equal(hydrated.highScores.tictactoe.wins, 2);
assert.equal(hydrated.highScores.tictactoe.losses, 0);
assert.equal(hydrated.highScores.tictactoe.draws, 1);
assert.equal(hydrated.highScores.tictactoe.best, 2, "Tic-Tac-Toe best should match normalized wins");
assert.equal(hydrated.history.length, 1, "malformed history entries should be discarded individually");
assert.equal(hydrated.history[0].score, 12);
assert.equal(hydrated.hallOfFame.length, 2, "malformed hall entries should be discarded individually");
assert.ok(hydrated.hallOfFame.some((entry) => entry.score === 75));

const { scores: cloudScores } = createScores();
cloudScores.submitScore("snake", 10);
cloudScores.submitScore("reaction", 200);
cloudScores.submitScore("tictactoe", 1, { result: "win" });
const merged = cloudScores.mergeHighScores({
  snake: { best: "Infinity" },
  reaction: { best: -1 },
  tictactoe: { wins: "Infinity", losses: -5, draws: -1 },
});
assert.equal(merged.highScores.snake.best, 10, "non-finite cloud bests must not erase local records");
assert.equal(merged.highScores.reaction.best, 200, "invalid reaction bests must not replace local records");
assert.equal(merged.highScores.tictactoe.wins, 1, "invalid cloud win counts must not replace local totals");

const denied = createScores(new Map(), { writesFail: true });
const deniedFirst = denied.scores.submitScore("snake", 50);
const deniedSecond = denied.scores.submitScore("snake", 75);
const deniedState = denied.scores.getState();
assert.equal(deniedState.gamesPlayed, 2, "denied writes retain every run for the current visit");
assert.equal(
  deniedState.xp,
  deniedFirst.xpGained + deniedSecond.xpGained,
  "denied writes retain cumulative XP for the current visit",
);
assert.equal(deniedState.highScores.snake.best, 75, "denied writes retain the current-visit best");
assert.equal(deniedState.history.length, 2, "denied writes retain current-visit history");
assert.equal(denied.events.length, 1, "repeated score write failures warn only once per failure episode");
assert.equal(denied.events[0].type, "arcade:score-save-error");
assert.match(
  denied.events[0].detail?.message || "",
  /enable site storage/i,
  "the score warning tells the player how to make progress durable",
);
assert.equal(denied.warnings.length, 1, "the score console warning is also deduplicated");

denied.scores.submitScore("reaction", 200);
denied.scores.submitScore("reaction", 350);
assert.equal(
  denied.scores.getState().highScores.reaction.best,
  200,
  "denied writes retain lower-is-better records across repeated runs",
);
assert.equal(denied.events.length, 1, "additional denied games stay in the same failure episode");

denied.setWritesFail(false);
denied.scores.setPlayerName("Recovered Player");
const recoveredState = JSON.parse(denied.stored.get(storageKey));
assert.equal(recoveredState.playerName, "Recovered Player", "a successful save persists the latest player name");
assert.equal(recoveredState.gamesPlayed, 4, "a successful save flushes session-only runs");
assert.equal(recoveredState.highScores.snake.best, 75, "a successful save flushes the session-only best");
denied.setWritesFail(true);
denied.scores.submitScore("snake", 100);
assert.equal(denied.events.length, 2, "a later score failure episode remains observable after recovery");

console.log("Score persistence, rewards, ranking, import, and denied-storage contracts passed.");
