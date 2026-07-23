import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const context = {
  window: {},
  console,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "js/games/jubeat.js"), "utf8"), context);

const game = context.window.GameJubeat;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(game.MARKER_MODES.length === 6, "Pulse Grid marker count changed");
assert(game.judgeForTap(1000, 499, 1000).grade === "miss", "Early taps must miss below 50%");
assert(game.judgeForTap(1000, 500, 1000).grade === "good", "The 50% boundary must be GOOD");
assert(
  new Set(game.SONGS.map((song) => JSON.stringify(game.chartFor(song, "extreme")))).size === game.SONGS.length,
  "Extreme song charts must remain unique"
);

for (const song of game.SONGS) {
  const chart = game.chartFor(song, "extreme");
  const tracker = game.createScoreTracker(chart);
  for (let streak = 1; streak <= tracker.totalNotes; streak += 1) {
    tracker.register("excellent", streak);
  }
  assert(tracker.score() === 1000000, `${song.id} all-EXCELLENT score must be 1,000,000`);
}

console.log("Pulse Grid timing, chart uniqueness, and score cap passed.");
