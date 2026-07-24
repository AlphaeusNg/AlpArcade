import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";

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
const chartDataSource = fs.readFileSync(path.join(root, "js/games/jubeat-chart-data.js"), "utf8");
const source = fs.readFileSync(path.join(root, "js/games/jubeat.js"), "utf8");
const gameCss = fs.readFileSync(path.join(root, "css/games.css"), "utf8");
const responsiveCss = fs.readFileSync(path.join(root, "css/responsive.css"), "utf8");
const achievementsSource = fs.readFileSync(path.join(root, "js/features/achievements.js"), "utf8");
const appSource = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const gameScreenSource = fs.readFileSync(path.join(root, "js/core/game-screen.js"), "utf8");
vm.runInContext(chartDataSource, context);
vm.runInContext(source, context);

const game = context.window.GameJubeat;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const playViewFixture = {};
const screenContext = {
  window: {
    matchMedia: () => ({ matches: true }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
  },
  document: { fullscreenElement: null, webkitFullscreenElement: null },
};
vm.createContext(screenContext);
vm.runInContext(gameScreenSource, screenContext);
const screenRootFixture = {
  closest: (selector) => (selector === "#play-view" ? playViewFixture : null),
};
assert(
  screenContext.window.ArcadeGameScreen.shouldUseDocumentScroll(screenRootFixture),
  "Phone cabinet play must use the outer document scroller"
);
screenContext.document.fullscreenElement = playViewFixture;
assert(
  !screenContext.window.ArcadeGameScreen.shouldUseDocumentScroll(screenRootFixture),
  "Fullscreen phone play must keep the stable cabinet lock"
);

assert(game.MARKER_MODES.length === 6, "Pulse Grid marker count changed");
assert(
  JSON.stringify(Object.keys(game.DIFFICULTIES)) === JSON.stringify(["easy", "medium", "extreme"]),
  "Pulse Grid must expose Easy, Medium, and Extreme"
);
assert(
  JSON.stringify(Object.values(game.DIFFICULTIES).map((difficulty) => difficulty.symbol)) ===
    JSON.stringify(["E", "M", "EX"]) &&
    source.includes('difficultyEl.classList.toggle("is-custom", !!song().custom)') &&
    gameCss.includes('grid-template-columns: repeat(3, 2rem)') &&
    gameCss.includes('.jb-difficulty-btn[data-difficulty="easy"]') &&
    gameCss.includes('.jb-difficulty-btn[data-difficulty="medium"]') &&
    gameCss.includes('.jb-difficulty-btn[data-difficulty="extreme"]'),
  "Difficulty controls must remain one compact E/M/EX row with stable color coding"
);
assert(source.includes('id="jb-results-retry"'), "Pulse Grid results must offer Retry");
assert(
  source.includes('resultsEl.classList.add("is-full-combo", "is-combo-visible")') &&
    source.includes('resultsEl.classList.add("is-exc")') &&
    source.includes('resultsEl.classList.add("is-rank-visible")'),
  "Pulse Grid must distinguish full-combo and EXC result celebrations"
);
assert(
  source.includes("hintEl.hidden = true;") &&
    source.includes("hintEl.hidden = false;") &&
    !source.includes('hintEl.textContent = `${s.title} ${cleared ? "cleared" : "finished"}'),
  "The result display must not repeat its summary in the hint below"
);
assert(
  game.resultAnnouncementCues("A", false).rankMs === 2140 &&
    game.resultAnnouncementCues("SSS", false).rankMs === 2080 &&
    game.resultAnnouncementCues("EXC", true).comboMs === 220 &&
    game.resultAnnouncementCues("EXC", true).rankMs === 4960,
  "Every result visual must use its measured spoken announcement cue"
);
assert(
  ["A", "B", "C", "D", "FAIL", "S", "SS", "SSS", "EXC"].every((rank) => {
    const standard = game.resultAnnouncementCues(rank, false);
    const fullCombo = game.resultAnnouncementCues(rank, true);
    return standard.comboMs === null && standard.rankMs > 0 && fullCombo.comboMs >= 0 && fullCombo.rankMs > fullCombo.comboMs;
  }),
  "Every grade and Full Combo result must have valid synchronized media cues"
);
assert(
  source.includes("resultAudioEl.currentTime * 1000") &&
    source.includes("resultAudioEl.onplaying = watchCues") &&
    source.includes("onComboCue: revealFullCombo") &&
    source.includes("onRankCue: revealRank") &&
    !source.includes("FULL_COMBO_REVEAL_DELAY_MS") &&
    !source.includes("EXC_REVEAL_DELAY_MS"),
  "Grade and Full Combo visuals must follow media playback instead of page timers"
);
assert(
  game.EXC_MINIMUM_CELEBRATION_MS === 11000 &&
    source.includes('rank === "EXC" ? 14000 : 12000'),
  "The delayed EXC celebration must retain its full animation and suspense"
);
assert(
  source.includes('rank === "EXC" && entry.grade === "excellent"') &&
    source.includes('class="jb-accuracy-timeline"') &&
    !source.includes("jb-accuracy-box"),
  "All-Excellent result bars must turn gold"
);
assert(
  source.includes('id="jb-grid-combo"') &&
    source.includes('id="jb-grid-combo-value"') &&
    gameCss.includes(".jb-grid-combo.is-active"),
  "The live combo tracker must span the 4 by 4 panel background"
);
assert(
  source.includes('id="jb-tap-map"') &&
    source.includes('id="jb-tap-map-playhead"') &&
    source.indexOf('id="jb-progress"') < source.indexOf('id="jb-grid"'),
  "The full-song tap map and progress rail must sit above the panel grid"
);
assert(
  source.includes('id="jb-tap-map-canvas"') &&
    source.includes('tapMapCanvasEl.getContext("2d"') &&
    source.includes('function drawLiveTap(entry, grade = "expected")') &&
    !source.includes("jb-tap-tick"),
  "Expected taps must update on one low-overhead canvas instead of hundreds of DOM nodes"
);
assert(
  game.liveSequenceGrade([{ grade: "excellent" }, { grade: null }]) === "expected" &&
    game.liveSequenceGrade([{ grade: "excellent" }, { grade: "great" }]) === "hit" &&
    game.liveSequenceGrade([{ grade: "excellent" }, { grade: "excellent" }]) === "excellent" &&
    source.includes("sequence.forEach((sequenceEntry) => drawLiveTap(sequenceEntry, sequenceGrade));") &&
    source.includes("<i class=\"is-hit\"></i> ALL EXC"),
  "The live map must turn a sequence gold only when every simultaneous tap is Excellent"
);
assert(
  source.includes("1000 / 30") &&
    source.includes("progEl.style.transform = `scaleX(${ratio})`") &&
    !source.includes("offsetWidth"),
  "Phone visuals must be frame-capped, compositor-driven, and free of forced layout"
);
assert(
  gameScreenSource.includes("shouldUseDocumentScroll") &&
    gameScreenSource.includes('root.classList.add("is-document-flow")') &&
    responsiveCss.includes("calc(4rem + env(safe-area-inset-bottom))"),
  "Phone cabinets must use document scrolling with safe bottom room"
);
assert(game.songProgressPercent(-20, 1000) === 0, "Song progress must clamp before the chart starts");
assert(game.songProgressPercent(500, 1000) === 50, "Song progress and tap-map playhead must share one timeline");
assert(game.songProgressPercent(1200, 1000) === 100, "Song progress must clamp after the song ends");
assert(
  game.songTimelineDuration({ durationSec: 10, audioOffsetMs: 500 }, [{ t: 8000 }]) === 9500,
  "The live song map must cover the documented full song cut"
);
assert(
  source.includes('id="jb-timing-offset"') &&
    source.includes('id="jb-timing-earlier"') &&
    source.includes('id="jb-timing-later"') &&
    source.includes("runtimeChartFor(s, difficultyId, timingOffsetFor(s))") &&
    gameCss.includes(".jb-timing-calibration"),
  "Each song must expose editable earlier/later tap calibration"
);
assert(
  game.DEFAULT_TIMING_OFFSET_MS === 25 &&
    game.SONGS.every((song) => song.defaultTimingOffsetMs == null) &&
    source.includes("const sampled = sampleAudioMs();") &&
    source.includes("return sampled;") &&
    !source.includes("perf - lastAudioSamplePerf > 100"),
  "All songs must default 25 ms early and follow the media beat clock without accumulated interpolation drift"
);
const practiceMarkupIndex = source.indexOf('class="jb-practice-row jb-song-practice"');
const timingMarkupIndex = source.indexOf('class="jb-timing-calibration"');
const setupControlsMarkupIndex = source.indexOf('class="jb-setup-controls"');
assert(
  practiceMarkupIndex >= 0 &&
    practiceMarkupIndex < timingMarkupIndex &&
    timingMarkupIndex < setupControlsMarkupIndex,
  "Beat practice must live in the selected song details immediately above tap timing"
);
assert(
  source.includes("function practiceAudioTimeMs()") &&
    source.includes("const cycleMs = beatMs * 8;") &&
    source.includes("const calibratedTime = audioTimeMs + timingOffsetFor(song());"),
  "Beat practice must follow the selected song preview BPM and timing calibration"
);
assert(
  /\.jb-setup-controls\s*\{[^}]*grid-template-columns:\s*1fr;/s.test(gameCss) &&
    /\.jb-setup-panel\s*\{[^}]*grid-template-columns:\s*5\.25rem minmax\(0,\s*1fr\);/s.test(gameCss) &&
    /\.jb-marker-mode\s*\{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\);/s.test(gameCss),
  "Difficulty and marker controls must remain two compact full-width rows"
);
assert(game.clampTimingOffset(438) === 400, "Tap calibration must clamp unsafe large offsets");
assert(game.clampTimingOffset(112) === 100, "Tap calibration must snap to 25 ms steps");
assert(
  JSON.stringify(game.applyTimingOffset([{ t: 0, panels: [0] }, { t: 500, panels: [1] }], 100)) ===
    JSON.stringify([{ t: 0, panels: [0] }, { t: 400, panels: [1] }]),
  "A positive timing offset must move runtime taps earlier without creating negative time"
);
assert(!source.includes("assets/jubeat/panel-"), "Pulse Grid must not load legacy panel art or video");
assert(!gameCss.includes("assets/jubeat/panel-"), "Pulse Grid CSS must not use legacy panel faces");
assert(gameCss.includes('content: "PRESS"'), "Neon Ring must expose an explicit press cue");
assert(
  source.includes('const comboSuffix = fullCombo ? "-full-combo" : "";') &&
    source.includes('resultAudioUrl(`final-${rankId}${comboSuffix}.mp4`)') &&
    game.resultAudioUrl("final-s-full-combo.mp4") ===
      "assets/jubeat/audio/results/final-s-full-combo.mp4?v=latest",
  "Full combos must keep their dedicated spoken result"
);
const excitedResultFiles = ["s", "ss", "sss"].flatMap((rank) => [
  `assets/jubeat/audio/results/final-${rank}.mp4`,
  `assets/jubeat/audio/results/final-${rank}-full-combo.mp4`,
]);
assert(
  excitedResultFiles.every(
    (relativePath) =>
      fs.existsSync(path.join(root, relativePath)) &&
      fs.statSync(path.join(root, relativePath)).size > 25000
  ),
  "S through SSS must keep their energetic voice and musical result stings"
);
assert(
  fs.statSync(path.join(root, "assets/jubeat/audio/results/final-exc.mp4")).size > 75000 &&
    fs.statSync(path.join(root, "assets/jubeat/audio/results/final-exc-full-combo.mp4")).size > 75000,
  "EXCELLENT must keep its extended female voice and low victory music"
);
assert(
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, "assets/jubeat/audio/results/final-exc-full-combo.mp4")))
    .digest("hex") === "7dc8c6f9551d960afeb39c0b6a3b15cc01bcf4e8ca80be622379d4a5ce4be45d",
  "EXCELLENT Full Combo must keep the excited female, chirp-free result mix"
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
assert(!game.isDisplayedPerfectAccuracy(99.949), "99.9% display hits must not unlock Perfect Pulse");
assert(game.isDisplayedPerfectAccuracy(99.95), "A displayed 100.0% hit must unlock Perfect Pulse");
assert(
  achievementsSource.includes('id: "jubeat-perfect-timing"') &&
    source.includes('unlockPerfectTimingAchievement(accuracy)') &&
    appSource.includes('"arcade:achievement-unlocked"'),
  "Perfect Pulse must unlock and notify from practice or song timing"
);
assert(
  new Set(game.SONGS.map((song) => JSON.stringify(game.chartFor(song, "extreme")))).size === game.SONGS.length,
  "Extreme song charts must remain unique"
);
assert(
  appSource.includes('jubeat: ["js/games/jubeat-chart-data.js"]'),
  "Exact chart data must lazy-load before the Pulse Grid engine"
);
assert(
  source.includes("if (this.soonest())") &&
    gameCss.includes(".jb-cell.is-judge-excellent:not(.is-approach) .jb-shutter"),
  "A dense repeat marker must remain visible beneath the previous judgment"
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
assert(
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, "assets/jubeat/jackets/only-my-railgun.webp")))
    .digest("hex") === "f5efaab974b992c4c8312749a8cdd4c2f57880a23fabbb32b187f59bba0046cc",
  "Railgun must keep the requested RemyWiki jacket artwork"
);

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

const expectedCharts = {
  imsosohappy: { bpm: 181, levels: [4, 8, 10.2], notes: [265, 529, 806], first: [331, 0, 0], last: [92818, 92818, 92818] },
  albida: { bpm: 185, levels: [5, 7, 10.1], notes: [332, 584, 731], first: [0, 0, 0], last: [107676, 107676, 107676] },
  flower: { bpm: 173, levels: [6, 9.7, 10.5], notes: [477, 828, 939], first: [0, 0, 0], last: [118873, 119133, 119133] },
  evans: { bpm: 185, levels: [6, 8, 10.6], notes: [414, 491, 805], first: [0, 0, 0], last: [101189, 101189, 101189] },
  onlymyrailgun: { bpm: 143, levels: [3, 6, 8], notes: [219, 392, 558], first: [0, 0, 0], last: [93776, 93776, 93776] },
};
const expectedChartHashes = {
  "imsosohappy.easy": "2a61221f3ca490ba87739b5d5c9d8e487e3c876c84646fd4ec2cf0c31591f117",
  "imsosohappy.medium": "8b0798c3de21f87552a10cccac4e8c32be02f0ae1b1cb4ecb676fb754c12ae57",
  "imsosohappy.extreme": "9a2720bfff02fc8a1aa4ab01eca0c6f414f473ac3028b429f6defe6bc079a544",
  "albida.easy": "a0e8e29edf630857a0ddf78dfb9677dd9512dc70946774ff827796f4eb36050d",
  "albida.medium": "5b2bb59facef305a8d3eda250435ee7fc42b23be20de9e5a2a5f59a7d7a0a5e2",
  "albida.extreme": "bfceb00ed70faed45794ca914ab4239b5959ce426ae080c37a6ebc6d54ebb8ca",
  "flower.easy": "9df73867b6dfd27e8f2f2a0af868616c521295d8c2cfaf0b0f4791d111162df9",
  "flower.medium": "7bee717023b785c59356fbe5eb40165440358f84c6063105ceff9942290a88f2",
  "flower.extreme": "f59151db4d3a4dc064472636e96e1c9ede7862d09babc992771e8554f65cdec2",
  "evans.easy": "30876cac7f180eb01933dd734b6bcc68ac57548a1db112e0085ac54b730a0d2b",
  "evans.medium": "5e6e32ecb0459aa038c576bb54aabad62ff071d1a5c6c3167c7f94003432f240",
  "evans.extreme": "463386fa4a5282011395385bd8741351d5ada7454390da3401f0966cff6c7e32",
  "onlymyrailgun.easy": "c468bf1e5ed035f16d15359aa72c2b11e81e8fc6aba866f0a76ffb0528df30c2",
  "onlymyrailgun.medium": "c064b8df63be789c7c15b2cb3d6be947ba5e258f7aa90ea7031b4fde181ad660",
  "onlymyrailgun.extreme": "082d9eef7a4d2dd9668b349f336a2418489514ad8f07cc845c9d92fe45a82296",
};
const difficultyIds = ["easy", "medium", "extreme"];
assert(game.SONGS.length === 5, "Pulse Grid must contain the four originals plus only my railgun");
for (const song of game.SONGS) {
  const expected = expectedCharts[song.id];
  assert(expected && song.bpm === expected.bpm, `${song.id} BPM must match the arcade chart`);
  difficultyIds.forEach((difficultyId, index) => {
    const official = context.window.JubeatChartData.songs[song.id].charts[difficultyId];
    const chart = game.chartFor(song, difficultyId);
    const totalNotes = chart.reduce((sum, event) => sum + event.panels.length, 0);
    assert(
      JSON.stringify(game.buildChart(song, difficultyId)) === JSON.stringify(chart),
      `${song.id} ${difficultyId} must not use the legacy procedural fallback`
    );
    assert(song.levels[difficultyId] === expected.levels[index], `${song.id} ${difficultyId} level changed`);
    assert(totalNotes === expected.notes[index], `${song.id} ${difficultyId} note count changed`);
    assert(totalNotes === official.noteCount, `${song.id} ${difficultyId} packed data count is invalid`);
    assert(
      chart[0].t === expected.first[index] && chart.at(-1).t === expected.last[index],
      `${song.id} ${difficultyId} audio-origin landmarks changed`
    );
    assert(
      crypto.createHash("sha256").update(JSON.stringify(chart)).digest("hex") ===
        expectedChartHashes[`${song.id}.${difficultyId}`],
      `${song.id} ${difficultyId} chart snapshot changed`
    );
    assert(
      chart.every(
        (event, eventIndex) =>
          Number.isInteger(event.t) &&
          event.t >= 0 &&
          (!eventIndex || event.t > chart[eventIndex - 1].t) &&
          event.panels.length > 0 &&
          new Set(event.panels).size === event.panels.length &&
          event.panels.every((panel) => Number.isInteger(panel) && panel >= 0 && panel < 16)
      ),
      `${song.id} ${difficultyId} chart must be sorted and use valid unique panels`
    );
    assert(
      chart.at(-1).t <= song.durationSec * 1000 - (song.audioOffsetMs || 0),
      `${song.id} ${difficultyId} chart must finish within its documented song cut`
    );
    const tracker = game.createScoreTracker(chart);
    for (let streak = 1; streak <= tracker.totalNotes; streak += 1) {
      tracker.register("excellent", streak);
    }
    assert(tracker.score() === 1000000, `${song.id} ${difficultyId} all-EXCELLENT score must be 1,000,000`);
  });
}
assert(
  JSON.stringify(game.SONGS.filter((song) => song.requiresLocalAudio && !song.audio).map((song) => song.id)) ===
    JSON.stringify([]),
  "Every built-in song must now have bundled audio"
);
assert(
  game.SONGS.find((song) => song.id === "imsosohappy")?.audio ===
    "assets/jubeat/audio/imsosohappy.mp3",
  "I'm so Happy must use its restored bundled audio"
);
assert(
  game.SONGS.find((song) => song.id === "onlymyrailgun")?.officialAudioUrl ===
    "https://lnk.to/onlymyrailgun",
  "Railgun must link to its official audio distributor"
);
assert(
  game.SONGS.find((song) => song.id === "onlymyrailgun")?.audio ===
    "assets/jubeat/audio/only-my-railgun.mp3" &&
    fs.statSync(path.join(root, "assets/jubeat/audio/only-my-railgun.mp3")).size < 1_500_000,
  "Railgun must use the compressed phone-friendly game cut"
);
assert(
  source.includes("createObjectURL") && source.includes("revokeObjectURL"),
  "Local game-cut audio must stay in-browser and release its temporary URL"
);
assert(
  game.SONGS.some((song) =>
    difficultyIds.some((difficultyId) => {
      const chart = game.chartFor(song, difficultyId);
      const lastByPanel = Array(16).fill(-Infinity);
      return chart.some((event) =>
        event.panels.some((panel) => {
          const dense = event.t - lastByPanel[panel] < game.DIFFICULTIES[difficultyId].approachMs;
          lastByPanel[panel] = event.t;
          return dense;
        })
      );
    })
  ),
  "Authentic dense repeat notes must not be culled by the marker approach window"
);

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
  Math.abs(customChart[1].t - customChart[0].t - (60000 / 185) * 1) <= 1,
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
assert(recordedChart[1].t === Math.round((60000 / 185) * 0.5), "Recorded taps must retain quantized beat timing");
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

const timingStored = new Map();
const timingStorage = {
  getItem: (key) => timingStored.get(key) ?? null,
  setItem: (key, value) => timingStored.set(key, value),
};
game.saveTimingOffsets(timingStorage, { onlymyrailgun: 175, "../../bad": 300 });
assert(
  JSON.stringify(game.loadTimingOffsets(timingStorage)) === JSON.stringify({ onlymyrailgun: 175 }),
  "Per-song timing calibration must persist safely"
);

const selectionStored = new Map();
const selectionStorage = {
  getItem: (key) => selectionStored.get(key) ?? null,
  setItem: (key, value) => selectionStored.set(key, value),
};
game.savePulseGridSelection(selectionStorage, game.SONGS[3], "extreme");
assert(
  JSON.stringify(game.loadPulseGridSelection(selectionStorage, game.SONGS)) ===
    JSON.stringify({ songIndex: 3, difficultyId: "extreme" }),
  "The last built-in song and difficulty must restore together"
);
const customSelectionSong = game.customSongFromDefinition(customDefinition);
game.savePulseGridSelection(selectionStorage, customSelectionSong, "easy");
assert(
  JSON.stringify(game.loadPulseGridSelection(selectionStorage, game.SONGS.concat(customSelectionSong))) ===
    JSON.stringify({ songIndex: game.SONGS.length, difficultyId: "custom" }),
  "A saved custom chart must restore with its custom difficulty"
);
assert(
  JSON.stringify(game.loadPulseGridSelection(selectionStorage, game.SONGS)) ===
    JSON.stringify({ songIndex: 0, difficultyId: "easy" }) &&
    source.includes("persistSelection();"),
  "A missing saved song must fall back safely and selection changes must persist"
);

console.log("Pulse Grid timing, chart uniqueness, custom charts, and score cap passed.");
