/**
 * Pulse Grid — jubeat-inspired 4×4 rhythm panels.
 * Notes approach on panels; tap in the timing window. Endless speed-up, no hard cap.
 */
(function (global) {
  "use strict";

  const COLS = 4;
  const CELLS = COLS * COLS;
  const JUDGE = {
    perfect: 90,
    great: 150,
    good: 220,
  };

  function mount(root, { onScore }) {
    root.innerHTML = `
      <div class="jubeat-wrap">
        <div class="game-hud">
          <div><span class="hud-label">Score</span><strong id="jb-score">0</strong></div>
          <div><span class="hud-label">Combo</span><strong id="jb-combo">0</strong></div>
          <div><span class="hud-label">BPM</span><strong id="jb-bpm">100</strong></div>
          <div><span class="hud-label">Miss</span><strong id="jb-miss">0</strong></div>
        </div>
        <div class="jb-stage">
          <div class="jb-grid" id="jb-grid" role="grid" aria-label="Pulse Grid 4 by 4"></div>
          <div class="jb-judge" id="jb-judge" hidden aria-live="polite"></div>
        </div>
        <p class="game-hint" id="jb-hint">Tap panels as they light up — hit on the beat. Speed never caps.</p>
        <div class="game-actions">
          <button type="button" class="btn primary" id="jb-start">Start / Restart</button>
        </div>
      </div>
    `;

    const grid = root.querySelector("#jb-grid");
    const scoreEl = root.querySelector("#jb-score");
    const comboEl = root.querySelector("#jb-combo");
    const bpmEl = root.querySelector("#jb-bpm");
    const missEl = root.querySelector("#jb-miss");
    const hintEl = root.querySelector("#jb-hint");
    const judgeEl = root.querySelector("#jb-judge");
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
    let misses = 0;
    let beat = 0;
    let bpm = 100;
    let spawnTimer = null;
    let tickTimer = null;
    let submitted = false;
    /** active notes: cellIndex -> { born, windowMs, el } */
    let notes = new Map();
    let judgeTimer = null;

    function setJudge(text, cls) {
      judgeEl.hidden = false;
      judgeEl.textContent = text;
      judgeEl.className = "jb-judge " + (cls || "");
      clearTimeout(judgeTimer);
      judgeTimer = setTimeout(() => {
        judgeEl.hidden = true;
      }, 420);
    }

    function clearNotes() {
      notes.forEach((n, i) => {
        cells[i]?.classList.remove("is-armed", "is-hit", "is-miss", "is-approach");
      });
      notes.clear();
    }

    function stopLoops() {
      if (spawnTimer) clearTimeout(spawnTimer);
      if (tickTimer) clearInterval(tickTimer);
      spawnTimer = null;
      tickTimer = null;
    }

    function endRun() {
      if (submitted) return;
      submitted = true;
      running = false;
      stopLoops();
      clearNotes();
      startBtn.disabled = false;
      startBtn.textContent = "Play again";
      hintEl.textContent = `Run over · ${score} pts · max combo ${bestCombo}`;
      onScore?.({
        score,
        meta: { bestCombo, misses, bpmPeak: bpm },
      });
    }

    function beatMs() {
      return Math.max(280, Math.round(60000 / bpm));
    }

    function scheduleSpawn() {
      if (!running) return;
      const delay = beatMs() * (0.85 + Math.random() * 0.35);
      spawnTimer = setTimeout(() => {
        spawnNote();
        // occasional double / triple patterns
        if (Math.random() < Math.min(0.55, 0.12 + beat * 0.008)) spawnNote();
        if (Math.random() < Math.min(0.35, 0.04 + beat * 0.005)) spawnNote();
        scheduleSpawn();
      }, delay);
    }

    function spawnNote() {
      if (!running) return;
      const free = [];
      for (let i = 0; i < CELLS; i++) if (!notes.has(i)) free.push(i);
      if (!free.length) return;
      const i = free[Math.floor(Math.random() * free.length)];
      const windowMs = Math.max(280, JUDGE.good + 40 - Math.min(80, beat * 0.4));
      notes.set(i, { born: performance.now(), windowMs });
      const el = cells[i];
      el.classList.remove("is-hit", "is-miss");
      el.classList.add("is-approach", "is-armed");
      // miss if not hit in time
      const missT = setTimeout(() => {
        if (!notes.has(i)) return;
        notes.delete(i);
        el.classList.remove("is-approach", "is-armed");
        el.classList.add("is-miss");
        setTimeout(() => el.classList.remove("is-miss"), 200);
        combo = 0;
        comboEl.textContent = "0";
        misses += 1;
        missEl.textContent = String(misses);
        setJudge("MISS", "miss");
        global.ArcadeSFX?.foul?.() || global.ArcadeSFX?.tick?.();
        if (misses >= 8) endRun();
      }, windowMs + 30);
      notes.get(i).missT = missT;
    }

    function onPanel(i) {
      global.ArcadeSFX?.unlock?.();
      if (!running) {
        start();
        return;
      }
      const note = notes.get(i);
      const el = cells[i];
      if (!note) {
        // empty panel tap — tiny combo break if mid-run with active notes
        if (notes.size) {
          combo = 0;
          comboEl.textContent = "0";
          el.classList.add("is-miss");
          setTimeout(() => el.classList.remove("is-miss"), 150);
          global.ArcadeSFX?.tick?.();
        }
        return;
      }
      clearTimeout(note.missT);
      notes.delete(i);
      const age = performance.now() - note.born;
      const ideal = note.windowMs * 0.72;
      const err = Math.abs(age - ideal);
      let pts = 0;
      let label = "GOOD";
      let cls = "good";
      if (err <= JUDGE.perfect) {
        pts = 320 + Math.min(180, combo * 4);
        label = "PERFECT";
        cls = "perfect";
        global.ArcadeSFX?.match?.() || global.ArcadeSFX?.go?.();
      } else if (err <= JUDGE.great) {
        pts = 200 + Math.min(100, combo * 2);
        label = "GREAT";
        cls = "great";
        global.ArcadeSFX?.click?.();
      } else {
        pts = 90;
        label = "GOOD";
        cls = "good";
        global.ArcadeSFX?.tick?.();
      }
      combo += 1;
      if (combo > bestCombo) bestCombo = combo;
      score += pts;
      scoreEl.textContent = String(score);
      comboEl.textContent = String(combo);
      setJudge(label, cls);
      el.classList.remove("is-approach", "is-armed");
      el.classList.add("is-hit");
      setTimeout(() => el.classList.remove("is-hit"), 180);

      // speed never caps — climb forever
      beat += 1;
      if (beat % 4 === 0) {
        bpm = Math.min(280, bpm + 2 + Math.floor(beat / 40));
        bpmEl.textContent = String(bpm);
      }
    }

    function start() {
      stopLoops();
      clearNotes();
      running = true;
      submitted = false;
      score = 0;
      combo = 0;
      bestCombo = 0;
      misses = 0;
      beat = 0;
      bpm = 100;
      scoreEl.textContent = "0";
      comboEl.textContent = "0";
      missEl.textContent = "0";
      bpmEl.textContent = "100";
      startBtn.textContent = "Running…";
      startBtn.disabled = true;
      hintEl.textContent = "Hit the glow on the beat · miss 8 and it's over";
      global.ArcadeSFX?.go?.() || global.ArcadeSFX?.click?.();
      scheduleSpawn();
      spawnNote();
      spawnNote();
    }

    startBtn.addEventListener("click", start);

    // number keys 1–9 / qwer map loosely to first 9 + top row
    function onKey(e) {
      if (!running && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        start();
        return;
      }
      if (!running) return;
      const map = {
        "1": 0, "2": 1, "3": 2, "4": 3,
        q: 4, w: 5, e: 6, r: 7,
        a: 8, s: 9, d: 10, f: 11,
        z: 12, x: 13, c: 14, v: 15,
      };
      const k = e.key.toLowerCase();
      if (map[k] != null) {
        e.preventDefault();
        onPanel(map[k]);
      }
    }
    window.addEventListener("keydown", onKey);

    return {
      destroy() {
        running = false;
        stopLoops();
        clearNotes();
        clearTimeout(judgeTimer);
        window.removeEventListener("keydown", onKey);
        root.innerHTML = "";
      },
    };
  }

  global.GameJubeat = { mount };
})(window);
