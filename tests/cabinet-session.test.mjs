import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "js/core/cabinet-session.js"), "utf8");
const window = {};
const context = { window };
vm.createContext(context);
vm.runInContext(source, context);

const session = window.ArcadeCabinetSession.create();
const first = session.begin();
assert.equal(typeof first, "number", "the first cabinet request should receive a token");
assert.equal(session.isCurrent(first), true, "a new request should be current");
assert.equal(session.begin(), null, "a second request should not start while one is opening");

session.cancel();
assert.equal(session.isCurrent(first), false, "Back should invalidate an in-flight request");

const second = session.begin();
assert.notEqual(second, first, "a replacement request should receive a distinct token");
assert.equal(session.finish(first), false, "a stale request must not finish its replacement");
assert.equal(session.isCurrent(second), true, "stale cleanup must preserve the replacement request");
assert.equal(session.finish(second), true, "the current request should finish successfully");
assert.equal(session.isCurrent(second), false, "a finished request should no longer be current");

let releaseLoad;
const loading = new Promise((resolve) => {
  releaseLoad = resolve;
});
const stale = session.begin();
let staleMounted = false;
const staleContinuation = (async () => {
  await loading;
  if (session.isCurrent(stale)) staleMounted = true;
  session.finish(stale);
})();

session.cancel();
const replacement = session.begin();
releaseLoad();
await staleContinuation;
assert.equal(staleMounted, false, "a resolved stale load must not mount after returning to the lobby");
assert.equal(
  session.isCurrent(replacement),
  true,
  "a stale continuation must not cancel a newer cabinet request",
);

console.log("Cabinet navigation lifecycle passed (11 contracts).");
