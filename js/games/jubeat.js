/**
 * Pulse Grid — jubeat-style 4×4 charts.
 * Songs: I'm so Happy · Albida · Flower · Evans (EXTREME only).
 * Judges: EXCELLENT · GREAT · GOOD · MISS — misses do not end the run.
 */
(function (global) {
  "use strict";

  const COLS = 4;
  const CELLS = 16;

  // Timing windows vs note time (ms) — jubeat-like ladder
  const WIN = {
    excellent: 45,
    great: 90,
    good: 140,
  };

  /**
   * Chart helpers: build EXTREME streams on a 4×4 pad.
   * Panel map:  0  1  2  3
   *             4  5  6  7
   *             8  9 10 11
   *            12 13 14 15
   */
  function note(t, panels) {
    return { t, panels: Array.isArray(panels) ? panels : [panels] };
  }

  function buildChart(song) {
    const bpm = song.bpm;
    const beat = 60000 / bpm;
    // Target full chart length (~2.5–3.5 min) — never short “8 miss” runs
    const durationSec = song.durationSec || 180;
    const totalBeats = Math.ceil((durationSec * bpm) / 60);
    // One “measure” = 4 beats
    const totalMeasures = Math.max(32, Math.ceil(totalBeats / 4));
    const bodyStart = 4;
    const bodyEnd = totalMeasures - 4; // leave room for outro

    const notes = [];
    const push = (beatIndex, panels) => {
      if (beatIndex < 0 || beatIndex > totalBeats + 16) return;
      notes.push(note(Math.round(beatIndex * beat), panels));
    };

    // Intro — 4 measures
    for (let b = 0; b < bodyStart * 4; b++) {
      push(b, b % 4 === 0 ? [5, 6, 9, 10] : [b % 16]);
    }

    if (song.id === "imsosohappy") {
      // Dense happy-hardcore style: 16ths + corner chords + center cross
      for (let m = bodyStart; m < bodyEnd; m++) {
        const base = m * 4;
        const streams = [
          [0, 1, 2, 3, 7, 11, 15, 14, 13, 12, 8, 4],
          [0, 5, 10, 15, 14, 9, 4, 1, 6, 11, 7, 2],
          [3, 2, 1, 0, 4, 8, 12, 13, 14, 15, 11, 7],
          [12, 8, 4, 0, 1, 2, 3, 7, 11, 15, 10, 5],
        ];
        const stream = streams[m % streams.length];
        stream.forEach((p, i) => push(base + i * 0.25, p));
        push(base, [0, 3, 12, 15]);
        push(base + 2, [5, 6, 9, 10]);
        if (m % 2 === 0) push(base + 1.5, [1, 2, 13, 14]);
        if (m % 3 === 0) {
          push(base + 0.5, [4, 7]);
          push(base + 2.5, [8, 11]);
        }
        // Late chart denser doubles
        if (m > bodyStart + 20) {
          for (let i = 0; i < 8; i++) {
            push(base + i * 0.5 + 0.125, [(stream[i % stream.length] + 2) % 16]);
          }
        }
      }
    } else if (song.id === "albida") {
      for (let m = bodyStart; m < bodyEnd; m++) {
        const base = m * 4;
        for (let i = 0; i < 8; i++) {
          const col = (m + i) % 4;
          push(
            base + i * 0.5,
            [col, col + 4, col + 8, col + 12].filter((_, k) => k === i % 4 || k === (i + 1) % 4)
          );
        }
        push(base, [0, 5, 10, 15]);
        push(base + 1, [3, 6, 9, 12]);
        push(base + 2, [0, 3, 12, 15]);
        push(base + 3, [5, 6, 9, 10]);
        for (let s = 0; s < 4; s++) {
          push(base + 0.25 + s, [(m * 3 + s * 5) % 16]);
          push(base + 0.75 + s, [(m * 7 + s * 3) % 16]);
        }
        if (m > bodyStart + 16) {
          for (let i = 0; i < 16; i++) push(base + i * 0.25, [(m * 5 + i * 3) % 16]);
        }
      }
    } else if (song.id === "flower") {
      for (let m = bodyStart; m < bodyEnd; m++) {
        const base = m * 4;
        const ring = [1, 2, 7, 11, 14, 13, 8, 4];
        ring.forEach((p, i) => push(base + i * 0.5, p));
        push(base, [5, 6, 9, 10]);
        push(base + 2, [0, 3, 12, 15]);
        for (let i = 0; i < 8; i++) {
          const a = (m + i) % 16;
          const b = (a + 5) % 16;
          push(base + i * 0.5 + 0.25, [a, b]);
        }
        if (m % 2 === 1) {
          push(base + 1, [1, 4, 7, 13]);
          push(base + 3, [2, 8, 11, 14]);
        }
        if (m > bodyStart + 18) {
          ring.forEach((p, i) => push(base + i * 0.25, [(p + 2) % 16]));
        }
      }
    } else {
      // Evans — classic dense shuffle / hard 16ths
      for (let m = bodyStart; m < bodyEnd; m++) {
        const base = m * 4;
        const shuffle = [0, 5, 2, 7, 8, 13, 10, 15, 3, 6, 1, 4, 11, 14, 9, 12];
        shuffle.forEach((p, i) => push(base + i * 0.25, p));
        if (m > bodyStart + 8) {
          for (let i = 0; i < 8; i++) {
            push(base + i * 0.5 + 0.125, [(shuffle[i] + 3) % 16]);
          }
        }
        if (m > bodyStart + 24) {
          for (let i = 0; i < 16; i++) {
            push(base + i * 0.25 + 0.125, [(shuffle[i] + 7) % 16]);
          }
        }
        push(base, [0, 3]);
        push(base + 1, [12, 15]);
        push(base + 2, [0, 15]);
        push(base + 3, [3, 12]);
        if (m % 4 === 0) push(base + 1.5, [5, 6, 9, 10]);
      }
    }

    // Outro — last ~4 measures
    const endBeat = bodyEnd * 4;
    for (let b = 0; b < 12; b++) {
      push(endBeat + b * 0.5, b % 2 === 0 ? [5, 6, 9, 10] : [0, 3, 12, 15]);
    }
    push(endBeat + 6, [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15]);
    push(endBeat + 8, [5, 6, 9, 10]);

    notes.sort((a, b) => a.t - b.t || a.panels[0] - b.panels[0]);
    return notes;
  }

  const SONGS = [
    {
      id: "imsosohappy",
      title: "I'm so Happy",
      artist: "Ryu☆",
      difficulty: "EXTREME",
      level: 10,
      bpm: 183,
      durationSec: 195, // ~3.2 min
      color: "#f472b6",
    },
    {
      id: "albida",
      title: "Albida",
      artist: "dj TAKA",
      difficulty: "EXTREME",
      level: 10,
      bpm: 155,
      durationSec: 200, // ~3.3 min
      color: "#38bdf8",
    },
    {
      id: "flower",
      title: "Flower",
      artist: "DJ YOSHITAKA",
      difficulty: "EXTREME",
      level: 9,
      bpm: 173,
      durationSec: 185, // ~3.1 min
      color: "#c084fc",
    },
    {
      id: "evans",
      title: "Evans",
      artist: "DJ YOSHITAKA",
      difficulty: "EXTREME",
      level: 10,
      bpm: 180,
      durationSec: 210, // ~3.5 min
      color: "#fbbf24",
    },
  ].map((s) => ({ ...s, chart: null }));

  // Lazy chart build
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
          <div class="jb-judge" id="jb-judge" hidden aria-live="polite"></div>
          <div class="jb-progress"><div class="jb-progress-fill" id="jb-progress"></div></div>
        </div>
        <p class="game-hint" id="jb-hint">EXTREME charts (~3 min) · EXCELLENT / GREAT / GOOD / MISS · miss is OK — play the full song</p>
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
    const judgeEl = root.querySelector("#jb-judge");
    const progEl = root.querySelector("#jb-progress");
    const startBtn = root.querySelector("#jb-start");

    /** @type {HTMLButtonElement[]} */
    const cells = [];
    for (let i = 0; i < CELLS; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "jb-cell";
      btn.dataset.i = String(i);
      btn.setAttribute("aria-label", `Panel ${i + 1}`);
      btn.innerHTML = `<span class="jb-ring" aria-hidden="true"></span><span class="jb-core" aria-hidden="true"></span>`;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        onPanel(i);
      });
      grid.appendChild(btn);
      cells.push(btn);
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
    let judgeTimer = null;
    /** active: key "t-panel" -> { t, panel, born } */
    let active = new Map();
    let approachMs = 520;
    let audioCtx = null;

    function song() {
      return SONGS[songIndex];
    }

    function paintSongs() {
      songsEl.innerHTML = SONGS.map(
        (s, i) => `
        <button type="button" class="jb-song-chip${i === songIndex ? " is-active" : ""}" data-s="${i}" ${running ? "disabled" : ""} style="--sc:${s.color}">
          <strong>${escapeHtml(s.title)}</strong>
          <small>EXTREME ${s.level} · ${s.bpm} BPM</small>
        </button>`
      ).join("");
      songsEl.querySelectorAll("[data-s]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (running) return;
          songIndex = Number(btn.dataset.s);
          paintSongs();
          paintMeta();
          global.ArcadeSFX?.click?.();
        });
      });
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function paintMeta() {
      const s = song();
      metaEl.innerHTML = `<span style="color:${s.color}">${escapeHtml(s.title)}</span>
        <span class="jb-diff">EXTREME ${s.level}</span>
        <span>${s.artist}</span>
        <span>${s.bpm} BPM</span>`;
      grid.style.setProperty("--jb-accent", s.color);
    }

    function setJudge(text, cls) {
      judgeEl.hidden = false;
      judgeEl.textContent = text;
      judgeEl.className = "jb-judge " + (cls || "");
      clearTimeout(judgeTimer);
      judgeTimer = setTimeout(() => {
        judgeEl.hidden = true;
      }, 380);
    }

    function clearPanels() {
      cells.forEach((c) => c.classList.remove("is-armed", "is-hit", "is-miss", "is-approach"));
      active.clear();
    }

    function blip(freq, dur = 0.06) {
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
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(t);
        o.stop(t + dur + 0.02);
      } catch {
        /* ignore */
      }
    }

    function nowMs() {
      return performance.now() - t0;
    }

    function spawnNote(panel, hitTime) {
      const key = `${hitTime}-${panel}`;
      if (active.has(key)) return;
      active.set(key, { t: hitTime, panel, key });
      const el = cells[panel];
      el.classList.add("is-approach", "is-armed");
    }

    function despawn(key, panel, missed) {
      active.delete(key);
      const still = [...active.values()].some((n) => n.panel === panel);
      const el = cells[panel];
      if (!still) {
        el.classList.remove("is-approach", "is-armed");
        if (missed) {
          el.classList.add("is-miss");
          setTimeout(() => el.classList.remove("is-miss"), 160);
        }
      }
    }

    function registerMiss(n) {
      counts.miss += 1;
      missEl.textContent = String(counts.miss);
      combo = 0;
      comboEl.textContent = "0";
      setJudge("MISS", "miss");
      despawn(n.key, n.panel, true);
      global.ArcadeSFX?.foul?.() || global.ArcadeSFX?.tick?.();
      blip(120, 0.05);
    }

    function onPanel(i) {
      global.ArcadeSFX?.unlock?.();
      if (!running) {
        start();
        return;
      }
      const t = nowMs();
      // nearest active note on this panel still in good window
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
        // empty hit — soft feedback only, no miss counter (jubeat empty tap)
        cells[i].classList.add("is-miss");
        setTimeout(() => cells[i].classList.remove("is-miss"), 120);
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
        blip(880 + (i % 4) * 40, 0.05);
        global.ArcadeSFX?.match?.() || global.ArcadeSFX?.go?.();
      } else if (bestErr <= WIN.great) {
        label = "GREAT";
        cls = "great";
        pts = 700 + Math.min(120, combo * 2);
        counts.great += 1;
        blip(660, 0.05);
        global.ArcadeSFX?.click?.();
      } else {
        label = "GOOD";
        cls = "good";
        pts = 300;
        counts.good += 1;
        blip(440, 0.05);
        global.ArcadeSFX?.tick?.();
      }

      combo += 1;
      if (combo > bestCombo) bestCombo = combo;
      score += pts;
      scoreEl.textContent = String(score);
      comboEl.textContent = String(combo);
      excEl.textContent = String(counts.excellent);
      setJudge(label, cls);
      despawn(best.key, best.panel, false);
      cells[i].classList.add("is-hit");
      setTimeout(() => cells[i].classList.remove("is-hit"), 140);
    }

    function finish() {
      if (submitted) return;
      submitted = true;
      running = false;
      cancelAnimationFrame(raf);
      // Remaining active → miss
      for (const n of [...active.values()]) registerMiss(n);
      clearPanels();
      startBtn.disabled = false;
      startBtn.textContent = "Play again";
      paintSongs();
      const s = song();
      const total = counts.excellent + counts.great + counts.good + counts.miss;
      const excRate = total ? Math.round((counts.excellent / total) * 100) : 0;
      hintEl.textContent = `${s.title} cleared · ${score} pts · EXC ${counts.excellent} · MISS ${counts.miss} · ${excRate}% EXC · max combo ${bestCombo}`;
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
        },
      });
    }

    function frame() {
      if (!running) return;
      const t = nowMs();
      const s = song();
      const chart = chartFor(s);
      const duration = chart.length ? chart[chart.length - 1].t + 800 : 1000;

      // spawn approaching notes
      while (chartIndex < chart.length && chart[chartIndex].t <= t + approachMs) {
        const n = chart[chartIndex++];
        n.panels.forEach((p) => spawnNote(p, n.t));
      }

      // auto-miss notes past good window
      for (const n of [...active.values()]) {
        if (t - n.t > WIN.good) registerMiss(n);
      }

      // approach animation intensity via CSS var
      for (const n of active.values()) {
        const el = cells[n.panel];
        const left = n.t - t;
        const p = 1 - Math.max(0, Math.min(1, left / approachMs));
        el.style.setProperty("--jb-p", String(p));
      }

      if (progEl) progEl.style.width = `${Math.min(100, (t / duration) * 100)}%`;

      if (chartIndex >= chart.length && active.size === 0 && t > duration) {
        finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      clearPanels();
      const s = song();
      chart = chartFor(s);
      chartIndex = 0;
      running = true;
      submitted = false;
      score = 0;
      combo = 0;
      bestCombo = 0;
      counts = { excellent: 0, great: 0, good: 0, miss: 0 };
      approachMs = Math.max(420, Math.round(60000 / s.bpm) * 1.6);
      scoreEl.textContent = "0";
      comboEl.textContent = "0";
      excEl.textContent = "0";
      missEl.textContent = "0";
      if (progEl) progEl.style.width = "0%";
      startBtn.disabled = true;
      startBtn.textContent = "Playing…";
      paintSongs();
      const mins = Math.round((s.durationSec || 180) / 6) / 10;
      hintEl.textContent = `${s.title} · EXTREME ${s.level} · ~${mins} min · miss is OK · play to the end`;
      t0 = performance.now() + 600; // short count-in
      global.ArcadeSFX?.go?.() || global.ArcadeSFX?.click?.();
      blip(523, 0.08);
      setTimeout(() => blip(659, 0.08), 200);
      setTimeout(() => blip(784, 0.1), 400);
      raf = requestAnimationFrame(frame);
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

    return {
      destroy() {
        running = false;
        cancelAnimationFrame(raf);
        clearTimeout(judgeTimer);
        clearPanels();
        window.removeEventListener("keydown", onKey);
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
