import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "js/services/cloud-scores.js"), "utf8");

function loadCloud({ fail = [], missing = [], profileDeleteFails = false } = {}) {
  const calls = [];
  const global = profileDeleteFails
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
  if (profileDeleteFails) context.firebase = fakeFirebase({ calls });
  vm.runInNewContext(source, context);
  return { cloud: global.ArcadeCloud, calls };
}

function fakeFirebase({ calls }) {
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
              return collection === "players"
                ? { exists: true, data: () => ({ username: "Tester", email: liveUser.email }) }
                : { exists: false, data: () => ({}) };
            },
            async set() {
              calls.push(`set:${collection}/${id}`);
            },
            async delete() {
              calls.push(`delete:${collection}/${id}`);
              if (collection === "players") throw new Error("profile delete denied");
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

console.log("Cloud factory-reset honesty contracts passed (20 assertions).");
