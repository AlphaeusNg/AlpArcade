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
const source = fs.readFileSync(path.join(root, "js/games/jubeat.js"), "utf8");
const gameCss = fs.readFileSync(path.join(root, "css/games.css"), "utf8");
vm.runInContext(source, context);

const game = context.window.GameJubeat;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(game.MARKER_MODES.length === 6, "Pulse Grid marker count changed");
assert(source.includes('id="jb-results-retry"'), "Pulse Grid results must offer Retry");
assert(!source.includes("assets/jubeat/panel-"), "Pulse Grid must not load legacy panel art or video");
assert(!gameCss.includes("assets/jubeat/panel-"), "Pulse Grid CSS must not use legacy panel faces");
assert(gameCss.includes('content: "PRESS"'), "Neon Ring must expose an explicit press cue");
assert(
  source.includes('const comboSuffix = fullCombo ? "-full-combo" : "";') &&
    source.includes('`${RESULT_AUDIO_BASE}final-${rankId}${comboSuffix}.mp4`'),
  "Full combos must keep their dedicated spoken result"
);
const markerProperties = new Map();
const markerFixture = { style: { setProperty: (name, value) => markerProperties.set(name, value) } };
game.setMarkerProgress(markerFixture, 0.899);
assert(markerProperties.get("--jb-ring-ready-opacity") === "0.0000", "Neon Ring press cue must wait for Excellent");
game.setMarkerProgress(markerFixture, 0.9);
assert(
  markerProperties.get("--jb-ring-scale") === "1.0000" &&
    markerProperties.get("--jb-ring-ready-opacity") === "1.0000",
  "Neon Ring must meet its target and show PRESS when Excellent begins"
);
assert(game.judgeForTap(1000, 499, 1000).grade === "miss", "Early taps must miss below 50%");
assert(game.judgeForTap(1000, 500, 1000).grade === "good", "The 50% boundary must be GOOD");
assert(
  new Set(game.SONGS.map((song) => JSON.stringify(game.chartFor(song, "extreme")))).size === game.SONGS.length,
  "Extreme song charts must remain unique"
);
assert(
  game.SONGS.every(
    (song) =>
      /^assets\/jubeat\/jackets\/[a-z0-9-]+\.webp$/.test(song.jacket) &&
      fs.existsSync(path.join(root, song.jacket))
  ),
  "Every built-in song must use a local jacket asset"
);
assert(new Set(game.SONGS.map((song) => song.jacket)).size === game.SONGS.length, "Song jackets must remain unique");

const slideListeners = new Map();
const slideCells = Array.from({ length: 4 }, (_, index) => ({
  dataset: { i: String(index) },
  closest: () => slideCells[index],
}));
const slideGrid = {
  ownerDocument: {
    elementFromPoint: (x) => slideCells[Math.floor(x / 100)] || null,
  },
  contains: (cell) => slideCells.includes(cell),
  addEventListener: (type, listener) => slideListeners.set(type, listener),
  removeEventListener: (type, listener) => {
    if (slideListeners.get(type) === listener) slideListeners.delete(type);
  },
};
const slideHits = [];
const stopSlideHits = game.bindSlideHits(slideGrid, (index) => slideHits.push(index));
slideListeners.get("pointerdown")({ pointerType: "touch", pointerId: 7, clientX: 20, clientY: 20 });
slideListeners.get("pointermove")({ pointerId: 7, clientX: 40, clientY: 20, preventDefault() {} });
slideListeners.get("pointermove")({ pointerId: 7, clientX: 120, clientY: 20, preventDefault() {} });
slideListeners.get("pointermove")({ pointerId: 7, clientX: 220, clientY: 20, preventDefault() {} });
slideListeners.get("pointerup")({ pointerId: 7 });
slideListeners.get("pointermove")({ pointerId: 7, clientX: 320, clientY: 20, preventDefault() {} });
assert(JSON.stringify(slideHits) === JSON.stringify([1, 2]), "Touch slides must hit each newly entered panel once");
stopSlideHits();
assert(slideListeners.size === 0, "Touch slide listeners must clean up with the game");

for (const song of game.SONGS) {
  for (const difficultyId of ["easy", "extreme"]) {
    assert(
      !game.hasPanelOverlaps(game.chartFor(song, difficultyId), game.DIFFICULTIES[difficultyId].approachMs),
      `${song.id} ${difficultyId} chart must not overlap notes on one panel`
    );
  }
  const extremeChart = game.chartFor(song, "extreme");
  const tracker = game.createScoreTracker(extremeChart);
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
assert(normalizedCustom.startBeat === 4, "Existing custom charts must retain their four-beat start");
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

const recordedDefinition = {
  ...customDefinition,
  id: "recorded-chart",
  startBeat: 0,
  level: 6,
  stepBeats: 0.25,
  steps: [[0], [], [5, 10]],
};
const recordedChart = game.buildCustomChart(recordedDefinition);
assert(recordedChart[0].t === 0, "Recorded first-beat taps must remain aligned to chart time zero");
assert(recordedChart[1].t === Math.round((60000 / 180) * 0.5), "Recorded taps must retain quantized beat timing");
const recordedSong = game.customSongFromDefinition(recordedDefinition);
const runtimeChart = game.runtimeChartFor(recordedSong, "custom");
assert(game.customRuntimeLeadMs(recordedSong.difficulty.approachMs) === 96, "Level 6 custom charts need a 96ms lead");
assert(runtimeChart[0].t === 0, "Runtime compensation must preserve the first chart beat");
assert(runtimeChart[1].t < recordedChart[1].t, "Recorded custom notes must appear slightly earlier at runtime");
const sameTapTime = 832;
assert(game.judgeForTap(1000, sameTapTime, 1200).grade === "great", "Timing fixture must begin as GREAT");
assert(
  game.judgeForTap(1000 - game.customRuntimeLeadMs(1200), sameTapTime, 1200).grade === "excellent",
  "Custom playback lead must promote the same near-boundary tap to EXCELLENT"
);
assert(game.customStepIndexForTime(0, 180, 0.25, 0) === 0, "Recording must capture the first beat");
assert(game.customStepIndexForTime(170, 180, 0.25, 0) === 2, "Recording must snap taps to the nearest grid step");
assert(game.customStepIndexForTime(170, 180, 0.3, 0) === -1, "Unsupported recording grids must be rejected");

const overlapSteps = Array.from({ length: 17 }, () => []);
overlapSteps[0] = [0, 1];
overlapSteps[1] = [0];
overlapSteps[15] = [0];
overlapSteps[16] = [0];
const overlapDefinition = game.normalizeCustomChartDefinition({
  ...recordedDefinition,
  id: "overlap-chart",
  steps: overlapSteps,
});
assert(
  JSON.stringify(overlapDefinition.steps[0]) === JSON.stringify([0, 1]) &&
    overlapDefinition.steps[1].length === 0 &&
    overlapDefinition.steps[15].length === 0 &&
    JSON.stringify(overlapDefinition.steps[16]) === JSON.stringify([0]),
  "Custom charts must reject repeated panels until the approach window is clear"
);
assert(
  game.panelPlacementOverlaps(
    overlapDefinition.steps,
    17,
    0,
    180,
    0.25,
    game.customMinimumPanelGapMs(overlapDefinition.level)
  ),
  "Recorder overlap checks must detect a too-close repeated panel"
);
assert(
  !game.hasPanelOverlaps(
    game.runtimeChartFor(game.customSongFromDefinition(overlapDefinition), "custom"),
    game.customSongFromDefinition(overlapDefinition).difficulty.approachMs
  ),
  "Runtime timing compensation must not reintroduce custom panel overlaps"
);

const longRecording = {
  ...recordedDefinition,
  steps: Array.from({ length: 1500 }, (_, index) => (index === 1499 ? [15] : [])),
};
assert(
  game.normalizeCustomChartDefinition(longRecording).steps.length === 1500,
  "Full-song quarter-beat recordings must not be truncated"
);

const stored = new Map();
const storage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, value),
};
game.saveCustomChartDefinitions(storage, [customDefinition, { broken: true }]);
const restored = game.loadCustomChartDefinitions(storage);
assert(restored.length === 1 && restored[0].id === "test-chart", "Valid custom charts must persist locally");

console.log("Pulse Grid timing, chart uniqueness, custom charts, and score cap passed.");
