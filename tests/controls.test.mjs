import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "js/core/controls.js"), "utf8");

function boot(storage) {
  const window = { localStorage: storage, document: { createElement() { throw new Error("no dom"); } } };
  const context = { window };
  vm.createContext(context);
  vm.runInContext(source, context);
  return window.ArcadeControls;
}

const saved = new Map();
const storage = {
  getItem(key) {
    return saved.has(key) ? saved.get(key) : null;
  },
  setItem(key, value) {
    saved.set(key, value);
  },
};
const controls = boot(storage);

assert.equal(controls.isActionGame("snake"), true);
assert.equal(controls.isActionGame("shooter"), true);
assert.equal(controls.isActionGame("breaker"), true);
assert.equal(controls.isActionGame("tictactoe"), false);
assert.equal(controls.isActionGame("reaction"), false);
assert.equal(controls.isActionGame("memory"), false);
assert.equal(controls.isActionGame("jubeat"), false);
assert.equal(controls.isActionGame("tapper"), false);
assert.equal(controls.matches("snake", "up", { key: "ArrowUp" }), true);
assert.equal(controls.matches("snake", "up", { key: "w" }), true);
assert.equal(controls.matches("snake", "up", { key: "s" }), false);

const conflict = controls.setBinding("snake", "up", "a");
assert.equal(conflict.ok, false);
assert.equal(conflict.reason, "conflict");
assert.equal(controls.matches("snake", "up", { key: "ArrowUp" }), true, "a rejected bind keeps the previous keys");

const reserved = controls.setBinding("breaker", "left", "p");
assert.equal(reserved.ok, false);
assert.equal(reserved.reason, "reserved");

const moved = controls.setBinding("shooter", "left", "j");
assert.equal(moved.ok, true);
assert.equal(controls.keysFor("shooter", "left").join(","), "j");
assert.equal(controls.matches("shooter", "left", { key: "a" }), false);
assert.equal(controls.matches("shooter", "right", { key: "ArrowRight" }), true);

const touch = controls.setTouch("snake", { scale: 4, place: "left" });
assert.equal(touch.scale, 1.45);
assert.equal(touch.place, "left");
assert.equal(controls.setTouch("snake", { place: "nope" }).place, "left");

const cluster = { dataset: {}, style: { setProperty(name, value) { this[name] = value; } } };
controls.applyTouch(cluster, "snake");
assert.equal(cluster.dataset.place, "left");
assert.equal(cluster.style["--touch-scale"], "1.45");

controls.reset("shooter");
assert.equal(controls.matches("shooter", "left", { key: "a" }), true);
assert.equal(controls.matches("shooter", "left", { key: "j" }), false);

const denied = boot({
  getItem() {
    return null;
  },
  setItem() {
    throw new Error("denied");
  },
});
const visit = denied.setBinding("breaker", "right", "l");
assert.equal(visit.ok, true);
assert.equal(visit.persistDenied, true);
assert.equal(denied.matches("breaker", "right", { key: "l" }), true, "denied storage still keeps the visit binding");
assert.equal(denied.snapshot().persistDenied, true);

console.log("Control preferences passed.");
