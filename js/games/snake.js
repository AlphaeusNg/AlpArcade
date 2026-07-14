(function (global) {
  "use strict";

  function mount(root, { onScore }) {
    root.innerHTML = `
      <div class="snake-wrap">
        <div class="game-hud">
          <div><span class="hud-label">Score</span><strong id="snake-score">0</strong></div>
          <div><span class="hud-label">Level</span><strong id="snake-level">1</strong></div>
          <div><span class="hud-label">Best</span><strong id="snake-best">0</strong></div>
        </div>
        <div class="snake-progress" aria-live="polite">
          <div class="snake-progress-meta">
            <span>Next level</span>
            <strong id="snake-progress-text">0 / 3 food</strong>
          </div>
          <div class="snake-progress-track">
            <div class="snake-progress-fill" id="snake-progress-fill"></div>
          </div>
          <p class="snake-progress-sub" id="snake-progress-sub">Eat 3 green food to advance</p>
        </div>
        <canvas id="snake-canvas" width="360" height="360" aria-label="Snake game"></canvas>
        <p class="game-hint" id="snake-hint">Arrows / WASD · swipe · P pause</p>
        <div class="game-actions">
          <button type="button" class="btn primary" id="snake-start">Start / Restart</button>
        </div>
      </div>
    `;

    const canvas = root.querySelector("#snake-canvas");
    const ctx = canvas.getContext("2d");
    const scoreEl = root.querySelector("#snake-score");
    const bestEl = root.querySelector("#snake-best");
    const levelEl = root.querySelector("#snake-level");
    const hintEl = root.querySelector("#snake-hint");
    const progressText = root.querySelector("#snake-progress-text");
    const progressFill = root.querySelector("#snake-progress-fill");
    const progressSub = root.querySelector("#snake-progress-sub");

    const COLS = 18;
    const ROWS = 18;
    const cell = canvas.width / COLS;
    const DIRS = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];

    let snake, dir, nextDir, food, hazards, score, level, foodsThisLevel, running, tickMs, timer, submitted;

    bestEl.textContent = String(window.ArcadeScores?.getState()?.highScores?.snake?.best || 0);

    function levelConfig(lv) {
      return {
        tick: Math.max(48, 150 - (lv - 1) * 10),
        need: 3 + Math.floor(lv - 1), // Lv1:3, Lv2:4, …
        hazards: Math.min(10, Math.floor((lv - 1) / 2)),
        wrap: lv < 4,
        bonus: 10 + (lv - 1) * 4,
      };
    }

    function keyOf(x, y) {
      return x + "," + y;
    }

    function inBounds(x, y) {
      return x >= 0 && y >= 0 && x < COLS && y < ROWS;
    }

    function normalizePos(x, y, wrap) {
      if (wrap) {
        return {
          x: ((x % COLS) + COLS) % COLS,
          y: ((y % ROWS) + ROWS) % ROWS,
        };
      }
      if (!inBounds(x, y)) return null;
      return { x, y };
    }

    function bodySet(body) {
      const set = new Set();
      for (const s of body) set.add(keyOf(s.x, s.y));
      return set;
    }

    function hazardSet(list) {
      const set = new Set();
      for (const h of list) set.add(keyOf(h.x, h.y));
      return set;
    }

    /**
     * BFS free cells from start. Blocked = body + hazards (+ walls if !wrap).
     * Returns { count, canReach(target), freeNeighbors of start, cells Set }.
     */
    function analyzeReach(start, body, hazardList, wrap, excludeTail = false) {
      const blocked = bodySet(body);
      // Growing snake: tail will move unless we just ate — for escape checks use current body.
      // Optionally free the tail cell as it will vacate next non-eat move.
      if (excludeTail && body.length > 1) {
        const tail = body[body.length - 1];
        blocked.delete(keyOf(tail.x, tail.y));
      }
      const haz = hazardSet(hazardList);
      const visited = new Set();
      const q = [];
      const sk = keyOf(start.x, start.y);
      if (haz.has(sk)) {
        return { count: 0, freeNeighbors: 0, canReach: () => false, cells: visited };
      }
      q.push(start);
      visited.add(sk);

      while (q.length) {
        const cur = q.shift();
        for (const d of DIRS) {
          const n = normalizePos(cur.x + d.x, cur.y + d.y, wrap);
          if (!n) continue;
          const k = keyOf(n.x, n.y);
          if (visited.has(k) || blocked.has(k) || haz.has(k)) continue;
          visited.add(k);
          q.push(n);
        }
      }

      let freeNeighbors = 0;
      for (const d of DIRS) {
        const n = normalizePos(start.x + d.x, start.y + d.y, wrap);
        if (!n) continue;
        const k = keyOf(n.x, n.y);
        if (!blocked.has(k) && !haz.has(k)) freeNeighbors += 1;
      }

      return {
        count: visited.size,
        freeNeighbors,
        canReach(tx, ty) {
          return visited.has(keyOf(tx, ty));
        },
        cells: visited,
      };
    }

    function isSafeLayout(body, hazardList, wrap, foodPos) {
      const head = body[0];
      // Immediate escape: at least 1 free neighbor (prefer 2 when possible)
      const analysis = analyzeReach(head, body, hazardList, wrap, true);
      if (analysis.freeNeighbors < 1) return false;

      // Enough room to maneuver (not a tiny sealed pocket)
      const minRoom = Math.max(body.length + 8, Math.floor(COLS * ROWS * 0.12));
      if (analysis.count < minRoom) return false;

      // If food exists, it must be reachable
      if (foodPos && !analysis.canReach(foodPos.x, foodPos.y)) return false;

      // Head must not be completely boxed into a dead-end of size < snake
      if (analysis.count < body.length) return false;

      return true;
    }

    /** Cells we refuse to put spikes on when generating mid-game. */
    function protectedCells(body, wrap) {
      const set = new Set();
      const head = body[0];
      // Full snake body is already blocked; also protect a bubble around the head
      // and the cell currently being moved into (next step).
      for (const s of body) set.add(keyOf(s.x, s.y));
      for (const d of DIRS) {
        const n = normalizePos(head.x + d.x, head.y + d.y, wrap);
        if (n) set.add(keyOf(n.x, n.y));
        // 2-tile bubble along cardinal directions so spikes can't pin you to a wall
        const n2 = normalizePos(head.x + d.x * 2, head.y + d.y * 2, wrap);
        if (n2) set.add(keyOf(n2.x, n2.y));
      }
      // Never block the immediate forward cell
      const fwd = normalizePos(head.x + dir.x, head.y + dir.y, wrap);
      if (fwd) set.add(keyOf(fwd.x, fwd.y));
      const fwd2 = normalizePos(head.x + dir.x * 2, head.y + dir.y * 2, wrap);
      if (fwd2) set.add(keyOf(fwd2.x, fwd2.y));
      return set;
    }

    function rebuildHazards(count, wrap) {
      hazards = [];
      if (count <= 0) return;

      const protect = protectedCells(snake, wrap);
      const candidates = [];
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const k = keyOf(x, y);
          if (protect.has(k)) continue;
          candidates.push({ x, y });
        }
      }
      // shuffle
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }

      // Greedy: add hazards only if layout stays safe
      for (const c of candidates) {
        if (hazards.length >= count) break;
        const trial = hazards.concat([c]);
        // Food not placed yet at level-up — check without food, then place food after
        if (isSafeLayout(snake, trial, wrap, null)) {
          // Prefer layouts that keep ≥2 free neighbors when possible
          const a = analyzeReach(snake[0], snake, trial, wrap, true);
          if (a.freeNeighbors >= 1) hazards.push(c);
        }
      }

      // If we couldn't place full count safely, keep fewer (safety > density)
      // Final assert: if even empty is weird, clear all
      if (!isSafeLayout(snake, hazards, wrap, null)) {
        hazards = [];
      }
    }

    function placeFood() {
      const cfg = levelConfig(level);
      const wrap = cfg.wrap;
      const analysis = analyzeReach(snake[0], snake, hazards, wrap, true);
      const reachable = [];
      analysis.cells.forEach((k) => {
        const [x, y] = k.split(",").map(Number);
        // Don't put food on head
        if (x === snake[0].x && y === snake[0].y) return;
        reachable.push({ x, y });
      });

      if (reachable.length) {
        // Prefer food not right next to head (gives reaction time) when possible
        const far = reachable.filter((p) => Math.abs(p.x - snake[0].x) + Math.abs(p.y - snake[0].y) > 2);
        const pool = far.length ? far : reachable;
        food = pool[Math.floor(Math.random() * pool.length)];
        return;
      }

      // Fallback: any free cell
      let tries = 0;
      do {
        food = {
          x: Math.floor(Math.random() * COLS),
          y: Math.floor(Math.random() * ROWS),
        };
        tries++;
      } while (
        (snake.some((s) => s.x === food.x && s.y === food.y) ||
          hazards.some((h) => h.x === food.x && h.y === food.y)) &&
        tries < 120
      );
    }

    function updateProgressUI() {
      const cfg = levelConfig(level);
      const need = cfg.need;
      const have = foodsThisLevel;
      const left = Math.max(0, need - have);
      progressText.textContent = `${have} / ${need} food`;
      const pct = Math.min(100, (have / need) * 100);
      progressFill.style.width = pct + "%";
      progressSub.textContent =
        left === 0
          ? `Level ${level} complete — advancing…`
          : left === 1
            ? `1 more food → Level ${level + 1}`
            : `${left} more food → Level ${level + 1}`;
      levelEl.textContent = String(level);
    }

    function reset() {
      snake = [
        { x: 8, y: 9 },
        { x: 7, y: 9 },
        { x: 6, y: 9 },
      ];
      dir = { x: 1, y: 0 };
      nextDir = { ...dir };
      score = 0;
      level = 1;
      foodsThisLevel = 0;
      hazards = [];
      submitted = false;
      const cfg = levelConfig(level);
      tickMs = cfg.tick;
      placeFood();
      scoreEl.textContent = "0";
      levelEl.textContent = "1";
      hintEl.textContent = "Eat green food · avoid red ✕ spikes";
      updateProgressUI();
    }

    function draw() {
      const cfg = levelConfig(level);
      ctx.fillStyle = "#060b14";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(45,212,191,0.06)";
      for (let i = 0; i <= COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cell);
        ctx.lineTo(canvas.width, i * cell);
        ctx.stroke();
      }

      const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 180);
      hazards.forEach((h) => {
        const x = h.x * cell;
        const y = h.y * cell;
        const pad = 1.5;
        const s = cell - pad * 2;

        ctx.shadowColor = `rgba(251, 50, 50, ${0.45 + pulse * 0.35})`;
        ctx.shadowBlur = 10 + pulse * 6;
        ctx.fillStyle = "#450a0a";
        ctx.fillRect(x + pad, y + pad, s, s);
        ctx.shadowBlur = 0;

        const g = ctx.createLinearGradient(x, y, x + cell, y + cell);
        g.addColorStop(0, "#ef4444");
        g.addColorStop(0.5, "#b91c1c");
        g.addColorStop(1, "#7f1d1d");
        ctx.fillStyle = g;
        ctx.fillRect(x + pad, y + pad, s, s);

        ctx.save();
        ctx.beginPath();
        ctx.rect(x + pad, y + pad, s, s);
        ctx.clip();
        ctx.strokeStyle = `rgba(250, 204, 21, ${0.55 + pulse * 0.35})`;
        ctx.lineWidth = 3;
        for (let d = -cell; d < cell * 2; d += 5) {
          ctx.beginPath();
          ctx.moveTo(x + d, y);
          ctx.lineTo(x + d + cell, y + cell);
          ctx.stroke();
        }
        ctx.restore();

        ctx.strokeStyle = "#fca5a5";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + pad + 0.5, y + pad + 0.5, s - 1, s - 1);

        ctx.fillStyle = "#fff7ed";
        ctx.font = `bold ${Math.floor(cell * 0.62)}px Outfit, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,0,0,0.65)";
        ctx.shadowBlur = 4;
        ctx.fillText("✕", x + cell / 2, y + cell / 2 + 0.5);
        ctx.shadowBlur = 0;
      });

      if (food) {
        const fx = food.x * cell + 3;
        const fy = food.y * cell + 3;
        const fs = cell - 6;
        ctx.shadowColor = "#4ade80";
        ctx.shadowBlur = 14;
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(fx, fy, fs, fs);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#bbf7d0";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(fx + 0.5, fy + 0.5, fs - 1, fs - 1);
        ctx.fillStyle = "#ecfdf5";
        ctx.beginPath();
        ctx.arc(food.x * cell + cell / 2, food.y * cell + cell / 2, cell * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }

      snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? "#2dd4bf" : `rgba(56,189,248,${1 - (i / snake.length) * 0.6})`;
        ctx.fillRect(s.x * cell + 1, s.y * cell + 1, cell - 2, cell - 2);
      });

      if (!cfg.wrap) {
        ctx.strokeStyle = "rgba(251,113,133,0.45)";
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
      }
    }

    function advanceLevel() {
      level += 1;
      foodsThisLevel = 0;
      const next = levelConfig(level);
      tickMs = next.tick;

      // Place spikes only where the snake still has a safe escape path
      rebuildHazards(next.hazards, next.wrap);
      // Then food only on cells reachable from the head
      placeFood();

      // If food still unreachable somehow, strip hazards until it works
      let guard = 0;
      while (food && !isSafeLayout(snake, hazards, next.wrap, food) && guard < 20) {
        hazards.pop();
        placeFood();
        guard++;
      }

      levelEl.textContent = String(level);
      hintEl.textContent = next.wrap
        ? `Level ${level} · wrap on · spikes placed with safe path`
        : `Level ${level} · solid walls · spikes placed with safe path`;
      updateProgressUI();
      ArcadeSFX?.levelUp();
      clearInterval(timer);
      timer = setInterval(step, tickMs);
    }

    function step() {
      if (!running) return;
      const cfg = levelConfig(level);
      dir = nextDir;
      let head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

      if (cfg.wrap) {
        head.x = ((head.x % COLS) + COLS) % COLS;
        head.y = ((head.y % ROWS) + ROWS) % ROWS;
      } else if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) {
        gameOver();
        return;
      }

      if (
        snake.some((s) => s.x === head.x && s.y === head.y) ||
        hazards.some((h) => h.x === head.x && h.y === head.y)
      ) {
        gameOver();
        return;
      }

      snake.unshift(head);
      if (food && head.x === food.x && head.y === food.y) {
        ArcadeSFX?.eat();
        score += cfg.bonus;
        foodsThisLevel += 1;
        scoreEl.textContent = String(score);
        updateProgressUI();
        if (foodsThisLevel >= cfg.need) {
          advanceLevel();
        } else {
          placeFood();
        }
      } else {
        snake.pop();
      }
      draw();
    }

    function gameOver() {
      running = false;
      clearInterval(timer);
      ArcadeSFX?.lose();
      ctx.fillStyle = "rgba(5,8,15,0.65)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#e8eef9";
      ctx.font = "bold 22px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 12);
      ctx.font = "14px JetBrains Mono, monospace";
      ctx.fillStyle = "#2dd4bf";
      ctx.fillText(`Score ${score} · Lv ${level}`, canvas.width / 2, canvas.height / 2 + 16);
      if (!submitted && onScore) {
        submitted = true;
        onScore({ score, meta: { level } });
        bestEl.textContent = String(window.ArcadeScores?.getState()?.highScores?.snake?.best || score);
      }
    }

    function start() {
      clearInterval(timer);
      ArcadeSFX?.unlock();
      ArcadeSFX?.click();
      reset();
      running = true;
      draw();
      timer = setInterval(step, tickMs);
    }

    function setDir(nx, ny) {
      if (dir.x === -nx && dir.y === -ny) return;
      nextDir = { x: nx, y: ny };
      ArcadeSFX?.move();
    }

    function onKey(e) {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "p"].includes(k)) {
        e.preventDefault();
      }
      if (k === "arrowup" || k === "w") setDir(0, -1);
      if (k === "arrowdown" || k === "s") setDir(0, 1);
      if (k === "arrowleft" || k === "a") setDir(-1, 0);
      if (k === "arrowright" || k === "d") setDir(1, 0);
      if (k === "p") {
        if (running) {
          running = false;
          clearInterval(timer);
        } else if (snake && !submitted) {
          running = true;
          timer = setInterval(step, tickMs);
        }
      }
    }

    let touchStart = null;
    function onTouchStart(e) {
      const t = e.changedTouches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }
    function onTouchEnd(e) {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
      else setDir(0, dy > 0 ? 1 : -1);
      touchStart = null;
    }

    window.addEventListener("keydown", onKey);
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });
    root.querySelector("#snake-start").addEventListener("click", start);

    reset();
    draw();

    return {
      destroy() {
        running = false;
        clearInterval(timer);
        window.removeEventListener("keydown", onKey);
        root.innerHTML = "";
      },
    };
  }

  global.GameSnake = { mount };
})(window);
