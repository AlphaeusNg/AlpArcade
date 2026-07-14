(function (global) {
  "use strict";

  const WINS = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  const DIFFS = [
    { id: "easy", label: "Easy", blunder: 0.55, depth: "Random-ish" },
    { id: "medium", label: "Medium", blunder: 0.22, note: "Blocks & forks" },
    { id: "hard", label: "Hard", blunder: 0.0, note: "Perfect minimax" },
  ];

  function empty() {
    return Array(9).fill(null);
  }

  function winner(board) {
    for (const [a, b, c] of WINS) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { player: board[a], line: [a, b, c] };
      }
    }
    if (board.every(Boolean)) return { player: "draw", line: [] };
    return null;
  }

  function minimax(board, isMax) {
    const w = winner(board);
    if (w) {
      if (w.player === "O") return { score: 10 };
      if (w.player === "X") return { score: -10 };
      return { score: 0 };
    }
    let best = isMax ? { score: -Infinity } : { score: Infinity };
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = isMax ? "O" : "X";
      const result = minimax(board, !isMax);
      board[i] = null;
      result.index = i;
      if (isMax) {
        if (result.score > best.score) best = result;
      } else if (result.score < best.score) {
        best = result;
      }
    }
    return best;
  }

  function findWin(board, mark) {
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = mark;
      const w = winner(board);
      board[i] = null;
      if (w && w.player === mark) return i;
    }
    return null;
  }

  function pickAi(board, diffIndex) {
    const free = board.map((c, i) => (c ? null : i)).filter((i) => i != null);
    if (!free.length) return null;
    const d = DIFFS[diffIndex];

    // sometimes blunder → random free cell
    if (Math.random() < d.blunder) {
      return free[Math.floor(Math.random() * free.length)];
    }

    // win if can
    const win = findWin(board, "O");
    if (win != null) return win;
    // block
    const block = findWin(board, "X");
    if (block != null) return block;

    if (diffIndex === 0) {
      return free[Math.floor(Math.random() * free.length)];
    }
    if (diffIndex === 1) {
      // prefer center / corners
      const prefer = [4, 0, 2, 6, 8, 1, 3, 5, 7].filter((i) => free.includes(i));
      return prefer[0];
    }
    return minimax([...board], true).index;
  }

  function mount(root, { onScore }) {
    let board = empty();
    let locked = false;
    let streak = 0;
    let diff = 0;
    let autoEscalate = true;

    root.innerHTML = `
      <div class="ttt-wrap">
        <div class="diff-bar" id="ttt-diffs"></div>
        <div class="game-hud">
          <div><span class="hud-label">You</span><strong>X</strong></div>
          <div><span class="hud-label">Streak</span><strong id="ttt-streak">0</strong></div>
          <div><span class="hud-label">AI</span><strong id="ttt-diff-label">Easy</strong></div>
        </div>
        <p class="game-status" id="ttt-status">Your move</p>
        <div class="ttt-board" id="ttt-board" role="grid"></div>
        <label class="check-row">
          <input type="checkbox" id="ttt-auto" checked />
          Auto-raise difficulty after wins
        </label>
        <div class="game-actions">
          <button type="button" class="btn ghost" id="ttt-reset">New round</button>
        </div>
      </div>
    `;

    const boardEl = root.querySelector("#ttt-board");
    const statusEl = root.querySelector("#ttt-status");
    const streakEl = root.querySelector("#ttt-streak");
    const diffLabel = root.querySelector("#ttt-diff-label");
    const diffBar = root.querySelector("#ttt-diffs");

    function paintDiffs() {
      diffBar.innerHTML = DIFFS.map(
        (d, i) =>
          `<button type="button" class="diff-chip${i === diff ? " active" : ""}" data-d="${i}">${d.label}</button>`
      ).join("");
      diffBar.querySelectorAll("[data-d]").forEach((btn) => {
        btn.addEventListener("click", () => {
          diff = Number(btn.dataset.d);
          ArcadeSFX?.click();
          paintDiffs();
          diffLabel.textContent = DIFFS[diff].label;
          statusEl.textContent = `${DIFFS[diff].note} — your move`;
        });
      });
      diffLabel.textContent = DIFFS[diff].label;
    }

    function render() {
      boardEl.innerHTML = "";
      board.forEach((cell, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ttt-cell" + (cell ? ` filled ${cell.toLowerCase()}` : "");
        btn.textContent = cell || "";
        btn.disabled = !!cell || locked;
        btn.addEventListener("click", () => play(i));
        boardEl.appendChild(btn);
      });
    }

    function highlight(line) {
      if (!line?.length) return;
      [...boardEl.children].forEach((el, i) => {
        if (line.includes(i)) el.classList.add("win");
      });
    }

    function endRound(result) {
      locked = true;
      if (result === "win") {
        streak += 1;
        ArcadeSFX?.win();
        statusEl.textContent = `You win! Streak ×${streak}`;
        if (autoEscalate && diff < DIFFS.length - 1 && streak % 2 === 0) {
          diff += 1;
          paintDiffs();
          ArcadeSFX?.levelUp();
          statusEl.textContent = `You win! Difficulty → ${DIFFS[diff].label}`;
        }
      } else if (result === "draw") {
        streak = 0;
        ArcadeSFX?.draw();
        statusEl.textContent = "Draw.";
      } else {
        streak = 0;
        ArcadeSFX?.lose();
        statusEl.textContent = "AI wins.";
        // slight de-escalate on hard losses so it stays fun
        if (autoEscalate && diff > 0 && Math.random() < 0.35) {
          diff -= 1;
          paintDiffs();
        }
      }
      streakEl.textContent = String(streak);
      onScore?.({
        score: result === "win" ? streak : 0,
        result,
        meta: { streak, difficulty: DIFFS[diff].id },
      });
    }

    function play(i) {
      if (locked || board[i]) return;
      board[i] = "X";
      ArcadeSFX?.place();
      render();
      let w = winner(board);
      if (w) {
        if (w.player === "X") endRound("win");
        else if (w.player === "draw") endRound("draw");
        else endRound("loss");
        highlight(w.line);
        return;
      }
      locked = true;
      statusEl.textContent = "AI…";
      setTimeout(() => {
        const move = pickAi(board, diff);
        if (move != null) {
          board[move] = "O";
          ArcadeSFX?.click();
        }
        locked = false;
        render();
        w = winner(board);
        if (w) {
          if (w.player === "O") endRound("loss");
          else if (w.player === "draw") endRound("draw");
          highlight(w.line);
        } else {
          statusEl.textContent = "Your move";
        }
      }, 220 + diff * 80);
    }

    function reset() {
      board = empty();
      locked = false;
      statusEl.textContent = "Your move";
      ArcadeSFX?.click();
      render();
    }

    root.querySelector("#ttt-reset").addEventListener("click", reset);
    root.querySelector("#ttt-auto").addEventListener("change", (e) => {
      autoEscalate = e.target.checked;
    });

    paintDiffs();
    render();

    return {
      destroy() {
        root.innerHTML = "";
      },
    };
  }

  global.GameTicTacToe = { mount };
})(window);
