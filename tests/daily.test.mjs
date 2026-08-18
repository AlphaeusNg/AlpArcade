import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "js/features/daily.js"), "utf8");
const storageKey = "alparcade-daily-v1";

function createDaily(
  initialNow = Date.parse("2026-08-08T16:00:00Z"),
  { intl = Intl, removalsFail = false, writesFail = false } = {},
) {
  let nowMs = initialNow;
  let rejectRemovals = removalsFail;
  let rejectWrites = writesFail;
  const stored = new Map();
  const unlocked = [];
  const events = [];
  const warnings = [];
  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [nowMs]));
    }
    static now() {
      return nowMs;
    }
  }
  const window = {
    ArcadeScores: {
      GAMES: Object.fromEntries(
        ["snake", "shooter", "reaction", "memory", "tapper", "tictactoe", "jubeat", "breaker"]
          .map((id) => [id, { label: `Game ${id}` }]),
      ),
    },
    ArcadeAchievements: { unlock: (id) => unlocked.push(id) },
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
    Date: FakeDate,
    Intl: intl,
    console: {
      warn: (...args) => warnings.push(args),
    },
    localStorage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => {
        if (rejectWrites) throw new Error("storage denied");
        stored.set(key, String(value));
      },
      removeItem: (key) => {
        if (rejectRemovals) throw new Error("storage denied");
        stored.delete(key);
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return {
    daily: window.ArcadeDaily,
    stored,
    unlocked,
    events,
    warnings,
    setNow: (value) => { nowMs = Date.parse(value); },
    setRemovalsFail: (value) => { rejectRemovals = value; },
    setWritesFail: (value) => { rejectWrites = value; },
  };
}

function successfulAttempt(challenge) {
  if (challenge.game === "tictactoe") return { score: 1, meta: { result: "win" } };
  return { score: challenge.target, meta: {} };
}

function failedAttempt(challenge) {
  if (challenge.game === "tictactoe") return { score: 1, meta: { result: "loss" } };
  if (challenge.game === "reaction") return { score: challenge.target + 1, meta: {} };
  return { score: challenge.target - 1, meta: {} };
}

function harnessForGame(gameId) {
  const harness = createDaily();
  for (let day = 1; day <= 64; day += 1) {
    const date = new Date(Date.UTC(2026, 0, day, 16));
    if (harness.daily.challengeFor(date).game !== gameId) continue;
    harness.setNow(date.toISOString());
    return harness;
  }
  throw new Error(`No deterministic fixture date found for ${gameId}`);
}

const { daily, stored, unlocked } = createDaily();
assert.equal(
  daily.dayKey(new Date("2026-08-08T15:59:59Z")),
  "2026-08-08",
  "the SGT day should not roll over before 16:00 UTC",
);
assert.equal(
  daily.dayKey(new Date("2026-08-08T16:00:00Z")),
  "2026-08-09",
  "the SGT day should roll over exactly at 16:00 UTC",
);

const challenge = daily.challengeFor(new Date("2026-08-08T16:00:00Z"));
const repeated = daily.challengeFor(new Date("2026-08-09T10:00:00+08:00"));
assert.equal(JSON.stringify(repeated), JSON.stringify(challenge), "one SGT day should have one stable challenge");
assert.equal(challenge.day, "2026-08-09");
assert.equal(challenge.timezone, "SGT");
assert.equal(challenge.label, `Game ${challenge.game}`);
assert.ok(Number.isFinite(challenge.target) && challenge.target > 0, "daily targets should be positive and finite");
assert.equal(challenge.higherIsBetter, challenge.game !== "reaction");

const knownGames = new Set();
for (let day = 1; day <= 64; day += 1) {
  const sampled = daily.challengeFor(new Date(Date.UTC(2026, 0, day, 16)));
  knownGames.add(sampled.game);
  assert.ok(Number.isFinite(sampled.target) && sampled.target > 0, `invalid target for ${sampled.game}`);
}
assert.equal(knownGames.size, 8, "the deterministic schedule should continue to reach every cabinet");

for (const gameId of ["snake", "reaction", "tictactoe"]) {
  const harness = harnessForGame(gameId);
  const sampled = harness.daily.challengeFor();
  const miss = failedAttempt(sampled);
  const hit = successfulAttempt(sampled);
  assert.equal(
    harness.daily.markAttempt(gameId, miss.score, miss.meta).completed,
    false,
    `${gameId} should enforce its target direction or win condition`,
  );
  assert.equal(
    harness.daily.markAttempt(gameId, hit.score, hit.meta).completed,
    true,
    `${gameId} should complete exactly at its target or win condition`,
  );
}

const wrongGame = [...knownGames].find((game) => game !== challenge.game);
assert.equal(daily.markAttempt(wrongGame, 999999).completed, false, "other cabinets cannot complete today");
const failed = failedAttempt(challenge);
assert.equal(
  daily.markAttempt(challenge.game, failed.score, failed.meta).completed,
  false,
  "missing the target should not complete the challenge",
);
const successful = successfulAttempt(challenge);
const first = daily.markAttempt(challenge.game, successful.score, successful.meta);
assert.equal(first.completed, true);
assert.equal(first.firstTime, true);
assert.equal(daily.isComplete(challenge.day), true);
assert.deepEqual(unlocked, ["daily"], "first completion should notify achievements once");
const again = daily.markAttempt(challenge.game, successful.score, successful.meta);
assert.equal(again.completed, true);
assert.equal(again.firstTime, false);
assert.deepEqual(unlocked, ["daily"], "repeated completion should stay idempotent");
assert.equal(JSON.parse(stored.get(storageKey))[challenge.day].done, true);

daily.resetAll();
assert.equal(daily.isComplete(challenge.day), false);

const deniedReset = createDaily(undefined, { removalsFail: true });
const deniedChallenge = deniedReset.daily.challengeFor();
const deniedAttempt = successfulAttempt(deniedChallenge);
deniedReset.stored.set(
  storageKey,
  JSON.stringify({ [deniedChallenge.day]: { done: true, score: deniedAttempt.score, at: 1 } }),
);
assert.throws(
  () => deniedReset.daily.resetAll(),
  /daily challenge progress couldn't be reset/i,
  "a denied daily reset is reported to its caller",
);
assert.equal(
  deniedReset.daily.isComplete(deniedChallenge.day),
  true,
  "a denied reset keeps retained daily progress visible",
);
deniedReset.setRemovalsFail(false);
deniedReset.daily.resetAll();
assert.equal(
  deniedReset.daily.isComplete(deniedChallenge.day),
  false,
  "a later permitted reset recovers cleanly",
);

const deniedWrite = createDaily(undefined, { writesFail: true });
const deniedWriteChallenge = deniedWrite.daily.challengeFor();
const deniedWriteAttempt = successfulAttempt(deniedWriteChallenge);
const deniedFirst = deniedWrite.daily.markAttempt(
  deniedWriteChallenge.game,
  deniedWriteAttempt.score,
  deniedWriteAttempt.meta,
);
assert.equal(deniedFirst.completed, true, "a denied write still records completion for this visit");
assert.equal(deniedFirst.firstTime, true, "the first denied completion is still first-time");
assert.equal(
  deniedWrite.daily.isComplete(deniedWriteChallenge.day),
  true,
  "a failed device save remains visible for the current visit",
);
assert.equal(
  deniedWrite.stored.has(storageKey),
  false,
  "denied daily progress is not treated as durable device state",
);
deniedWrite.daily.markAttempt(
  deniedWriteChallenge.game,
  deniedWriteAttempt.score,
  deniedWriteAttempt.meta,
);
assert.equal(deniedWrite.events.length, 1, "repeated write failures warn only once per failure episode");
assert.equal(deniedWrite.events[0].type, "arcade:daily-save-error");
assert.match(
  deniedWrite.events[0].detail?.message || "",
  /enable site storage/i,
  "the warning tells the player how to make daily progress durable",
);
assert.equal(deniedWrite.warnings.length, 1, "the console warning is also deduplicated");

deniedWrite.setWritesFail(false);
const laterDay = "2026-08-10T16:00:00Z";
deniedWrite.setNow(laterDay);
const recoveredChallenge = deniedWrite.daily.challengeFor();
const recoveredAttempt = successfulAttempt(recoveredChallenge);
deniedWrite.daily.markAttempt(
  recoveredChallenge.game,
  recoveredAttempt.score,
  recoveredAttempt.meta,
);
const persisted = JSON.parse(deniedWrite.stored.get(storageKey));
assert.equal(
  persisted[deniedWriteChallenge.day].done,
  true,
  "the next successful save flushes the session-only completion to device storage",
);
assert.equal(persisted[recoveredChallenge.day].done, true, "the recovered save includes the later completion");
deniedWrite.setWritesFail(true);
deniedWrite.setNow("2026-08-11T16:00:00Z");
const laterChallenge = deniedWrite.daily.challengeFor();
const laterAttempt = successfulAttempt(laterChallenge);
deniedWrite.daily.markAttempt(laterChallenge.game, laterAttempt.score, laterAttempt.meta);
assert.equal(deniedWrite.events.length, 2, "a later failure episode remains observable after recovery");

stored.set(storageKey, JSON.stringify("wrong-shape"));
assert.doesNotThrow(
  () => daily.markAttempt(challenge.game, successful.score, successful.meta),
  "valid JSON with a primitive shape should recover like malformed JSON",
);
assert.equal(daily.isComplete(challenge.day), true);

daily.resetAll();
stored.set(storageKey, JSON.stringify([]));
daily.markAttempt(challenge.game, successful.score, successful.meta);
assert.equal(daily.isComplete(challenge.day), true, "array-shaped storage should not lose completion on save");

const fallbackIntl = {
  DateTimeFormat() {
    throw new Error("timezone data unavailable");
  },
};
const fallback = createDaily(Date.parse("2026-08-08T16:00:00Z"), { intl: fallbackIntl }).daily;
assert.equal(fallback.dayKey(), "2026-08-09", "the fixed UTC+8 fallback should match SGT rollover");

console.log("Daily SGT schedule and completion persistence passed.");
