import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "js/services/cloud-scores.js"), "utf8");

function loadCloud({ fail = [], missing = [] } = {}) {
  const calls = [];
  const global = {};
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
  vm.runInNewContext(source, { window: global, console: { log() {}, warn() {} } });
  return { cloud: global.ArcadeCloud, calls };
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

console.log("Cloud factory-reset honesty contracts passed (12 assertions).");
