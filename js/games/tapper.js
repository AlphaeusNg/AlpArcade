/**
 * Target Tap — quick-reaction moles on a grid. Touch-friendly.
 */
(function (global) {
  "use strict";

  const DIFFS = [
    { id: "chill", label: "Chill", spawnMs: 900, lifeMs: 1100, multi: 1 },
    { id: "arcade", label: "Arcade", spawnMs: 650, lifeMs: 800, multi: 1 },
    { id: "frenzy", label: "Frenzy", spawnMs: 420, lifeMs: 560, multi: 2 },
  ];

  function mount(root, { onScore }) {
    let diff = 1;
    let score = 0;
    let lives = 3;
    let combo = 0;
    let bestCombo = 0;
    let running = false;
    let paused = false;
    let pausedByVisibility = false;
    let submitted = false;
    let spawnTimer = null;
    let spawnDueAt = 0;
    let pausedSpawnRemaining = 0;
    let active = new Map(); // cell index -> { timer, expiresAt, remaining }
    let hits = 0;
    let misses = 0;
    let round = 0;

    root.innerHTML = `
      <div class="tapper-wrap">
        <div class="diff-bar" id="tap-diffs"></div>
        <div class="game-hud">
          <div><span class="hud-label">Score</span><strong id="tap-score">0</strong></div>
          <div><span class="hud-label">Lives</span><strong id="tap-lives">♥♥♥</strong></div>
          <div><span class="hud-label">Combo</span><strong id="tap-combo">0</strong></div>
          <div><span class="hud-label">Best</span><strong id="tap-best">0</strong></div>
        </div>
        <div class="tap-stage">
          <div class="tap-grid" id="tap-grid" role="grid" aria-label="Target grid"></div>
          <section class="run-pause-overlay" id="tap-pause-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="tap-pause-heading">
            <p class="run-pause-kicker" id="tap-pause-heading">PAUSED</p>
            <div class="run-pause-actions">
              <button type="button" class="btn primary" id="tap-resume">Resume</button>
              <button type="button" class="btn ghost run-pause-bank" id="tap-bank">Save score & end</button>
            </div>
          </section>
        </div>
        <p class="game-hint" id="tap-hint">Tap glowing cells before they fade. Miss three and it's over.</p>
        <div class="game-actions">
          <button type="button" class="btn primary" id="tap-start">Start</button>
          <button type="button" class="run-pause-btn" id="tap-pause" hidden disabled aria-label="Pause" aria-pressed="false">
            <span aria-hidden="true">Ⅱ</span><span>Pause</span>
          </button>
        </div>
      </div>
    `;

    const grid = root.querySelector("#tap-grid");
    const scoreEl = root.querySelector("#tap-score");
    const livesEl = root.querySelector("#tap-lives");
    const comboEl = root.querySelector("#tap-combo");
    const bestEl = root.querySelector("#tap-best");
    const hintEl = root.querySelector("#tap-hint");
    const diffsEl = root.querySelector("#tap-diffs");
    const startBtn = root.querySelector("#tap-start");
    const pauseBtn = root.querySelector("#tap-pause");
    const pauseOverlay = root.querySelector("#tap-pause-overlay");
    const resumeBtn = root.querySelector("#tap-resume");
    const bankBtn = root.querySelector("#tap-bank");

    bestEl.textContent = String(
      window.ArcadeScores?.getState()?.highScores?.tapper?.best || 0
    );

    const CELLS = 9;
    for (let i = 0; i < CELLS; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "tap-cell";
      cell.dataset.i = String(i);
      cell.setAttribute("aria-label", `Cell ${i + 1}`);
      cell.addEventListener("click", () => onCell(i));
      grid.appendChild(cell);
    }

    function paintDiffs() {
      diffsEl.innerHTML = DIFFS.map(
        (d, i) =>
          `<button type="button" class="diff-chip${i === diff ? " active" : ""}" data-d="${i}" ${running || paused ? "disabled" : ""}>${d.label}</button>`
      ).join("");
      diffsEl.querySelectorAll("[data-d]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (running || paused) return;
          diff = Number(btn.dataset.d);
          window.ArcadeSFX?.click?.();
          paintDiffs();
        });
      });
    }

    function paintLives() {
      livesEl.textContent = "♥".repeat(Math.max(0, lives)) + "♡".repeat(Math.max(0, 3 - lives));
    }

    function clearAll() {
      if (spawnTimer) clearTimeout(spawnTimer);
      spawnTimer = null;
      spawnDueAt = 0;
      pausedSpawnRemaining = 0;
      for (const rec of active.values()) {
        if (rec.timer) clearTimeout(rec.timer);
      }
      active.clear();
      grid.querySelectorAll(".tap-cell").forEach((c) => {
        c.classList.remove("is-on", "is-hit", "is-miss");
      });
    }

    function expireCell(i) {
      const rec = active.get(i);
      if (!rec) return;
      active.delete(i);
      const cell = grid.querySelector(`[data-i="${i}"]`);
      if (cell) {
        cell.classList.remove("is-on");
        cell.classList.add("is-miss");
        setTimeout(() => cell.classList.remove("is-miss"), 180);
      }
      if (running && !paused) loseLife("Too slow!");
    }

    function freezeTimers() {
      const now = Date.now();
      if (spawnTimer) {
        clearTimeout(spawnTimer);
        spawnTimer = null;
        pausedSpawnRemaining = Math.max(0, spawnDueAt - now);
      } else {
        pausedSpawnRemaining = 0;
      }
      for (const rec of active.values()) {
        if (rec.timer) clearTimeout(rec.timer);
        rec.timer = 0;
        rec.remaining = Math.max(0, rec.expiresAt - now);
      }
    }

    function unfreezeTimers() {
      const now = Date.now();
      for (const [i, rec] of active) {
        const remaining = rec.remaining ?? Math.max(0, rec.expiresAt - now);
        rec.expiresAt = now + remaining;
        rec.remaining = 0;
        rec.timer = setTimeout(() => expireCell(i), remaining);
      }
      if (pausedSpawnRemaining > 0) scheduleSpawn(pausedSpawnRemaining);
      else scheduleSpawn();
      pausedSpawnRemaining = 0;
    }

    function commitScore() {
      if (submitted) return;
      if (!(score > 0 || hits > 0)) return;
      submitted = true;
      onScore?.({
        score,
        meta: { diff: DIFFS[diff].id, hits, misses, bestCombo, rounds: round },
      });
      const b = window.ArcadeScores?.getState()?.highScores?.tapper?.hits
        || window.ArcadeScores?.getState()?.highScores?.tapper?.best
        || hits;
      bestEl.textContent = String(b);
    }

    function endGame() {
      paused = false;
      pausedByVisibility = false;
      if (submitted) {
        running = false;
        clearAll();
        startBtn.textContent = "Play again";
        startBtn.disabled = false;
        paintDiffs();
        syncPauseUi();
        return;
      }
      running = false;
      clearAll();
      startBtn.textContent = "Play again";
      startBtn.disabled = false;
      paintDiffs();
      hintEl.textContent = `Game over · ${score} pts · ${hits} hits · best combo ×${bestCombo}`;
      window.ArcadeSFX?.die?.() || window.ArcadeSFX?.foul?.();
      commitScore();
      syncPauseUi();
    }

    function loseLife(reason) {
      lives -= 1;
      combo = 0;
      comboEl.textContent = "0";
      paintLives();
      misses += 1;
      window.ArcadeSFX?.foul?.();
      if (lives <= 0) endGame();
      else hintEl.textContent = reason || "Missed!";
    }

    function spawnOne() {
      if (!running || paused) return;
      const free = [];
      for (let i = 0; i < CELLS; i++) {
        if (!active.has(i)) free.push(i);
      }
      if (!free.length) return;
      const i = free[Math.floor(Math.random() * free.length)];
      const cell = grid.querySelector(`[data-i="${i}"]`);
      if (!cell) return;
      cell.classList.add("is-on");
      const cfg = DIFFS[diff];
      // Tighten as score climbs
      const life = Math.max(320, cfg.lifeMs - Math.floor(score / 80) * 20);
      const rec = { timer: 0, expiresAt: Date.now() + life, remaining: 0 };
      rec.timer = setTimeout(() => expireCell(i), life);
      active.set(i, rec);
    }

    function scheduleSpawn(delayOverride) {
      if (!running || paused) return;
      const cfg = DIFFS[diff];
      const delay =
        delayOverride != null
          ? delayOverride
          : Math.max(220, cfg.spawnMs - Math.floor(score / 50) * 12);
      spawnDueAt = Date.now() + delay;
      spawnTimer = setTimeout(() => {
        if (!running || paused) return;
        round += 1;
        const n = Math.min(cfg.multi + (score > 200 ? 1 : 0), 3);
        for (let k = 0; k < n; k++) spawnOne();
        scheduleSpawn();
      }, delay);
    }

    function onCell(i) {
      window.ArcadeSFX?.unlock?.();
      if (paused || pausedByVisibility) return;
      // Tap the playfield to start when idle
      if (!running) {
        start();
        return;
      }
      const cell = grid.querySelector(`[data-i="${i}"]`);
      if (!cell) return;
      if (!active.has(i)) {
        // Wrong cell while something is active → soft penalty
        if (active.size) {
          combo = 0;
          comboEl.textContent = "0";
          cell.classList.add("is-miss");
          setTimeout(() => cell.classList.remove("is-miss"), 150);
          window.ArcadeSFX?.tick?.();
        }
        return;
      }
      const rec = active.get(i);
      if (rec?.timer) clearTimeout(rec.timer);
      active.delete(i);
      cell.classList.remove("is-on");
      cell.classList.add("is-hit");
      setTimeout(() => cell.classList.remove("is-hit"), 160);
      hits += 1;
      combo += 1;
      if (combo > bestCombo) bestCombo = combo;
      const pts = 10 + Math.min(40, (combo - 1) * 4) + diff * 2;
      score += pts;
      scoreEl.textContent = String(score);
      comboEl.textContent = String(combo);
      window.ArcadeSFX?.match?.() || window.ArcadeSFX?.click?.();
      hintEl.textContent = combo >= 5 ? `On fire · combo ×${combo}` : "Nice!";
    }

    function syncPauseUi() {
      const inRun = (running || paused) && !submitted && lives > 0;
      pauseBtn.hidden = !inRun;
      pauseBtn.disabled = !running || submitted;
      pauseBtn.setAttribute("aria-pressed", paused ? "true" : "false");
      pauseOverlay.hidden = !paused;
    }

    function pauseRun() {
      if (!running || submitted || lives <= 0) return;
      running = false;
      paused = true;
      freezeTimers();
      hintEl.textContent = "Paused · resume or save your score";
      syncPauseUi();
    }

    function resume() {
      if (running || submitted || lives <= 0) return;
      paused = false;
      pausedByVisibility = false;
      running = true;
      startBtn.disabled = true;
      startBtn.textContent = "Running…";
      hintEl.textContent = "Tap the glow!";
      unfreezeTimers();
      syncPauseUi();
    }

    function bankRun() {
      if (submitted && !paused) return;
      paused = false;
      running = false;
      pausedByVisibility = false;
      clearAll();
      startBtn.textContent = "Start";
      startBtn.disabled = false;
      paintDiffs();
      const hadScore = score > 0 || hits > 0;
      commitScore();
      hintEl.textContent = hadScore
        ? `Score saved · ${score} pts · ${hits} hits`
        : "Run ended";
      syncPauseUi();
    }

    function start() {
      if (paused || pausedByVisibility) return;
      clearAll();
      score = 0;
      lives = 3;
      combo = 0;
      bestCombo = 0;
      hits = 0;
      misses = 0;
      round = 0;
      submitted = false;
      paused = false;
      pausedByVisibility = false;
      running = true;
      scoreEl.textContent = "0";
      comboEl.textContent = "0";
      paintLives();
      paintDiffs();
      startBtn.textContent = "Running…";
      startBtn.disabled = true;
      hintEl.textContent = "Tap the glow!";
      window.ArcadeSFX?.go?.() || window.ArcadeSFX?.click?.();
      scheduleSpawn();
      // First targets immediately
      spawnOne();
      if (DIFFS[diff].multi > 1) spawnOne();
      syncPauseUi();
    }

    startBtn.addEventListener("click", start);
    pauseBtn.addEventListener("click", pauseRun);
    resumeBtn.addEventListener("click", resume);
    bankBtn.addEventListener("click", bankRun);
    paintDiffs();
    paintLives();
    syncPauseUi();

    // Number keys 1–9 map to cells when running; P pauses
    function onKey(e) {
      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (running) pauseRun();
        else if (paused && !submitted && lives > 0) resume();
        return;
      }
      if (!running || paused) return;
      if (e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        onCell(Number(e.key) - 1);
      }
    }
    window.addEventListener("keydown", onKey);

    function onVisibility() {
      if (document.hidden) {
        if (running) {
          running = false;
          pausedByVisibility = true;
          freezeTimers();
          hintEl.textContent = "Paused (tab hidden) · return to resume";
        }
      } else if (pausedByVisibility && !submitted && lives > 0) {
        resume();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return {
      destroy() {
        commitScore();
        running = false;
        paused = false;
        clearAll();
        window.removeEventListener("keydown", onKey);
        document.removeEventListener("visibilitychange", onVisibility);
        root.innerHTML = "";
      },
    };
  }

  global.GameTapper = { mount };
})(window);
