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

const customDefinition = {
  id: "test-chart",
  name: "Test Chords",
  baseSongId: "evans",
  level: 12,
  stepBeats: 0.5,
  steps: [[0, 5], [], [3], [12, 15]],
};
const normalizedCustom = game.normalizeCustomChartDefinition(customDefinition);
assert(normalizedCustom.level === 10, "Custom difficulty levels must be clamped to 10");
assert(
  game.normalizeCustomChartDefinition({ ...customDefinition, steps: [[], []] }) === null,
  "Empty custom charts must be rejected"
);

const customChart = game.buildCustomChart(customDefinition);
assert(customChart.length === 3, "Rest steps must not create chart events");
assert(
  JSON.stringify(customChart[0].panels) === JSON.stringify([0, 5]),
  "Custom chart chords must preserve simultaneous panels"
);
assert(
  Math.abs(customChart[1].t - customChart[0].t - (60000 / 180) * 1) <= 1,
  "Custom chart step timing must follow the base track BPM"
);

const customSong = game.customSongFromDefinition(customDefinition);
assert(customSong.custom && customSong.level === 10, "Custom chart metadata must be playable");
const customTracker = game.createScoreTracker(game.chartFor(customSong, "custom"));
for (let streak = 1; streak <= customTracker.totalNotes; streak += 1) {
  customTracker.register("excellent", streak);
}
assert(customTracker.score() === 1000000, "Custom all-EXCELLENT score must be 1,000,000");

const stored = new Map();
const storage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, value),
};
game.saveCustomChartDefinitions(storage, [customDefinition, { broken: true }]);
const restored = game.loadCustomChartDefinitions(storage);
assert(restored.length === 1 && restored[0].id === "test-chart", "Valid custom charts must persist locally");

console.log("Pulse Grid timing, chart uniqueness, custom charts, and score cap passed.");
