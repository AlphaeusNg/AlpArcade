/**
 * Pulse Grid — jubeat-style 4×4 with classic Shutter marker.
 * All panels share one Panel class so approach, hit windows, and miss
 * timing stay identical across the grid. Local audio (no YouTube).
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
  const PANEL_VID = {
    excellent: "assets/jubeat/panel-excellent.mp4",
    great: "assets/jubeat/panel-great.mp4",
    good: "assets/jubeat/panel-good.mp4",
  };
  const JUDGE_CLASSES = ["is-judge-excellent", "is-judge-great", "is-judge-good", "is-judge-miss"];
  const AUDIO_BASE = "assets/jubeat/audio/";

  function note(t, panels) {
    return { t, panels: Array.isArray(panels) ? panels : [panels] };
  }

  /**
   * Panel map:
   *  0  1  2  3
   *  4  5  6  7
   *  8  9 10 11
   * 12 13 14 15
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

  /**
   * Single panel controller — every cell uses the same class so approach
   * speed, judge windows, and miss timing are identical.
   */
  class Panel {
    constructor(index, el, onTap) {
      this.index = index;
      this.el = el;
      this.vid = el.querySelector(".jb-cell-vid");
      this.judgeEl = el.querySelector(".jb-cell-judge");
      this.judgeUntil = 0;
      this.judgeTimer = null;
      this.emptyTimer = null;
      /** @type {{ t: number, key: string }[]} notes waiting on this panel */
      this.queue = [];
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        onTap(index);
      });
    }

    /** Spawning / active notes on this panel only. */
    addNote(hitTime, key) {
      if (this.queue.some((n) => n.key === key)) return;
      this.queue.push({ t: hitTime, key });
      this.queue.sort((a, b) => a.t - b.t);
    }

    removeNote(key) {
      this.queue = this.queue.filter((n) => n.key !== key);
    }

    soonest() {
      return this.queue[0] || null;
    }

    /** Best note within judge window at time t (shared WIN windows). */
    bestInWindow(t) {
      let best = null;
      let bestErr = Infinity;
      for (const n of this.queue) {
        const err = Math.abs(t - n.t);
        if (err < bestErr) {
          bestErr = err;
          best = n;
        }
      }
      if (!best || bestErr > WIN.good) return null;
      return { note: best, err: bestErr };
    }

    /** Expire notes past good window → miss. */
    expireMisses(t, onMiss) {
      const late = this.queue.filter((n) => t - n.t > WIN.good);
      for (const n of late) {
        this.removeNote(n.key);
        onMiss(n);
      }
    }

    /**
     * Drive shutter from absolute chart time so every note loads in exactly
     * APPROACH_MS. Only the soonest note owns the marker.
     */
    syncMarker(t) {
      if (performance.now() < this.judgeUntil) return;
      const soonest = this.soonest();
      if (!soonest) {
        this.el.classList.remove("is-approach", "is-armed");
        this.el.style.setProperty("--jb-p", "0");
        return;
      }
      const start = soonest.t - APPROACH_MS;
      const p = Math.max(0, Math.min(1, (t - start) / APPROACH_MS));
      this.el.classList.add("is-approach", "is-armed");
      this.el.style.setProperty("--jb-p", p.toFixed(4));
    }

    stopVid() {
      const vid = this.vid;
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

    clearJudgeVisual() {
      JUDGE_CLASSES.forEach((c) => this.el.classList.remove(c));
      this.el.classList.remove("is-miss", "is-hit");
      if (this.judgeEl) {
        this.judgeEl.hidden = true;
        this.judgeEl.textContent = "";
        this.judgeEl.className = "jb-cell-judge";
      }
      this.stopVid();
      this.judgeUntil = 0;
      if (this.judgeTimer) {
        clearTimeout(this.judgeTimer);
        this.judgeTimer = null;
      }
    }

    setJudge(text, cls, nowMsFn) {
      const key =
        cls === "excellent" || cls === "great" || cls === "good" || cls === "miss" ? cls : "miss";
      const holdMs = JUDGE_MS[key] ?? JUDGE_MS.good;

      if (this.judgeTimer) clearTimeout(this.judgeTimer);
      this.stopVid();
      JUDGE_CLASSES.forEach((c) => this.el.classList.remove(c));
      this.el.classList.remove("is-miss", "is-hit");
      this.el.classList.add(`is-judge-${key}`);
      this.el.classList.remove("is-approach", "is-armed");
      this.el.style.setProperty("--jb-p", "0");
      this.judgeUntil = performance.now() + holdMs;

      if (this.judgeEl) {
        this.judgeEl.hidden = false;
        this.judgeEl.textContent = text;
        this.judgeEl.className = "jb-cell-judge";
        void this.judgeEl.offsetWidth;
        this.judgeEl.className = "jb-cell-judge " + (cls || "");
      }

      if (this.vid && PANEL_VID[key] && key !== "miss") {
        try {
          if (this.vid.getAttribute("src") !== PANEL_VID[key]) this.vid.src = PANEL_VID[key];
          this.vid.currentTime = 0;
          this.vid.classList.add("is-playing");
          const p = this.vid.play();
          if (p?.catch) p.catch(() => {});
        } catch {
          /* still image via CSS */
        }
      }

      this.judgeTimer = setTimeout(() => {
        this.clearJudgeVisual();
        this.syncMarker(nowMsFn());
      }, holdMs);
    }

    flashEmpty() {
      if (performance.now() < this.judgeUntil) return;
      this.el.classList.add("is-miss");
      if (this.emptyTimer) clearTimeout(this.emptyTimer);
      this.emptyTimer = setTimeout(() => {
        this.el.classList.remove("is-miss");
        this.emptyTimer = null;
      }, EMPTY_TAP_MS);
    }

    reset() {
      this.queue = [];
      this.clearJudgeVisual();
      if (this.emptyTimer) {
        clearTimeout(this.emptyTimer);
        this.emptyTimer = null;
      }
      this.el.classList.remove("is-armed", "is-hit", "is-miss", "is-approach", ...JUDGE_CLASSES);
      this.el.style.setProperty("--jb-p", "0");
    }

    destroy() {
      this.reset();
    }
  }

  function buildChart(song) {
    const bpm = song.bpm;
    const beatMs = 60000 / bpm;
    const durationSec = song.durationSec || 100;
    const chartStartBeat = song.chartStartBeat || 0;
    const totalBeats = Math.floor((durationSec * bpm) / 60) - chartStartBeat;
    const buckets = new Map();

    const add = (beatIndex, panels) => {
      if (beatIndex < 0 || beatIndex > totalBeats + 2) return;
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

    const stream = (start, end, path, step = 0.5, pathOffset = 0) => {
      let i = 0;
      for (let b = start; b < end - 0.001; b += step) {
        add(b, [path[(i + pathOffset) % path.length]]);
        i++;
      }
    };

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
          stream(base, base + 4, path2, 0.5, seed);
          add(base, seed % 2 === 0 ? P.corners : P.diag);
          add(base + 2, seed % 2 === 0 ? P.center : P.diagR);
          break;
        case "roll": {
          const useCol = seed % 2 === 0;
          for (let i = 0; i < 8; i++) {
            const lane = (seed + i) % 4;
            const cells = useCol ? P.cols[lane] : P.rows[lane];
            add(base + i * 0.5, [cells[i % 4], cells[(i + 2) % 4]]);
          }
          break;
        }
        case "peak":
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
          add(base, [P.center[seed % 4]]);
          break;
        default:
          add(base, [seed % 16]);
      }
    };

    const section = (startBar, endBar, phraseRoles) => {
      for (let m = startBar; m < endBar; m++) {
        const role = phraseRoles[m % phraseRoles.length];
        bar(m * 4, role, m);
      }
    };

    const lastBar = Math.max(4, Math.floor(totalBeats / 4) - 1);

    if (song.id === "imsosohappy") {
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
      section(0, 4, ["sparse", "quarters", "sparse", "quarters"]);
      section(4, 10, ["roll", "quarters", "roll", "rest"]);
      section(10, 20, ["roll", "chord", "roll", "bounce"]);
      section(20, 30, ["stream", "roll", "chord", "rest"]);
      section(30, Math.min(42, lastBar), ["peak", "roll", "peak", "chord"]);
      if (lastBar > 42) section(42, lastBar, ["roll", "stream", "bounce", "rest"]);
      for (let m = 8; m < lastBar; m += 8) {
        add(m * 4 + 1.5, P.diag.concat(P.diagR));
      }
      add(totalBeats - 1, P.corners);
      add(totalBeats, P.center);
    } else if (song.id === "flower") {
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
      section(0, 4, ["sparse", "quarters", "eighths", "rest"]);
      section(4, 12, ["bounce", "eighths", "bounce", "rest"]);
      section(12, 20, ["stream", "bounce", "stream", "chord"]);
      section(20, 28, ["peak", "stream", "bounce", "rest"]);
      section(28, Math.min(40, lastBar), ["peak", "peak", "stream", "chord"]);
      if (lastBar > 40) section(40, lastBar, ["bounce", "stream", "peak", "rest"]);
      for (let m = 4; m < lastBar; m += 4) {
        add(m * 4, [0, 3]);
        add(m * 4 + 2, [12, 15]);
      }
      add(totalBeats - 2, P.corners);
      add(totalBeats - 1, P.center);
      add(totalBeats, P.shuffle.slice(0, 8));
    }

    return [...buckets.entries()]
      .map(([t, set]) => note(t, [...set].sort((a, b) => a - b)))
      .sort((a, b) => a.t - b.t || a.panels[0] - b.panels[0]);
  }

  const SONGS = [
    {
      id: "imsosohappy",
      title: "I'm so Happy",
      artist: "Ryu☆",
      level: 9,
      bpm: 183,
      // Matched to assets/jubeat/audio/*.mp3 (ffprobe)
      durationSec: 248,
      audioOffsetMs: 0,
      color: "#f472b6",
      audio: AUDIO_BASE + "imsosohappy.mp3",
      notesHint: "beat chart",
    },
    {
      id: "albida",
      title: "Albida",
      artist: "DJ YOSHITAKA",
      level: 9,
      bpm: 185,
      durationSec: 116,
      audioOffsetMs: 0,
      color: "#38bdf8",
      audio: AUDIO_BASE + "albida.mp3",
      notesHint: "columns",
    },
    {
      id: "flower",
      title: "Flower",
      artist: "DJ YOSHITAKA",
      level: 8,
      bpm: 173,
      durationSec: 124,
      audioOffsetMs: 0,
      color: "#c084fc",
      audio: AUDIO_BASE + "flower.mp3",
      notesHint: "petals",
    },
    {
      id: "evans",
      title: "Evans",
      artist: "DJ YOSHITAKA",
      level: 9,
      bpm: 180,
      durationSec: 109,
      audioOffsetMs: 0,
      color: "#fbbf24",
      audio: AUDIO_BASE + "evans.mp3",
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
          <audio id="jb-audio" class="jb-audio" preload="metadata" controls playsinline></audio>
          <p class="jb-music-note mono" id="jb-music-note">Local BGM · hit when the shutter closes</p>
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
    const audioEl = root.querySelector("#jb-audio");

    /** @type {Panel[]} */
    const panels = [];
    for (let i = 0; i < CELLS; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "jb-cell";
      btn.dataset.i = String(i);
      btn.setAttribute("aria-label", `Panel ${i + 1}`);
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
      grid.appendChild(btn);
      panels.push(new Panel(i, btn, (idx) => onPanel(idx)));
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
    let audioCtx = null;
    let destroyed = false;
    let clockStarted = false;
    let useAudioClock = false;
    let clockAnchorAudioMs = 0;
    let clockAnchorPerf = 0;
    let lastAudioSamplePerf = 0;
    let audioSrc = "";

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
        <span class="jb-bgm">♪ Local BGM · Shutter</span>`;
      grid.style.setProperty("--jb-accent", s.color);
    }

    function stopBgm() {
      useAudioClock = false;
      try {
        audioEl?.pause();
        if (audioEl) audioEl.currentTime = 0;
      } catch {
        /* ignore */
      }
    }

    function loadAudio(src) {
      if (!audioEl || !src) return Promise.resolve(false);
      if (audioSrc === src && audioEl.readyState >= 2) return Promise.resolve(true);
      return new Promise((resolve) => {
        const onReady = () => {
          cleanup();
          resolve(true);
        };
        const onErr = () => {
          cleanup();
          resolve(false);
        };
        const cleanup = () => {
          audioEl.removeEventListener("canplaythrough", onReady);
          audioEl.removeEventListener("loadeddata", onReady);
          audioEl.removeEventListener("error", onErr);
        };
        audioEl.addEventListener("canplaythrough", onReady, { once: true });
        audioEl.addEventListener("loadeddata", onReady, { once: true });
        audioEl.addEventListener("error", onErr, { once: true });
        audioSrc = src;
        audioEl.src = src;
        audioEl.load();
        // Already buffered from a previous visit
        if (audioEl.readyState >= 2) {
          cleanup();
          resolve(true);
        }
      });
    }

    function cuePreview(s) {
      if (!s?.audio) return;
      loadAudio(s.audio).then((ok) => {
        if (musicNoteEl) {
          musicNoteEl.textContent = ok
            ? `♪ ${s.title} · ${s.artist} · ready`
            : `♪ ${s.title} · audio missing (chart still playable)`;
        }
      });
    }

    function playBgm(s) {
      if (!s?.audio || !audioEl) return Promise.resolve(false);
      return loadAudio(s.audio).then((ok) => {
        if (!ok || destroyed) return false;
        try {
          audioEl.currentTime = 0;
          audioEl.volume = 1;
          const p = audioEl.play();
          if (musicNoteEl) musicNoteEl.textContent = `Now playing · ${s.title}`;
          if (p?.then) return p.then(() => true).catch(() => false);
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

    function sampleAudioMs() {
      const s = song();
      const offset = s.audioOffsetMs || 0;
      if (!audioEl || !Number.isFinite(audioEl.currentTime)) return null;
      try {
        if (audioEl.paused && !audioEl.ended) return clockAnchorAudioMs;
        return Math.max(0, audioEl.currentTime * 1000 - offset);
      } catch {
        return null;
      }
    }

    function nowMs() {
      if (useAudioClock && audioEl) {
        const perf = performance.now();
        if (audioEl.paused && !audioEl.ended) {
          return clockAnchorAudioMs;
        }
        // Resample HTMLAudio ~10×/s; interpolate with performance.now between samples
        if (perf - lastAudioSamplePerf > 100) {
          const v = sampleAudioMs();
          if (v != null) {
            clockAnchorAudioMs = v;
            clockAnchorPerf = perf;
            lastAudioSamplePerf = perf;
          }
        }
        return Math.max(0, clockAnchorAudioMs + (perf - clockAnchorPerf));
      }
      return Math.max(0, performance.now() - t0);
    }

    function activeNoteCount() {
      let n = 0;
      for (const p of panels) n += p.queue.length;
      return n;
    }

    function registerMiss(n, panel) {
      if (!running || submitted) return;
      counts.miss += 1;
      missEl.textContent = String(counts.miss);
      combo = 0;
      comboEl.textContent = "0";
      panel.setJudge("MISS", "miss", nowMs);
      if (srJudgeEl) srJudgeEl.textContent = "MISS";
      global.ArcadeSFX?.foul?.() || global.ArcadeSFX?.tick?.();
      blip(120, 0.05, 0.025);
    }

    function onPanel(i) {
      global.ArcadeSFX?.unlock?.();
      if (!running) {
        start();
        return;
      }
      const panel = panels[i];
      if (!panel) return;
      const t = nowMs();
      const hit = panel.bestInWindow(t);
      if (!hit) {
        panel.flashEmpty();
        global.ArcadeSFX?.tick?.();
        return;
      }

      const { note: best, err: bestErr } = hit;
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
      panel.removeNote(best.key);
      panel.setJudge(label, cls, nowMs);
      if (srJudgeEl) srJudgeEl.textContent = label;
    }

    function finish() {
      if (submitted) return;
      submitted = true;
      running = false;
      cancelAnimationFrame(raf);
      stopBgm();
      panels.forEach((p) => p.reset());
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
      const ch = chartFor(s);
      const duration = ch.length ? ch[ch.length - 1].t + 800 : 1000;

      while (chartIndex < ch.length && ch[chartIndex].t <= t + APPROACH_MS) {
        const n = ch[chartIndex++];
        n.panels.forEach((p) => {
          const key = `${n.t}-${p}`;
          panels[p]?.addNote(n.t, key);
        });
      }

      for (const panel of panels) {
        if (!running || submitted) break;
        panel.expireMisses(t, (n) => registerMiss(n, panel));
        panel.syncMarker(t);
      }

      if (progEl) progEl.style.width = `${Math.min(100, (t / duration) * 100)}%`;

      if (chartIndex >= ch.length && activeNoteCount() === 0 && t > duration) {
        finish();
        return;
      }
      // End when audio finishes and notes are done
      if (
        useAudioClock &&
        audioEl &&
        audioEl.ended &&
        chartIndex >= ch.length &&
        activeNoteCount() === 0
      ) {
        finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function beginChartClock(fromAudio) {
      if (clockStarted || !running || destroyed) return;
      clockStarted = true;
      const perf = performance.now();
      t0 = perf;
      useAudioClock = !!fromAudio;
      clockAnchorAudioMs = 0;
      clockAnchorPerf = perf;
      lastAudioSamplePerf = perf;
      if (useAudioClock) {
        const v = sampleAudioMs();
        if (v != null) clockAnchorAudioMs = v;
      }
      raf = requestAnimationFrame(frame);
    }

    function waitForPlaybackThenStart(deadlineMs) {
      const deadline = performance.now() + deadlineMs;
      const poll = () => {
        if (!running || destroyed || clockStarted) return;
        try {
          if (audioEl && !audioEl.paused && audioEl.currentTime >= 0 && !audioEl.ended) {
            beginChartClock(true);
            return;
          }
        } catch {
          /* ignore */
        }
        if (performance.now() >= deadline) {
          beginChartClock(false);
          return;
        }
        setTimeout(poll, 40);
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
      panels.forEach((p) => p.reset());
      stopBgm();
      const s = song();
      chart = chartFor(s);
      chartIndex = 0;
      running = true;
      clockStarted = false;
      useAudioClock = false;
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
      const beatMs = 60000 / s.bpm;
      blip(523, 0.07, 0.035);
      setTimeout(() => blip(523, 0.07, 0.035), beatMs);
      setTimeout(() => blip(659, 0.07, 0.035), beatMs * 2);
      setTimeout(() => blip(784, 0.09, 0.04), beatMs * 3);

      playBgm(s).then((ok) => {
        if (!running || destroyed || clockStarted) return;
        if (ok) {
          waitForPlaybackThenStart(2500);
        } else {
          setTimeout(() => beginChartClock(false), Math.round(beatMs * 4));
        }
      });
      setTimeout(() => {
        if (running && !clockStarted && !destroyed) beginChartClock(false);
      }, 3500);
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
        panels.forEach((p) => p.destroy());
        stopBgm();
        window.removeEventListener("keydown", onKey);
        try {
          if (audioEl) {
            audioEl.pause();
            audioEl.removeAttribute("src");
            audioEl.load();
          }
        } catch {
          /* ignore */
        }
        try {
          audioCtx?.close?.();
        } catch {
          /* ignore */
        }
        root.innerHTML = "";
      },
    };
  }

  // Expose for tests / debug
  global.GameJubeat = {
    mount,
    Panel,
    WIN,
    APPROACH_MS,
    JUDGE_MS,
    SONGS,
    chartFor,
    buildChart,
  };
})(window);
