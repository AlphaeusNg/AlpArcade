/**
 * Pulse Grid — jubeat-style 4×4 with classic Shutter marker.
 * All panels share one Panel class so approach, hit windows, and miss
 * timing stay identical across the grid. Local audio (no YouTube).
 */
(function (global) {
  "use strict";

  const CELLS = 16;
  const MAX_SCORE = 1000000;
  const JUDGE_PROGRESS = { safeEarly: 0.5, good: 0.7, great: 0.9, excellent: 0.96, perfect: 1.04 };
  const MISS_AFTER_MS = 180;
  const SCORE_WEIGHT = { good: 0.4, great: 0.7, excellent: 1 };
  const DIFFICULTIES = {
    easy: {
      label: "EASY",
      shortLabel: "Easy practice",
      approachMs: 1400,
    },
    extreme: {
      label: "EXTREME",
      shortLabel: "Extreme",
      approachMs: 1000,
    },
  };
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
  const RESULT_AUDIO_BASE = AUDIO_BASE + "results/";
  const MARKER_MODES = [
    { id: "iris", label: "Iris" },
    { id: "flower", label: "Flower" },
    { id: "shutter", label: "Shutter" },
    { id: "ring", label: "Neon ring" },
    { id: "sweep", label: "Cross sweep" },
    { id: "stealth", label: "Stealth" },
  ];

  function note(t, panels) {
    return { t, panels: Array.isArray(panels) ? panels : [panels] };
  }

  function streakMultiplier(streak) {
    return 1 + Math.min(0.5, Math.floor(Math.max(0, streak - 1) / 5) * 0.05);
  }

  function createScoreTracker(chart) {
    const totalNotes = chart.reduce((sum, event) => sum + event.panels.length, 0);
    const perfectRaw = Array.from({ length: totalNotes }, (_, index) => streakMultiplier(index + 1)).reduce(
      (sum, value) => sum + value,
      0
    );
    let rawScore = 0;

    return {
      register(grade, streak) {
        rawScore += (SCORE_WEIGHT[grade] || 0) * streakMultiplier(streak);
        return this.score();
      },
      score() {
        if (!perfectRaw) return 0;
        return Math.min(MAX_SCORE, Math.round((rawScore / perfectRaw) * MAX_SCORE));
      },
      arcadePoints() {
        return Math.max(0, Math.round(this.score() / 10000));
      },
      totalNotes,
    };
  }

  function rankForScore(score) {
    if (score >= MAX_SCORE) return "EXC";
    if (score >= 980000) return "SSS";
    if (score >= 950000) return "SS";
    if (score >= 900000) return "S";
    if (score >= 800000) return "A";
    if (score >= 700000) return "B";
    if (score >= 600000) return "C";
    if (score >= 500000) return "D";
    return "FAIL";
  }

  function formatScore(score) {
    return Math.max(0, Math.round(Number(score) || 0)).toLocaleString();
  }

  function timingAccuracy(noteTime, time, approachMs) {
    if (!Number.isFinite(noteTime) || !Number.isFinite(time) || !approachMs) return 0;
    return Math.max(0, Math.min(100, 100 - (Math.abs(time - noteTime) / approachMs) * 100));
  }

  function setMarkerProgress(el, progress) {
    if (!el) return;
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    el.style.setProperty("--jb-p", p.toFixed(4));
    el.style.setProperty("--jb-door-size", `${(p * 50).toFixed(2)}%`);
    el.style.setProperty("--jb-iris-turn", `${(p * 12).toFixed(2)}deg`);
    el.style.setProperty("--jb-iris-scale", (0.15 + p * 0.95).toFixed(4));
    el.style.setProperty("--jb-marker-opacity", (0.25 + p * 0.75).toFixed(4));
    el.style.setProperty("--jb-touch-opacity", Math.max(0, (p - 0.5) / 0.5).toFixed(4));
    el.style.setProperty("--jb-touch-gap", `${((1 - p) * 2.8).toFixed(3)}em`);
    el.style.setProperty("--jb-ring-opacity", (0.28 + p * 0.72).toFixed(4));
    el.style.setProperty("--jb-ring-scale", (1.9 - p * 0.9).toFixed(4));
    el.style.setProperty("--jb-ring-turn", `${(p * 180).toFixed(2)}deg`);
    el.style.setProperty("--jb-sweep-position", `${(p * 50).toFixed(2)}%`);
    const flowerP = Math.max(0, Math.min(1, (p - 0.34) / 0.66));
    const flowerTurn = -24 + flowerP * 24;
    el.style.setProperty("--jb-flower-opacity", Math.min(1, flowerP * 1.8).toFixed(4));
    el.style.setProperty("--jb-flower-scale", (0.08 + flowerP * 0.92).toFixed(4));
    el.style.setProperty("--jb-flower-turn", `${(Math.abs(flowerTurn) < 0.005 ? 0 : flowerTurn).toFixed(2)}deg`);
    el.style.setProperty("--jb-flower-ring-scale", (0.35 + flowerP * 0.65).toFixed(4));
    el.style.setProperty("--jb-flower-touch-opacity", Math.max(0, (flowerP - 0.72) / 0.28).toFixed(4));
    el.style.setProperty("--jb-flower-core-scale", (0.2 + flowerP * 0.8).toFixed(4));
  }

  function judgeForTap(noteTime, time, approachMs) {
    const progress = (time - (noteTime - approachMs)) / approachMs;
    if (progress < JUDGE_PROGRESS.safeEarly) return { grade: "miss", label: "MISS", early: true, progress };
    if (progress < JUDGE_PROGRESS.good) return { grade: "good", label: "GOOD", progress };
    if (progress < JUDGE_PROGRESS.great) return { grade: "great", label: "GREAT", progress };
    if (progress < JUDGE_PROGRESS.excellent) return { grade: "excellent", label: "EXCELLENT", progress };
    if (progress <= JUDGE_PROGRESS.perfect) return { grade: "excellent", label: "EXCELLENT", perfect: true, progress };
    return { grade: "miss", label: "MISS", progress };
  }

  function markerLayersMarkup() {
    return `
      <span class="jb-shutter" aria-hidden="true">
        <span class="jb-door jb-door-n"></span>
        <span class="jb-door jb-door-s"></span>
        <span class="jb-door jb-door-e"></span>
        <span class="jb-door jb-door-w"></span>
        <span class="jb-iris">
          <span class="jb-blade" style="--blade-angle:0deg"></span>
          <span class="jb-blade" style="--blade-angle:60deg"></span>
          <span class="jb-blade" style="--blade-angle:120deg"></span>
          <span class="jb-blade" style="--blade-angle:180deg"></span>
          <span class="jb-blade" style="--blade-angle:240deg"></span>
          <span class="jb-blade" style="--blade-angle:300deg"></span>
        </span>
        <span class="jb-touch"><span class="jb-touch-a">TOUCH</span><span class="jb-touch-b">TOUCH</span></span>
      </span>
      <span class="jb-alt-marker" aria-hidden="true">
        <span class="jb-ring-marker"></span>
        <span class="jb-sweep-line jb-sweep-top"></span>
        <span class="jb-sweep-line jb-sweep-bottom"></span>
        <span class="jb-sweep-line jb-sweep-left"></span>
        <span class="jb-sweep-line jb-sweep-right"></span>
      </span>
      <span class="jb-flower-marker" aria-hidden="true">
        <span class="jb-flower-guide jb-flower-guide-outer"></span>
        <span class="jb-flower-guide jb-flower-guide-inner"></span>
        <span class="jb-flower-head">
          <span class="jb-flower-leaf" style="--flower-angle:45deg"></span>
          <span class="jb-flower-leaf" style="--flower-angle:135deg"></span>
          <span class="jb-flower-leaf" style="--flower-angle:225deg"></span>
          <span class="jb-flower-leaf" style="--flower-angle:315deg"></span>
          <span class="jb-flower-petal is-pink" style="--flower-angle:0deg"></span>
          <span class="jb-flower-petal is-orange" style="--flower-angle:45deg"></span>
          <span class="jb-flower-petal is-white" style="--flower-angle:90deg"></span>
          <span class="jb-flower-petal is-pink" style="--flower-angle:135deg"></span>
          <span class="jb-flower-petal is-orange" style="--flower-angle:180deg"></span>
          <span class="jb-flower-petal is-white" style="--flower-angle:225deg"></span>
          <span class="jb-flower-petal is-pink" style="--flower-angle:270deg"></span>
          <span class="jb-flower-petal is-orange" style="--flower-angle:315deg"></span>
          <span class="jb-flower-core"></span>
        </span>
        <span class="jb-flower-touch">TOUCH</span>
      </span>
      <span class="jb-original-shutter" aria-hidden="true">
        <span class="jb-original-door jb-original-door-n"></span>
        <span class="jb-original-door jb-original-door-s"></span>
        <span class="jb-original-door jb-original-door-w"></span>
        <span class="jb-original-door jb-original-door-e"></span>
        <span class="jb-original-cross"></span>
        <span class="jb-original-touch">
          <span class="jb-original-touch-a">TOUCH</span>
          <span class="jb-original-touch-b">TOUCH</span>
        </span>
      </span>`;
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

    /** Judge the head of the queue — never credit a later overlapping note. */
    judgeTap(t, approachMs) {
      const head = this.queue[0];
      if (!head) return null;
      const judgment = judgeForTap(head.t, t, approachMs);
      return judgment ? { note: head, ...judgment } : null;
    }

    /** Expire untouched notes after the shutter closes. */
    expireMisses(t, onMiss) {
      const late = this.queue.filter((n) => t - n.t > MISS_AFTER_MS);
      for (const n of late) {
        this.removeNote(n.key);
        onMiss(n);
      }
    }

    /**
     * Drive shutter from absolute chart time so every note loads in exactly
     * its configured approach duration. Only the soonest note owns the marker.
     * Keep driving progress under a judge flash so dense streams stay readable.
     */
    syncMarker(t, approachMs = DIFFICULTIES.extreme.approachMs) {
      const soonest = this.soonest();
      if (!soonest) {
        if (performance.now() >= this.judgeUntil) {
          this.el.classList.remove("is-approach", "is-armed");
          setMarkerProgress(this.el, 0);
        }
        return;
      }
      const start = soonest.t - approachMs;
      const p = Math.max(0, Math.min(1, (t - start) / approachMs));
      this.el.classList.add("is-approach", "is-armed");
      setMarkerProgress(this.el, p);
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

    setJudge(text, cls, nowMsFn, approachMs) {
      const key =
        cls === "excellent" || cls === "great" || cls === "good" || cls === "miss" ? cls : "miss";
      const holdMs = JUDGE_MS[key] ?? JUDGE_MS.good;

      if (this.judgeTimer) clearTimeout(this.judgeTimer);
      this.stopVid();
      JUDGE_CLASSES.forEach((c) => this.el.classList.remove(c));
      this.el.classList.remove("is-miss", "is-hit");
      this.el.classList.add(`is-judge-${key}`);
      this.el.classList.remove("is-approach", "is-armed");
      setMarkerProgress(this.el, 0);
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
        this.syncMarker(nowMsFn(), approachMs);
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
      setMarkerProgress(this.el, 0);
    }

    destroy() {
      this.reset();
    }
  }

  function buildEasyChart(song) {
    const beatMs = 60000 / song.bpm;
    const chartStartBeat = song.chartStartBeat || 0;
    const totalBeats = Math.min(
      song.easyBeats || 96,
      Math.floor(((song.durationSec || 100) * song.bpm) / 60) - chartStartBeat
    );
    const buckets = new Map();
    const add = (beat, panels) => {
      if (beat < 0 || beat > totalBeats) return;
      const t = Math.round((beat + chartStartBeat) * beatMs);
      if (!buckets.has(t)) buckets.set(t, new Set());
      const set = buckets.get(t);
      (Array.isArray(panels) ? panels : [panels]).forEach((p) => set.add(p));
    };

    // A short, readable preview chart for each song. Every arrangement has a
    // different motion so practice teaches the grid instead of one loop.
    for (let base = 4, phrase = 0; base < totalBeats - 4; base += 8, phrase += 1) {
      if (song.id === "imsosohappy") {
        const path = phrase % 2 ? P.rows[phrase % 4] : P.snake;
        add(base, path[0]);
        add(base + 2, path[Math.min(2, path.length - 1)]);
        add(base + 4, path[Math.min(4, path.length - 1)]);
        add(base + 6, phrase % 3 === 2 ? P.center : path[Math.min(6, path.length - 1)]);
      } else if (song.id === "albida") {
        const col = P.cols[phrase % 4];
        add(base, col[0]);
        add(base + 2, col[1]);
        add(base + 4, col[2]);
        add(base + 6, phrase % 2 ? col[3] : [col[3], P.center[phrase % 4]]);
      } else if (song.id === "flower") {
        const ring = P.ring;
        const offset = (phrase * 2) % ring.length;
        add(base, ring[offset]);
        add(base + 2, ring[(offset + 2) % ring.length]);
        add(base + 4, ring[(offset + 4) % ring.length]);
        add(base + 6, phrase % 2 ? P.center : ring[(offset + 6) % ring.length]);
      } else {
        const diagonal = phrase % 2 ? P.diagR : P.diag;
        add(base, diagonal[0]);
        add(base + 2, diagonal[1]);
        add(base + 4, diagonal[2]);
        add(base + 6, phrase % 3 === 2 ? P.corners : diagonal[3]);
      }
    }
    add(totalBeats - 2, P.center);
    add(totalBeats, P.corners);
    return [...buckets.entries()]
      .map(([t, set]) => note(t, [...set].sort((a, b) => a - b)))
      .sort((a, b) => a.t - b.t || a.panels[0] - b.panels[0]);
  }

  function buildChart(song, difficultyId = "extreme") {
    if (difficultyId === "easy") return buildEasyChart(song);
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
        case "diagonal":
          add(base, P.diag);
          add(base + 1, P.diagR);
          add(base + 2, P.center);
          add(base + 3, P.corners);
          break;
        case "rowstep": {
          const row = P.rows[seed % 4];
          add(base, row[0]);
          add(base + 1, row[1]);
          add(base + 2, row[2]);
          add(base + 3, row[3]);
          break;
        }
        case "columnstep": {
          const col = P.cols[seed % 4];
          add(base, col[0]);
          add(base + 1, col[1]);
          add(base + 2, col[2]);
          add(base + 3, col[3]);
          break;
        }
        case "crossfire":
          add(base, [0, 15]);
          add(base + 1, [3, 12]);
          add(base + 2, [5, 10]);
          add(base + 3, [6, 9]);
          break;
        case "petal":
          add(base, [P.ring[seed % 8]]);
          add(base + 1, [P.ring[(seed + 2) % 8]]);
          add(base + 2, [P.ring[(seed + 4) % 8]]);
          add(base + 3, [P.ring[(seed + 6) % 8], P.center[seed % 4]]);
          break;
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
    } else if (song.id === "evans") {
      section(0, 4, ["diagonal", "quarters", "crossfire", "rest"]);
      section(4, 12, ["rowstep", "diagonal", "columnstep", "crossfire"]);
      section(12, 20, ["eighths", "crossfire", "stream", "diagonal"]);
      section(20, 28, ["columnstep", "peak", "rowstep", "crossfire"]);
      section(28, Math.min(40, lastBar), ["stream", "peak", "diagonal", "chord"]);
      if (lastBar > 40) section(40, lastBar, ["crossfire", "eighths", "rowstep", "rest"]);
      add(totalBeats - 2, P.diag.concat(P.diagR));
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
      easyLevel: 2,
      bpm: 183,
      // Chart length (s); audio file may be longer — chart stops when notes end
      durationSec: 105,
      // Intro silence trimmed so bar 0 ≈ first audible beat
      audioOffsetMs: 580,
      color: "#f472b6",
      audio: AUDIO_BASE + "imsosohappy.mp3",
      notesHint: "beat chart",
    },
    {
      id: "albida",
      title: "Albida",
      artist: "DJ YOSHITAKA",
      level: 9,
      easyLevel: 3,
      bpm: 185,
      durationSec: 116,
      audioOffsetMs: 890,
      color: "#38bdf8",
      audio: AUDIO_BASE + "albida.mp3",
      notesHint: "columns",
    },
    {
      id: "flower",
      title: "Flower",
      artist: "DJ YOSHITAKA",
      level: 8,
      easyLevel: 2,
      bpm: 173,
      durationSec: 124,
      audioOffsetMs: 390,
      color: "#c084fc",
      audio: AUDIO_BASE + "flower.mp3",
      notesHint: "petals",
    },
    {
      id: "evans",
      title: "Evans",
      artist: "DJ YOSHITAKA",
      level: 9,
      easyLevel: 3,
      bpm: 180,
      durationSec: 109,
      audioOffsetMs: 530,
      color: "#fbbf24",
      audio: AUDIO_BASE + "evans.mp3",
      notesHint: "shuffle",
    },
  ].map((s) => ({ ...s, charts: {} }));

  function chartFor(song, difficultyId = "extreme") {
    if (!song.charts[difficultyId]) song.charts[difficultyId] = buildChart(song, difficultyId);
    return song.charts[difficultyId];
  }

  function mount(root, { onScore }) {
    let songIndex = 0;
    let difficultyId = "easy";
    let markerId = "iris";

    root.innerHTML = `
      <div class="jubeat-wrap">
        <section class="jb-setup" id="jb-setup" aria-label="Pulse Grid setup">
          <header class="jb-select-header">
            <span>SELECT MUSIC</span>
            <strong id="jb-selection-title">${escapeHtml(SONGS[songIndex].title)}</strong>
          </header>
          <div class="jb-song-bar" id="jb-songs" role="tablist" aria-label="Pulse Grid songs"></div>
          <div class="jb-setup-controls">
            <section class="jb-setup-panel" aria-labelledby="jb-difficulty-label">
              <p class="jb-setup-label" id="jb-difficulty-label">DIFFICULTY</p>
              <div class="jb-difficulty" id="jb-difficulty" role="group" aria-label="Chart difficulty"></div>
            </section>
            <section class="jb-setup-panel jb-marker-lab" aria-labelledby="jb-marker-label">
              <p class="jb-setup-label" id="jb-marker-label">MARKER</p>
              <div class="jb-marker-mode" id="jb-marker-mode" role="group" aria-label="Shutter design"></div>
              <div class="jb-practice-row">
                <div class="jb-marker-practice jb-marker-surface" id="jb-marker-practice" data-marker="iris">
                  <button type="button" class="jb-cell jb-practice-cell is-approach is-armed" id="jb-practice-cell" aria-label="Practice selected marker">
                    <video class="jb-cell-vid" muted playsinline preload="none" aria-hidden="true"></video>
                    ${markerLayersMarkup()}
                    <span class="jb-cell-judge" hidden aria-hidden="true"></span>
                  </button>
                </div>
                <div class="jb-practice-feedback" aria-live="polite">
                  <span>PRACTICE</span>
                  <strong id="jb-practice-judge">TOUCH</strong>
                  <small id="jb-practice-accuracy">--%</small>
                </div>
              </div>
            </section>
          </div>
          <p class="game-hint jb-selection-hint" id="jb-selection-hint"></p>
          <div class="game-actions">
            <button type="button" class="btn primary" id="jb-start">Confirm song</button>
          </div>
        </section>
        <section class="jb-playfield" id="jb-playfield" hidden>
          <div class="game-hud">
            <div><span class="hud-label">Score</span><strong id="jb-score">0</strong></div>
            <div><span class="hud-label">Combo</span><strong id="jb-combo">0</strong></div>
            <div><span class="hud-label">EXC</span><strong id="jb-exc">0</strong></div>
            <div><span class="hud-label">Miss</span><strong id="jb-miss">0</strong></div>
          </div>
          <div class="jb-meta mono" id="jb-meta"></div>
          <div class="jb-stage">
            <div class="jb-grid jb-marker-surface" id="jb-grid" role="grid" aria-label="jubeat 4 by 4"></div>
            <div class="jb-sr-judge" id="jb-sr-judge" aria-live="polite"></div>
            <div class="jb-progress"><div class="jb-progress-fill" id="jb-progress"></div></div>
            <section class="jb-start-sequence" id="jb-start-sequence" hidden aria-live="assertive">
              <div class="jb-loading-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
              <p id="jb-start-sequence-label">LOADING</p>
              <strong id="jb-start-sequence-song"></strong>
            </section>
            <section class="jb-results" id="jb-results" hidden aria-live="polite" aria-label="Chart results">
              <p class="jb-results-kicker" id="jb-results-kicker">TRACK COMPLETE</p>
              <p class="jb-results-score" id="jb-results-score">0</p>
              <p class="jb-results-rank" id="jb-results-rank">RANK</p>
              <p class="jb-results-combo" id="jb-results-combo"></p>
              <div class="jb-results-accuracy">
                <span>ACCURACY</span>
                <strong id="jb-results-accuracy">0.0%</strong>
              </div>
              <div class="jb-accuracy-timeline" id="jb-accuracy-timeline" role="img" aria-label="Timing accuracy by note"></div>
              <p class="jb-results-stats" id="jb-results-stats"></p>
              <p class="jb-results-arcade" id="jb-results-arcade"></p>
              <button type="button" class="btn primary jb-results-continue" id="jb-results-continue" hidden>Continue</button>
            </section>
          </div>
          <p class="game-hint" id="jb-hint">1–4 QWER ASDF ZXCV</p>
        </section>
        <div class="jb-music" id="jb-music">
          <audio id="jb-audio" class="jb-audio" preload="auto" playsinline></audio>
          <audio id="jb-result-audio" class="jb-audio" preload="auto" playsinline></audio>
          <p class="jb-music-note mono" id="jb-music-note">Select a track</p>
        </div>
      </div>
    `;

    const setupEl = root.querySelector("#jb-setup");
    const playfieldEl = root.querySelector("#jb-playfield");
    const grid = root.querySelector("#jb-grid");
    const songsEl = root.querySelector("#jb-songs");
    const selectionTitleEl = root.querySelector("#jb-selection-title");
    const selectionHintEl = root.querySelector("#jb-selection-hint");
    const difficultyEl = root.querySelector("#jb-difficulty");
    const markerModeEl = root.querySelector("#jb-marker-mode");
    const markerPracticeEl = root.querySelector("#jb-marker-practice");
    const practiceCellEl = root.querySelector("#jb-practice-cell");
    const practiceJudgeEl = root.querySelector("#jb-practice-judge");
    const practiceAccuracyEl = root.querySelector("#jb-practice-accuracy");
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
    const startSequenceEl = root.querySelector("#jb-start-sequence");
    const startSequenceLabelEl = root.querySelector("#jb-start-sequence-label");
    const startSequenceSongEl = root.querySelector("#jb-start-sequence-song");
    const resultsEl = root.querySelector("#jb-results");
    const resultsScoreEl = root.querySelector("#jb-results-score");
    const resultsRankEl = root.querySelector("#jb-results-rank");
    const resultsComboEl = root.querySelector("#jb-results-combo");
    const resultsStatsEl = root.querySelector("#jb-results-stats");
    const resultsArcadeEl = root.querySelector("#jb-results-arcade");
    const resultsAccuracyEl = root.querySelector("#jb-results-accuracy");
    const accuracyTimelineEl = root.querySelector("#jb-accuracy-timeline");
    const resultsContinueBtn = root.querySelector("#jb-results-continue");
    const resultAudioEl = root.querySelector("#jb-result-audio");

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
        ${markerLayersMarkup()}
        <span class="jb-cell-judge" hidden aria-hidden="true"></span>`;
      grid.appendChild(btn);
      panels.push(new Panel(i, btn, (idx) => onPanel(idx)));
    }
    const practicePanel = new Panel(-1, practiceCellEl, practiceTap);
    setMarkerProgress(practiceCellEl, 0);

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
    let loadGen = 0;
    let countInTimers = [];
    let scoreTracker = null;
    let resultsOpen = false;
    let resultRaf = 0;
    let resultTimers = [];
    let announcementToken = 0;
    let accuracyTimeline = [];
    let accuracyByKey = new Map();
    let practiceRaf = 0;
    let practiceCycleStart = performance.now();

    function song() {
      return SONGS[songIndex];
    }

    function difficulty() {
      return DIFFICULTIES[difficultyId];
    }

    function controlsLocked() {
      return running || resultsOpen;
    }

    function clearCountIn() {
      countInTimers.forEach((id) => clearTimeout(id));
      countInTimers = [];
      if (startSequenceEl) {
        startSequenceEl.hidden = true;
        startSequenceEl.className = "jb-start-sequence";
      }
    }

    function duckLobbyMusic(on) {
      try {
        if (on) global.ArcadeMusic?.pause?.({ lock: true });
        else global.ArcadeMusic?.resume?.();
      } catch {
        /* ignore */
      }
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function restartPractice() {
      practicePanel.reset();
      practiceCycleStart = performance.now();
      practiceJudgeEl.textContent = "TOUCH";
      practiceJudgeEl.removeAttribute("data-grade");
      practiceJudgeEl.classList.remove("is-centered");
      practiceAccuracyEl.textContent = "--%";
    }

    function paintSongs() {
      songsEl.innerHTML = SONGS.map(
        (s, i) => `
        <button type="button" role="tab" aria-selected="${i === songIndex}" class="jb-song-chip${i === songIndex ? " is-active" : ""}" data-s="${i}" ${controlsLocked() ? "disabled" : ""} style="--sc:${s.color}">
          <span class="jb-song-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <strong>${escapeHtml(s.title)}</strong>
          <small>${escapeHtml(s.artist)}</small>
          <em>${difficultyId === "easy" ? `EASY ${s.easyLevel}` : `EXT ${s.level}`} · ${s.bpm} BPM</em>
        </button>`
      ).join("");
      songsEl.querySelectorAll("[data-s]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (controlsLocked()) return;
          songIndex = Number(btn.dataset.s);
          paintSongs();
          paintMeta();
          cuePreview(song(), true);
          global.ArcadeSFX?.click?.();
        });
      });
    }

    function paintDifficulty() {
      difficultyEl.innerHTML = Object.entries(DIFFICULTIES)
        .map(
          ([id, diff]) =>
            `<button type="button" class="jb-difficulty-btn${id === difficultyId ? " is-active" : ""}" data-difficulty="${id}" aria-pressed="${id === difficultyId}" ${controlsLocked() ? "disabled" : ""}>${diff.label}</button>`
        )
        .join("");
      difficultyEl.querySelectorAll("[data-difficulty]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (controlsLocked()) return;
          difficultyId = btn.dataset.difficulty;
          restartPractice();
          paintDifficulty();
          paintSongs();
          paintMeta();
          global.ArcadeSFX?.click?.();
        });
      });
    }

    function paintMarkerModes() {
      markerModeEl.innerHTML = MARKER_MODES.map(
        (marker) =>
          `<button type="button" class="jb-marker-btn${marker.id === markerId ? " is-active" : ""}" data-marker="${marker.id}" aria-pressed="${marker.id === markerId}" ${controlsLocked() ? "disabled" : ""}>${marker.label}</button>`
      ).join("");
      markerModeEl.querySelectorAll("[data-marker]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (controlsLocked()) return;
          markerId = btn.dataset.marker;
          grid.dataset.marker = markerId;
          markerPracticeEl.dataset.marker = markerId;
          restartPractice();
          paintMarkerModes();
          paintMeta();
          global.ArcadeSFX?.click?.();
        });
      });
      grid.dataset.marker = markerId;
      markerPracticeEl.dataset.marker = markerId;
    }

    function paintMeta() {
      const s = song();
      const diff = difficulty();
      const level = difficultyId === "easy" ? s.easyLevel : s.level;
      selectionTitleEl.textContent = s.title;
      selectionTitleEl.style.color = s.color;
      selectionHintEl.textContent = `${s.artist} · ${diff.label} ${level} · ${s.bpm} BPM · ${s.notesHint}`;
      metaEl.innerHTML = `<span style="color:${s.color}">${escapeHtml(s.title)}</span>
        <span class="jb-diff ${difficultyId}">${diff.label} ${level}</span>
        <span>${escapeHtml(s.artist)}</span>
        <span>${s.bpm} BPM</span>
        <span class="jb-bgm">♪ Local BGM · ${escapeHtml(MARKER_MODES.find((m) => m.id === markerId)?.label || "Iris")}</span>`;
      grid.style.setProperty("--jb-accent", s.color);
      playfieldEl.style.setProperty("--jb-accent", s.color);
    }

    function practiceProgress(now = performance.now()) {
      const approachMs = difficulty().approachMs;
      const cycleMs = approachMs + 420;
      const elapsed = Math.max(0, now - practiceCycleStart) % cycleMs;
      return elapsed <= approachMs ? elapsed / approachMs : null;
    }

    function animatePractice(now) {
      if (destroyed) return;
      const progress = practiceProgress(now);
      const showingJudge = now < practicePanel.judgeUntil;
      if (!running && !resultsOpen && !setupEl.hidden && !showingJudge && progress != null) {
        practiceCellEl.classList.add("is-approach", "is-armed");
        setMarkerProgress(practiceCellEl, progress);
      } else {
        practiceCellEl.classList.remove("is-approach", "is-armed");
        setMarkerProgress(practiceCellEl, 0);
      }
      practiceRaf = requestAnimationFrame(animatePractice);
    }

    function practiceTap() {
      if (controlsLocked() || setupEl.hidden) return;
      global.ArcadeSFX?.unlock?.();
      const now = performance.now();
      if (now < practicePanel.judgeUntil) return;
      const progress = practiceProgress(now);
      const approachMs = difficulty().approachMs;
      const judgment =
        progress == null
          ? { grade: "miss", label: "MISS" }
          : judgeForTap(approachMs, progress * approachMs, approachMs);
      const accuracy =
        progress == null ? 0 : timingAccuracy(approachMs, progress * approachMs, approachMs);
      practiceJudgeEl.textContent = judgment.label;
      practiceJudgeEl.dataset.grade = judgment.grade;
      practiceJudgeEl.classList.toggle("is-centered", !!judgment.perfect);
      practiceAccuracyEl.textContent = `${accuracy.toFixed(1)}%`;
      practicePanel.setJudge(judgment.label, judgment.grade, () => 0, approachMs);
      practiceCycleStart = now + (JUDGE_MS[judgment.grade] || JUDGE_MS.good) + 120;
      if (judgment.grade === "miss") global.ArcadeSFX?.foul?.() || global.ArcadeSFX?.tick?.();
      else {
        blip(judgment.perfect ? 1040 : judgment.grade === "excellent" ? 880 : judgment.grade === "great" ? 660 : 440);
        global.ArcadeSFX?.match?.() || global.ArcadeSFX?.click?.();
      }
    }

    function stopBgm() {
      useAudioClock = false;
      try {
        audioEl?.pause();
        if (audioEl) {
          audioEl.currentTime = 0;
          audioEl.loop = false;
          audioEl.volume = 1;
        }
      } catch {
        /* ignore */
      }
    }

    function startPostGameLoop(s) {
      useAudioClock = false;
      if (!audioEl || !s?.audio) return;
      const begin = () => {
        if (destroyed || !resultsOpen) return;
        try {
          audioEl.loop = true;
          audioEl.volume = 0.32;
          if (audioEl.ended || audioEl.paused) {
            audioEl.currentTime = Math.max(0, (s.audioOffsetMs || 0) / 1000);
            audioEl.play()?.catch?.(() => {});
          }
          if (musicNoteEl) musicNoteEl.textContent = `Post-game loop · ${s.title}`;
        } catch {
          /* result screen remains usable if background audio cannot resume */
        }
      };
      if (audioSrc === s.audio && audioEl.readyState >= 1) begin();
      else loadAudio(s.audio).then((ok) => ok && begin());
    }

    function stopResultAudio() {
      announcementToken += 1;
      try {
        if (resultAudioEl) {
          resultAudioEl.onended = null;
          resultAudioEl.onerror = null;
          resultAudioEl.pause();
          resultAudioEl.removeAttribute("src");
          resultAudioEl.load();
        }
      } catch {
        /* ignore */
      }
    }

    function primeResultAudio() {
      if (!resultAudioEl || global.ArcadeSFX?.isMuted?.()) return;
      try {
        resultAudioEl.src = RESULT_AUDIO_BASE + "final-a.mp4";
        resultAudioEl.muted = false;
        resultAudioEl.volume = 0;
        const ready = resultAudioEl.play();
        ready
          ?.then?.(() => {
            resultAudioEl.pause();
            resultAudioEl.currentTime = 0;
            resultAudioEl.volume = 1;
          })
          ?.catch?.(() => {
            resultAudioEl.volume = 1;
          });
      } catch {
        resultAudioEl.volume = 1;
      }
    }

    function loadAudio(src) {
      if (!audioEl || !src) return Promise.resolve(false);
      if (audioSrc === src && audioEl.readyState >= 2) return Promise.resolve(true);
      const gen = ++loadGen;
      return new Promise((resolve) => {
        let settled = false;
        const finish = (ok) => {
          if (settled || gen !== loadGen) {
            if (!settled && gen !== loadGen) {
              settled = true;
              resolve(false); // superseded load
            }
            return;
          }
          settled = true;
          cleanup();
          resolve(ok);
        };
        const onReady = () => finish(true);
        const onErr = () => finish(false);
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
        if (audioEl.readyState >= 2) {
          finish(true);
        }
        // Always settle within 4s (fail closed if still empty)
        setTimeout(() => {
          if (settled || gen !== loadGen) {
            if (!settled) finish(false);
            return;
          }
          finish(audioEl.readyState >= 1);
        }, 4000);
      });
    }

    function cuePreview(s, autoplay = false) {
      if (!s?.audio) return;
      loadAudio(s.audio).then((ok) => {
        if (ok && autoplay && !destroyed && !controlsLocked() && !setupEl.hidden) {
          try {
            duckLobbyMusic(true);
            audioEl.loop = true;
            audioEl.volume = 0.52;
            audioEl.currentTime = Math.max(0, (s.audioOffsetMs || 0) / 1000);
            audioEl.play()?.catch?.(() => {
              duckLobbyMusic(false);
            });
          } catch {
            duckLobbyMusic(false);
          }
        } else if (!ok && autoplay) {
          duckLobbyMusic(false);
        }
        if (musicNoteEl) {
          musicNoteEl.textContent = ok
            ? autoplay
              ? `Preview · ${s.title} · ${s.artist}`
              : `${s.title} · ${s.artist} · ready`
            : `♪ ${s.title} · audio missing (chart still playable)`;
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

    function songOffsetMs() {
      return song().audioOffsetMs || 0;
    }

    /**
     * Chart time origin = first audible beat (after audioOffsetMs).
     * Hold at 0 during intro silence — never interpolate past 0 while still in intro.
     */
    function sampleAudioMs() {
      const offset = songOffsetMs();
      if (!audioEl || !Number.isFinite(audioEl.currentTime)) return null;
      try {
        if (audioEl.ended) {
          return Math.max(0, (audioEl.duration || audioEl.currentTime) * 1000 - offset);
        }
        if (audioEl.paused) return clockAnchorAudioMs;
        const raw = audioEl.currentTime * 1000;
        if (raw < offset) return 0; // intro hold
        return raw - offset;
      } catch {
        return null;
      }
    }

    function nowMs() {
      if (useAudioClock && audioEl) {
        const perf = performance.now();
        // Track ended: keep advancing with performance.now so late notes can miss/finish
        if (audioEl.ended) {
          return Math.max(0, clockAnchorAudioMs + (perf - clockAnchorPerf));
        }
        if (audioEl.paused) {
          return clockAnchorAudioMs;
        }
        // Intro silence: hard hold at 0 (no perf interpolation thrash)
        try {
          if (audioEl.currentTime * 1000 < songOffsetMs()) {
            clockAnchorAudioMs = 0;
            clockAnchorPerf = perf;
            lastAudioSamplePerf = perf;
            return 0;
          }
        } catch {
          /* ignore */
        }
        // Resample HTMLAudio ~10×/s; interpolate with performance.now between samples
        if (perf - lastAudioSamplePerf > 100) {
          const v = sampleAudioMs();
          if (v != null) {
            // Soft catch-up: never jump backward more than a small amount
            if (v + 40 < clockAnchorAudioMs + (perf - clockAnchorPerf)) {
              // buffer underrun recovery — re-anchor without large rewind
              clockAnchorAudioMs = Math.max(v, clockAnchorAudioMs + (perf - clockAnchorPerf) - 80);
            } else {
              clockAnchorAudioMs = v;
            }
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

    function resetAccuracyTimeline(events) {
      accuracyTimeline = [];
      accuracyByKey = new Map();
      events.forEach((event) => {
        event.panels.forEach((panel) => {
          const key = `${event.t}-${panel}`;
          const entry = { key, noteTime: event.t, panel, grade: null, accuracy: null, deltaMs: null };
          accuracyTimeline.push(entry);
          accuracyByKey.set(key, entry);
        });
      });
    }

    function recordAccuracy(n, grade, tapTime = null) {
      const entry = accuracyByKey.get(n?.key);
      if (!entry || entry.grade != null) return;
      entry.grade = grade;
      entry.deltaMs = Number.isFinite(tapTime) ? Math.round(tapTime - n.t) : null;
      entry.accuracy = Number.isFinite(tapTime)
        ? timingAccuracy(n.t, tapTime, difficulty().approachMs)
        : 0;
    }

    function overallAccuracy() {
      if (!accuracyTimeline.length) return 0;
      const total = accuracyTimeline.reduce((sum, entry) => sum + (entry.accuracy ?? 0), 0);
      return total / accuracyTimeline.length;
    }

    function renderAccuracyTimeline() {
      if (!accuracyTimelineEl) return;
      const fragment = document.createDocumentFragment();
      accuracyTimeline.forEach((entry, index) => {
        const box = document.createElement("span");
        const accuracy = entry.accuracy ?? 0;
        box.className = `jb-accuracy-box is-${entry.grade || "miss"}`;
        box.style.opacity = String(0.38 + accuracy * 0.0062);
        box.title = `Note ${index + 1}: ${accuracy.toFixed(1)}%${
          entry.deltaMs == null ? " · missed" : ` · ${entry.deltaMs > 0 ? "+" : ""}${entry.deltaMs} ms`
        }`;
        box.setAttribute("aria-hidden", "true");
        fragment.appendChild(box);
      });
      accuracyTimelineEl.replaceChildren(fragment);
      accuracyTimelineEl.setAttribute(
        "aria-label",
        `${overallAccuracy().toFixed(1)} percent timing accuracy across ${accuracyTimeline.length} notes`
      );
    }

    function registerMiss(n, panel, tapTime = null) {
      if (!running || submitted) return;
      recordAccuracy(n, "miss", tapTime);
      counts.miss += 1;
      missEl.textContent = String(counts.miss);
      combo = 0;
      comboEl.textContent = "0";
      panel.setJudge("MISS", "miss", nowMs, difficulty().approachMs);
      if (srJudgeEl) srJudgeEl.textContent = "MISS";
      global.ArcadeSFX?.foul?.() || global.ArcadeSFX?.tick?.();
      blip(120, 0.05, 0.025);
    }

    function onPanel(i) {
      global.ArcadeSFX?.unlock?.();
      if (!running || !clockStarted) return;
      const panel = panels[i];
      if (!panel) return;
      const t = nowMs();
      const diff = difficulty();
      const judgment = panel.judgeTap(t, diff.approachMs);
      if (!judgment) {
        // Truly empty panels stay harmless; an armed early note is judged MISS.
        panel.flashEmpty();
        global.ArcadeSFX?.tick?.();
        return;
      }

      const { note: best, grade, label, perfect } = judgment;
      if (grade === "miss") {
        panel.removeNote(best.key);
        registerMiss(best, panel, t);
        return;
      }

      if (grade === "excellent") {
        counts.excellent += 1;
        blip(perfect ? 1040 + (i % 4) * 40 : 880 + (i % 4) * 40, 0.04, 0.03);
        global.ArcadeSFX?.match?.() || global.ArcadeSFX?.go?.();
      } else if (grade === "great") {
        counts.great += 1;
        blip(660, 0.04, 0.028);
        global.ArcadeSFX?.click?.();
      } else {
        counts.good += 1;
        blip(440, 0.04, 0.025);
        global.ArcadeSFX?.tick?.();
      }

      combo += 1;
      recordAccuracy(best, grade, t);
      if (combo > bestCombo) bestCombo = combo;
      score = scoreTracker?.register(grade, combo) || 0;
      scoreEl.textContent = formatScore(score);
      comboEl.textContent = String(combo);
      excEl.textContent = String(counts.excellent);
      panel.removeNote(best.key);
      panel.setJudge(label, grade, nowMs, diff.approachMs);
      if (srJudgeEl) srJudgeEl.textContent = label;
    }

    function clearResults() {
      cancelAnimationFrame(resultRaf);
      resultRaf = 0;
      resultTimers.forEach((timer) => clearTimeout(timer));
      resultTimers = [];
      resultsOpen = false;
      stopResultAudio();
      if (resultsEl) {
        resultsEl.hidden = true;
        resultsEl.className = "jb-results";
      }
    }

    function announceRank(rank, fullCombo, onComplete) {
      const finish = () => {
        if (audioEl) audioEl.volume = 0.32;
        onComplete?.();
      };
      if (global.ArcadeSFX?.isMuted?.() || !resultAudioEl) {
        finish();
        return;
      }

      if (rank === "FAIL") global.ArcadeSFX?.lose?.();
      else global.ArcadeSFX?.levelUp?.();
      if (audioEl) audioEl.volume = 0.16;

      const token = ++announcementToken;
      let completed = false;
      const complete = () => {
        if (completed || token !== announcementToken) return;
        completed = true;
        finish();
      };
      const rankId = rank.toLowerCase();
      const comboSuffix = fullCombo ? "-full-combo" : "";
      try {
        resultAudioEl.onended = complete;
        resultAudioEl.onerror = complete;
        resultAudioEl.src = `${RESULT_AUDIO_BASE}final-${rankId}${comboSuffix}.mp4`;
        resultAudioEl.currentTime = 0;
        resultAudioEl.volume = 1;
        resultAudioEl.play()?.catch?.(complete);
      } catch {
        complete();
      }
    }

    function showResults({ rank, arcadePoints, total, fullCombo }) {
      if (!resultsEl) return;
      resultsOpen = true;
      resultsEl.hidden = false;
      resultsEl.className = "jb-results is-open";
      resultsScoreEl.textContent = "0";
      resultsRankEl.textContent = "RANK";
      resultsComboEl.textContent = fullCombo ? "FULL COMBO" : "";
      resultsAccuracyEl.textContent = `${overallAccuracy().toFixed(1)}%`;
      renderAccuracyTimeline();
      resultsStatsEl.textContent = "";
      resultsArcadeEl.textContent = "";
      resultsContinueBtn.hidden = true;

      const countStart = performance.now();
      const countDuration = 1150;
      const tick = (now) => {
        const progress = Math.min(1, (now - countStart) / countDuration);
        const eased = 1 - Math.pow(1 - progress, 3);
        resultsScoreEl.textContent = formatScore(score * eased);
        if (progress < 1) resultRaf = requestAnimationFrame(tick);
      };
      resultRaf = requestAnimationFrame(tick);

      resultTimers.push(
        setTimeout(() => {
          resultsEl.classList.add("is-rank-visible");
          resultsRankEl.textContent = rank;
          announceRank(rank, fullCombo, () => {
            if (!resultsOpen) return;
            resultsEl.classList.add("is-ready");
            resultsContinueBtn.hidden = false;
          });
        }, 1650),
        setTimeout(() => {
          resultsEl.classList.add("is-stats-visible");
          resultsStatsEl.textContent = `EXC ${counts.excellent} · GREAT ${counts.great} · GOOD ${counts.good} · MISS ${counts.miss} / ${total}`;
          resultsArcadeEl.textContent = `ARCADE +${arcadePoints} PTS`;
        }, 2250),
        setTimeout(() => {
          if (!resultsOpen || !resultsContinueBtn.hidden) return;
          resultsEl.classList.add("is-ready");
          resultsContinueBtn.hidden = false;
        }, 9000)
      );
    }

    function finish() {
      if (submitted) return;
      submitted = true;
      running = false;
      cancelAnimationFrame(raf);
      clearCountIn();
      panels.forEach((p) => p.reset());
      startBtn.disabled = true;
      startBtn.textContent = "Play again";
      const s = song();
      const total = counts.excellent + counts.great + counts.good + counts.miss;
      const fullCombo = total > 0 && counts.miss === 0;
      const accuracy = overallAccuracy();
      const rank = rankForScore(score);
      const arcadePoints =
        global.ArcadeScores?.arcadePointsForRun?.("jubeat", score) ?? scoreTracker?.arcadePoints() ?? 0;
      const cleared = rank !== "FAIL";
      hintEl.textContent = `${s.title} ${cleared ? "cleared" : "finished"} · score ${formatScore(score)} · ${accuracy.toFixed(1)}% accuracy · rank ${rank}`;
      if (musicNoteEl) musicNoteEl.textContent = `♪ ${s.title} finished`;
      showResults({ rank, arcadePoints, total, fullCombo });
      startPostGameLoop(s);
      paintSongs();
      paintDifficulty();
      paintMarkerModes();
      onScore?.({
        score,
        meta: {
          song: s.id,
          difficulty: difficulty().label,
          rank,
          arcadePoints,
          excellent: counts.excellent,
          great: counts.great,
          good: counts.good,
          miss: counts.miss,
          bestCombo,
          fullCombo,
          accuracy: Number(accuracy.toFixed(2)),
          marker: markerId,
          cleared,
        },
      });
    }

    function frame() {
      if (!running || submitted) return;
      const t = nowMs();
      const s = song();
      const ch = chartFor(s, difficultyId);
      const duration = ch.length ? ch[ch.length - 1].t + 800 : 1000;

      while (chartIndex < ch.length && ch[chartIndex].t <= t + difficulty().approachMs) {
        const n = ch[chartIndex++];
        n.panels.forEach((p) => {
          const key = `${n.t}-${p}`;
          panels[p]?.addNote(n.t, key);
        });
      }

      for (const panel of panels) {
        if (!running || submitted) break;
        panel.expireMisses(t, (n) => registerMiss(n, panel));
        panel.syncMarker(t, difficulty().approachMs);
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

    function warmPanelMedia() {
      Object.values(PANEL_ART).forEach((src) => {
        const img = new Image();
        img.src = src;
      });
    }

    function setStartSequence(stage, s) {
      startSequenceEl.hidden = false;
      startSequenceEl.className = `jb-start-sequence is-${stage.toLowerCase()}`;
      startSequenceLabelEl.textContent = stage;
      startSequenceSongEl.textContent = `${s.title} · ${difficulty().label}`;
    }

    function prepareChartAudio(s) {
      if (!s?.audio || !audioEl) return Promise.resolve(false);
      return loadAudio(s.audio).then((ok) => {
        if (!ok || destroyed || !running) return false;
        try {
          audioEl.loop = false;
          audioEl.currentTime = songOffsetMs() / 1000;
          audioEl.volume = 0;
          const primed = audioEl.play();
          if (!primed?.then) {
            audioEl.pause();
            audioEl.volume = 1;
            return true;
          }
          return primed
            .then(() => {
              audioEl.pause();
              audioEl.currentTime = songOffsetMs() / 1000;
              audioEl.volume = 1;
              return true;
            })
            .catch(() => {
              audioEl.volume = 1;
              return false;
            });
        } catch {
          audioEl.volume = 1;
          return false;
        }
      });
    }

    function launchChart(s, audioReady) {
      if (!running || destroyed || clockStarted) return;
      clearCountIn();
      if (!audioReady || !audioEl) {
        beginChartClock(false);
        return;
      }
      try {
        audioEl.currentTime = songOffsetMs() / 1000;
        audioEl.volume = 1;
        audioEl.loop = false;
        const playback = audioEl.play();
        if (musicNoteEl) musicNoteEl.textContent = `Now playing · ${s.title}`;
        if (playback?.then) {
          playback.then(() => beginChartClock(true)).catch(() => {
            stopBgm();
            beginChartClock(false);
          });
        } else {
          beginChartClock(true);
        }
      } catch {
        stopBgm();
        beginChartClock(false);
      }
    }

    function runStartSequence(s) {
      const loadingAt = performance.now();
      setStartSequence("LOADING", s);
      prepareChartAudio(s).then((audioReady) => {
        if (!running || destroyed) return;
        const loadingDelay = Math.max(0, 650 - (performance.now() - loadingAt));
        countInTimers.push(
          setTimeout(() => {
            if (!running || destroyed) return;
            setStartSequence("READY", s);
            global.ArcadeSFX?.go?.() || global.ArcadeSFX?.click?.();
            countInTimers.push(
              setTimeout(() => {
                if (!running || destroyed) return;
                setStartSequence("START", s);
                global.ArcadeSFX?.match?.() || global.ArcadeSFX?.go?.();
                countInTimers.push(setTimeout(() => launchChart(s, audioReady), 620));
              }, 920)
            );
          }, loadingDelay)
        );
      });
    }

    function start() {
      if (resultsOpen || running) return;
      cancelAnimationFrame(raf);
      clearCountIn();
      panels.forEach((p) => p.reset());
      stopBgm();
      duckLobbyMusic(true);
      primeResultAudio();
      const s = song();
      chart = chartFor(s, difficultyId);
      resetAccuracyTimeline(chart);
      chartIndex = 0;
      running = true;
      clockStarted = false;
      useAudioClock = false;
      submitted = false;
      score = 0;
      combo = 0;
      bestCombo = 0;
      counts = { excellent: 0, great: 0, good: 0, miss: 0 };
      scoreTracker = createScoreTracker(chart);
      scoreEl.textContent = "0";
      comboEl.textContent = "0";
      excEl.textContent = "0";
      missEl.textContent = "0";
      if (progEl) progEl.style.width = "0%";
      startBtn.disabled = true;
      setupEl.hidden = true;
      playfieldEl.hidden = false;
      paintSongs();
      paintDifficulty();
      paintMarkerModes();
      warmPanelMedia();
      const chartSeconds = chart.length ? chart[chart.length - 1].t / 1000 : s.durationSec || 100;
      const mins = Math.round(chartSeconds / 6) / 10;
      const noteCount = chart.reduce((n, ev) => n + ev.panels.length, 0);
      const diff = difficulty();
      const level = difficultyId === "easy" ? s.easyLevel : s.level;
      hintEl.textContent = `${s.title} · ${diff.label} ${level} · ${s.bpm} BPM · ~${mins} min · ${noteCount} hits · follow the beat`;
      runStartSequence(s);
    }

    startBtn.addEventListener("click", start);
    resultsContinueBtn.addEventListener("click", () => {
      clearResults();
      stopBgm();
      playfieldEl.hidden = true;
      setupEl.hidden = false;
      startBtn.disabled = false;
      startBtn.textContent = "Confirm song";
      paintSongs();
      paintDifficulty();
      paintMarkerModes();
      restartPractice();
      cuePreview(song(), true);
      startBtn.focus({ preventScroll: true });
    });

    function onKey(e) {
      if (resultsOpen) return;
      if (!running || !clockStarted) return;
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
    practiceCellEl.addEventListener("click", (event) => {
      if (event.detail === 0) practiceTap();
    });

    paintDifficulty();
    paintMarkerModes();
    paintSongs();
    paintMeta();
    cuePreview(song());
    practiceRaf = requestAnimationFrame(animatePractice);

    return {
      destroy() {
        destroyed = true;
        running = false;
        cancelAnimationFrame(raf);
        cancelAnimationFrame(practiceRaf);
        clearCountIn();
        clearResults();
        panels.forEach((p) => p.destroy());
        practicePanel.destroy();
        stopBgm();
        duckLobbyMusic(false);
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
    MAX_SCORE,
    JUDGE_PROGRESS,
    DIFFICULTIES,
    MARKER_MODES,
    APPROACH_MS: DIFFICULTIES.extreme.approachMs,
    JUDGE_MS,
    SONGS,
    chartFor,
    buildChart,
    createScoreTracker,
    rankForScore,
    judgeForTap,
    timingAccuracy,
    setMarkerProgress,
  };
})(window);
