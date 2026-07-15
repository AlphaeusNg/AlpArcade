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
    tapper: () => window.GameTapper,
  };

  /** Lazy-loaded game bundles (only fetch the cabinet you open). */
  const GAME_SCRIPTS = {
    tictactoe: "js/games/tictactoe.js",
    shooter: "js/games/shooter.js",
    snake: "js/games/snake.js",
    reaction: "js/games/reaction.js",
    memory: "js/games/memory.js",
    tapper: "js/games/tapper.js",
  };

  const GAME_CONTROLS = {
    tictactoe: "Click a cell · change AI difficulty anytime",
    shooter: "WASD / arrows move · Space fire · P pause",
    snake: "WASD / arrows · swipe on mobile · P pause",
    reaction: "Click / tap the pad · wait for green",
    memory: "Tap cards to match pairs · hearts are lives",
    tapper: "Tap glowing cells · keys 1–9 · three lives",
  };

  let lastRunShare = null;

  function updateShareButton() {
    const btn = $("#btn-share-run");
    if (!btn) return;
    btn.hidden = !lastRunShare;
  }

  async function shareLastRun() {
    if (!lastRunShare) {
      showToast("Finish a run first");
      return;
    }
    const { label, score, gameId, isHighScore } = lastRunShare;
    const scoreText = ArcadeScores.formatScore(gameId, score);
    const text = `I scored ${scoreText} in ${label} on AlpArcade${isHighScore ? " (personal best!)" : ""} — ${location.origin}${location.pathname}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "AlpArcade", text, url: location.href.split("#")[0] });
        showToast("Shared!");
        return;
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Share text copied");
    } catch {
      prompt("Copy to share:", text);
    }
  }

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

  // ----- Toast (queued so achievements don't clobber each other) -----
  const toast = $("#toast");
  let toastTimer;
  const toastQueue = [];
  let toastBusy = false;

  function showToast(msg) {
    if (!toast || !msg) return;
    toastQueue.push(String(msg));
    drainToast();
  }

  function drainToast() {
    if (toastBusy || !toastQueue.length) return;
    toastBusy = true;
    const msg = toastQueue.shift();
    toast.hidden = false;
    toast.textContent = msg;
    requestAnimationFrame(() => toast.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        toast.hidden = true;
        toastBusy = false;
        drainToast();
      }, 260);
    }, 2400);
  }

  function paintCabinetBests() {
    const state = ArcadeScores.getState();
    $$("[data-game]").forEach((card) => {
      const id = card.dataset.game;
      const g = ArcadeScores.GAMES[id];
      if (!g) return;
      let bestEl = card.querySelector(".cab-best");
      if (!bestEl) {
        bestEl = document.createElement("span");
        bestEl.className = "cab-best mono";
        card.querySelector(".cab-body")?.appendChild(bestEl);
      }
      const hs = state.highScores[id];
      if (id === "tictactoe") {
        const w = hs?.wins || 0;
        bestEl.textContent = w ? `${w} win${w === 1 ? "" : "s"}` : "No wins yet";
      } else if (id === "reaction") {
        bestEl.textContent = hs?.best != null ? `Best ${hs.best} ms` : "No runs yet";
      } else {
        const b = hs?.best || 0;
        bestEl.textContent = b > 0 ? `Best ${ArcadeScores.formatScore(id, b)}` : "No runs yet";
      }
    });
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
    paintCabinetBests();

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

  // ----- Cloud scoreboard UI (Google opt-in) -----
  let pendingSave = null; // { gameId, score, isHighScore, meta }

  function cloudState() {
    return window.ArcadeCloud?.getState?.() || {
      status: "off",
      configured: false,
      signedIn: false,
      hasUsername: false,
      leaderboard: [],
      leaderboardGame: "all",
    };
  }

  function updateCloudChrome() {
    const statusEl = $("#cloud-status");
    const banner = $("#cloud-banner");
    const shareBtn = $("#btn-share-cloud");
    const retryBtn = $("#btn-cloud-retry");
    const label = $("#global-hall-label");
    const authLabel = $("#auth-label");
    const signInBtn = $("#btn-google-signin");
    const signOutBtn = $("#btn-google-signout");
    const s = cloudState();
    const status = s.status || "off";
    const err = s.lastError || window.ArcadeCloud?.getLastError?.() || "";

    let msg;
    if (!s.configured) {
      msg = "Cloud disabled — set enabled:true in js/firebase-config.js";
    } else if (status === "connecting") {
      msg = "Cloud: connecting…";
    } else if (status === "error") {
      msg = err ? `Cloud error: ${err}` : "Cloud offline — local play still works";
    } else if (status === "online") {
      msg = s.signedIn
        ? `Cloud live · signed in as ${s.displayName || s.email || "player"}`
        : "Cloud live · play free · Google only to post scores";
    } else {
      msg = "Cloud ready when you want to post a score";
    }

    if (statusEl) statusEl.textContent = msg;
    if (banner) {
      banner.classList.remove("is-online", "is-error", "is-off", "is-connecting");
      banner.classList.add(
        status === "online"
          ? "is-online"
          : status === "error"
            ? "is-error"
            : status === "connecting"
              ? "is-connecting"
              : "is-off"
      );
    }

    const filter = s.leaderboardGame || "all";
    const gameLabel =
      filter === "all" ? "all games" : ArcadeScores.GAMES[filter]?.label || filter;
    if (label) label.textContent = `(${gameLabel})`;

    if (shareBtn) {
      shareBtn.hidden = !s.configured;
      shareBtn.disabled = status === "connecting";
      shareBtn.textContent = s.signedIn ? "Post bests" : "Post bests (Google)";
    }
    if (retryBtn) {
      retryBtn.hidden = !(s.configured && (status === "error" || status === "off"));
    }

    if (authLabel) {
      authLabel.textContent = s.signedIn
        ? `${s.displayName || s.email} · cloud scores unlocked`
        : "Play free · Google only to post scores";
    }
    if (signInBtn) signInBtn.hidden = !s.configured || s.signedIn;
    if (signOutBtn) signOutBtn.hidden = !s.signedIn;

    // Filter chips
    $$("#lb-filters [data-lb-game]").forEach((chip) => {
      const on = chip.dataset.lbGame === filter;
      chip.classList.toggle("is-active", on);
      chip.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function renderLeaderboardList(listEl, hall, { showGame = true } = {}) {
    if (!listEl) return;
    const s = cloudState();
    const status = s.status || "off";
    const err = s.lastError || "";

    if (status === "off" && !s.configured) {
      listEl.innerHTML = `<li class="empty">Enable Firebase in <code>js/firebase-config.js</code>.</li>`;
      return;
    }
    if (status === "connecting") {
      listEl.innerHTML = `<li class="empty">Connecting…</li>`;
      return;
    }
    if (status === "error" && !hall.length) {
      listEl.innerHTML = `<li class="empty">Could not load board${err ? `: ${escapeHtml(err)}` : ""}.</li>`;
      return;
    }
    if (!hall.length) {
      listEl.innerHTML = `<li class="empty">No scores yet for this board — finish a run and save with Google.</li>`;
      return;
    }
    listEl.innerHTML = hall
      .map((e, i) => {
        const gameLabel = ArcadeScores.GAMES[e.game]?.label || e.game;
        return `<li>
          <span class="rank">#${i + 1}</span>
          <span class="who">${escapeHtml(e.player)}</span>
          ${showGame ? `<span class="what">${escapeHtml(gameLabel)}</span>` : ""}
          <span class="pts">${escapeHtml(ArcadeScores.formatScore(e.game, e.score))}</span>
        </li>`;
      })
      .join("");
  }

  function renderGlobalHall() {
    const hall = window.ArcadeCloud?.getLeaderboard?.() || window.ArcadeCloud?.getGlobalHall?.() || [];
    const filter = cloudState().leaderboardGame || "all";
    renderLeaderboardList($("#global-hall-list"), hall, { showGame: filter === "all" });
    renderPlayLeaderboard();
  }

  function renderPlayLeaderboard() {
    const list = $("#play-lb-list");
    const sub = $("#play-lb-sub");
    if (!list || playView?.hidden || !activeGameId) return;
    const label = ArcadeScores.GAMES[activeGameId]?.label || activeGameId;
    if (sub) sub.textContent = label;
    const hall =
      (window.ArcadeCloud?.getLeaderboard?.() || []).filter((e) => e.game === activeGameId);
    // If dashboard filter is this game, list is already filtered; else use load cache
    const rows =
      (cloudState().leaderboardGame === activeGameId
        ? window.ArcadeCloud?.getLeaderboard?.()
        : null) || hall;
    // Prefer dedicated load when filter differs
    if (cloudState().leaderboardGame === activeGameId) {
      renderLeaderboardList(list, window.ArcadeCloud.getLeaderboard() || [], { showGame: false });
    } else {
      window.ArcadeCloud?.loadLeaderboard?.(activeGameId, 15).then((data) => {
        if (activeGameId) renderLeaderboardList(list, data || [], { showGame: false });
      });
      renderLeaderboardList(list, rows, { showGame: false });
    }
  }

  function collectShareableBests() {
    const state = ArcadeScores.getState();
    const items = [];
    for (const [gameId, g] of Object.entries(ArcadeScores.GAMES)) {
      const best = state.highScores[gameId]?.best;
      if (best == null) continue;
      if (g.higherIsBetter && best <= 0) continue;
      if (!g.higherIsBetter && !Number.isFinite(Number(best))) continue;
      items.push({ gameId, best: Number(best), label: g.label });
    }
    return items;
  }

  function setModalStatus(text) {
    const el = $("#cloud-save-status");
    if (el) el.textContent = text || "";
  }

  function openCloudSaveModal(payload) {
    pendingSave = payload;
    const modal = $("#cloud-save-modal");
    if (!modal || !window.ArcadeCloud?.isConfigured?.()) return;

    const g = ArcadeScores.GAMES[payload.gameId];
    const summary = $("#cloud-save-summary");
    if (summary) {
      const scoreText = ArcadeScores.formatScore(payload.gameId, payload.score);
      summary.textContent = `${g?.label || payload.gameId}: ${scoreText}${
        payload.isHighScore ? " · personal best" : ""
      }`;
    }

    const stepMain = $("#cloud-save-step-main");
    const stepUser = $("#cloud-save-step-username");
    if (stepMain) stepMain.hidden = false;
    if (stepUser) stepUser.hidden = true;
    setModalStatus("");

    const goBtn = $("#btn-cloud-save-go");
    const s = cloudState();
    if (goBtn) {
      goBtn.textContent = s.signedIn && s.hasUsername ? "Post to global board" : "Continue with Google";
    }

    modal.hidden = false;
    goBtn?.focus({ preventScroll: true });
  }

  function closeCloudSaveModal() {
    const modal = $("#cloud-save-modal");
    if (modal) modal.hidden = true;
    pendingSave = null;
    setModalStatus("");
  }

  async function ensureReadyToPost() {
    await window.ArcadeCloud.init();
    let s = cloudState();
    if (!s.signedIn) {
      setModalStatus("Opening Google…");
      await window.ArcadeCloud.signInWithGoogle();
      s = cloudState();
    }
    if (!s.hasUsername) {
      $("#cloud-save-step-main").hidden = true;
      $("#cloud-save-step-username").hidden = false;
      const input = $("#cloud-username-input");
      if (input) {
        input.value = window.ArcadeCloud.suggestUsername?.() || ArcadeScores.getState().playerName || "";
        input.focus();
        input.select();
      }
      setModalStatus("Almost there — choose a username for the board.");
      return { ready: false, needUsername: true };
    }
    return { ready: true };
  }

  async function postAllBests() {
    const items = collectShareableBests();
    if (!items.length) return { ok: false, message: "No personal bests to post" };
    let pushed = 0;
    let lastMsg = "";
    for (const item of items) {
      const result = await window.ArcadeCloud.submitCloudScore(
        item.gameId,
        item.best,
        { shared: true },
        { force: true, isHighScore: true }
      );
      if (result?.ok && result.improved !== false) pushed += 1;
      if (result?.ok) lastMsg = result.message || lastMsg;
      else lastMsg = result?.message || lastMsg;
    }
    return {
      ok: pushed > 0 || lastMsg.includes("already"),
      message: pushed
        ? `Posted ${pushed} best${pushed === 1 ? "" : "s"}`
        : lastMsg || "Nothing new to post",
    };
  }

  async function postPendingOrBests() {
    const s = cloudState();
    if (!s.hasUsername) return { ok: false, message: "Username required" };
    if (pendingSave?.setupOnly) return { ok: true, message: "Username saved" };
    if (pendingSave?.batch) return postAllBests();

    if (pendingSave && pendingSave.gameId) {
      const result = await window.ArcadeCloud.submitCloudScore(
        pendingSave.gameId,
        pendingSave.score,
        pendingSave.meta || {},
        { force: true, isHighScore: !!pendingSave.isHighScore }
      );
      return result;
    }

    return postAllBests();
  }

  async function handleCloudSaveGo() {
    try {
      if (!window.ArcadeCloud?.isConfigured?.()) {
        setModalStatus("Cloud not configured");
        return;
      }
      const gate = await ensureReadyToPost();
      if (!gate.ready) return;

      setModalStatus("Posting…");
      const result = await postPendingOrBests();
      updateCloudChrome();
      renderGlobalHall();
      if (result.ok) {
        setModalStatus(result.message || "Saved!");
        showToast(result.message || "Saved to global board");
        const cloudAch = window.ArcadeAchievements?.unlock?.("cloud-post");
        if (cloudAch) notifyAchievements([cloudAch]);
        setTimeout(() => closeCloudSaveModal(), 700);
      } else {
        setModalStatus(result.message || "Could not save");
        showToast(result.message || "Save failed");
      }
    } catch (err) {
      console.warn(err);
      setModalStatus(err.message || "Failed");
      showToast(err.message || "Save failed");
      updateCloudChrome();
    }
  }

  async function handleUsernameSave() {
    try {
      const name = $("#cloud-username-input")?.value || "";
      setModalStatus("Saving username…");
      await window.ArcadeCloud.setUsername(name);
      refreshHud();
      setModalStatus("Posting score…");
      const result = await postPendingOrBests();
      updateCloudChrome();
      renderGlobalHall();
      if (result.ok) {
        showToast(result.message || "Saved!");
        setTimeout(() => closeCloudSaveModal(), 700);
      } else {
        setModalStatus(result.message || "Could not save score");
      }
    } catch (err) {
      setModalStatus(err.message || "Username failed");
    }
  }

  async function shareLocalBestsToCloud() {
    const shareBtn = $("#btn-share-cloud");
    if (shareBtn) shareBtn.disabled = true;
    try {
      if (!window.ArcadeCloud?.isConfigured?.()) {
        showToast("Cloud not configured");
        return;
      }
      await window.ArcadeCloud.init();
      const items = collectShareableBests();
      if (!items.length) {
        showToast("No personal bests yet — play first");
        return;
      }

      const s = cloudState();
      if (s.signedIn && s.hasUsername) {
        showToast("Posting bests…");
        pendingSave = { batch: true };
        const result = await postAllBests();
        pendingSave = null;
        updateCloudChrome();
        renderGlobalHall();
        showToast(result.message || (result.ok ? "Posted" : "Nothing to post"));
        return;
      }

      // Need Google + maybe username — modal guides the rest
      openCloudSaveModal({
        gameId: items[0].gameId,
        score: items[0].best,
        isHighScore: true,
        meta: { shared: true },
      });
      pendingSave = { batch: true };
      const summary = $("#cloud-save-summary");
      if (summary) {
        summary.textContent = `Post ${items.length} personal best${items.length === 1 ? "" : "s"} to the global board`;
      }
      const title = $("#cloud-save-title");
      if (title) title.textContent = "Post your bests?";
    } finally {
      if (shareBtn) shareBtn.disabled = false;
      updateCloudChrome();
    }
  }

  async function retryCloudConnect() {
    showToast("Retrying cloud…");
    const ok = await window.ArcadeCloud?.init?.();
    updateCloudChrome();
    renderGlobalHall();
    if (ok) showToast("Cloud connected");
    else showToast(window.ArcadeCloud?.getLastError?.() || "Still offline");
  }

  function offerCloudSaveAfterRun({ gameId, score, isHighScore, meta }) {
    if (!window.ArcadeCloud?.isConfigured?.()) return;
    const g = ArcadeScores.GAMES[gameId];
    if (!g) return;
    if (g.higherIsBetter && Number(score) <= 0 && gameId !== "tictactoe") return;
    // Reduce modal spam: auto-prompt only on personal bests (or TTT wins).
    // Players can always use "Post bests" from the lobby scoreboard.
    const meaningful =
      isHighScore ||
      (gameId === "tictactoe" && meta?.result === "win");
    if (!meaningful) return;
    setTimeout(() => {
      // Don't stack over an already-open modal
      if ($("#cloud-save-modal") && !$("#cloud-save-modal").hidden) return;
      openCloudSaveModal({ gameId, score, isHighScore, meta });
    }, 700);
  }

  function notifyAchievements(list) {
    if (!list?.length) return;
    for (const a of list) {
      showToast(`${a.icon || "🏅"} ${a.title}`);
    }
    paintAchievements();
  }

  function paintAchievements() {
    const host = $("#achievements-list");
    const countEl = $("#achievements-count");
    if (!window.ArcadeAchievements) return;
    const items = window.ArcadeAchievements.list();
    const { have, total } = window.ArcadeAchievements.count();
    if (countEl) countEl.textContent = `${have} / ${total}`;
    if (!host) return;
    host.innerHTML = items
      .map(
        (a) => `
      <li class="ach-item${a.unlocked ? " is-unlocked" : ""}" title="${escapeHtml(a.blurb)}">
        <span class="ach-icon" aria-hidden="true">${a.icon}</span>
        <span class="ach-body">
          <strong>${escapeHtml(a.title)}</strong>
          <small>${escapeHtml(a.blurb)}</small>
        </span>
      </li>`
      )
      .join("");
  }

  function paintDaily() {
    const el = $("#daily-card");
    if (!el || !window.ArcadeDaily) return;
    const ch = window.ArcadeDaily.challengeFor();
    const done = window.ArcadeDaily.isComplete();
    const target = window.ArcadeDaily.formatTarget(ch);
    el.innerHTML = `
      <div class="daily-head">
        <p class="eyebrow">Daily challenge</p>
        <span class="daily-badge mono${done ? " is-done" : ""}">${done ? "Done ✓" : ch.day}</span>
      </div>
      <p class="daily-task">
        <strong>${escapeHtml(ch.label)}</strong>
        <span>${escapeHtml(target)}</span>
      </p>
      <button type="button" class="btn small primary" id="btn-daily-play" data-daily-game="${escapeHtml(ch.game)}">
        ${done ? "Play again" : "Play challenge"}
      </button>
    `;
    $("#btn-daily-play")?.addEventListener("click", () => openGame(ch.game));
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

      // Side leaderboard for this cabinet
      window.ArcadeCloud?.setLeaderboardGame?.(id);
      const playSub = $("#play-lb-sub");
      if (playSub) playSub.textContent = ArcadeScores.GAMES[id]?.label || id;

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
          lastRunShare = {
            gameId: id,
            score,
            isHighScore,
            label: ArcadeScores.GAMES[id]?.label || id,
          };
          updateShareButton();

          const unlocked = window.ArcadeAchievements?.evaluateAfterRun?.(id, score, {
            result,
            ...meta,
          });
          if (unlocked?.length) {
            setTimeout(() => notifyAchievements(unlocked), 900);
          }

          const daily = window.ArcadeDaily?.markAttempt?.(id, score, { result, ...meta });
          if (daily?.completed && daily.firstTime) {
            setTimeout(() => {
              showToast("📅 Daily challenge complete!");
              paintDaily();
              paintAchievements();
            }, 1200);
          }

          offerCloudSaveAfterRun({
            gameId: id,
            score,
            isHighScore,
            meta: { result, ...meta },
          });
        },
      });
      activeGameId = id;
      const ctrl = $("#play-controls");
      if (ctrl) ctrl.textContent = GAME_CONTROLS[id] || "Have fun";
      renderPlayLeaderboard();

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
    // Restore dashboard leaderboard filter to All
    window.ArcadeCloud?.setLeaderboardGame?.("all");
    refreshHud();
    updateCloudChrome();
    renderGlobalHall();
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
  $("#btn-share-run")?.addEventListener("click", () => {
    shareLastRun().catch(() => showToast("Share failed"));
  });

  // Escape: close modal first; otherwise return to lobby from a game.
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const modal = $("#cloud-save-modal");
    if (modal && !modal.hidden) {
      e.preventDefault();
      closeCloudSaveModal();
      return;
    }
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
      showToast(`Share failed: ${err.message || "error"}`);
    });
  });

  $("#btn-cloud-retry")?.addEventListener("click", () => {
    retryCloudConnect().catch((err) => {
      console.warn(err);
      showToast(`Retry failed: ${err.message || "error"}`);
    });
  });

  $("#btn-google-signin")?.addEventListener("click", async () => {
    try {
      await window.ArcadeCloud.init();
      await window.ArcadeCloud.signInWithGoogle();
      const s = cloudState();
      if (!s.hasUsername) {
        pendingSave = null;
        openCloudSaveModal({
          gameId: "snake",
          score: 0,
          isHighScore: false,
          meta: { setupOnly: true },
        });
        $("#cloud-save-title").textContent = "Choose a username";
        $("#cloud-save-summary").textContent = "This name appears on the global leaderboard.";
        $("#cloud-save-step-main").hidden = true;
        $("#cloud-save-step-username").hidden = false;
        const input = $("#cloud-username-input");
        if (input) {
          input.value = window.ArcadeCloud.suggestUsername() || "";
          input.focus();
        }
        // Prevent posting score 0 on username-only setup
        pendingSave = { setupOnly: true };
      } else {
        showToast(`Signed in as ${s.displayName}`);
      }
      updateCloudChrome();
      refreshHud();
    } catch (err) {
      showToast(err.message || "Sign-in failed");
    }
  });

  $("#btn-google-signout")?.addEventListener("click", async () => {
    try {
      await window.ArcadeCloud.signOut();
      showToast("Signed out");
      updateCloudChrome();
    } catch (err) {
      showToast(err.message || "Sign out failed");
    }
  });

  $$("#lb-filters [data-lb-game]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const game = chip.dataset.lbGame || "all";
      window.ArcadeCloud?.setLeaderboardGame?.(game === "all" ? "all" : game);
      updateCloudChrome();
      renderGlobalHall();
    });
  });

  $("#btn-cloud-save-go")?.addEventListener("click", () => {
    handleCloudSaveGo().catch((err) => showToast(err.message || "Failed"));
  });
  $("#btn-cloud-save-skip")?.addEventListener("click", () => closeCloudSaveModal());
  $("#btn-cloud-username-save")?.addEventListener("click", () => {
    // Username-only setup (no score)
    if (pendingSave?.setupOnly) {
      const name = $("#cloud-username-input")?.value || "";
      window.ArcadeCloud
        .setUsername(name)
        .then(() => {
          showToast("Username saved");
          closeCloudSaveModal();
          updateCloudChrome();
          refreshHud();
        })
        .catch((err) => setModalStatus(err.message || "Failed"));
      return;
    }
    handleUsernameSave().catch((err) => setModalStatus(err.message || "Failed"));
  });
  $$("#cloud-save-modal [data-close-modal]").forEach((el) => {
    el.addEventListener("click", () => closeCloudSaveModal());
  });

  // year + deploy version
  const y = $("#year");
  if (y) y.textContent = String(new Date().getFullYear());
  const ver = $("#site-version");
  if (ver && window.SITE_VERSION) {
    ver.textContent = `v${window.SITE_VERSION.id} · ${window.SITE_VERSION.repo}`;
  }

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
      const ach = window.ArcadeAchievements?.unlock?.("salmon");
      if (ach) setTimeout(() => notifyAchievements([ach]), 500);
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
  paintAchievements();
  paintDaily();
  routeFromHash();

  // Cloud init — read-only leaderboards without forcing Google sign-in
  function bootCloud() {
    if (!window.ArcadeCloud) {
      const statusEl = $("#cloud-status");
      if (statusEl) statusEl.textContent = "Cloud module failed to load — hard-refresh (Ctrl+Shift+R)";
      return;
    }
    window.ArcadeCloud.onChange?.(() => {
      renderGlobalHall();
      updateCloudChrome();
    });
    updateCloudChrome();

    let attempts = 0;
    const tryInit = () => {
      attempts += 1;
      if (typeof firebase === "undefined" && window.ArcadeCloud.isConfigured?.()) {
        if (attempts < 40) {
          setTimeout(tryInit, 100);
          return;
        }
        showToast("Firebase SDK failed to load");
        updateCloudChrome();
        return;
      }
      window.ArcadeCloud.init?.().then((ok) => {
        refreshHud();
        updateCloudChrome();
        renderGlobalHall();
        if (ok) {
          console.info("[Arcade] cloud ready (Google only for writes)", window.ArcadeCloud.getDiagnostics?.());
        } else if (window.ArcadeCloud.isConfigured?.()) {
          const err = window.ArcadeCloud.getLastError?.() || "unknown";
          console.warn("[Arcade] cloud init failed", err, window.ArcadeCloud.getDiagnostics?.());
        }
      });
    };
    tryInit();
  }
  bootCloud();
})();
