/**
 * Circuit Breaker — endless brick breaker with falling power-ups.
 * Wide paddle, split / extra balls, slow-mo, and extra lives.
 */
(function (global) {
  "use strict";

  /** @typedef {{ id: string, label: string, color: string, glyph: string, duration: number }} PowerDef */

  /** @type {Record<string, PowerDef>} */
  const POWERS = {
    wide: { id: "wide", label: "Wide", color: "#2dd4bf", glyph: "▬▬", duration: 520 },
    multi: { id: "multi", label: "Split", color: "#38bdf8", glyph: "✱", duration: 0 },
    extra: { id: "extra", label: "Extra ball", color: "#a78bfa", glyph: "+", duration: 0 },
    slow: { id: "slow", label: "Slow-mo", color: "#fbbf24", glyph: "⏳", duration: 420 },
    life: { id: "life", label: "+Life", color: "#fb7185", glyph: "♥", duration: 0 },
  };

  const POWER_DROP_ORDER = ["wide", "multi", "extra", "slow", "life"];
  const MAX_BALLS = 8;
  const BASE_PADDLE_W = 78;
  const BALL_R = 6;

  function mount(root, { onScore }) {
    root.innerHTML = `
      <div class="breaker-wrap">
        <div class="game-hud">
          <div><span class="hud-label">Score</span><strong id="br-score">0</strong></div>
          <div><span class="hud-label">Lives</span><strong id="br-lives">3</strong></div>
          <div><span class="hud-label">Row</span><strong id="br-row">1</strong></div>
        </div>
        <div class="br-powers" id="br-powers" aria-live="polite"></div>
        <div class="br-stage">
          <canvas id="br-canvas" width="420" height="480" aria-label="Circuit Breaker"></canvas>
          <div class="br-pickup-toast" id="br-pickup-toast" hidden></div>
        </div>
        <p class="game-hint" id="br-hint">Drag / move to aim the paddle · tap canvas to start · catch falling power-ups</p>
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

    const W = 420;
    const H = 480;
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
    let paddle = { x: W / 2, w: BASE_PADDLE_W, h: 12, y: H - 28 };
    let balls = [];
    let bricks = [];
    let drops = [];
    let active = {};
    let submitted = false;
    let toastTimer = 0;

    function has(id) {
      return (active[id] || 0) > 0;
    }

    function paddleWidth() {
      const shrink = Math.floor(row / 8) * 2;
      const wide = has("wide") ? 42 : 0;
      return Math.max(48, Math.min(160, BASE_PADDLE_W - shrink + wide));
    }

    function clampPaddle() {
      paddle.w = paddleWidth();
      paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, paddle.x));
    }

    function makeBall(x, y, vx, vy) {
      return { x, y, vx, vy, r: BALL_R };
    }

    function serveBall() {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
      const sp = 3.2 + Math.min(4, row * 0.08);
      return makeBall(paddle.x, paddle.y - 16, Math.cos(a) * sp, Math.sin(a) * sp);
    }

    function resetBalls() {
      balls = [serveBall()];
    }

    function makeRow(y, hardness) {
      const cols = 8;
      const gap = 4;
      const bw = (W - gap * (cols + 1)) / cols;
      const bh = 14;
      const list = [];
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.12) continue;
        list.push({
          x: gap + c * (bw + gap),
          y,
          w: bw,
          h: bh,
          hp: 1 + Math.floor(hardness / 4) + (Math.random() < 0.2 ? 1 : 0),
        });
      }
      return list;
    }

    function paintPowers() {
      const chips = POWER_DROP_ORDER.filter((id) => POWERS[id].duration > 0 && has(id)).map((id) => {
        const p = POWERS[id];
        const t = Math.ceil((active[id] || 0) / 60);
        return `<span class="br-power-chip" style="--pc:${p.color}">${p.glyph} ${p.label} <small>${t}s</small></span>`;
      });
      if (balls.length > 1) {
        chips.unshift(
          `<span class="br-power-chip" style="--pc:#38bdf8">●×${balls.length} balls</span>`
        );
      }
      powersEl.innerHTML = chips.length
        ? chips.join("")
        : `<span class="br-power-empty">Break bricks · catch falling power-ups</span>`;
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
      const next = [];
      for (const ball of balls) {
        if (next.length >= MAX_BALLS) {
          next.push(ball);
          continue;
        }
        const speed = Math.max(2.6, Math.hypot(ball.vx, ball.vy));
        const ang = Math.atan2(ball.vy, ball.vx);
        next.push(makeBall(ball.x, ball.y, Math.cos(ang - 0.42) * speed, Math.sin(ang - 0.42) * speed));
        if (next.length < MAX_BALLS) {
          next.push(makeBall(ball.x, ball.y, Math.cos(ang + 0.42) * speed, Math.sin(ang + 0.42) * speed));
        }
      }
      balls = next.slice(0, MAX_BALLS);
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
        showPickup("✱ Split shot!", def.color);
        global.ArcadeSFX?.levelUp?.() || global.ArcadeSFX?.match?.();
        paintPowers();
        hintEl.textContent = `${balls.length} balls in play`;
        return;
      }

      if (id === "extra") {
        if (balls.length < MAX_BALLS) balls.push(serveBall());
        showPickup("+ Extra ball!", def.color);
        global.ArcadeSFX?.levelUp?.() || global.ArcadeSFX?.match?.();
        paintPowers();
        hintEl.textContent = `${balls.length} balls in play`;
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
      if (Math.random() > Math.min(0.34, 0.16 + row * 0.008)) return;
      const roll = Math.random();
      let id = "wide";
      if (roll < 0.08) id = "life";
      else if (roll < 0.28) id = "multi";
      else if (roll < 0.48) id = "extra";
      else if (roll < 0.68) id = "slow";
      else id = "wide";
      const def = POWERS[id];
      drops.push({
        x,
        y,
        id,
        vy: 1.7 + Math.random() * 0.5,
        color: def.color,
        glyph: def.glyph,
      });
    }

    function init() {
      score = 0;
      lives = 3;
      row = 1;
      submitted = false;
      paused = false;
      pausedByVisibility = false;
      active = {};
      drops = [];
      bricks = [];
      for (let r = 0; r < 5; r++) {
        bricks.push(...makeRow(40 + r * 20, r + 1));
      }
      paddle.x = W / 2;
      clampPaddle();
      resetBalls();
      scoreEl.textContent = "0";
      livesEl.textContent = "3";
      rowEl.textContent = "1";
      paintPowers();
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
      hintEl.textContent = `Circuit fried · ${score} pts · row ${row}`;
      commitScore();
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

      for (const ball of balls) {
        ctx.beginPath();
        ctx.fillStyle = balls.length > 1 ? "#38bdf8" : "#fbbf24";
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 8;
        ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

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
        global.ArcadeSFX?.tick?.();
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
          if (minX < minY) ball.vx *= -1;
          else ball.vy *= -1;
          if (b.hp <= 0) {
            maybeDrop(b.x + b.w / 2, b.y + b.h / 2);
            bricks.splice(i, 1);
            score += 20 + Math.min(40, row);
            scoreEl.textContent = String(score);
            global.ArcadeSFX?.hit?.() || global.ArcadeSFX?.click?.();
          } else {
            global.ArcadeSFX?.tick?.();
          }
          return true;
        }
      }
      return false;
    }

    function pushNewRow() {
      for (const b of bricks) b.y += 20;
      if (bricks.some((b) => b.y + b.h >= paddle.y - 8)) {
        endRun();
        return;
      }
      row += 1;
      rowEl.textContent = String(row);
      bricks.push(...makeRow(36, row));
      clampPaddle();
    }

    function frame(ts) {
      if (!running) return;
      const dt = Math.min(32, ts - (last || ts)) / 16.67;
      last = ts;
      const ballDt = has("slow") ? dt * 0.55 : dt;

      let powersDirty = false;
      for (const id of Object.keys(active)) {
        if (active[id] > 0) {
          active[id] -= dt;
          if (active[id] <= 0) {
            active[id] = 0;
            powersDirty = true;
            hintEl.textContent = `${POWERS[id]?.label || id} expired`;
          }
        }
      }
      if (powersDirty || Math.floor(ts / 250) % 2 === 0) paintPowers();

      for (const ball of balls) {
        ball.x += ball.vx * ballDt;
        ball.y += ball.vy * ballDt;

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
        const caught =
          p.y + 8 >= paddle.y &&
          p.y - 8 <= paddle.y + paddle.h &&
          p.x >= paddle.x - paddle.w / 2 - 8 &&
          p.x <= paddle.x + paddle.w / 2 + 8;
        if (caught) {
          applyPower(p.id);
          return false;
        }
        return p.y < H + 20;
      });

      if (!bricks.length || bricks.every((b) => b.y > 100)) {
        pushNewRow();
        if (!running) {
          draw();
          return;
        }
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
      init();
      running = true;
      paused = false;
      startBtn.disabled = true;
      startBtn.textContent = "Running…";
      hintEl.textContent = "Clear bricks · catch power-ups · rows never stop";
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
      hintEl.textContent = "Clear bricks · catch power-ups · rows never stop";
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

  global.GameBreaker = { mount };
})(window);
