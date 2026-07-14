(function (global) {
  "use strict";

  // Enough unique faces for a full 10×10 (50 pairs)
  const ICON_POOL = [
    "🚀", "⭐", "🎮", "🧠", "⚡", "🐟", "🎯", "👾", "🪐", "💎",
    "🔥", "❄️", "🌊", "🍀", "🎵", "🎲", "🧩", "🦊", "🐱", "🐶",
    "🍕", "🍩", "⚽", "🏀", "🎸", "📚", "🔑", "💡", "🌙", "☀️",
    "🌈", "🎪", "🎨", "🏆", "🎁", "🔔", "🦄", "🐝", "🐢", "🐙",
    "🍎", "🍇", "🌮", "🧁", "🚁", "🚂", "📷", "💻", "⌚", "🧲",
  ];

  const MAX_SIDE = 10; // 10×10 cap
  const MAX_HP = 5;
  const START_PAIRS = 2; // 2×2

  /**
   * Infinite levels; board grows until 10×10 (50 pairs), then stays maxed
   * while speed/pressure keep ramping.
   */
  function layoutForLevel(level) {
    const pairs = Math.min(50, START_PAIRS + (level - 1));
    const cells = pairs * 2;
    const { cols, rows } = bestGrid(cells);
    // Flip peek time shortens with level; floor at 280ms
    const flipMs = Math.max(280, 720 - (level - 1) * 28);
    return { pairs, cols, rows, flipMs, cells };
  }

  /** Prefer near-square grids, never exceeding MAX_SIDE on either axis. */
  function bestGrid(cells) {
    let best = { cols: cells, rows: 1, score: Infinity };
    for (let cols = 1; cols <= Math.min(MAX_SIDE, cells); cols++) {
      if (cells % cols !== 0) continue;
      const rows = cells / cols;
      if (rows > MAX_SIDE) continue;
      const score = Math.abs(cols - rows) + (cols < rows ? 0.1 : 0);
      if (score < best.score) best = { cols, rows, score };
    }
    // Fallback: force into max box (should not hit if cells even ≤ 100)
    if (best.score === Infinity) {
      const cols = Math.min(MAX_SIDE, cells);
      const rows = Math.ceil(cells / cols);
      return { cols, rows: Math.min(MAX_SIDE, rows) };
    }
    return { cols: best.cols, rows: best.rows };
  }

  function mount(root, { onScore }) {
    let level = 1;
    let cards = [];
    let flipped = [];
    let lock = false;
    let matched = 0;
    let totalScore = 0;
    let hp = MAX_HP;
    let gameOver = false;
    let submitted = false;
    /** Card indices the player has already revealed this level */
    let seen = new Set();

    root.innerHTML = `
      <div class="memory-wrap">
        <div class="game-hud">
          <div><span class="hud-label">Level</span><strong id="mem-level">1</strong></div>
          <div><span class="hud-label">Health</span><strong id="mem-hp" class="mem-hp" aria-live="polite"></strong></div>
          <div><span class="hud-label">Score</span><strong id="mem-score">0</strong></div>
        </div>
        <div class="mem-status">
          <span id="mem-matched">0 / 2 pairs</span>
          <span id="mem-board-size">2×2</span>
        </div>
        <div class="mem-grid" id="mem-grid"></div>
        <p class="game-hint" id="mem-hint">First peeks are free. Miss a card you've already seen → lose a heart.</p>
        <div class="game-actions">
          <button type="button" class="btn primary" id="mem-restart">New run</button>
        </div>
      </div>
    `;

    const grid = root.querySelector("#mem-grid");
    const levelEl = root.querySelector("#mem-level");
    const hpEl = root.querySelector("#mem-hp");
    const scoreEl = root.querySelector("#mem-score");
    const matchedEl = root.querySelector("#mem-matched");
    const boardSizeEl = root.querySelector("#mem-board-size");
    const hintEl = root.querySelector("#mem-hint");

    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    function paintHp() {
      const hearts = Array.from({ length: MAX_HP }, (_, i) =>
        i < hp ? "❤️" : "🖤"
      ).join("");
      hpEl.textContent = hearts;
      hpEl.classList.toggle("low", hp <= 2 && hp > 0);
      hpEl.classList.toggle("dead", hp <= 0);
    }

    function startRun() {
      level = 1;
      totalScore = 0;
      hp = MAX_HP;
      gameOver = false;
      submitted = false;
      scoreEl.textContent = "0";
      startLevel();
    }

    function startLevel() {
      if (gameOver) return;
      const L = layoutForLevel(level);
      const icons = ICON_POOL.slice(0, L.pairs);
      cards = shuffle([...icons, ...icons]).map((icon, i) => ({
        id: i,
        icon,
        matched: false,
      }));
      flipped = [];
      lock = false;
      matched = 0;
      seen = new Set();

      levelEl.textContent = String(level);
      matchedEl.textContent = `0 / ${L.pairs} pairs`;
      boardSizeEl.textContent = `${L.cols}×${L.rows}`;
      scoreEl.textContent = String(totalScore);
      paintHp();

      const atCap = L.pairs >= 50;
      hintEl.textContent = atCap
        ? `Level ${level} · 10×10 · free scouting, paid mistakes`
        : `Level ${level} · ${L.cols}×${L.rows} · new cards free to peek`;

      grid.style.gridTemplateColumns = `repeat(${L.cols}, 1fr)`;
      grid.classList.toggle("mem-grid-dense", L.cols >= 8);
      render();
    }

    function render() {
      grid.innerHTML = "";
      cards.forEach((c, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "mem-card" +
          (c.matched ? " matched" : "") +
          (flipped.includes(i) || c.matched ? " face-up" : "");
        btn.innerHTML = `<span class="mem-face">${
          c.matched || flipped.includes(i) ? c.icon : "?"
        }</span>`;
        btn.disabled = gameOver || c.matched || lock;
        btn.addEventListener("click", () => flip(i));
        grid.appendChild(btn);
      });
    }

    function loseHeart() {
      hp = Math.max(0, hp - 1);
      paintHp();
      hpEl.classList.remove("hit");
      void hpEl.offsetWidth;
      hpEl.classList.add("hit");
      ArcadeSFX?.hit?.() || ArcadeSFX?.foul?.();

      if (hp <= 0) {
        endRun();
      }
    }

    function endRun() {
      if (gameOver) return;
      gameOver = true;
      lock = true;
      ArcadeSFX?.lose();
      hintEl.textContent = `Out of hearts · Level ${level} · ${totalScore} pts`;
      render();
      if (!submitted) {
        submitted = true;
        onScore?.({
          score: totalScore,
          meta: { level, board: boardSizeEl.textContent },
        });
      }
    }

    function markSeen(...indices) {
      for (const idx of indices) seen.add(idx);
    }

    function flip(i) {
      if (gameOver || lock || cards[i].matched || flipped.includes(i)) return;
      ArcadeSFX?.flip();
      flipped.push(i);
      render();
      if (flipped.length < 2) return;

      const [a, b] = flipped;
      const L = layoutForLevel(level);

      // Knowledge *before* this pair is fully committed to memory
      const knewA = seen.has(a);
      const knewB = seen.has(b);

      if (cards[a].icon === cards[b].icon) {
        cards[a].matched = cards[b].matched = true;
        markSeen(a, b);
        matched += 1;
        matchedEl.textContent = `${matched} / ${L.pairs} pairs`;
        flipped = [];
        ArcadeSFX?.match();
        totalScore += 10 + level * 2;
        scoreEl.textContent = String(totalScore);
        render();

        if (matched === L.pairs) {
          const clearBonus = 40 + L.pairs * 8 + level * 5 + hp * 15;
          totalScore += clearBonus;
          scoreEl.textContent = String(totalScore);
          if (hp < MAX_HP) {
            hp += 1;
            paintHp();
          }
          ArcadeSFX?.win();
          onScore?.({
            score: totalScore,
            meta: { partial: true, level, board: `${L.cols}×${L.rows}` },
          });
          hintEl.textContent = `Cleared! +${clearBonus} · expanding…`;
          setTimeout(() => {
            if (gameOver) return;
            level += 1;
            ArcadeSFX?.levelUp();
            startLevel();
          }, 700);
        }
      } else {
        // Only punish if the player already knew at least one of these cards
        const shouldCostHeart = knewA || knewB;
        lock = true;
        setTimeout(() => {
          markSeen(a, b);
          flipped = [];
          lock = false;
          render();
          if (shouldCostHeart) {
            loseHeart();
            if (!gameOver) {
              hintEl.textContent = `Memory miss · ${hp} heart${hp === 1 ? "" : "s"} left`;
            }
          } else if (!gameOver) {
            hintEl.textContent = "Scout peek — no heart lost";
            ArcadeSFX?.tick?.();
          }
        }, L.flipMs);
      }
    }

    root.querySelector("#mem-restart").addEventListener("click", () => {
      ArcadeSFX?.click();
      startRun();
    });

    startRun();

    return {
      destroy() {
        root.innerHTML = "";
      },
    };
  }

  global.GameMemory = { mount };
})(window);
