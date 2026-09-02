/**
 * Circuit Breaker — brick banks that grow 1.5× each clear.
 * Level 1 is 8×1; bricks and the paddle shrink to fit denser boards.
 * Split doubles the swarm until the field floods and a bank clears.
 */
(function (global) {
  "use strict";

  /** @typedef {{ id: string, label: string, color: string, glyph: string, duration: number }} PowerDef */

  /** @type {Record<string, PowerDef>} */
  const POWERS = {
    wide: { id: "wide", label: "Wide", color: "#2dd4bf", glyph: "▬▬", duration: 520 },
    multi: { id: "multi", label: "Split", color: "#38bdf8", glyph: "✱", duration: 0 },
    extra: { id: "extra", label: "Extra ball", color: "#a78bfa", glyph: "+", duration: 0 },
    life: { id: "life", label: "+Life", color: "#fb7185", glyph: "♥", duration: 0 },
  };

  const POWER_DROP_ORDER = ["wide", "multi", "extra", "life"];
  const MAX_BALLS = 96;
  const BALL_R = 5;
  const LEVEL_GROWTH = 1.5;
  const BASE_COLS = 8;
  const BASE_ROWS = 1;
  const MAX_COLS = 72;
  const MAX_ROWS = 32;
  const BANK_TOP = 28;
  const SELECT_MAX = 12;
  const LAYOUT_W = 480;
  const WIDE_END_GAP = 12;
  const WIDE_MAX_STACKS = 6;

  function layoutDims(level, boardW = LAYOUT_W) {
    const n = Math.max(1, Math.floor(Number(level) || 1));
    let cols = BASE_COLS;
    let rows = BASE_ROWS;
    for (let i = 1; i < n; i++) {
      cols = Math.min(MAX_COLS, Math.max(cols + 1, Math.round(cols * LEVEL_GROWTH)));
      rows = Math.min(MAX_ROWS, Math.max(rows + 1, Math.round(rows * LEVEL_GROWTH)));
    }
    const gap = cols >= 36 ? 1 : cols >= 18 ? 2 : 4;
    const bw = Math.max(3, (boardW - gap * (cols + 1)) / cols);
    const bh = Math.max(3, Math.min(bw * 0.4, 16));
    return { cols, rows, gap, bw, bh, rowStep: bh + gap };
  }

  function mount(root, { onScore }) {
    root.innerHTML = `
      <div class="breaker-wrap">
        <div class="diff-bar" id="br-levels" role="tablist" aria-label="Level"></div>
        <div class="game-hud">
          <div><span class="hud-label">Score</span><strong id="br-score">0</strong></div>
          <div><span class="hud-label">Lives</span><strong id="br-lives">3</strong></div>
          <div><span class="hud-label">Level</span><strong id="br-row">1</strong></div>
        </div>
        <div class="br-powers" id="br-powers" aria-live="polite"></div>
        <div class="br-stage">
          <canvas id="br-canvas" width="480" height="560" aria-label="Circuit Breaker"></canvas>
          <div class="br-pickup-toast" id="br-pickup-toast" hidden></div>
        </div>
        <p class="game-hint" id="br-hint">Pick a level · catch capsules with the paddle · 8×1 start</p>
        <div class="game-actions">
          <button type="button" class="btn primary" id="br-start">Start / Restart</button>
        </div>
      </div>
    `;

    const canvas = root.querySelector("#br-canvas");
    const scoreEl = root.querySelector("#br-score");
    const livesEl = root.querySelector("#br-lives");
    const rowEl = root.querySelector("#br-row");
    const hintEl = root.querySelector("#br-hint");
    const startBtn = root.querySelector("#br-start");
    const powersEl = root.querySelector("#br-powers");
    const pickupToast = root.querySelector("#br-pickup-toast");
    const levelsEl = root.querySelector("#br-levels");

    const W = 480;
    const H = 560;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = "100%";
    canvas.style.maxWidth = W + "px";
    canvas.style.height = "auto";
    canvas.style.aspectRatio = `${W} / ${H}`;
    canvas.style.display = "block";
    canvas.style.margin = "0 auto";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let running = false;
    let paused = false;
    let pausedByVisibility = false;
    let raf = 0;
    let last = 0;
    let score = 0;
    let lives = 3;
    let row = 1;
    let selectedLevel = 1;
    let paddle = { x: W / 2, w: 148, h: 12, y: H - 32 };
    let balls = [];
    let bricks = [];
    let drops = [];
    let active = {};
    let submitted = false;
    let toastTimer = 0;
    let powerMarkup = "";
    let wideStacks = 0;

    function has(id) {
      return (active[id] || 0) > 0;
    }

    function layoutForLevel(level) {
      const L = layoutDims(level, W);
      const paddleW = Math.max(22, Math.min(160, L.bw * 2.35));
      const ballR = Math.max(2.6, Math.min(BALL_R, L.bw * 0.18 + 2.2));
      return { ...L, paddleW, ballR };
    }

    function paddleWidth() {
      const L = layoutForLevel(row);
      const maxW = Math.max(L.paddleW, W - WIDE_END_GAP * 2);
      if (wideStacks <= 0) return L.paddleW;
      const t = Math.min(1, wideStacks / WIDE_MAX_STACKS);
      return L.paddleW + (maxW - L.paddleW) * t;
    }

    function clampPaddle() {
      paddle.w = paddleWidth();
      paddle.h = Math.max(7, Math.min(12, layoutForLevel(row).bh * 0.45 + 6));
      paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, paddle.x));
    }

    function applyLayout(L) {
      const layout = L || layoutForLevel(row);
      for (const ball of balls) ball.r = layout.ballR;
      clampPaddle();
    }

    function makeBall(x, y, vx, vy) {
      return { x, y, vx, vy, r: layoutForLevel(row).ballR };
    }

    function serveBall() {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
      const sp = 3.2 + Math.min(5.5, (row - 1) * 0.35);
      return makeBall(paddle.x, paddle.y - 16, Math.cos(a) * sp, Math.sin(a) * sp);
    }

    function resetBalls() {
      balls = [serveBall()];
    }

    function makeRow(y, L, hardness) {
      const list = [];
      const skip = L.cols <= 12 ? 0 : 0.03;
      for (let c = 0; c < L.cols; c++) {
        if (Math.random() < skip) continue;
        list.push({
          x: L.gap + c * (L.bw + L.gap),
          y,
          w: L.bw,
          h: L.bh,
          hp: 1 + Math.floor(hardness / 6) + (Math.random() < 0.12 ? 1 : 0),
        });
      }
      return list;
    }

    function spawnBank(level) {
      const L = layoutForLevel(level);
      bricks = [];
      for (let r = 0; r < L.rows; r++) {
        bricks.push(...makeRow(BANK_TOP + r * L.rowStep, L, level + r));
      }
      applyLayout(L);
    }

    function paintLevels() {
      if (!levelsEl) return;
      levelsEl.innerHTML = Array.from({ length: SELECT_MAX }, (_, i) => {
        const n = i + 1;
        const on = n === selectedLevel;
        return `<button type="button" class="diff-chip${on ? " active" : ""}" data-level="${n}" ${running ? "disabled" : ""} role="tab" aria-selected="${on ? "true" : "false"}">Lv ${n}</button>`;
      }).join("");
      levelsEl.querySelectorAll("[data-level]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (running) return;
          selectedLevel = Number(btn.dataset.level) || 1;
          window.ArcadeSFX?.click?.();
          previewLevel(selectedLevel);
        });
      });
    }

    function previewLevel(level) {
      row = level;
      selectedLevel = level;
      score = 0;
      lives = 3;
      submitted = false;
      active = {};
      wideStacks = 0;
      drops = [];
      spawnBank(level);
      paddle.x = W / 2;
      clampPaddle();
      resetBalls();
      scoreEl.textContent = "0";
      livesEl.textContent = "3";
      rowEl.textContent = String(level);
      const L = layoutForLevel(level);
      hintEl.textContent = `Level ${level} · ${L.cols}×${L.rows} · catch capsules with the paddle`;
      paintLevels();
      paintPowers();
      draw();
    }

    function paintPowers() {
      const chips = POWER_DROP_ORDER.filter((id) => POWERS[id].duration > 0 && has(id)).map((id) => {
        const p = POWERS[id];
        const t = Math.ceil((active[id] || 0) / 60);
        const stacks = id === "wide" && wideStacks > 1 ? ` ×${wideStacks}` : "";
        return `<span class="br-power-chip" style="--pc:${p.color}">${p.glyph} ${p.label}${stacks} <small>${t}s</small></span>`;
      });
      if (balls.length > 1) {
        chips.unshift(
          `<span class="br-power-chip" style="--pc:#38bdf8">●×${balls.length} balls</span>`
        );
      }
      const nextMarkup = chips.length
        ? chips.join("")
        : `<span class="br-power-empty">Stack Split to flood the field</span>`;
      if (nextMarkup === powerMarkup) return;
      powerMarkup = nextMarkup;
      powersEl.innerHTML = nextMarkup;
    }

    function showPickup(text, color) {
      pickupToast.hidden = false;
      pickupToast.textContent = text;
      pickupToast.style.borderColor = color;
      pickupToast.style.color = color;
      pickupToast.classList.remove("play");
      void pickupToast.offsetWidth;
      pickupToast.classList.add("play");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        pickupToast.hidden = true;
        pickupToast.classList.remove("play");
      }, 900);
    }

    function splitBalls() {
      if (!balls.length || balls.length >= MAX_BALLS) return;
      const spawned = [];
      for (const ball of balls) {
        if (balls.length + spawned.length >= MAX_BALLS) break;
        const speed = Math.max(2.8, Math.hypot(ball.vx, ball.vy));
        const ang = Math.atan2(ball.vy, ball.vx);
        const spread = 0.32 + Math.random() * 0.28;
        spawned.push(
          makeBall(ball.x, ball.y, Math.cos(ang + spread) * speed, Math.sin(ang + spread) * speed)
        );
      }
      balls = balls.concat(spawned).slice(0, MAX_BALLS);
    }

    function applyPower(id) {
      const def = POWERS[id];
      if (!def) return;

      if (id === "life") {
        lives = Math.min(6, lives + 1);
        livesEl.textContent = String(lives);
        showPickup("♥ Extra life!", def.color);
        global.ArcadeSFX?.match?.() || global.ArcadeSFX?.win?.();
        paintPowers();
        return;
      }

      if (id === "multi") {
        splitBalls();
        showPickup(`✱ Split · ×${balls.length}`, def.color);
        global.ArcadeSFX?.levelUp?.() || global.ArcadeSFX?.match?.();
        paintPowers();
        hintEl.textContent =
          balls.length >= 24 ? `Flood · ${balls.length} balls` : `${balls.length} balls in play`;
        return;
      }

      if (id === "extra") {
        const add = Math.max(1, Math.min(MAX_BALLS - balls.length, balls.length));
        for (let i = 0; i < add; i++) balls.push(serveBall());
        showPickup(add > 1 ? `+ ${add} balls · ×${balls.length}` : "+ Extra ball!", def.color);
        global.ArcadeSFX?.levelUp?.() || global.ArcadeSFX?.match?.();
        paintPowers();
        hintEl.textContent =
          balls.length >= 24 ? `Flood · ${balls.length} balls` : `${balls.length} balls in play`;
        return;
      }

      if (id === "wide") {
        wideStacks = Math.min(WIDE_MAX_STACKS, wideStacks + 1);
        active.wide = def.duration * 1.35;
        showPickup(
          wideStacks >= WIDE_MAX_STACKS ? "▬▬ Full width!" : `▬▬ Wide ×${wideStacks}`,
          def.color
        );
        global.ArcadeSFX?.levelUp?.() || global.ArcadeSFX?.match?.();
        clampPaddle();
        paintPowers();
        hintEl.textContent =
          wideStacks >= WIDE_MAX_STACKS
            ? "Paddle spans the board"
            : `Wide ×${wideStacks} · more Wide grows the bar`;
        return;
      }

      active[id] = Math.min((active[id] || 0) + def.duration, def.duration * 2.2);
      showPickup(`${def.glyph} ${def.label}!`, def.color);
      global.ArcadeSFX?.levelUp?.() || global.ArcadeSFX?.match?.();
      clampPaddle();
      paintPowers();
      hintEl.textContent = `${def.label} online`;
    }

    function maybeDrop(x, y) {
      if (drops.length > 18) return;
      const swarm = balls.length >= 8;
      const chance = swarm ? 0.34 : Math.min(0.62, 0.48 + row * 0.01);
      if (Math.random() > chance) return;
      const roll = Math.random();
      let id = "wide";
      if (roll < 0.06) id = "life";
      else if (roll < (swarm ? 0.58 : 0.4)) id = "multi";
      else if (roll < (swarm ? 0.84 : 0.68)) id = "extra";
      else id = "wide";
      const def = POWERS[id];
      drops.push({
        x,
        y: y + 12,
        id,
        vy: 1.7 + Math.random() * 0.5,
        color: def.color,
        glyph: def.glyph,
      });
    }

    function paddleCaught(p) {
      return (
        p.y + 8 >= paddle.y &&
        p.y - 8 <= paddle.y + paddle.h &&
        p.x >= paddle.x - paddle.w / 2 - 8 &&
        p.x <= paddle.x + paddle.w / 2 + 8
      );
    }

    function init() {
      paused = false;
      pausedByVisibility = false;
      previewLevel(selectedLevel);
    }

    function commitScore() {
      if (submitted) return;
      if (!(score > 0 || row > 1)) return;
      submitted = true;
      onScore?.({ score, meta: { row } });
    }

    function endRun() {
      running = false;
      paused = false;
      cancelAnimationFrame(raf);
      startBtn.disabled = false;
      startBtn.textContent = "Play again";
      selectedLevel = row;
      hintEl.textContent = `Circuit fried · ${score} pts · level ${row}`;
      commitScore();
      paintLevels();
    }

    function draw() {
      ctx.fillStyle = "#05080f";
      ctx.fillRect(0, 0, W, H);

      for (const b of bricks) {
        const hue = 160 + b.hp * 25;
        ctx.fillStyle = `hsl(${hue} 70% 48%)`;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }

      for (const p of drops) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 11, p.y - 8, 22, 16);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#0b1220";
        ctx.font = "11px Outfit, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.glyph, p.x, p.y + 0.5);
      }

      clampPaddle();
      ctx.fillStyle = has("wide") ? "#5eead4" : "#2dd4bf";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = has("wide") ? 12 : 0;
      ctx.fillRect(paddle.x - paddle.w / 2, paddle.y, paddle.w, paddle.h);
      ctx.shadowBlur = 0;

      const swarm = balls.length > 1;
      const glow = balls.length < 12;
      ctx.fillStyle = swarm ? "#38bdf8" : "#fbbf24";
      if (glow) {
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 8;
      }
      for (const ball of balls) {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, balls.length > 40 ? 4 : ball.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (glow) ctx.shadowBlur = 0;

      if (!running) {
        ctx.fillStyle = "rgba(226,232,240,0.9)";
        ctx.font = "16px Outfit, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(paused ? "Paused · tap to resume" : "Tap to start", W / 2, H / 2);
      }
    }

    function bouncePaddle(ball) {
      if (
        ball.vy > 0 &&
        ball.y + ball.r >= paddle.y &&
        ball.y - ball.r <= paddle.y + paddle.h &&
        ball.x >= paddle.x - paddle.w / 2 &&
        ball.x <= paddle.x + paddle.w / 2
      ) {
        ball.y = paddle.y - ball.r;
        ball.vy = -Math.abs(ball.vy);
        const offset = (ball.x - paddle.x) / (paddle.w / 2);
        ball.vx = offset * 3.6;
        if (balls.length < 12) global.ArcadeSFX?.tick?.();
      }
    }

    function hitBrick(ball) {
      for (let i = bricks.length - 1; i >= 0; i--) {
        const b = bricks[i];
        if (
          ball.x + ball.r > b.x &&
          ball.x - ball.r < b.x + b.w &&
          ball.y + ball.r > b.y &&
          ball.y - ball.r < b.y + b.h
        ) {
          b.hp -= 1;
          const overlapL = ball.x + ball.r - b.x;
          const overlapR = b.x + b.w - (ball.x - ball.r);
          const overlapT = ball.y + ball.r - b.y;
          const overlapB = b.y + b.h - (ball.y - ball.r);
          const minX = Math.min(overlapL, overlapR);
          const minY = Math.min(overlapT, overlapB);
          const flood = balls.length >= 16;
          if (!flood || Math.random() < 0.35) {
            if (minX < minY) ball.vx *= -1;
            else ball.vy *= -1;
          }
          maybeDrop(b.x + b.w / 2, b.y + b.h / 2);
          if (b.hp <= 0) {
            bricks.splice(i, 1);
            score += 20 + Math.min(40, row);
            scoreEl.textContent = String(score);
            if (!flood || Math.random() < 0.08) {
              global.ArcadeSFX?.hit?.() || global.ArcadeSFX?.click?.();
            }
          } else if (!flood) {
            global.ArcadeSFX?.tick?.();
          }
          return true;
        }
      }
      return false;
    }

    function beginLevel(level, { keepScore = false } = {}) {
      row = Math.max(1, level);
      selectedLevel = row;
      if (!keepScore) {
        score = 0;
        scoreEl.textContent = "0";
      }
      lives = keepScore ? lives : 3;
      livesEl.textContent = String(lives);
      submitted = false;
      active = {};
      wideStacks = 0;
      drops = [];
      spawnBank(row);
      paddle.x = W / 2;
      clampPaddle();
      resetBalls();
      rowEl.textContent = String(row);
      const L = layoutForLevel(row);
      hintEl.textContent = `Level ${row} · ${L.cols}×${L.rows} · catch capsules with the paddle`;
      paintLevels();
      paintPowers();
    }

    function floodClear() {
      showPickup(`LEVEL ${row + 1}`, "#38bdf8");
      global.ArcadeSFX?.win?.() || global.ArcadeSFX?.levelUp?.();
      beginLevel(row + 1, { keepScore: true });
    }

    function frame(ts) {
      if (!running) return;
      const dt = Math.min(32, ts - (last || ts)) / 16.67;
      last = ts;

      let powersDirty = false;
      for (const id of Object.keys(active)) {
        if (active[id] > 0) {
          active[id] -= dt;
          if (active[id] <= 0) {
            active[id] = 0;
            if (id === "wide") wideStacks = 0;
            powersDirty = true;
            hintEl.textContent = `${POWERS[id]?.label || id} expired`;
            if (id === "wide") clampPaddle();
          }
        }
      }
      if (powersDirty || Math.floor(ts / 250) % 2 === 0) paintPowers();

      for (const ball of balls) {
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        if (ball.x < ball.r) {
          ball.x = ball.r;
          ball.vx *= -1;
        }
        if (ball.x > W - ball.r) {
          ball.x = W - ball.r;
          ball.vx *= -1;
        }
        if (ball.y < ball.r) {
          ball.y = ball.r;
          ball.vy *= -1;
        }

        bouncePaddle(ball);
        hitBrick(ball);
      }

      balls = balls.filter((ball) => ball.y <= H + 24);

      drops = drops.filter((p) => {
        p.y += p.vy * dt;
        if (paddleCaught(p)) {
          applyPower(p.id);
          return false;
        }
        return p.y < H + 20;
      });

      if (!bricks.length) {
        floodClear();
      }

      if (!balls.length) {
        lives -= 1;
        livesEl.textContent = String(lives);
        global.ArcadeSFX?.lose?.();
        if (lives <= 0) {
          endRun();
          draw();
          return;
        }
        active = {};
        resetBalls();
        paintPowers();
      }

      draw();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      beginLevel(selectedLevel);
      running = true;
      paused = false;
      startBtn.disabled = true;
      startBtn.textContent = "Running…";
      paintLevels();
      last = 0;
      global.ArcadeSFX?.go?.() || global.ArcadeSFX?.click?.();
      raf = requestAnimationFrame(frame);
    }

    function resume() {
      if (running || submitted || lives <= 0) return;
      paused = false;
      pausedByVisibility = false;
      running = true;
      last = 0;
      startBtn.disabled = true;
      startBtn.textContent = "Running…";
      const L = layoutForLevel(row);
      hintEl.textContent = `Level ${row} · ${L.cols}×${L.rows} · catch capsules with the paddle`;
      raf = requestAnimationFrame(frame);
    }

    function pointerToX(clientX) {
      const r = canvas.getBoundingClientRect();
      const x = ((clientX - r.left) / r.width) * W;
      paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, x));
    }

    canvas.addEventListener("pointerdown", (e) => {
      pointerToX(e.clientX);
      canvas.setPointerCapture?.(e.pointerId);
      if (paused || pausedByVisibility) resume();
      else if (!running) start();
    });
    canvas.addEventListener("pointermove", (e) => {
      pointerToX(e.clientX);
    });
    startBtn.addEventListener("click", () => {
      if (paused || pausedByVisibility) resume();
      else start();
    });

    function onKey(e) {
      if (e.key === "ArrowLeft" || e.key === "a") paddle.x = Math.max(paddle.w / 2, paddle.x - 18);
      if (e.key === "ArrowRight" || e.key === "d") paddle.x = Math.min(W - paddle.w / 2, paddle.x + 18);
      if (e.key.toLowerCase() === "p") {
        if (running) {
          running = false;
          paused = true;
          cancelAnimationFrame(raf);
          startBtn.disabled = false;
          startBtn.textContent = "Resume";
          hintEl.textContent = "Paused · tap playfield or P to resume";
          draw();
        } else if (!submitted && lives > 0 && balls.length) {
          resume();
        }
        return;
      }
      if (!running && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        if (paused || pausedByVisibility) resume();
        else start();
      }
    }
    window.addEventListener("keydown", onKey);

    function onVisibility() {
      if (document.hidden) {
        if (running) {
          running = false;
          cancelAnimationFrame(raf);
          pausedByVisibility = true;
          hintEl.textContent = "Paused (tab hidden) · return to resume";
        }
      } else if (pausedByVisibility && !submitted && lives > 0) {
        resume();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    init();
    draw();

    return {
      destroy() {
        commitScore();
        running = false;
        paused = false;
        cancelAnimationFrame(raf);
        clearTimeout(toastTimer);
        window.removeEventListener("keydown", onKey);
        document.removeEventListener("visibilitychange", onVisibility);
        root.innerHTML = "";
      },
    };
  }

  global.GameBreaker = { mount, layoutDims };
})(window);
