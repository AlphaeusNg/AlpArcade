import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "js/core/favorites.js"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");

function boot(storage) {
  const window = { localStorage: storage };
  const context = { window };
  vm.createContext(context);
  vm.runInContext(source, context);
  return window.ArcadeFavorites;
}

const saved = new Map();
const favorites = boot({
  getItem(key) {
    return saved.has(key) ? saved.get(key) : null;
  },
  setItem(key, value) {
    saved.set(key, value);
  },
});

assert.equal(JSON.stringify(favorites.pins()), JSON.stringify({ favorites: [], recent: [], persistDenied: false }));
assert.equal(favorites.toggle("not-a-game"), false);
assert.equal(favorites.toggle("snake"), true);
assert.equal(favorites.toggle("breaker"), true);
assert.equal(favorites.toggle("snake"), false);
assert.equal(favorites.pins().favorites.join(","), "breaker");
favorites.remember("snake");
favorites.remember("tapper");
favorites.remember("snake");
favorites.remember("memory");
favorites.remember("shooter");
assert.equal(favorites.pins().recent.join(","), "shooter,memory,snake,tapper");
assert.equal(favorites.pins().recent.includes("breaker"), false, "favorites are not repeated in recent");
assert.equal(favorites.remember("nope").includes("nope"), false);

const denied = boot({
  getItem() {
    return null;
  },
  setItem() {
    throw new Error("denied");
  },
});
assert.equal(denied.toggle("jubeat"), true);
denied.remember("reaction");
const visit = denied.pins();
assert.equal(visit.favorites.join(","), "jubeat");
assert.equal(visit.recent.join(","), "reaction");
assert.equal(visit.persistDenied, true);

assert.match(app, /ArcadeFavorites\?\.remember\?/);
assert.match(app, /openGame\(id\)/);
assert.match(app, /dataset\.launch = id/);
assert.match(index, /Star a cabinet to pin it/);
assert.doesNotMatch(source, /location\.hash|loadScript|GAME_SCRIPTS/);

console.log("Favorites and recent cabinets passed.");
