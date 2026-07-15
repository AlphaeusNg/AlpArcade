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
  let activeGameId = null;
  let lastCabinet = null;
  let opening = false;

  const GAME_LOADERS = {
    tictactoe: () => window.GameTicTacToe,
    shooter: () => window.GameShooter,
    snake: () => window.GameSnake,
    reaction: () => window.GameReaction,
    memory: () => window.GameMemory,
  };

  /** Lazy-loaded game bundles (only fetch the cabinet you open). */
  const GAME_SCRIPTS = {
    tictactoe: "js/games/tictactoe.js",
    shooter: "js/games/shooter.js",
    snake: "js/games/snake.js",
    reaction: "js/games/reaction.js",
    memory: "js/games/memory.js",
  };

  const scriptPromises = Object.create(null);

  function loadScript(src) {
    if (scriptPromises[src]) return scriptPromises[src];
    scriptPromises[src] = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-arcade-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === "1") resolve();
        else {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("load failed")), { once: true });
        }
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.dataset.arcadeSrc = src;
      s.onload = () => {
        s.dataset.loaded = "1";
        resolve();
      };
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.body.appendChild(s);
    });
    return scriptPromises[src];
  }

  async function ensureGame(id) {
    const api = GAME_LOADERS[id]?.();
    if (api) return api;
    const src = GAME_SCRIPTS[id];
    if (!src) return null;
    await loadScript(src);
    return GAME_LOADERS[id]?.() || null;
  }

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
          // Parentheses matter: without them, `best === 0 && id === tictactoe` binds tighter than `||`.
          const hasBest = best != null && !(best === 0 && id !== "reaction");
          let display;
          if (id === "tictactoe") {
            display = `${state.highScores.tictactoe?.wins || 0} wins`;
          } else if (!hasBest || (id === "reaction" && best == null)) {
            display = "—";
          } else {
            display = ArcadeScores.formatScore(id, best);
          }
          const extra =
            id === "tictactoe"
              ? `<span class="hs-extra">${state.highScores.tictactoe?.wins || 0}W · ${state.highScores.tictactoe?.draws || 0}D · ${state.highScores.tictactoe?.losses || 0}L</span>`
              : "";
          return `<li><span class="hs-game">${escapeHtml(g.label)}</span><span class="hs-score">${escapeHtml(display)}</span>${extra}</li>`;
        })
        .join("");
    }

    // hall of fame (local)
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
              <span class="what">${escapeHtml(label)}</span>
              <span class="pts">${escapeHtml(ArcadeScores.formatScore(e.game, e.score))}</span>
            </li>`;
          })
          .join("");
      }
    }

    renderGlobalHall();
    updateCloudChrome();

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
              <span class="what">${escapeHtml(label)}</span>
              <span class="pts">${escapeHtml(ArcadeScores.formatScore(e.game, e.score))}</span>
              <span class="xp">+${escapeHtml(String(e.xp))} XP</span>
              <span class="when">${escapeHtml(when)}</span>
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

  // ----- Cloud scoreboard UI -----
  function updateCloudChrome() {
    const statusEl = $("#cloud-status");
    const shareBtn = $("#btn-share-cloud");
    const label = $("#global-hall-label");
    const status = window.ArcadeCloud?.getStatus?.() || "off";
    const configured = window.ArcadeCloud?.isConfigured?.() ?? false;

    const messages = {
      off: configured ? "" : " · Cloud disabled (see js/firebase-config.js)",
      connecting: " · Cloud: connecting…",
      online: " · Cloud: live",
      error: " · Cloud: offline (local still works)",
    };
    if (statusEl) statusEl.textContent = messages[status] || "";
    if (label) {
      label.textContent =
        status === "online" ? "(live)" : status === "connecting" ? "(connecting…)" : "(cloud)";
    }
    if (shareBtn) {
      shareBtn.hidden = status !== "online";
    }
  }

  function renderGlobalHall() {
    const list = $("#global-hall-list");
    if (!list) return;
    const status = window.ArcadeCloud?.getStatus?.() || "off";
    const hall = window.ArcadeCloud?.getGlobalHall?.() || [];

    if (status === "off") {
      list.innerHTML = `<li class="empty">Enable Firebase in <code>js/firebase-config.js</code> for a shared board.</li>`;
      return;
    }
    if (status === "connecting") {
      list.innerHTML = `<li class="empty">Connecting to global board…</li>`;
      return;
    }
    if (status === "error" && !hall.length) {
      list.innerHTML = `<li class="empty">Could not reach cloud. Local scores still work.</li>`;
      return;
    }
    if (!hall.length) {
      list.innerHTML = `<li class="empty">No global scores yet — beat a game to post one.</li>`;
      return;
    }
    list.innerHTML = hall
      .map((e, i) => {
        const gameLabel = ArcadeScores.GAMES[e.game]?.label || e.game;
        return `<li>
          <span class="rank">#${i + 1}</span>
          <span class="who">${escapeHtml(e.player)}</span>
          <span class="what">${escapeHtml(gameLabel)}</span>
          <span class="pts">${escapeHtml(ArcadeScores.formatScore(e.game, e.score))}</span>
        </li>`;
      })
      .join("");
  }

  async function shareLocalBestsToCloud() {
    if (window.ArcadeCloud?.getStatus?.() !== "online") {
      showToast("Cloud not online");
      return;
    }
    const state = ArcadeScores.getState();
    let pushed = 0;
    for (const [gameId, g] of Object.entries(ArcadeScores.GAMES)) {
      const best = state.highScores[gameId]?.best;
      if (best == null) continue;
      if (g.higherIsBetter && best <= 0) continue;
      const result = await window.ArcadeCloud.submitCloudScore(gameId, best, { shared: true }, {
        force: true,
        isHighScore: true,
      });
      if (result?.ok) pushed += 1;
    }
    showToast(pushed ? `Shared ${pushed} best${pushed === 1 ? "" : "s"} to cloud` : "Nothing to share yet");
  }

  // ----- Navigation -----
  async function openGame(id) {
    if (!GAME_SCRIPTS[id] || opening) return;
    // Re-activating the same game via hash is a no-op once mounted.
    if (activeGameId === id && activeGame && !playView.hidden) return;

    opening = true;
    lastCabinet = document.querySelector(`[data-game="${id}"]`);

    try {
      if (activeGame?.destroy) activeGame.destroy();
      activeGame = null;
      activeGameId = null;

      lobby.hidden = true;
      playView.hidden = false;
      playTitle.textContent = ArcadeScores.GAMES[id]?.label || id;
      gameMount.innerHTML = `<div class="game-loading" role="status" aria-live="polite"><span class="game-loading-spin" aria-hidden="true"></span><span>Loading cabinet…</span></div>`;

      const game = await ensureGame(id);
      if (!game) {
        showToast("Game failed to load");
        backToLobby();
        return;
      }

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
      activeGameId = id;

      // hash for deep links
      if (location.hash !== `#play/${id}`) {
        location.hash = `play/${id}`;
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      // Move focus into the play chrome for keyboard users
      $("#btn-back")?.focus({ preventScroll: true });
    } catch (err) {
      console.error(err);
      showToast("Game failed to load");
      backToLobby();
    } finally {
      opening = false;
    }
  }

  function backToLobby() {
    if (activeGame?.destroy) activeGame.destroy();
    activeGame = null;
    activeGameId = null;
    gameMount.innerHTML = "";
    playView.hidden = true;
    lobby.hidden = false;
    if (location.hash) {
      history.replaceState(null, "", location.pathname + location.search);
    }
    refreshHud();
    // Restore focus to the cabinet that opened the game
    if (lastCabinet?.isConnected) {
      lastCabinet.focus({ preventScroll: true });
    }
  }

  function routeFromHash() {
    const h = location.hash.replace(/^#/, "");
    if (h.startsWith("play/")) {
      const id = h.slice(5);
      if (GAME_SCRIPTS[id]) openGame(id);
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
    const id = card.dataset.game;
    // Prefetch the game bundle on first hover/focus so open feels instant.
    const prefetch = () => {
      if (GAME_SCRIPTS[id]) loadScript(GAME_SCRIPTS[id]).catch(() => {});
    };
    card.addEventListener("pointerenter", prefetch, { once: true });
    card.addEventListener("focus", prefetch, { once: true });
    card.addEventListener("click", () => openGame(id));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openGame(id);
      }
    });
  });

  $("#btn-back")?.addEventListener("click", backToLobby);

  // Escape returns to lobby when a game is open (and not typing in an input).
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (playView?.hidden) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    e.preventDefault();
    backToLobby();
  });

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

  $("#btn-share-cloud")?.addEventListener("click", () => {
    shareLocalBestsToCloud().catch((err) => {
      console.warn(err);
      showToast("Share failed");
    });
  });

  // year
  const y = $("#year");
  if (y) y.textContent = String(new Date().getFullYear());

  // ----- Fun facts deck -----
  const FUN_FACTS = [
    "⚡ I once ate ~1kg of salmon at one go.",
    "♟ AlphaGo & AlphaStar pulled me into AI research.",
    "🎮 Strategy roots: Dota 2, StarCraft II, and chess.",
    "🛂 As an HTX intern I staged threat items at real checkpoints for CV data.",
    "🤖 I automate the boring stuff — including PowerPoint generation.",
    "📚 I keep an open vault for Seeking Biblical Truth.",
    "🎓 NTU Computer Science, class of 2024.",
    "🔬 Now: AI Research Engineer @ Panasonic R&D, Singapore.",
    "🧠 Day job energy: computer vision, NLP, production ML.",
    "🇸🇬 Based in Singapore · still trying not to drown in CS work.",
    "🍣 Click me enough times and the whole arcade goes salmon-mode.",
  ];

  const factText = $("#fun-fact-text");
  const factCounter = $("#fun-facts-counter");
  const factCard = $("#fun-fact-card");
  const factHint = $("#fun-facts-hint");
  let factIndex = 0;
  let factClicks = 0;
  const seenFacts = new Set([0]);

  function showFact(i, { animate = true } = {}) {
    if (!factText) return;
    factIndex = ((i % FUN_FACTS.length) + FUN_FACTS.length) % FUN_FACTS.length;
    seenFacts.add(factIndex);
    if (animate && factCard) {
      factCard.classList.remove("flip");
      void factCard.offsetWidth;
      factCard.classList.add("flip");
    }
    factText.textContent = FUN_FACTS[factIndex];
    if (factCounter) {
      factCounter.textContent = `${factIndex + 1} / ${FUN_FACTS.length}`;
    }
    if (factHint) {
      factHint.textContent = `Collected ${seenFacts.size} / ${FUN_FACTS.length} lore cards`;
    }
  }

  function maybeSalmonUnlock() {
    if (factClicks >= 5 && !document.body.classList.contains("salmon-mode")) {
      document.body.classList.add("salmon-mode");
      showToast("🍣 SALMON MODE unlocked");
      window.ArcadeSFX?.levelUp?.();
    }
  }

  function nextFact(delta = 1) {
    factClicks += 1;
    showFact(factIndex + delta);
    window.ArcadeSFX?.click?.();
    maybeSalmonUnlock();
  }

  factCard?.addEventListener("click", () => nextFact(1));
  factCard?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      nextFact(1);
    }
  });
  $("#fun-fact-next")?.addEventListener("click", () => nextFact(1));
  $("#fun-fact-prev")?.addEventListener("click", () => nextFact(-1));
  $("#fun-fact-shuffle")?.addEventListener("click", () => {
    let n = factIndex;
    if (FUN_FACTS.length > 1) {
      while (n === factIndex) n = Math.floor(Math.random() * FUN_FACTS.length);
    }
    factClicks += 1;
    showFact(n);
    window.ArcadeSFX?.flip?.() || window.ArcadeSFX?.click?.();
    maybeSalmonUnlock();
  });
  showFact(0, { animate: false });

  // portfolio link already in HTML
  $$("[data-portfolio]").forEach((a) => {
    a.href = PORTFOLIO_URL;
  });

  // Brand → lobby (also clears an open game)
  $("#brand-home")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (!playView.hidden) backToLobby();
    else window.scrollTo({ top: 0, behavior: "smooth" });
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

  // Cloud init after SDKs + scripts (defer) have run
  function bootCloud() {
    if (!window.ArcadeCloud) return;
    window.ArcadeCloud.onChange?.(() => {
      renderGlobalHall();
      updateCloudChrome();
    });
    // Firebase compat scripts are also defer — wait a tick if needed
    const tryInit = () => {
      if (typeof firebase === "undefined" && window.ArcadeCloud.isConfigured?.()) {
        setTimeout(tryInit, 80);
        return;
      }
      window.ArcadeCloud.init?.().then((ok) => {
        if (ok) showToast("Global scoreboard online");
        refreshHud();
      });
    };
    tryInit();
  }
  bootCloud();
})();
