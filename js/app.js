(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const PORTFOLIO_URL = "https://alphaeusng.github.io/";
  const gameMount = $("#game-mount");
  const lobby = $("#lobby");
  const playView = $("#play-view");
  const playTitle = $("#play-title");
  let activeGame = null;

  const GAME_LOADERS = {
    tictactoe: () => window.GameTicTacToe,
    shooter: () => window.GameShooter,
    snake: () => window.GameSnake,
    reaction: () => window.GameReaction,
    memory: () => window.GameMemory,
  };

  // ----- Toast -----
  const toast = $("#toast");
  let toastTimer;
  function showToast(msg) {
    if (!toast) return;
    toast.hidden = false;
    toast.textContent = msg;
    requestAnimationFrame(() => toast.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        toast.hidden = true;
      }, 280);
    }, 2800);
  }

  // ----- Player / HUD -----
  function refreshHud() {
    const state = ArcadeScores.getState();
    const { level, progress, next } = ArcadeScores.getLevel(state.xp);
    const nameEl = $("#player-name-display");
    const xpEl = $("#xp-display");
    const levelEl = $("#level-display");
    const bar = $("#xp-bar");
    const gamesEl = $("#games-played");
    if (nameEl) nameEl.textContent = state.playerName;
    if (xpEl) xpEl.textContent = `${state.xp} XP`;
    if (levelEl) levelEl.textContent = `Lv ${level}`;
    if (gamesEl) gamesEl.textContent = String(state.gamesPlayed);
    if (bar) bar.style.width = `${Math.min(100, (progress / next) * 100)}%`;

    const nameInput = $("#name-input");
    if (nameInput && document.activeElement !== nameInput) {
      nameInput.value = state.playerName;
    }

    // high scores panel
    const hs = $("#highscores-list");
    if (hs) {
      hs.innerHTML = Object.entries(ArcadeScores.GAMES)
        .map(([id, g]) => {
          const best = state.highScores[id]?.best;
          const display =
            best == null || best === 0 && id === "tictactoe"
              ? id === "tictactoe"
                ? `${state.highScores.tictactoe?.wins || 0} wins`
                : "—"
              : ArcadeScores.formatScore(id, best);
          const extra =
            id === "tictactoe"
              ? `<span class="hs-extra">${state.highScores.tictactoe?.wins || 0}W · ${state.highScores.tictactoe?.draws || 0}D · ${state.highScores.tictactoe?.losses || 0}L</span>`
              : "";
          return `<li><span class="hs-game">${g.label}</span><span class="hs-score">${display}</span>${extra}</li>`;
        })
        .join("");
    }

    // hall of fame
    const hall = $("#hall-list");
    if (hall) {
      if (!state.hallOfFame.length) {
        hall.innerHTML = `<li class="empty">Play a game to fill the hall of fame.</li>`;
      } else {
        hall.innerHTML = state.hallOfFame
          .map((e, i) => {
            const label = ArcadeScores.GAMES[e.game]?.label || e.game;
            return `<li>
              <span class="rank">#${i + 1}</span>
              <span class="who">${escapeHtml(e.player)}</span>
              <span class="what">${label}</span>
              <span class="pts">${ArcadeScores.formatScore(e.game, e.score)}</span>
            </li>`;
          })
          .join("");
      }
    }

    // history
    const hist = $("#history-list");
    if (hist) {
      if (!state.history.length) {
        hist.innerHTML = `<li class="empty">No runs yet.</li>`;
      } else {
        hist.innerHTML = state.history
          .slice(0, 12)
          .map((e) => {
            const label = ArcadeScores.GAMES[e.game]?.label || e.game;
            const when = new Date(e.at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            return `<li>
              <span class="what">${label}</span>
              <span class="pts">${ArcadeScores.formatScore(e.game, e.score)}</span>
              <span class="xp">+${e.xp} XP</span>
              <span class="when">${when}</span>
            </li>`;
          })
          .join("");
      }
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ----- Navigation -----
  function openGame(id) {
    const loader = GAME_LOADERS[id];
    const game = loader?.();
    if (!game) {
      showToast("Game failed to load");
      return;
    }
    if (activeGame?.destroy) activeGame.destroy();
    activeGame = null;

    lobby.hidden = true;
    playView.hidden = false;
    playTitle.textContent = ArcadeScores.GAMES[id]?.label || id;
    gameMount.innerHTML = "";

    activeGame = game.mount(gameMount, {
      onScore({ score, result, meta }) {
        const { isHighScore, xpGained } = ArcadeScores.submitScore(id, score, {
          result,
          ...meta,
        });
        refreshHud();
        let msg = `+${xpGained} XP`;
        if (isHighScore) msg = `🏆 New best! ${msg}`;
        showToast(msg);
      },
    });

    // hash for deep links
    location.hash = `play/${id}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backToLobby() {
    if (activeGame?.destroy) activeGame.destroy();
    activeGame = null;
    gameMount.innerHTML = "";
    playView.hidden = true;
    lobby.hidden = false;
    location.hash = "";
    refreshHud();
  }

  function routeFromHash() {
    const h = location.hash.replace(/^#/, "");
    if (h.startsWith("play/")) {
      const id = h.slice(5);
      if (GAME_LOADERS[id]) openGame(id);
      else backToLobby();
    } else if (h === "scores") {
      backToLobby();
      $("#scores-panel")?.scrollIntoView({ behavior: "smooth" });
    } else {
      // stay lobby
    }
  }

  // ----- Bind UI -----
  $$("[data-game]").forEach((card) => {
    card.addEventListener("click", () => openGame(card.dataset.game));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openGame(card.dataset.game);
      }
    });
  });

  $("#btn-back")?.addEventListener("click", backToLobby);

  $("#name-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = ArcadeScores.setPlayerName($("#name-input").value);
    refreshHud();
    showToast(`Player set: ${name}`);
  });

  $("#btn-export")?.addEventListener("click", async () => {
    const code = ArcadeScores.exportCode();
    try {
      await navigator.clipboard.writeText(code);
      showToast("Score code copied to clipboard");
    } catch {
      prompt("Copy your score code:", code);
    }
  });

  $("#btn-import")?.addEventListener("click", () => {
    const code = prompt("Paste score code:");
    if (!code) return;
    try {
      ArcadeScores.importCode(code);
      refreshHud();
      showToast("Scores imported");
    } catch {
      showToast("Invalid score code");
    }
  });

  $("#btn-reset")?.addEventListener("click", () => {
    if (confirm("Reset all arcade scores on this device?")) {
      ArcadeScores.resetAll();
      refreshHud();
      showToast("Scores wiped");
    }
  });

  // year
  const y = $("#year");
  if (y) y.textContent = String(new Date().getFullYear());

  // portfolio link already in HTML
  $$("[data-portfolio]").forEach((a) => {
    a.href = PORTFOLIO_URL;
  });

  // mute toggle
  function syncMuteButtons() {
    const muted = window.ArcadeSFX?.isMuted?.() ?? false;
    $$(".mute-btn").forEach((btn) => {
      btn.textContent = muted ? "🔇" : "🔊";
      btn.setAttribute("aria-pressed", muted ? "true" : "false");
      btn.title = muted ? "Unmute" : "Mute";
    });
  }
  $$(".mute-btn, #btn-mute, #btn-mute-play").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.ArcadeSFX?.toggleMute?.();
      window.ArcadeSFX?.unlock?.();
      if (!window.ArcadeSFX?.isMuted?.()) window.ArcadeSFX?.click?.();
      syncMuteButtons();
    });
  });
  // unlock audio on first interaction
  const unlockOnce = () => {
    window.ArcadeSFX?.unlock?.();
    window.removeEventListener("pointerdown", unlockOnce);
    window.removeEventListener("keydown", unlockOnce);
  };
  window.addEventListener("pointerdown", unlockOnce);
  window.addEventListener("keydown", unlockOnce);
  syncMuteButtons();

  $$("[data-game]").forEach((card) => {
    card.addEventListener("pointerdown", () => window.ArcadeSFX?.click?.());
  });

  window.addEventListener("hashchange", routeFromHash);
  refreshHud();
  routeFromHash();
})();
