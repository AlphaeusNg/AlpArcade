import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "js/services/cloud-scores.js"), "utf8");

function loadCloud({
  fail = [],
  missing = [],
  profileDeleteFails = false,
  profileKeepFails = false,
  progressDeleteFails = false,
  progressSetFails = false,
  existingScores = [],
  scoreDeleteFails = [],
  scoreSetFails = [],
} = {}) {
  const calls = [];
  const writes = [];
  const configured = profileDeleteFails || profileKeepFails || progressDeleteFails ||
    progressSetFails || existingScores.length || scoreDeleteFails.length || scoreSetFails.length;
  const global = configured
    ? {
        ARCADE_FIREBASE_CONFIG: { enabled: true, apiKey: "test-key", projectId: "test-project" },
      }
    : {};
  for (const [domain, api] of [
    ["scores", "ArcadeScores"],
    ["achievements", "ArcadeAchievements"],
    ["daily", "ArcadeDaily"],
  ]) {
    if (missing.includes(domain)) continue;
    global[api] = {
      resetAll() {
        calls.push(domain);
        if (fail.includes(domain)) throw new Error(`${domain} storage denied`);
      },
    };
  }
  if (global.ArcadeScores) {
    global.ArcadeScores.getState = () => ({ playerName: "Tester", highScores: {} });
  }
  const context = { window: global, console: { log() {}, warn() {} } };
  if (configured) {
    context.firebase = fakeFirebase({
      calls,
      writes,
      profileDeleteFails,
      profileKeepFails,
      progressDeleteFails,
      progressSetFails,
      existingScores,
      scoreDeleteFails,
      scoreSetFails,
    });
  }
  vm.runInNewContext(source, context);
  return { cloud: global.ArcadeCloud, calls, writes };
}

function fakeFirebase({
  calls,
  writes,
  profileDeleteFails = false,
  profileKeepFails = false,
  progressDeleteFails = false,
  progressSetFails = false,
  existingScores = [],
  scoreDeleteFails = [],
  scoreSetFails = [],
}) {
  const liveUser = {
    uid: "user-1",
    email: "tester@example.com",
    providerData: [{ providerId: "google.com" }],
    async getIdToken() {
      calls.push("token");
      return "token";
    },
  };
  const db = {
    collection(collection) {
      return {
        doc(id) {
          return {
            async get() {
              calls.push(`get:${collection}/${id}`);
              if (collection === "players") {
                return { exists: true, data: () => ({ username: "Tester", email: liveUser.email }) };
              }
              return {
                exists: collection === "scores" && existingScores.includes(id),
                data: () => ({}),
              };
            },
            async set(data) {
              calls.push(`set:${collection}/${id}`);
              if (collection === "players" && profileKeepFails) {
                throw new Error("profile keep denied");
              }
              if (collection === "progress" && progressSetFails) {
                throw new Error("progress zero denied");
              }
              if (collection === "scores" && scoreSetFails.includes(id)) {
                throw new Error("score zero denied");
              }
              writes.push({ collection, id, data });
            },
            async delete() {
              calls.push(`delete:${collection}/${id}`);
              if (collection === "players" && profileDeleteFails) {
                throw new Error("profile delete denied");
              }
              if (collection === "progress" && progressDeleteFails) {
                throw new Error("progress delete denied");
              }
              if (collection === "scores" && scoreDeleteFails.includes(id)) {
                throw new Error("score delete denied");
              }
            },
          };
        },
        limit() {
          return {
            onSnapshot() {
              return () => {};
            },
          };
        },
      };
    },
  };
  return {
    apps: [{}],
    firestore: () => db,
    auth: () => ({ currentUser: liveUser, onAuthStateChanged() {} }),
  };
}

{
  const { cloud, calls } = loadCloud();
  const result = await cloud.factoryReset({ cloud: false });
  assert.equal(result.ok, true, "factory reset succeeds when every local domain resets");
  assert.equal(result.local, true, "factory reset truthfully reports complete local deletion");
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.localResults)),
    { scores: "reset", achievements: "reset", daily: "reset" },
    "factory reset reports every cleared local domain",
  );
  assert.deepEqual(calls, ["scores", "achievements", "daily"], "all local domains are attempted");
}

{
  const { cloud, calls } = loadCloud({ fail: ["achievements"] });
  const result = await cloud.factoryReset({ cloud: false });
  assert.equal(result.ok, false, "a denied local reset makes the overall reset fail");
  assert.equal(result.local, false, "a denied local reset is not reported as successful");
  assert.equal(result.localResults.achievements, "failed", "the denied domain is named");
  assert.match(result.localErrors.join(" "), /achievements/i, "the local failure is actionable");
  assert.deepEqual(calls, ["scores", "achievements", "daily"], "later local domains still reset after one failure");
}

{
  const { cloud } = loadCloud({ missing: ["daily"] });
  const result = await cloud.factoryReset({ cloud: false });
  assert.equal(result.ok, false, "an unavailable local reset domain fails closed");
  assert.equal(result.local, false, "an unavailable domain cannot claim complete local deletion");
  assert.equal(result.localResults.daily, "unavailable", "the unavailable domain is explicit");
}

{
  const { cloud, calls } = loadCloud({ profileDeleteFails: true });
  assert.equal(await cloud.init(), true, "configured cloud fixture initializes");
  const result = await cloud.wipeAccountData({ wipeProfile: true });
  assert.equal(result.players, "failed", "a denied requested profile deletion is named");
  assert.equal(result.ok, false, "a denied requested profile deletion makes the cloud wipe fail");
  assert.match(result.errors.join(" "), /players/i, "the profile deletion failure is actionable");
  assert.ok(calls.includes("delete:players/user-1"), "the requested profile delete is attempted");
  const combined = await cloud.factoryReset({ wipeProfile: true });
  assert.equal(combined.local, true, "successful local deletion remains distinct from cloud failure");
  assert.equal(combined.cloud.players, "failed", "factory reset retains the exact cloud profile outcome");
  assert.equal(combined.ok, false, "factory reset propagates the failed requested cloud deletion");
}

{
  const { cloud, calls } = loadCloud({ profileKeepFails: true });
  assert.equal(await cloud.init(), true, "configured retention fixture initializes");
  const result = await cloud.wipeAccountData();
  assert.equal(result.players, "keep-failed", "a denied username-retention write is distinct from a skip");
  assert.equal(result.ok, true, "username retention does not redefine successful account-data deletion");
  assert.equal(result.errors.length, 0, "a retention problem is not reported as deletion failure");
  assert.match(result.warnings.join(" "), /players/i, "the retention failure remains actionable");
  assert.ok(calls.includes("set:players/user-1"), "the default username-retention write is attempted");

  const skipped = await cloud.wipeAccountData({ keepUsername: false });
  assert.equal(skipped.players, "skipped", "an explicitly disabled keep operation is an intentional skip");
  assert.equal(skipped.warnings.length, 0, "an intentional skip has no retention warning");
}

{
  const scoreId = "user-1_snake";
  const { cloud, calls, writes } = loadCloud({
    progressDeleteFails: true,
    existingScores: [scoreId],
    scoreDeleteFails: [scoreId],
  });
  assert.equal(await cloud.init(), true, "delete-fallback fixture initializes");
  const result = await cloud.wipeAccountData();
  assert.equal(result.ok, true, "successful zero-overwrites complete the cloud wipe");
  assert.equal(result.progress, "zeroed", "denied progress deletion falls back to an empty snapshot");
  assert.equal(result.scores.snake, "zeroed", "denied public-score deletion falls back to a zero row");
  assert.equal(result.scores.reaction, "absent", "missing public-score rows remain explicit no-ops");
  assert.ok(calls.includes("set:progress/user-1"), "progress fallback write is attempted");
  assert.ok(calls.includes(`set:scores/${scoreId}`), "public-score fallback write is attempted");
  const progressWrite = writes.find((write) => write.collection === "progress");
  const scoreWrite = writes.find((write) => write.id === scoreId);
  assert.equal(progressWrite.data.xp, 0, "progress fallback removes retained XP");
  assert.deepEqual(progressWrite.data.highScores, {}, "progress fallback removes retained bests");
  assert.equal(scoreWrite.data.score, 0, "public-score fallback removes the retained score");
  assert.equal(scoreWrite.data.arcadePoints, 0, "public-score fallback removes retained arcade points");
}

{
  const scoreId = "user-1_snake";
  const { cloud } = loadCloud({
    progressDeleteFails: true,
    progressSetFails: true,
    existingScores: [scoreId],
    scoreDeleteFails: [scoreId],
    scoreSetFails: [scoreId],
  });
  assert.equal(await cloud.init(), true, "failed-fallback fixture initializes");
  const result = await cloud.wipeAccountData();
  assert.equal(result.ok, false, "denied zero-overwrites make the cloud wipe fail closed");
  assert.equal(result.progress, "failed", "failed progress replacement is explicit");
  assert.equal(result.scores.snake, "failed", "failed public-score replacement is explicit");
  assert.match(result.errors.join(" "), /progress/i, "progress replacement failure is actionable");
  assert.match(result.errors.join(" "), /snake/i, "public-score replacement failure is actionable");
}

console.log("Cloud factory-reset honesty contracts passed (46 assertions).");
