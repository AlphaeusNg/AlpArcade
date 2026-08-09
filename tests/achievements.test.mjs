import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "js/features/achievements.js"), "utf8");
const storageKey = "alparcade-achievements-v1";

function createAchievements(rawState = null, { level = 1, now = 9000 } = {}) {
  const stored = new Map();
  if (rawState != null) stored.set(storageKey, rawState);
  class FakeDate extends Date {
    static now() {
      return now;
    }
  }
  const window = {
    ArcadeScores: {
      getState: () => ({ xp: 0 }),
      getLevel: () => ({ level }),
    },
  };
  const context = {
    window,
    Date: FakeDate,
    localStorage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, String(value)),
      removeItem: (key) => stored.delete(key),
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { achievements: window.ArcadeAchievements, stored };
}

const defaults = createAchievements().achievements;
assert.equal(defaults.count().have, 0);
assert.equal(defaults.count().total, defaults.DEFS.length);

const malformedState = JSON.stringify({
  unlocked: {
    "first-run": 1000,
    "snake-50": "2000",
    "ttt-win": -5,
    daily: null,
    unknown: 3000,
  },
  seen: {
    "first-run": true,
    "snake-50": 1,
    daily: "true",
    unknown: true,
  },
});
const { achievements, stored } = createAchievements(malformedState);
assert.deepEqual(
  JSON.parse(JSON.stringify(achievements.getUnlockedMap())),
  { "first-run": 1000, "snake-50": 2000 },
  "local unlocks keep known IDs with positive finite timestamps only",
);
assert.equal(achievements.count().have, 2, "invalid and unknown unlocks do not inflate totals");
assert.equal(achievements.isUnlocked("ttt-win"), false, "negative timestamps do not unlock badges");
assert.equal(achievements.isUnlocked("unknown"), false, "unknown IDs never unlock");
assert.equal(achievements.unlock("unknown"), null, "unknown IDs cannot be persisted");

const repaired = achievements.unlock("ttt-win");
assert.equal(repaired.id, "ttt-win", "an invalid local unlock remains earnable");
const repairedState = JSON.parse(stored.get(storageKey));
assert.deepEqual(
  repairedState.unlocked,
  { "first-run": 1000, "snake-50": 2000, "ttt-win": 9000 },
  "the next save persists a normalized unlock map",
);
assert.deepEqual(repairedState.seen, { "first-run": true }, "seen flags require known IDs and true");

const existingOnly = createAchievements(
  JSON.stringify({ unlocked: { "first-run": 5000 }, seen: {} }),
);
assert.deepEqual(
  JSON.parse(JSON.stringify(existingOnly.achievements.mergeUnlocked({ "first-run": 4000 }))),
  [],
  "an earlier cloud timestamp is not reported as a new unlock",
);
assert.equal(
  JSON.parse(existingOnly.stored.get(storageKey)).unlocked["first-run"],
  4000,
  "an earlier cloud timestamp is persisted even without a new unlock",
);

const cloud = createAchievements(null, { level: 1, now: 9000 });
assert.deepEqual(
  JSON.parse(
    JSON.stringify(cloud.achievements.mergeUnlocked({ "snake-50": -20, unknown: 100 })),
  ),
  ["snake-50"],
  "cloud merge ignores unknown IDs but preserves a known unlock",
);
assert.equal(
  cloud.achievements.getUnlockedMap()["snake-50"],
  9000,
  "invalid cloud timestamps fall back to a valid local timestamp",
);
cloud.achievements.mergeUnlocked({ "level-5": 1000 });
assert.equal(
  cloud.achievements.isGameUnlocked("reaction"),
  false,
  "a merged badge still cannot bypass the player-level cabinet gate",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(cloud.achievements.mergeUnlocked(null))),
  [],
  "invalid cloud containers are ignored",
);

for (const wrongShape of [JSON.stringify([]), JSON.stringify("bad"), "{not-json"]) {
  assert.equal(
    createAchievements(wrongShape).achievements.count().have,
    0,
    "wrong-shaped or corrupt achievement storage recovers empty",
  );
}

achievements.resetAll();
assert.equal(stored.has(storageKey), false, "reset removes repaired achievement storage");

console.log("Achievement persistence and cloud merge passed (20 contracts).");
