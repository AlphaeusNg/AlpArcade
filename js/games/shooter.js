(function (global) {
  "use strict";

  /** @typedef {{ id: string, label: string, color: string, glyph: string, duration: number }} PowerDef */

  /** @type {Record<string, PowerDef>} */
  const POWERS = {
    rapid: { id: "rapid", label: "Rapid", color: "#fbbf24", glyph: "⚡", duration: 480 },
    multi: { id: "multi", label: "Multi", color: "#38bdf8", glyph: "🔱", duration: 520 },
    spread: { id: "spread", label: "Spread", color: "#a78bfa", glyph: "✳", duration: 480 },
    shield: { id: "shield", label: "Shield", color: "#2dd4bf", glyph: "🛡", duration: 400 },
    speed: { id: "speed", label: "Speed", color: "#4ade80", glyph: "➤", duration: 450 },
    pierce: { id: "pierce", label: "Pierce", color: "#fb923c", glyph: "➤➤", duration: 400 },
    life: { id: "life", label: "+Life", color: "#fb7185", glyph: "♥", duration: 0 },
  };

  const POWER_DROP_ORDER = ["rapid", "multi", "spread", "speed", "pierce", "shield", "life"];

  function mount(root, { onScore }) {
    root.innerHTML = `
      <div class="shooter-wrap">
        <div class="game-hud">
          <div><span class="hud-label">Score</span><strong id="sh-score">0</strong></div>
          <div><span class="hud-label">Lives</span><strong id="sh-lives" class="sh-lives">3</strong></div>
          <div><span class="hud-label">Wave</span><strong id="sh-wave">1</strong></div>
        </div>
        <div class="sh-powers" id="sh-powers" aria-live="polite"></div>
        <div class="sh-stage">
          <canvas id="sh-canvas" width="420" height="520" aria-label="Space shooter"></canvas>
          <div class="sh-hit-flash" id="sh-hit-flash" hidden aria-hidden="true"></div>
          <div class="sh-life-banner" id="sh-life-banner" hidden aria-live="assertive">
            <span class="sh-life-banner-main">LIFE LOST</span>
            <span class="sh-life-banner-sub" id="sh-life-banner-sub">−1</span>
          </div>
          <div class="sh-pickup-toast" id="sh-pickup-toast" hidden></div>
        </div>
        <p class="game-hint" id="sh-hint">WASD / arrows · full flight · auto-fire · grab powerups</p>
        <div class="game-actions">
          <button type="button" class="btn primary" id="sh-start">Launch</button>
        </div>
      </div>
    `;

    const canvas = root.querySelector("#sh-canvas");
    const ctx = canvas.getContext("2d");
    const scoreEl = root.querySelector("#sh-score");
    const livesEl = root.querySelector("#sh-lives");
    const waveEl = root.querySelector("#sh-wave");
    const hintEl = root.querySelector("#sh-hint");
    const powersEl = root.querySelector("#sh-powers");
    const hitFlashEl = root.querySelector("#sh-hit-flash");
    const lifeBannerEl = root.querySelector("#sh-life-banner");
    const lifeBannerSub = root.querySelector("#sh-life-banner-sub");
    const pickupToast = root.querySelector("#sh-pickup-toast");

    const W = canvas.width;
    const H = canvas.height;

    let ship,
      bullets,
      eBullets,
      enemies,
      particles,
      powerups,
      active, // timed buffs { id: remaining }
      keys,
      score,
      lives,
      wave,
      running,
      raf,
      last,
      spawnTimer,
      submitted,
      waveAnnounce,
      invuln,
      hitAnim,
      hitBannerTimer,
      toastTimer,
      multiLevel; // stacks multi (1 = double, 2 = triple…)

    function waveMods(w) {
      return {
        spawnEvery: Math.max(12, 52 - w * 3.2),
        enemySpeed: 1.15 + w * 0.28,
        enemyHp: 1 + Math.floor((w - 1) / 2),
        zig: w >= 3,
        shooters: w >= 4,
        shootRate: Math.max(40, 110 - w * 6),
        swarm: w >= 6,
        dropChance: Math.min(0.42, 0.18 + w * 0.025),
      };
    }

    function has(id) {
      return (active[id] || 0) > 0;
    }

    function paintPowers() {
      const chips = POWER_DROP_ORDER.filter((id) => id !== "life" && has(id)).map((id) => {
        const p = POWERS[id];
        const t = Math.ceil((active[id] || 0) / 60);
        const extra = id === "multi" && multiLevel > 1 ? `×${multiLevel + 1}` : "";
        return `<span class="sh-power-chip" style="--pc:${p.color}">${p.glyph} ${p.label}${extra} <small>${t}s</small></span>`;
      });
      if (multiLevel > 0 && !has("multi")) {
        // permanent stacks shouldn't happen; multi is timed
      }
      powersEl.innerHTML = chips.length
        ? chips.join("")
        : `<span class="sh-power-empty">No powerups — destroy ships to drop gear</span>`;
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

    function applyPower(id) {
      const def = POWERS[id];
      if (!def) return;

      if (id === "life") {
        lives = Math.min(6, lives + 1);
        livesEl.textContent = String(lives);
        showPickup("♥ Extra life!", def.color);
        ArcadeSFX?.match?.() || ArcadeSFX?.win?.();
        paintPowers();
        return;
      }

      if (id === "multi") {
        multiLevel = Math.min(3, multiLevel + 1);
      }

      // refresh / extend duration
      active[id] = Math.max(active[id] || 0, 0) + def.duration;
      // cap so stacking doesn't go forever
      active[id] = Math.min(active[id], def.duration * 2.2);

      showPickup(`${def.glyph} ${def.label}!`, def.color);
      ArcadeSFX?.levelUp?.() || ArcadeSFX?.match?.();
      paintPowers();
      hintEl.textContent = `${def.label} online`;
    }

    function maybeDropPowerup(x, y) {
      const m = waveMods(wave);
      if (Math.random() > m.dropChance) return;
      // weighted: life rare
      const roll = Math.random();
      let id = "rapid";
      if (roll < 0.06) id = "life";
      else if (roll < 0.18) id = "shield";
      else if (roll < 0.32) id = "pierce";
      else if (roll < 0.48) id = "spread";
      else if (roll < 0.64) id = "multi";
      else if (roll < 0.80) id = "speed";
      else id = "rapid";

      const def = POWERS[id];
      powerups.push({
        x,
        y,
        id,
        vy: 1.4 + Math.random() * 0.6,
        bob: Math.random() * Math.PI * 2,
        color: def.color,
        glyph: def.glyph,
      });
    }

    function init() {
      ship = { x: W / 2, y: H - 70, w: 28, h: 22, cool: 0 };
      bullets = [];
      eBullets = [];
      enemies = [];
      particles = [];
      powerups = [];
      active = {};
      multiLevel = 0;
      keys = {};
      score = 0;
      lives = 3;
      wave = 1;
      spawnTimer = 0;
      submitted = false;
      waveAnnounce = 90;
      invuln = 0;
      hitAnim = 0;
      clearTimeout(hitBannerTimer);
      hitFlashEl.hidden = true;
      lifeBannerEl.hidden = true;
      livesEl.classList.remove("lost");
      scoreEl.textContent = "0";
      livesEl.textContent = "3";
      waveEl.textContent = "1";
      hintEl.textContent = "Wave 1 — WASD fly · auto-fire · hunt powerups";
      paintPowers();
    }

    function spawnEnemy() {
      const m = waveMods(wave);
      const kind =
        m.shooters && Math.random() < 0.35
          ? "shooter"
          : m.swarm && Math.random() < 0.4
            ? "swarm"
            : "grunt";
      enemies.push({
        x: 30 + Math.random() * (W - 60),
        y: -20,
        w: kind === "swarm" ? 14 : 22 + Math.random() * 10,
        h: kind === "swarm" ? 14 : 18,
        vy: m.enemySpeed * (kind === "swarm" ? 1.35 : 1) + Math.random() * 0.5,
        vx: m.zig ? (Math.random() < 0.5 ? -1 : 1) * (0.8 + wave * 0.1) : 0,
        hp: kind === "shooter" ? m.enemyHp + 1 : m.enemyHp,
        kind,
        hue: kind === "shooter" ? 320 : kind === "swarm" ? 45 : 180 + Math.random() * 60,
        cool: 20 + Math.random() * 40,
      });
    }

    function burst(x, y, color, n = 10) {
      for (let i = 0; i < n; i++) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          life: 30 + Math.random() * 20,
          color,
        });
      }
    }

    function fireBullets() {
      const pierce = has("pierce");
      const dmg = pierce ? 2 : 1;
      const speed = -10.5 - (has("rapid") ? 1.5 : 0);
      const shots = [];

      // Base multi-shot from multi power (level 0 = single, 1 = double, …)
      const n = 1 + multiLevel;
      const spacing = 10;
      for (let i = 0; i < n; i++) {
        const offset = (i - (n - 1) / 2) * spacing;
        shots.push({ x: ship.x + offset, y: ship.y - 16, vx: 0, vy: speed, dmg, pierce, life: 120 });
      }

      // Spread fans extra diagonal shots
      if (has("spread")) {
        shots.push(
          { x: ship.x, y: ship.y - 14, vx: -3.2, vy: speed * 0.92, dmg, pierce, life: 100 },
          { x: ship.x, y: ship.y - 14, vx: 3.2, vy: speed * 0.92, dmg, pierce, life: 100 }
        );
        if (multiLevel >= 2) {
          shots.push(
            { x: ship.x, y: ship.y - 12, vx: -5.2, vy: speed * 0.85, dmg, pierce, life: 90 },
            { x: ship.x, y: ship.y - 12, vx: 5.2, vy: speed * 0.85, dmg, pierce, life: 90 }
          );
        }
      }

      for (const s of shots) bullets.push(s);
      ArcadeSFX?.shoot();
    }

    function drawShip() {
      if (invuln > 0 && Math.floor(invuln / 4) % 2 === 0 && !has("shield")) return;

      ctx.save();
      ctx.translate(ship.x, ship.y);

      if (has("shield")) {
        const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 120);
        ctx.strokeStyle = `rgba(45,212,191,${0.45 + pulse * 0.4})`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "#2dd4bf";
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      if (hitAnim > 0) {
        const shake = Math.sin(hitAnim * 1.8) * 4;
        ctx.translate(shake, 0);
        ctx.fillStyle = "#fb7185";
        ctx.shadowColor = "#fb7185";
        ctx.shadowBlur = 22;
      } else {
        ctx.fillStyle = has("speed") ? "#4ade80" : "#2dd4bf";
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 14;
      }
      ctx.beginPath();
      ctx.moveTo(0, -ship.h / 2);
      ctx.lineTo(ship.w / 2, ship.h / 2);
      ctx.lineTo(0, ship.h / 4);
      ctx.lineTo(-ship.w / 2, ship.h / 2);
      ctx.closePath();
      ctx.fill();

      // engine glow
      ctx.shadowBlur = 0;
      ctx.fillStyle = has("rapid") ? "#fbbf24" : "rgba(56,189,248,0.7)";
      ctx.beginPath();
      ctx.moveTo(-5, ship.h / 3);
      ctx.lineTo(0, ship.h / 2 + 6 + (has("speed") ? 4 : 0));
      ctx.lineTo(5, ship.h / 3);
      ctx.fill();
      ctx.restore();
    }

    function playHitFeedback() {
      hitFlashEl.hidden = false;
      hitFlashEl.classList.remove("play");
      void hitFlashEl.offsetWidth;
      hitFlashEl.classList.add("play");

      lifeBannerSub.textContent = lives > 0 ? `${lives} left` : "0 left";
      lifeBannerEl.querySelector(".sh-life-banner-main").textContent =
        lives > 0 ? "LIFE LOST" : "SHIP DOWN";
      lifeBannerEl.hidden = false;
      lifeBannerEl.classList.remove("play");
      void lifeBannerEl.offsetWidth;
      lifeBannerEl.classList.add("play");

      livesEl.classList.remove("lost");
      void livesEl.offsetWidth;
      livesEl.classList.add("lost");

      clearTimeout(hitBannerTimer);
      hitBannerTimer = setTimeout(() => {
        hitFlashEl.hidden = true;
        hitFlashEl.classList.remove("play");
        lifeBannerEl.hidden = true;
        lifeBannerEl.classList.remove("play");
        livesEl.classList.remove("lost");
      }, 900);
    }

    function maybeAdvanceWave() {
      const threshold = wave * 100 + (wave - 1) * 40;
      if (score >= threshold) {
        wave += 1;
        waveEl.textContent = String(wave);
        waveAnnounce = 80;
        ArcadeSFX?.levelUp();
        const m = waveMods(wave);
        const bits = [];
        if (m.zig) bits.push("zigzag");
        if (m.shooters) bits.push("shooters");
        if (m.swarm) bits.push("swarm");
        hintEl.textContent = `Wave ${wave}${bits.length ? " · " + bits.join(" · ") : ""} · powerups drop more`;
      }
    }

    function keyDown(name) {
      return !!(keys[name] || keys[name.toLowerCase?.()] || keys[name]);
    }

    function moving(dir) {
      if (dir === "left") return keys.ArrowLeft || keys.a || keys.A;
      if (dir === "right") return keys.ArrowRight || keys.d || keys.D;
      if (dir === "up") return keys.ArrowUp || keys.w || keys.W;
      if (dir === "down") return keys.ArrowDown || keys.s || keys.S;
      return false;
    }

    function frame(ts) {
      if (!running) return;
      if (!last) last = ts;
      const dt = Math.min(32, ts - last) / 16.67;
      last = ts;
      const m = waveMods(wave);

      ctx.fillStyle = "#04070e";
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) {
        const sx = (i * 97 + ts * 0.02) % W;
        const sy = (i * 53 + ts * 0.08 * ((i % 3) + 1)) % H;
        ctx.fillStyle = `rgba(200,220,255,${0.15 + (i % 5) * 0.08})`;
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }

      if (invuln > 0) invuln -= dt;
      if (hitAnim > 0) hitAnim -= dt;

      // tick powerup timers
      let powersDirty = false;
      for (const id of Object.keys(active)) {
        if (active[id] > 0) {
          active[id] -= dt;
          if (active[id] <= 0) {
            active[id] = 0;
            if (id === "multi") multiLevel = 0;
            powersDirty = true;
            hintEl.textContent = `${POWERS[id]?.label || id} expired`;
          }
        }
      }
      if (powersDirty || (Math.floor(ts / 250) % 2 === 0)) paintPowers();

      // 4-direction movement
      const baseSpeed = 5.2 + wave * 0.08 + (has("speed") ? 2.4 : 0);
      if (moving("left")) ship.x -= baseSpeed * dt;
      if (moving("right")) ship.x += baseSpeed * dt;
      if (moving("up")) ship.y -= baseSpeed * dt;
      if (moving("down")) ship.y += baseSpeed * dt;
      ship.x = Math.max(18, Math.min(W - 18, ship.x));
      ship.y = Math.max(28, Math.min(H - 24, ship.y));

      // Auto-fire (faster with rapid)
      if (ship.cool > 0) ship.cool -= dt;
      const fireRate = has("rapid")
        ? Math.max(3.2, 5.5 - wave * 0.12)
        : Math.max(5.5, 10 - wave * 0.2);
      if (ship.cool <= 0 && invuln < 35) {
        fireBullets();
        ship.cool = fireRate;
      }

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnEnemy();
        if (m.swarm && Math.random() < 0.4) spawnEnemy();
        spawnTimer = m.spawnEvery;
      }

      // Player bullets
      bullets = bullets.filter((b) => {
        b.x += (b.vx || 0) * dt;
        b.y += b.vy * dt;
        b.life = (b.life || 100) - dt;
        const col = b.pierce ? "#fb923c" : has("rapid") ? "#fde68a" : "#fbbf24";
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 8;
        ctx.fillRect(b.x - 2, b.y, 4, b.pierce ? 14 : 10);
        ctx.shadowBlur = 0;
        return b.y > -14 && b.y < H + 20 && b.x > -20 && b.x < W + 20 && b.life > 0;
      });

      // Enemy bullets
      eBullets = eBullets.filter((b) => {
        b.y += b.vy * dt;
        b.x += (b.vx || 0) * dt;
        ctx.fillStyle = "#fb7185";
        ctx.fillRect(b.x - 2, b.y, 4, 8);
        if (invuln <= 0 && Math.abs(b.x - ship.x) < 14 && Math.abs(b.y - ship.y) < 14) {
          hurt();
          return false;
        }
        return b.y < H + 20;
      });

      // Powerup pickups
      powerups = powerups.filter((p) => {
        p.y += p.vy * dt;
        p.bob += 0.12 * dt;
        const drawX = p.x + Math.sin(p.bob) * 4;
        // gem
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(drawX, p.y - 9);
        ctx.lineTo(drawX + 9, p.y);
        ctx.lineTo(drawX, p.y + 9);
        ctx.lineTo(drawX - 9, p.y);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#0b1220";
        ctx.font = "11px Outfit, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.glyph.length > 1 ? "◆" : p.glyph, drawX, p.y + 0.5);

        if (Math.hypot(drawX - ship.x, p.y - ship.y) < 22) {
          applyPower(p.id);
          burst(drawX, p.y, p.color, 14);
          return false;
        }
        return p.y < H + 24;
      });

      // Enemies
      enemies = enemies.filter((e) => {
        e.y += e.vy * dt;
        e.x += e.vx * dt;
        if (e.x < 16 || e.x > W - 16) e.vx *= -1;
        e.cool -= dt;
        if (e.kind === "shooter" && e.cool <= 0 && e.y > 20 && e.y < H * 0.75) {
          eBullets.push({
            x: e.x,
            y: e.y + e.h / 2,
            vy: 3.2 + wave * 0.15,
            vx: (ship.x - e.x) * 0.012,
          });
          e.cool = m.shootRate;
          ArcadeSFX?.tick();
        }

        ctx.fillStyle = `hsl(${e.hue} 80% 55%)`;
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
        ctx.shadowBlur = 0;

        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          if (Math.abs(b.x - e.x) < e.w / 2 + 2 && Math.abs(b.y - e.y) < e.h / 2 + 2) {
            e.hp -= b.dmg || 1;
            ArcadeSFX?.hit();
            if (!b.pierce) bullets.splice(i, 1);
            else {
              // pierce: slight damage falloff after hit, keep flying
              b.dmg = Math.max(1, (b.dmg || 1) - 0.35);
            }
            if (e.hp <= 0) {
              score += 10 * wave + (e.kind === "shooter" ? 15 : 0);
              scoreEl.textContent = String(score);
              burst(e.x, e.y, `hsl(${e.hue} 80% 60%)`);
              ArcadeSFX?.explode();
              maybeDropPowerup(e.x, e.y);
              maybeAdvanceWave();
              return false;
            }
          }
        }

        if (
          invuln <= 0 &&
          Math.abs(e.x - ship.x) < (e.w + ship.w) / 2.4 &&
          Math.abs(e.y - ship.y) < (e.h + ship.h) / 2.4
        ) {
          hurt();
          burst(e.x, e.y, "#fb7185", 12);
          return false;
        }

        return e.y < H + 30;
      });

      particles = particles.filter((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        ctx.globalAlpha = Math.max(0, p.life / 40);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 2, 2);
        ctx.globalAlpha = 1;
        return p.life > 0;
      });

      drawShip();

      if (hitAnim > 0) {
        const t = hitAnim / 45;
        ctx.strokeStyle = `rgba(251,113,133,${t})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, 20 + (1 - t) * 50, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(251,113,133,${0.12 * t})`;
        ctx.fillRect(0, 0, W, H);
      }

      if (waveAnnounce > 0) {
        waveAnnounce -= dt;
        ctx.fillStyle = `rgba(45,212,191,${Math.min(1, waveAnnounce / 40)})`;
        ctx.font = "bold 28px Outfit, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`WAVE ${wave}`, W / 2, H * 0.35);
      }

      raf = requestAnimationFrame(frame);
    }

    function hurt() {
      if (invuln > 0 || !running) return;

      // Shield absorbs one hit
      if (has("shield")) {
        active.shield = 0;
        invuln = 50;
        hitAnim = 20;
        ArcadeSFX?.hit();
        burst(ship.x, ship.y, "#2dd4bf", 18);
        showPickup("Shield broke!", "#2dd4bf");
        paintPowers();
        eBullets = eBullets.filter((b) => Math.hypot(b.x - ship.x, b.y - ship.y) > 50);
        return;
      }

      lives -= 1;
      livesEl.textContent = String(lives);
      invuln = 70;
      hitAnim = 45;
      ArcadeSFX?.explode();
      burst(ship.x, ship.y, "#fb7185", 28);
      burst(ship.x, ship.y, "#fbbf24", 14);
      playHitFeedback();
      eBullets = eBullets.filter((b) => Math.hypot(b.x - ship.x, b.y - ship.y) > 60);
      if (lives <= 0) {
        setTimeout(() => {
          if (lives <= 0) endGame();
        }, 650);
      }
    }

    function endGame() {
      running = false;
      cancelAnimationFrame(raf);
      ArcadeSFX?.lose();
      ctx.fillStyle = "rgba(4,7,14,0.72)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#e8eef9";
      ctx.font = "bold 26px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Ship Down", W / 2, H / 2 - 10);
      ctx.font = "14px JetBrains Mono, monospace";
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(`Score ${score} · Wave ${wave}`, W / 2, H / 2 + 20);
      if (!submitted && onScore) {
        submitted = true;
        onScore({ score, meta: { wave } });
      }
    }

    function start() {
      cancelAnimationFrame(raf);
      ArcadeSFX?.unlock();
      ArcadeSFX?.click();
      init();
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    function onKeyDown(e) {
      keys[e.key] = true;
      keys[e.key.toLowerCase()] = true;
      // prevent page scroll with arrows / space
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Space"].includes(e.key) ||
        e.code === "Space"
      ) {
        e.preventDefault();
      }
      if (e.key.toLowerCase() === "p" && running) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (e.key.toLowerCase() === "p" && !running && ship && lives > 0) {
        running = true;
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    }
    function onKeyUp(e) {
      keys[e.key] = false;
      keys[e.key.toLowerCase()] = false;
    }

    let dragging = false;
    canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      canvas.setPointerCapture?.(e.pointerId);
      const r = canvas.getBoundingClientRect();
      if (ship) {
        ship.x = ((e.clientX - r.left) / r.width) * W;
        ship.y = ((e.clientY - r.top) / r.height) * H;
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging || !ship) return;
      const r = canvas.getBoundingClientRect();
      ship.x = ((e.clientX - r.left) / r.width) * W;
      ship.y = ((e.clientY - r.top) / r.height) * H;
      ship.x = Math.max(18, Math.min(W - 18, ship.x));
      ship.y = Math.max(28, Math.min(H - 24, ship.y));
    });
    canvas.addEventListener("pointerup", () => {
      dragging = false;
    });
    canvas.addEventListener("pointercancel", () => {
      dragging = false;
    });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    root.querySelector("#sh-start").addEventListener("click", start);

    init();
    ctx.fillStyle = "#04070e";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#93a4c3";
    ctx.font = "16px Outfit, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Press Launch", W / 2, H / 2);
    ctx.font = "12px JetBrains Mono, monospace";
    ctx.fillText("WASD · powerups drop from wrecks", W / 2, H / 2 + 28);

    return {
      destroy() {
        running = false;
        cancelAnimationFrame(raf);
        clearTimeout(hitBannerTimer);
        clearTimeout(toastTimer);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        root.innerHTML = "";
      },
    };
  }

  global.GameShooter = { mount };
})(window);
