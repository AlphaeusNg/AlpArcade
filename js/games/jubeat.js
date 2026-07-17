/**
 * Pulse Grid — jubeat-style 4×4 with classic Shutter marker.
 * Charts approximate official EXTREME note density / song structure:
 *   I'm so Happy · Albida · Flower · Evans
 * Judges on each panel · misses do not end the run.
 */
(function (global) {
  "use strict";

  const CELLS = 16;
  const WIN = { excellent: 45, great: 90, good: 140 };
  /** Fixed shutter load time (ms) — same for every note and every song. */
  const APPROACH_MS = 1000;
  /** Judge flash duration (ms). Miss is short so the panel frees up fast. */
  const JUDGE_MS = { excellent: 280, great: 260, good: 240, miss: 180 };
  /** Empty tap flash (wrong panel / early) */
  const EMPTY_TAP_MS = 90;

  const PANEL_ART = {
    idle: "assets/jubeat/panel-idle.jpg",
    excellent: "assets/jubeat/panel-excellent.jpg",
    great: "assets/jubeat/panel-great.jpg",
    good: "assets/jubeat/panel-good.jpg",
    miss: "assets/jubeat/panel-miss.jpg",
  };
  // Videos are 2s — only use for EXC/GREAT/GOOD flashes; miss uses still + short flash
  const PANEL_VID = {
    excellent: "assets/jubeat/panel-excellent.mp4",
    great: "assets/jubeat/panel-great.mp4",
    good: "assets/jubeat/panel-good.mp4",
  };
  const JUDGE_CLASSES = ["is-judge-excellent", "is-judge-great", "is-judge-good", "is-judge-miss"];

  let ytApiPromise = null;

  function loadYouTubeApi() {
    if (global.YT && global.YT.Player) return Promise.resolve();
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise((resolve, reject) => {
      const prev = global.onYouTubeIframeAPIReady;
      global.onYouTubeIframeAPIReady = () => {
        try {
          prev?.();
        } catch {
          /* ignore */
        }
        resolve();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const s = document.createElement("script");
        s.src = "https://www.youtube.com/iframe_api";
        s.async = true;
        s.onerror = () => reject(new Error("YouTube API failed"));
        document.head.appendChild(s);
      }
      if (global.YT && global.YT.Player) resolve();
    });
    return ytApiPromise;
  }

  function note(t, panels) {
    return { t, panels: Array.isArray(panels) ? panels : [panels] };
  }

  /**
   * Panel map:
   *  0  1  2  3
   *  4  5  6  7
   *  8  9 10 11
   * 12 13 14 15
   *
   * Charts are phrase-based and beat-quantized — one primary pattern per bar,
   * strong downbeats, readable density. Notes at the same time merge into chords.
   */
  const P = {
    clock: [0, 1, 2, 3, 7, 11, 15, 14, 13, 12, 8, 4],
    clockR: [4, 8, 12, 13, 14, 15, 11, 7, 3, 2, 1, 0],
    diag: [0, 5, 10, 15],
    diagR: [3, 6, 9, 12],
    center: [5, 6, 9, 10],
    corners: [0, 3, 12, 15],
    ring: [1, 2, 7, 11, 14, 13, 8, 4],
    snake: [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11, 15, 14, 13, 12],
    shuffle: [0, 5, 2, 7, 8, 13, 10, 15, 3, 6, 1, 4, 11, 14, 9, 12],
    cols: [
      [0, 4, 8, 12],
      [1, 5, 9, 13],
      [2, 6, 10, 14],
      [3, 7, 11, 15],
    ],
    rows: [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11],
      [12, 13, 14, 15],
    ],
  };

  function buildChart(song) {
    const bpm = song.bpm;
    const beatMs = 60000 / bpm;
    const durationSec = song.durationSec || 100;
    const chartStartBeat = song.chartStartBeat || 0;
    const totalBeats = Math.floor((durationSec * bpm) / 60) - chartStartBeat;
    // timeMs → Set of panel indices (merge simultaneous hits into chords)
    const buckets = new Map();

    const add = (beatIndex, panels) => {
      if (beatIndex < 0 || beatIndex > totalBeats + 2) return;
      // Quantize to 1/16 beat so stacked patterns collapse cleanly
      const q = Math.round(beatIndex * 16) / 16;
      const t = Math.round((q + chartStartBeat) * beatMs);
      let set = buckets.get(t);
      if (!set) {
        set = new Set();
        buckets.set(t, set);
      }
      const list = Array.isArray(panels) ? panels : [panels];
      for (const p of list) {
        if (p >= 0 && p < CELLS) set.add(p);
      }
    };

    /** Single-panel stream along a path at a fixed step (beats). */
    const stream = (start, end, path, step = 0.5, pathOffset = 0) => {
      let i = 0;
      for (let b = start; b < end - 0.001; b += step) {
        add(b, [path[(i + pathOffset) % path.length]]);
        i++;
      }
    };

    /**
     * One 4-beat bar with a clear role. Roles:
     *  sparse | quarters | eighths | bounce | chord | stream | roll | peak
     */
    const bar = (base, role, seed = 0) => {
      const path = seed % 2 === 0 ? P.clock : P.clockR;
      const path2 = seed % 2 === 0 ? P.snake : P.shuffle;
      switch (role) {
        case "sparse":
          add(base, P.corners);
          add(base + 2, P.center);
          break;
        case "quarters":
          add(base, [path[seed % path.length]]);
          add(base + 1, [path[(seed + 3) % path.length]]);
          add(base + 2, [path[(seed + 6) % path.length]]);
          add(base + 3, [path[(seed + 9) % path.length]]);
          break;
        case "eighths":
          stream(base, base + 4, path, 0.5, seed);
          break;
        case "bounce":
          // Downbeats + off-beat taps (classic jubeat groove)
          add(base, P.corners);
          add(base + 0.5, [path2[seed % 16]]);
          add(base + 1, P.center);
          add(base + 1.5, [path2[(seed + 2) % 16]]);
          add(base + 2, P.corners);
          add(base + 2.5, [path2[(seed + 4) % 16]]);
          add(base + 3, P.center);
          add(base + 3.5, [path2[(seed + 6) % 16]]);
          break;
        case "chord":
          add(base, P.corners);
          add(base + 1, P.center);
          add(base + 2, P.corners);
          add(base + 3, P.center);
          add(base + 0.5, [P.ring[seed % 8]]);
          add(base + 1.5, [P.ring[(seed + 2) % 8]]);
          add(base + 2.5, [P.ring[(seed + 4) % 8]]);
          add(base + 3.5, [P.ring[(seed + 6) % 8]]);
          break;
        case "stream":
          // 8ths along a path + chord anchors on 1 and 3 only
          stream(base, base + 4, path2, 0.5, seed);
          add(base, seed % 2 === 0 ? P.corners : P.diag);
          add(base + 2, seed % 2 === 0 ? P.center : P.diagR);
          break;
        case "roll": {
          // Column or row roll — vertical/horizontal phrasing
          const useCol = seed % 2 === 0;
          for (let i = 0; i < 8; i++) {
            const lane = (seed + i) % 4;
            const cells = useCol ? P.cols[lane] : P.rows[lane];
            // two panels from the lane so it reads as a roll, not a wall
            add(base + i * 0.5, [cells[i % 4], cells[(i + 2) % 4]]);
          }
          break;
        }
        case "peak":
          // Dense but musical: 8ths stream + off-beat single + big chords on 1/3
          stream(base, base + 4, path, 0.5, seed);
          add(base, P.corners);
          add(base + 1, P.diag);
          add(base + 2, P.center);
          add(base + 3, P.diagR);
          add(base + 0.5, [path2[(seed + 1) % 16]]);
          add(base + 1.5, [path2[(seed + 5) % 16]]);
          add(base + 2.5, [path2[(seed + 9) % 16]]);
          add(base + 3.5, [path2[(seed + 13) % 16]]);
          break;
        case "rest":
          // Breath — single downbeat only
          add(base, [P.center[seed % 4]]);
          break;
        default:
          add(base, [seed % 16]);
      }
    };

    /** Fill a section with a repeating 4-bar phrase of roles. */
    const section = (startBar, endBar, phraseRoles) => {
      for (let m = startBar; m < endBar; m++) {
        const role = phraseRoles[m % phraseRoles.length];
        bar(m * 4, role, m);
      }
    };

    const lastBar = Math.max(4, Math.floor(totalBeats / 4) - 1);

    if (song.id === "imsosohappy") {
      // Happy hardstyle: bright pulse, corner chords, room to breathe every 4th bar
      section(0, 4, ["sparse", "quarters", "sparse", "quarters"]);
      section(4, 8, ["quarters", "eighths", "bounce", "rest"]);
      section(8, 16, ["bounce", "eighths", "bounce", "chord"]);
      section(16, 24, ["stream", "bounce", "stream", "rest"]);
      section(24, 32, ["chord", "peak", "chord", "bounce"]);
      section(32, 40, ["peak", "stream", "peak", "chord"]);
      section(40, Math.min(48, lastBar), ["peak", "peak", "stream", "rest"]);
      if (lastBar > 48) section(48, lastBar, ["bounce", "chord", "eighths", "rest"]);
      add(totalBeats - 2, P.corners);
      add(totalBeats - 1, P.center);
      add(totalBeats, P.corners.concat(P.center));
    } else if (song.id === "albida") {
      // Baroque columns + diagonals — rolls read as the motif
      section(0, 4, ["sparse", "quarters", "sparse", "quarters"]);
      section(4, 10, ["roll", "quarters", "roll", "rest"]);
      section(10, 20, ["roll", "chord", "roll", "bounce"]);
      section(20, 30, ["stream", "roll", "chord", "rest"]);
      section(30, Math.min(42, lastBar), ["peak", "roll", "peak", "chord"]);
      if (lastBar > 42) section(42, lastBar, ["roll", "stream", "bounce", "rest"]);
      // Signature X hits every 8 bars in the body
      for (let m = 8; m < lastBar; m += 8) {
        add(m * 4 + 1.5, P.diag.concat(P.diagR));
      }
      add(totalBeats - 1, P.corners);
      add(totalBeats, P.center);
    } else if (song.id === "flower") {
      // Trance petals: ring orbits, center blooms
      const ringStream = (startBar, endBar) => {
        for (let m = startBar; m < endBar; m++) {
          const base = m * 4;
          stream(base, base + 4, P.ring, 0.5, m);
          if (m % 4 !== 3) {
            add(base, P.center);
            add(base + 2, P.corners);
          } else {
            add(base, P.corners);
          }
        }
      };
      section(0, 4, ["sparse", "sparse", "quarters", "rest"]);
      ringStream(4, 12);
      section(12, 20, ["chord", "eighths", "bounce", "rest"]);
      ringStream(20, 28);
      section(28, Math.min(36, lastBar), ["peak", "chord", "stream", "bounce"]);
      if (lastBar > 36) {
        ringStream(36, Math.min(44, lastBar));
        if (lastBar > 44) section(44, lastBar, ["chord", "eighths", "rest", "sparse"]);
      }
      add(totalBeats - 2, P.ring);
      add(totalBeats - 1, P.center);
      add(totalBeats, P.corners);
    } else {
      // Evans — shuffle feel: 8ths with syncopated bounce, not 16th walls
      section(0, 4, ["sparse", "quarters", "eighths", "rest"]);
      section(4, 12, ["bounce", "eighths", "bounce", "rest"]);
      section(12, 20, ["stream", "bounce", "stream", "chord"]);
      section(20, 28, ["peak", "stream", "bounce", "rest"]);
      section(28, Math.min(40, lastBar), ["peak", "peak", "stream", "chord"]);
      if (lastBar > 40) section(40, lastBar, ["bounce", "stream", "peak", "rest"]);
      // Evans corner pairs on every 4th downbeat
      for (let m = 4; m < lastBar; m += 4) {
        add(m * 4, [0, 3]);
        add(m * 4 + 2, [12, 15]);
      }
      add(totalBeats - 2, P.corners);
      add(totalBeats - 1, P.center);
      add(totalBeats, P.shuffle.slice(0, 8));
    }

    const notes = [...buckets.entries()]
      .map(([t, set]) => note(t, [...set].sort((a, b) => a - b)))
      .sort((a, b) => a.t - b.t || a.panels[0] - b.panels[0]);
    return notes;
  }

  const SONGS = [
    {
      id: "imsosohappy",
      title: "I'm so Happy",
      artist: "Ryu☆",
      level: 9,
      bpm: 183,
      durationSec: 100, // ~1:40
      // Skip non-musical lead-in on the YT upload (ms subtracted from video time)
      audioOffsetMs: 0,
      color: "#f472b6",
      youtubeId: "9TFe1oHsb-s",
      notesHint: "beat chart",
    },
    {
      id: "albida",
      title: "Albida",
      artist: "DJ YOSHITAKA",
      level: 9,
      bpm: 185,
      durationSec: 118,
      audioOffsetMs: 0,
      color: "#38bdf8",
      youtubeId: "H-tHnjxkkNg",
      notesHint: "columns",
    },
    {
      id: "flower",
      title: "Flower",
      artist: "DJ YOSHITAKA",
      level: 8,
      bpm: 173,
      durationSec: 125,
      audioOffsetMs: 0,
      color: "#c084fc",
      youtubeId: "3K6OnRqo4og",
      notesHint: "petals",
    },
    {
      id: "evans",
      title: "Evans",
      artist: "DJ YOSHITAKA",
      level: 9,
      bpm: 180,
      durationSec: 122,
      audioOffsetMs: 0,
      color: "#fbbf24",
      youtubeId: "6FRGiRCbfr8",
      notesHint: "shuffle",
    },
  ].map((s) => ({ ...s, chart: null }));

  function chartFor(song) {
    if (!song.chart) song.chart = buildChart(song);
    return song.chart;
  }

  function mount(root, { onScore }) {
    let songIndex = 0;

    root.innerHTML = `
      <div class="jubeat-wrap">
        <div class="jb-song-bar" id="jb-songs" role="tablist" aria-label="EXTREME charts"></div>
        <div class="game-hud">
          <div><span class="hud-label">Score</span><strong id="jb-score">0</strong></div>
          <div><span class="hud-label">Combo</span><strong id="jb-combo">0</strong></div>
          <div><span class="hud-label">EXC</span><strong id="jb-exc">0</strong></div>
          <div><span class="hud-label">Miss</span><strong id="jb-miss">0</strong></div>
        </div>
        <div class="jb-meta mono" id="jb-meta"></div>
        <div class="jb-stage">
          <div class="jb-grid" id="jb-grid" role="grid" aria-label="jubeat 4 by 4"></div>
          <div class="jb-sr-judge" id="jb-sr-judge" aria-live="polite"></div>
          <div class="jb-progress"><div class="jb-progress-fill" id="jb-progress"></div></div>
        </div>
        <div class="jb-music" id="jb-music">
          <div id="jb-yt" class="jb-yt" aria-label="Song BGM"></div>
          <p class="jb-music-note mono" id="jb-music-note">Each chart plays its track · unmute if needed</p>
        </div>
        <p class="game-hint" id="jb-hint">Hit when the shutter closes on the beat · miss never fails the chart · 1–4 QWER ASDF ZXCV</p>
        <div class="game-actions">
          <button type="button" class="btn primary" id="jb-start">Start chart</button>
        </div>
      </div>
    `;

    const grid = root.querySelector("#jb-grid");
    const songsEl = root.querySelector("#jb-songs");
    const scoreEl = root.querySelector("#jb-score");
    const comboEl = root.querySelector("#jb-combo");
    const excEl = root.querySelector("#jb-exc");
    const missEl = root.querySelector("#jb-miss");
    const metaEl = root.querySelector("#jb-meta");
    const hintEl = root.querySelector("#jb-hint");
    const srJudgeEl = root.querySelector("#jb-sr-judge");
    const progEl = root.querySelector("#jb-progress");
    const startBtn = root.querySelector("#jb-start");
    const musicNoteEl = root.querySelector("#jb-music-note");
    const ytHost = root.querySelector("#jb-yt");

    const cells = [];
    const cellVids = [];
    const cellJudgeTimers = Array(CELLS).fill(null);
    /** Panel is locked while a judge flash is showing (perf timestamp end). */
    const judgeUntil = Array(CELLS).fill(0);
    const emptyTapTimers = Array(CELLS).fill(null);

    for (let i = 0; i < CELLS; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "jb-cell";
      btn.dataset.i = String(i);
      btn.setAttribute("aria-label", `Panel ${i + 1}`);
      // Classic shutter: 4 edge doors + 6 iris blades + TOUCH
      btn.innerHTML = `
        <video class="jb-cell-vid" muted playsinline preload="none" aria-hidden="true"></video>
        <span class="jb-shutter" aria-hidden="true">
          <span class="jb-door jb-door-n"></span>
          <span class="jb-door jb-door-s"></span>
          <span class="jb-door jb-door-e"></span>
          <span class="jb-door jb-door-w"></span>
          <span class="jb-iris">
            <span class="jb-blade" style="--i:0"></span>
            <span class="jb-blade" style="--i:1"></span>
            <span class="jb-blade" style="--i:2"></span>
            <span class="jb-blade" style="--i:3"></span>
            <span class="jb-blade" style="--i:4"></span>
            <span class="jb-blade" style="--i:5"></span>
          </span>
          <span class="jb-touch"><span class="jb-touch-a">TOUCH</span><span class="jb-touch-b">TOUCH</span></span>
        </span>
        <span class="jb-cell-judge" hidden aria-hidden="true"></span>`;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        onPanel(i);
      });
      grid.appendChild(btn);
      cells.push(btn);
      cellVids.push(btn.querySelector(".jb-cell-vid"));
    }

    let running = false;
    let score = 0;
    let combo = 0;
    let bestCombo = 0;
    let counts = { excellent: 0, great: 0, good: 0, miss: 0 };
    let chart = [];
    let chartIndex = 0;
    let t0 = 0;
    let raf = 0;
    let submitted = false;
    let active = new Map();
    const approachMs = APPROACH_MS;
    let audioCtx = null;
    let ytPlayer = null;
    let ytVideoId = "";
    let useVideoClock = false;
    let destroyed = false;
    let clockStarted = false;
    // Hybrid clock: sample YT occasionally, interpolate with performance.now
    let clockAnchorVideoMs = 0;
    let clockAnchorPerf = 0;
    let lastVideoSamplePerf = 0;

    function song() {
      return SONGS[songIndex];
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function paintSongs() {
      songsEl.innerHTML = SONGS.map(
        (s, i) => `
        <button type="button" class="jb-song-chip${i === songIndex ? " is-active" : ""}" data-s="${i}" ${running ? "disabled" : ""} style="--sc:${s.color}">
          <strong>${escapeHtml(s.title)}</strong>
          <small>EXT ${s.level} · ${s.bpm} BPM · ${s.notesHint || ""}</small>
        </button>`
      ).join("");
      songsEl.querySelectorAll("[data-s]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (running) return;
          songIndex = Number(btn.dataset.s);
          paintSongs();
          paintMeta();
          cuePreview(song());
          global.ArcadeSFX?.click?.();
        });
      });
    }

    function paintMeta() {
      const s = song();
      metaEl.innerHTML = `<span style="color:${s.color}">${escapeHtml(s.title)}</span>
        <span class="jb-diff">EXTREME ${s.level}</span>
        <span>${escapeHtml(s.artist)}</span>
        <span>${s.bpm} BPM</span>
        <span class="jb-bgm">♪ BGM · Shutter</span>`;
      grid.style.setProperty("--jb-accent", s.color);
    }

    function stopCellVid(panel) {
      const vid = cellVids[panel];
      if (!vid) return;
      try {
        vid.pause();
        vid.removeAttribute("src");
        vid.load?.();
        vid.classList.remove("is-playing");
      } catch {
        /* ignore */
      }
    }

    function clearJudgeVisual(panel) {
      const el = cells[panel];
      if (!el) return;
      JUDGE_CLASSES.forEach((c) => el.classList.remove(c));
      el.classList.remove("is-miss", "is-hit");
      const j = el.querySelector(".jb-cell-judge");
      if (j) {
        j.hidden = true;
        j.textContent = "";
        j.className = "jb-cell-judge";
      }
      stopCellVid(panel);
      judgeUntil[panel] = 0;
      if (cellJudgeTimers[panel]) {
        clearTimeout(cellJudgeTimers[panel]);
        cellJudgeTimers[panel] = null;
      }
    }

    function setCellJudge(panel, text, cls) {
      const el = cells[panel];
      if (!el) return;
      const j = el.querySelector(".jb-cell-judge");
      const vid = cellVids[panel];
      const key =
        cls === "excellent" || cls === "great" || cls === "good" || cls === "miss" ? cls : "miss";
      const holdMs = JUDGE_MS[key] ?? JUDGE_MS.good;

      // Restart judge cleanly (no stacked timers / lingering miss art)
      if (cellJudgeTimers[panel]) clearTimeout(cellJudgeTimers[panel]);
      stopCellVid(panel);
      JUDGE_CLASSES.forEach((c) => el.classList.remove(c));
      el.classList.remove("is-miss", "is-hit");

      el.classList.add(`is-judge-${key}`);
      // Hide shutter during judge; frame() re-arms after judgeUntil
      el.classList.remove("is-approach", "is-armed");
      el.style.setProperty("--jb-p", "0");
      judgeUntil[panel] = performance.now() + holdMs;

      if (j) {
        j.hidden = false;
        j.textContent = text;
        // Restart CSS pop animation
        j.className = "jb-cell-judge";
        void j.offsetWidth;
        j.className = "jb-cell-judge " + (cls || "");
      }
      // Miss: still frame only (videos are 2s and read as “stuck”)
      if (vid && PANEL_VID[key] && key !== "miss") {
        try {
          if (vid.getAttribute("src") !== PANEL_VID[key]) vid.src = PANEL_VID[key];
          vid.currentTime = 0;
          vid.classList.add("is-playing");
          const p = vid.play();
          if (p?.catch) p.catch(() => {});
        } catch {
          /* still image via CSS */
        }
      }
      cellJudgeTimers[panel] = setTimeout(() => {
        clearJudgeVisual(panel);
        // Immediately restore shutter for any note still waiting on this panel
        syncPanelMarker(panel, nowMs());
      }, holdMs);
      if (srJudgeEl) srJudgeEl.textContent = text;
    }

    /**
     * Drive shutter from absolute chart time so every note loads in exactly APPROACH_MS.
     * Only the soonest active note on a panel owns the marker.
     */
    function syncPanelMarker(panel, t) {
      const el = cells[panel];
      if (!el) return;
      if (performance.now() < judgeUntil[panel]) return;

      let soonest = null;
      for (const n of active.values()) {
        if (n.panel !== panel) continue;
        if (!soonest || n.t < soonest.t) soonest = n;
      }

      if (!soonest) {
        el.classList.remove("is-approach", "is-armed");
        el.style.setProperty("--jb-p", "0");
        return;
      }

      // Linear 0→1 over a fixed window ending at hit time
      const start = soonest.t - approachMs;
      const p = Math.max(0, Math.min(1, (t - start) / approachMs));
      el.classList.add("is-approach", "is-armed");
      el.style.setProperty("--jb-p", p.toFixed(4));
    }

    function syncAllMarkers(t) {
      for (let i = 0; i < CELLS; i++) syncPanelMarker(i, t);
    }

    function clearPanels() {
      cells.forEach((c, i) => {
        c.classList.remove("is-armed", "is-hit", "is-miss", "is-approach", ...JUDGE_CLASSES);
        c.style.setProperty("--jb-p", "0");
        const j = c.querySelector(".jb-cell-judge");
        if (j) {
          j.hidden = true;
          j.textContent = "";
          j.className = "jb-cell-judge";
        }
        stopCellVid(i);
        judgeUntil[i] = 0;
      });
      cellJudgeTimers.forEach((t, i) => {
        if (t) clearTimeout(t);
        cellJudgeTimers[i] = null;
      });
      emptyTapTimers.forEach((t, i) => {
        if (t) clearTimeout(t);
        emptyTapTimers[i] = null;
      });
      active.clear();
    }

    function stopBgm() {
      useVideoClock = false;
      try {
        ytPlayer?.pauseVideo?.();
      } catch {
        /* ignore */
      }
    }

    function ensureYtPlayer(videoId) {
      return loadYouTubeApi()
        .then(
          () =>
            new Promise((resolve) => {
              if (destroyed) return resolve(null);
              if (ytPlayer && ytVideoId === videoId) return resolve(ytPlayer);
              if (ytPlayer && typeof ytPlayer.loadVideoById === "function") {
                ytVideoId = videoId;
                try {
                  ytPlayer.cueVideoById({ videoId, startSeconds: 0 });
                } catch {
                  ytPlayer.loadVideoById(videoId);
                }
                return resolve(ytPlayer);
              }
              if (ytHost) ytHost.innerHTML = "";
              ytVideoId = videoId;
              ytPlayer = new global.YT.Player(ytHost, {
                height: "152",
                width: "100%",
                videoId,
                host: "https://www.youtube-nocookie.com",
                playerVars: {
                  autoplay: 0,
                  controls: 1,
                  modestbranding: 1,
                  rel: 0,
                  playsinline: 1,
                  fs: 0,
                  origin: location.origin,
                },
                events: {
                  onReady: (e) => resolve(e.target),
                  onError: () => resolve(ytPlayer),
                },
              });
            })
        )
        .catch(() => null);
    }

    function cuePreview(s) {
      if (!s?.youtubeId) return;
      ensureYtPlayer(s.youtubeId).then((p) => {
        try {
          p?.cueVideoById?.({ videoId: s.youtubeId, startSeconds: 0 });
        } catch {
          /* ignore */
        }
      });
      if (musicNoteEl) musicNoteEl.textContent = `♪ ${s.title} · ${s.artist}`;
    }

    function playBgm(s) {
      if (!s?.youtubeId) return Promise.resolve(false);
      return ensureYtPlayer(s.youtubeId).then((p) => {
        if (!p || destroyed) return false;
        try {
          p.loadVideoById?.({ videoId: s.youtubeId, startSeconds: 0 });
          p.unMute?.();
          p.setVolume?.(100);
          p.playVideo?.();
          if (musicNoteEl) musicNoteEl.textContent = `Now playing · ${s.title}`;
          return true;
        } catch {
          return false;
        }
      });
    }

    function blip(freq, dur = 0.05, gain = 0.03) {
      try {
        if (!audioCtx) {
          const C = window.AudioContext || window.webkitAudioContext;
          if (!C) return;
          audioCtx = new C();
        }
        if (audioCtx.state === "suspended") audioCtx.resume();
        const t = audioCtx.currentTime;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "square";
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(t);
        o.stop(t + dur + 0.02);
      } catch {
        /* ignore */
      }
    }

    function sampleVideoMs() {
      const s = song();
      const offset = s.audioOffsetMs || 0;
      if (!ytPlayer?.getCurrentTime) return null;
      try {
        const state = ytPlayer.getPlayerState?.();
        // 1 = playing; keep last sample while buffering so chart doesn't jump
        if (state === 1) {
          return Math.max(0, ytPlayer.getCurrentTime() * 1000 - offset);
        }
        if (state === 3 /* buffering */ || state === 2 /* paused */) {
          return clockAnchorVideoMs;
        }
      } catch {
        /* ignore */
      }
      return null;
    }

    function nowMs() {
      if (useVideoClock) {
        const perf = performance.now();
        try {
          const state = ytPlayer?.getPlayerState?.();
          // Freeze the chart while buffering/paused so we don't drift off the beat
          if (state === 2 || state === 3) {
            return clockAnchorVideoMs;
          }
        } catch {
          /* ignore */
        }
        // Resample YouTube time ~8×/s — API is coarse; interpolate between samples
        if (perf - lastVideoSamplePerf > 120) {
          const v = sampleVideoMs();
          if (v != null) {
            clockAnchorVideoMs = v;
            clockAnchorPerf = perf;
            lastVideoSamplePerf = perf;
          }
        }
        return Math.max(0, clockAnchorVideoMs + (perf - clockAnchorPerf));
      }
      return Math.max(0, performance.now() - t0);
    }

    function spawnNote(panel, hitTime) {
      const key = `${hitTime}-${panel}`;
      if (active.has(key)) return;
      active.set(key, { t: hitTime, panel, key });
      // Marker progress is applied every frame via syncPanelMarker
    }

    function registerMiss(n) {
      if (!running || submitted) return;
      if (!active.has(n.key)) return;
      counts.miss += 1;
      missEl.textContent = String(counts.miss);
      combo = 0;
      comboEl.textContent = "0";
      active.delete(n.key);
      setCellJudge(n.panel, "MISS", "miss");
      global.ArcadeSFX?.foul?.() || global.ArcadeSFX?.tick?.();
      blip(120, 0.05, 0.025);
      // Misses never fail the chart
    }

    function flashEmptyTap(i) {
      const el = cells[i];
      if (!el || performance.now() < judgeUntil[i]) return;
      el.classList.add("is-miss");
      if (emptyTapTimers[i]) clearTimeout(emptyTapTimers[i]);
      emptyTapTimers[i] = setTimeout(() => {
        el.classList.remove("is-miss");
        emptyTapTimers[i] = null;
      }, EMPTY_TAP_MS);
    }

    function onPanel(i) {
      global.ArcadeSFX?.unlock?.();
      if (!running) {
        start();
        return;
      }
      const t = nowMs();
      let best = null;
      let bestErr = Infinity;
      for (const n of active.values()) {
        if (n.panel !== i) continue;
        const err = Math.abs(t - n.t);
        if (err < bestErr) {
          bestErr = err;
          best = n;
        }
      }
      if (!best || bestErr > WIN.good) {
        flashEmptyTap(i);
        global.ArcadeSFX?.tick?.();
        return;
      }

      let label = "GOOD";
      let cls = "good";
      let pts = 100;
      if (bestErr <= WIN.excellent) {
        label = "EXCELLENT";
        cls = "excellent";
        pts = 1000 + Math.min(200, combo * 3);
        counts.excellent += 1;
        blip(880 + (i % 4) * 40, 0.04, 0.03);
        global.ArcadeSFX?.match?.() || global.ArcadeSFX?.go?.();
      } else if (bestErr <= WIN.great) {
        label = "GREAT";
        cls = "great";
        pts = 700 + Math.min(120, combo * 2);
        counts.great += 1;
        blip(660, 0.04, 0.028);
        global.ArcadeSFX?.click?.();
      } else {
        counts.good += 1;
        blip(440, 0.04, 0.025);
        global.ArcadeSFX?.tick?.();
      }

      combo += 1;
      if (combo > bestCombo) bestCombo = combo;
      score += pts;
      scoreEl.textContent = String(score);
      comboEl.textContent = String(combo);
      excEl.textContent = String(counts.excellent);
      active.delete(best.key);
      setCellJudge(i, label, cls);
    }

    function finish() {
      if (submitted) return;
      submitted = true;
      running = false;
      cancelAnimationFrame(raf);
      stopBgm();
      active.clear();
      clearPanels();
      startBtn.disabled = false;
      startBtn.textContent = "Play again";
      paintSongs();
      const s = song();
      const total = counts.excellent + counts.great + counts.good + counts.miss;
      const excRate = total ? Math.round((counts.excellent / total) * 100) : 0;
      hintEl.textContent = `${s.title} cleared · ${score} pts · EXC ${counts.excellent} · MISS ${counts.miss} · ${excRate}% EXC · max combo ${bestCombo}`;
      if (musicNoteEl) musicNoteEl.textContent = `♪ ${s.title} finished`;
      onScore?.({
        score,
        meta: {
          song: s.id,
          difficulty: "EXTREME",
          excellent: counts.excellent,
          great: counts.great,
          good: counts.good,
          miss: counts.miss,
          bestCombo,
          cleared: true,
        },
      });
    }

    function frame() {
      if (!running || submitted) return;
      const t = nowMs();
      const s = song();
      const chart = chartFor(s);
      const duration = chart.length ? chart[chart.length - 1].t + 800 : 1000;

      // Spawn exactly approachMs before hit so every marker gets a full load
      while (chartIndex < chart.length && chart[chartIndex].t <= t + approachMs) {
        const n = chart[chartIndex++];
        n.panels.forEach((p) => spawnNote(p, n.t));
      }

      for (const n of [...active.values()]) {
        if (!running || submitted) break;
        if (t - n.t > WIN.good) registerMiss(n);
      }

      // One consistent progress owner per panel (soonest note)
      syncAllMarkers(t);

      if (progEl) progEl.style.width = `${Math.min(100, (t / duration) * 100)}%`;

      if (chartIndex >= chart.length && active.size === 0 && t > duration) {
        finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function beginChartClock(fromVideo) {
      if (clockStarted || !running || destroyed) return;
      clockStarted = true;
      const perf = performance.now();
      t0 = perf;
      useVideoClock = !!fromVideo;
      clockAnchorVideoMs = 0;
      clockAnchorPerf = perf;
      lastVideoSamplePerf = perf;
      if (useVideoClock) {
        const v = sampleVideoMs();
        if (v != null) {
          clockAnchorVideoMs = v;
        }
      }
      raf = requestAnimationFrame(frame);
    }

    /**
     * Wait until the YT player is actually playing, then lock the chart clock
     * to video time so shutters close on the beat.
     */
    function waitForPlaybackThenStart(deadlineMs) {
      const deadline = performance.now() + deadlineMs;
      const poll = () => {
        if (!running || destroyed || clockStarted) return;
        try {
          const state = ytPlayer?.getPlayerState?.();
          if (state === 1) {
            beginChartClock(true);
            return;
          }
        } catch {
          /* ignore */
        }
        if (performance.now() >= deadline) {
          // Fallback: local clock if YT never reports playing
          beginChartClock(false);
          return;
        }
        setTimeout(poll, 50);
      };
      poll();
    }

    function warmPanelMedia() {
      Object.values(PANEL_ART).forEach((src) => {
        const img = new Image();
        img.src = src;
      });
    }

    function start() {
      cancelAnimationFrame(raf);
      clearPanels();
      stopBgm();
      const s = song();
      chart = chartFor(s);
      chartIndex = 0;
      running = true;
      clockStarted = false;
      useVideoClock = false;
      submitted = false;
      score = 0;
      combo = 0;
      bestCombo = 0;
      counts = { excellent: 0, great: 0, good: 0, miss: 0 };
      scoreEl.textContent = "0";
      comboEl.textContent = "0";
      excEl.textContent = "0";
      missEl.textContent = "0";
      if (progEl) progEl.style.width = "0%";
      startBtn.disabled = true;
      startBtn.textContent = "Playing…";
      paintSongs();
      warmPanelMedia();
      const mins = Math.round((s.durationSec || 100) / 6) / 10;
      const noteCount = chart.reduce((n, ev) => n + ev.panels.length, 0);
      hintEl.textContent = `${s.title} · EXT ${s.level} · ${s.bpm} BPM · ~${mins} min · ${noteCount} hits · follow the beat`;
      global.ArcadeSFX?.go?.() || global.ArcadeSFX?.click?.();
      // Count-in blips on the song's beat grid
      const beatMs = 60000 / s.bpm;
      blip(523, 0.07, 0.035);
      setTimeout(() => blip(523, 0.07, 0.035), beatMs);
      setTimeout(() => blip(659, 0.07, 0.035), beatMs * 2);
      setTimeout(() => blip(784, 0.09, 0.04), beatMs * 3);

      playBgm(s).then((ok) => {
        if (!running || destroyed || clockStarted) return;
        if (ok) {
          // Chart starts when audio is audible — stays locked to YT time
          waitForPlaybackThenStart(4000);
        } else {
          // No video: count-in then local clock
          setTimeout(() => beginChartClock(false), Math.round(beatMs * 4));
        }
      });
      // Absolute fallback so a hung YT API never soft-locks the board
      setTimeout(() => {
        if (running && !clockStarted && !destroyed) beginChartClock(false);
      }, 5000);
    }

    startBtn.addEventListener("click", start);

    function onKey(e) {
      if (!running && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        start();
        return;
      }
      if (!running) return;
      const map = {
        "1": 0,
        "2": 1,
        "3": 2,
        "4": 3,
        q: 4,
        w: 5,
        e: 6,
        r: 7,
        a: 8,
        s: 9,
        d: 10,
        f: 11,
        z: 12,
        x: 13,
        c: 14,
        v: 15,
      };
      const k = e.key.toLowerCase();
      if (map[k] != null) {
        e.preventDefault();
        onPanel(map[k]);
      }
    }
    window.addEventListener("keydown", onKey);

    paintSongs();
    paintMeta();
    cuePreview(song());

    return {
      destroy() {
        destroyed = true;
        running = false;
        cancelAnimationFrame(raf);
        clearPanels();
        stopBgm();
        window.removeEventListener("keydown", onKey);
        try {
          ytPlayer?.destroy?.();
        } catch {
          /* ignore */
        }
        ytPlayer = null;
        try {
          audioCtx?.close?.();
        } catch {
          /* ignore */
        }
        root.innerHTML = "";
      },
    };
  }

  global.GameJubeat = { mount };
})(window);
