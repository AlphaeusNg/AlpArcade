/**
 * Circuit Breaker — simple brick breaker unlockable cabinet.
 * Endless brick rows; paddle control; no hard level cap.
 */
(function (global) {
  "use strict";

  function mount(root, { onScore }) {
    root.innerHTML = `
      <div class="breaker-wrap">
        <div class="game-hud">
          <div><span class="hud-label">Score</span><strong id="br-score">0</strong></div>
          <div><span class="hud-label">Lives</span><strong id="br-lives">3</strong></div>
          <div><span class="hud-label">Row</span><strong id="br-row">1</strong></div>
        </div>
        <div class="br-stage">
          <canvas id="br-canvas" width="420" height="480" aria-label="Circuit Breaker"></canvas>
        </div>
        <p class="game-hint" id="br-hint">Drag / move to aim the paddle · tap canvas to start · bricks never stop coming</p>
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
    let raf = 0;
    let last = 0;
    let score = 0;
    let lives = 3;
    let row = 1;
    let paddle = { x: W / 2, w: 78, h: 12, y: H - 28 };
    let ball = { x: W / 2, y: H - 50, vx: 2.6, vy: -3.4, r: 6 };
    let bricks = [];
    let submitted = false;

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

    function resetBall() {
      ball.x = paddle.x;
      ball.y = paddle.y - 16;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
      const sp = 3.2 + Math.min(4, row * 0.08);
      ball.vx = Math.cos(a) * sp;
      ball.vy = Math.sin(a) * sp;
    }

    function init() {
      score = 0;
      lives = 3;
      row = 1;
      submitted = false;
      bricks = [];
      for (let r = 0; r < 5; r++) {
        bricks.push(...makeRow(40 + r * 20, r + 1));
      }
      paddle.x = W / 2;
      resetBall();
      scoreEl.textContent = "0";
      livesEl.textContent = "3";
      rowEl.textContent = "1";
    }

    function endRun() {
      if (submitted) return;
      submitted = true;
      running = false;
      cancelAnimationFrame(raf);
      startBtn.disabled = false;
      startBtn.textContent = "Play again";
      hintEl.textContent = `Circuit fried · ${score} pts · row ${row}`;
      onScore?.({ score, meta: { row } });
    }

    function draw() {
      ctx.fillStyle = "#05080f";
      ctx.fillRect(0, 0, W, H);
      // bricks
      for (const b of bricks) {
        const hue = 160 + b.hp * 25;
        ctx.fillStyle = `hsl(${hue} 70% 48%)`;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
      // paddle
      ctx.fillStyle = "#2dd4bf";
      ctx.fillRect(paddle.x - paddle.w / 2, paddle.y, paddle.w, paddle.h);
      // ball
      ctx.beginPath();
      ctx.fillStyle = "#fbbf24";
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      if (!running) {
        ctx.fillStyle = "rgba(226,232,240,0.9)";
        ctx.font = "16px Outfit, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Tap to start", W / 2, H / 2);
      }
    }

    function pushNewRow() {
      // shift bricks down
      for (const b of bricks) b.y += 20;
      // lose if bricks reach paddle
      if (bricks.some((b) => b.y + b.h >= paddle.y - 8)) {
        endRun();
        return;
      }
      row += 1;
      rowEl.textContent = String(row);
      bricks.push(...makeRow(36, row));
      // soft paddle shrink at high rows, floor so still playable
      paddle.w = Math.max(48, 78 - Math.floor(row / 8) * 2);
    }

    function frame(ts) {
      if (!running) return;
      const dt = Math.min(32, ts - (last || ts)) / 16.67;
      last = ts;

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

      // paddle
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

      // bricks
      for (let i = bricks.length - 1; i >= 0; i--) {
        const b = bricks[i];
        if (
          ball.x + ball.r > b.x &&
          ball.x - ball.r < b.x + b.w &&
          ball.y + ball.r > b.y &&
          ball.y - ball.r < b.y + b.h
        ) {
          b.hp -= 1;
          // bounce from nearest side
          const overlapL = ball.x + ball.r - b.x;
          const overlapR = b.x + b.w - (ball.x - ball.r);
          const overlapT = ball.y + ball.r - b.y;
          const overlapB = b.y + b.h - (ball.y - ball.r);
          const minX = Math.min(overlapL, overlapR);
          const minY = Math.min(overlapT, overlapB);
          if (minX < minY) ball.vx *= -1;
          else ball.vy *= -1;
          if (b.hp <= 0) {
            bricks.splice(i, 1);
            score += 20 + Math.min(40, row);
            scoreEl.textContent = String(score);
            global.ArcadeSFX?.hit?.() || global.ArcadeSFX?.click?.();
          } else {
            global.ArcadeSFX?.tick?.();
          }
          break;
        }
      }

      if (!bricks.length || bricks.every((b) => b.y > 100)) {
        pushNewRow();
      }

      if (ball.y > H + 20) {
        lives -= 1;
        livesEl.textContent = String(lives);
        global.ArcadeSFX?.lose?.();
        if (lives <= 0) {
          endRun();
          draw();
          return;
        }
        resetBall();
      }

      draw();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      cancelAnimationFrame(raf);
      init();
      running = true;
      startBtn.disabled = true;
      startBtn.textContent = "Running…";
      hintEl.textContent = "Clear bricks · rows never stop · no cap";
      last = 0;
      global.ArcadeSFX?.go?.() || global.ArcadeSFX?.click?.();
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
      if (!running) start();
    });
    canvas.addEventListener("pointermove", (e) => {
      pointerToX(e.clientX);
    });
    startBtn.addEventListener("click", start);

    function onKey(e) {
      if (e.key === "ArrowLeft" || e.key === "a") paddle.x = Math.max(paddle.w / 2, paddle.x - 18);
      if (e.key === "ArrowRight" || e.key === "d") paddle.x = Math.min(W - paddle.w / 2, paddle.x + 18);
      if (!running && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        start();
      }
    }
    window.addEventListener("keydown", onKey);

    init();
    draw();

    return {
      destroy() {
        running = false;
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", onKey);
        root.innerHTML = "";
      },
    };
  }

  global.GameBreaker = { mount };
})(window);
