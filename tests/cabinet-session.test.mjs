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

const { frameGap, scoredTimeout, createLifecycle, bindSuspension, STALL_MS } = window.ArcadeCabinetSession;

const fresh = frameGap(5000, null);
assert.equal(fresh.stalled, false);
assert.equal(fresh.stepMs, 0);
assert.equal(fresh.now, 5000);

const played = frameGap(1016, 1000);
assert.equal(played.stalled, false);
assert.equal(played.stepMs, 16);

let power = 520;
let anchor = 1000;
function tickPower(now) {
  const gap = frameGap(now, anchor);
  anchor = gap.now;
  if (!gap.stalled) power -= gap.stepMs / 16.67;
  return power;
}
tickPower(1016);
const midPower = power;
tickPower(1016 + STALL_MS + 50);
assert.equal(power, midPower, "a long suspension must not drain or extend a timed power");
tickPower(500);
assert.equal(power, midPower, "a backward clock must not grant extra power time");
const after = tickPower(500 + 16);
assert.ok(after < midPower, "play continues only after the clock is rebased");

assert.equal(scoredTimeout(1000, 900), "pending");
assert.equal(scoredTimeout(1000, 1100), "due");
assert.equal(scoredTimeout(1000, 1000 + STALL_MS + 1), "suspended");

const timers = new Map();
const intervals = new Map();
const frames = new Map();
let seq = 0;
window.setTimeout = (fn) => {
  const id = ++seq;
  timers.set(id, fn);
  return id;
};
window.clearTimeout = (id) => timers.delete(id);
window.setInterval = (fn) => {
  const id = ++seq;
  intervals.set(id, fn);
  return id;
};
window.clearInterval = (id) => intervals.delete(id);
window.requestAnimationFrame = (fn) => {
  const id = ++seq;
  frames.set(id, fn);
  return id;
};
window.cancelAnimationFrame = (id) => frames.delete(id);

function target() {
  const map = new Map();
  return {
    addEventListener(type, fn) {
      map.set(type, [...(map.get(type) || []), fn]);
    },
    removeEventListener(type, fn) {
      map.set(type, (map.get(type) || []).filter((item) => item !== fn));
    },
    dispatch(type) {
      for (const fn of map.get(type) || []) fn();
    },
    size(type) {
      return (map.get(type) || []).length;
    },
  };
}

const firstLife = createLifecycle();
const secondLife = createLifecycle();
const keys = target();
let hits = 0;
let timed = 0;
firstLife.listen(keys, "keydown", () => {
  hits += 1;
});
secondLife.listen(keys, "keydown", () => {
  hits += 1;
});
const timeoutId = firstLife.setTimeout(() => {
  timed += 1;
}, 0);
const wrappedTimeout = timers.get(timeoutId);
firstLife.setInterval(() => {
  timed += 1;
}, 10);
firstLife.requestAnimationFrame(() => {
  timed += 1;
});
const audio = {
  paused: false,
  pause() {
    this.paused = true;
  },
  state: "running",
  close() {
    this.state = "closed";
  },
};
firstLife.trackAudio(audio);
assert.equal(firstLife.snapshot().listeners, 1);
assert.equal(firstLife.snapshot().timeouts, 1);
assert.equal(firstLife.snapshot().intervals, 1);
assert.equal(firstLife.snapshot().frames, 1);
assert.equal(firstLife.dispose(), true);
assert.equal(firstLife.dispose(), false, "a second dispose is a no-op");
wrappedTimeout();
assert.equal(timed, 0, "a disposed timer must not keep running");
assert.equal(timers.has(timeoutId), false);
assert.equal(intervals.size, 0);
assert.equal(frames.size, 0);
assert.equal(audio.paused, true);
assert.equal(audio.state, "closed");
keys.dispatch("keydown");
assert.equal(hits, 1, "disposing one cabinet must leave the next cabinet's listener");
assert.equal(secondLife.snapshot().listeners, 1);
secondLife.dispose();
keys.dispatch("keydown");
assert.equal(hits, 1, "leaving the replacement cabinet removes its listener too");
assert.equal(JSON.stringify(secondLife.snapshot()), JSON.stringify({
  disposed: true,
  timeouts: 0,
  intervals: 0,
  frames: 0,
  listeners: 0,
  audios: 0,
}));

const doc = target();
doc.hidden = false;
doc.visibilityState = "visible";
const life = createLifecycle();
const reasons = [];
bindSuspension(life, doc, (reason) => reasons.push(reason));
doc.hidden = true;
doc.visibilityState = "hidden";
doc.dispatch("visibilitychange");
doc.dispatch("pagehide");
doc.dispatch("freeze");
doc.hidden = false;
doc.visibilityState = "visible";
doc.dispatch("visibilitychange");
doc.dispatch("pageshow");
doc.dispatch("resume");
assert.equal(reasons.join(","), "hidden,pagehide,freeze,visible,pageshow,resume");
life.dispose();
doc.dispatch("visibilitychange");
assert.equal(reasons.length, 6, "a left cabinet must not keep suspension listeners");

const games = {
  shooter: ["frameGap", "bindSuspension"],
  breaker: ["frameGap", "bindSuspension"],
  snake: ["frameGap", "bindSuspension"],
  tapper: ["scoredTimeout", "bindSuspension"],
  memory: ["scoredTimeout", "bindSuspension"],
  reaction: ["scoredTimeout", "bindSuspension", "Interrupted"],
  jubeat: ["frameGap", "bindSuspension", "trackAudio"],
  tictactoe: [],
};
for (const [id, needles] of Object.entries(games)) {
  const src = fs.readFileSync(path.join(root, "js/games", `${id}.js`), "utf8");
  assert.match(src, /createLifecycle\(/, `${id} mounts a lifecycle`);
  assert.match(src, /life\.dispose\(/, `${id} disposes on leave`);
  for (const needle of needles) assert.match(src, new RegExp(needle), `${id} uses ${needle}`);
}
for (const id of ["tictactoe", "reaction", "memory", "jubeat", "tapper"]) {
  const src = fs.readFileSync(path.join(root, "js/games", `${id}.js`), "utf8");
  assert.doesNotMatch(src, /mountPanel|ctrl-prefs/, `${id} has no remap panel`);
}
for (const id of ["snake", "shooter", "breaker"]) {
  const src = fs.readFileSync(path.join(root, "js/games", `${id}.js`), "utf8");
  assert.match(src, /mountPanel/, `${id} exposes control preferences`);
}

console.log("Cabinet navigation lifecycle passed.");
