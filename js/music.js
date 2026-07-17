/**
 * AlpArcade music
 * - Left ♪ tab opens/closes the station list (dock panel)
 * - Small player shell lives under body (never trapped by dock transform)
 * - Drag free across the viewport · – mini tab · × stops audio
 * - Iframe never reparented after first mount under body host
 */
(function () {
  "use strict";

  const KEY = "alparcade-bg-music";
  const UI_KEY = "alparcade-music-ui-v4";
  const DEFAULT_ID = "lofi";
  const DEFAULT_EMBED =
    "https://open.spotify.com/embed/playlist/0IcjCtBQgkV41B1jkMeAaw?utm_source=generator";
  const SNAP_LEFT = 96;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let currentEmbed = "";
  let currentId = "";
  let currentLabel = "Playing…";
  let lastEmbed = "";
  let playing = false;
  let gestureHooked = false;
  let dockOpen = false;
  /** home | float | mini */
  let playerMode = "home";
  let floatPos = null;
  let drag = null;

  function dockRoot() {
    return $("#bg-music");
  }
  function panel() {
    return $("#music-dock-panel");
  }
  function tab() {
    return $("#music-dock-tab");
  }
  function scrim() {
    return $("#music-dock-scrim");
  }
  function slot() {
    return $("#music-player-slot");
  }
  function shell() {
    return $("#music-player-shell");
  }
  function frame() {
    return $("#bg-music-frame");
  }
  function empty() {
    return $("#bg-music-empty");
  }
  function withAutoplay(url) {
    if (!url) return url;
    try {
      const u = new URL(url, location.href);
      u.searchParams.set("utm_source", u.searchParams.get("utm_source") || "generator");
      u.searchParams.set("autoplay", "1");
      u.searchParams.set("theme", "0");
      return u.toString();
    } catch {
      return url.includes("?") ? `${url}&autoplay=1` : `${url}?autoplay=1`;
    }
  }

  function setActiveButtons(id) {
    $$(".bg-music-btn").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.playlist === id);
    });
  }

  /**
   * Mount shell under body once so fixed positioning / drag use the viewport.
   * Must run before iframe src is set (reparenting later can stop Spotify).
   */
  function ensureShellOnBody() {
    const s = shell();
    if (!s) return null;
    if (s.parentElement !== document.body) {
      document.body.appendChild(s);
    }
    s.classList.add("music-player-shell");
    return s;
  }

  function ensureBarChrome() {
    const s = ensureShellOnBody();
    const bar = s?.querySelector(".music-player-bar");
    if (!bar) return;
    if (!$("#music-player-grip")) {
      const g = document.createElement("span");
      g.id = "music-player-grip";
      g.className = "music-player-grip";
      g.setAttribute("aria-hidden", "true");
      g.title = "Drag player";
      g.textContent = "⋮⋮";
      bar.insertBefore(g, bar.firstChild);
    }
    if (!$("#music-player-min")) {
      const b = document.createElement("button");
      b.type = "button";
      b.id = "music-player-min";
      b.className = "music-player-min";
      b.title = "Minimize to side tab";
      b.setAttribute("aria-label", "Minimize to side tab");
      b.textContent = "–";
      bar.appendChild(b);
    }
    if (!$("#music-player-close")) {
      const b = document.createElement("button");
      b.type = "button";
      b.id = "music-player-close";
      b.className = "music-player-close";
      b.title = "Stop music";
      b.setAttribute("aria-label", "Stop music");
      b.textContent = "×";
      bar.appendChild(b);
    }
  }

  function updateLabels() {
    const lab = $("#music-player-label");
    if (lab) lab.textContent = playing ? currentLabel : "Stopped";
    const short = playing
      ? currentLabel.length > 14
        ? currentLabel.slice(0, 12) + "…"
        : currentLabel
      : "Music";
    const tabText = $("#music-dock-tab-text");
    if (tabText) tabText.textContent = short;
    const t = tab();
    if (t) {
      t.setAttribute("aria-expanded", dockOpen ? "true" : "false");
      t.title = dockOpen
        ? "Close stations"
        : playerMode === "mini" && playing
          ? `Open stations · ${currentLabel} (playing)`
          : "Open stations";
      t.classList.toggle("is-active-tab", dockOpen);
      t.classList.toggle("is-player-mini", playerMode === "mini" && playing);
    }
    dockRoot()?.classList.toggle("is-playing", playing);
    // Never leave a second left-edge tab around
    const stray = $("#music-mini-tab");
    if (stray) stray.remove();
  }

  function persistUi() {
    try {
      localStorage.setItem(
        UI_KEY,
        JSON.stringify({
          dockOpen,
          playerMode,
          float: floatPos,
          playing,
          id: currentId,
          embed: lastEmbed || currentEmbed,
          label: currentLabel,
        })
      );
    } catch {
      /* ignore */
    }
  }

  function clearShellPos(s) {
    if (!s) return;
    s.style.left = "";
    s.style.top = "";
    s.style.right = "";
    s.style.bottom = "";
    s.style.width = "";
    s.style.maxWidth = "";
    s.style.transform = "";
    s.classList.remove("is-dragged", "is-popup", "is-home", "is-minimized", "is-snap-near", "is-dragging");
  }

  function setChrome(floaty) {
    const minB = $("#music-player-min");
    const closeB = $("#music-player-close");
    const grip = $("#music-player-grip");
    if (minB) minB.hidden = !floaty;
    if (closeB) closeB.hidden = !floaty;
    if (grip) grip.hidden = !floaty;
  }

  function placePlayerHome() {
    const s = ensureShellOnBody();
    const sl = slot();
    if (!s) return;
    playerMode = "home";
    s.classList.remove("is-popup", "is-minimized", "is-dragged");
    s.classList.add("is-home");
    s.hidden = !playing;
    clearShellPos(s);

    if (!playing || !sl) {
      setChrome(false);
      return;
    }

    // Pin over the slot when dock is open and slot is visible
    const rect = sl.getBoundingClientRect();
    const slotOnScreen =
      dockOpen && rect.width > 8 && rect.bottom > 0 && rect.top < (window.innerHeight || 0);

    if (slotOnScreen) {
      s.style.position = "fixed";
      s.style.left = `${Math.max(0, rect.left)}px`;
      s.style.top = `${Math.max(0, rect.top)}px`;
      s.style.width = `${rect.width}px`;
      s.style.zIndex = "58";
      sl.style.minHeight = `${Math.max(s.offsetHeight || 180, 168)}px`;
      setChrome(false);
    } else {
      // Dock closed or slot off-screen → keep playing as float
      placePlayerFloat({ soft: true });
      return;
    }
  }

  function placePlayerFloat({ soft = false } = {}) {
    const s = ensureShellOnBody();
    if (!s || !playing) return;
    playerMode = "float";
    s.hidden = false;
    s.classList.add("is-popup");
    s.classList.remove("is-home", "is-minimized");
    s.style.position = "fixed";
    s.style.zIndex = "80";
    s.style.width = "min(340px, calc(100vw - 1.5rem))";
    s.style.maxWidth = "calc(100vw - 1rem)";

    if (floatPos && Number.isFinite(floatPos.left) && Number.isFinite(floatPos.top)) {
      const pos = clamp(floatPos.left, floatPos.top, s);
      floatPos = pos;
      s.style.left = `${pos.left}px`;
      s.style.top = `${pos.top}px`;
      s.style.right = "auto";
      s.style.bottom = "auto";
      s.classList.add("is-dragged");
    } else {
      s.style.right = "1rem";
      s.style.bottom = "1rem";
      s.style.left = "auto";
      s.style.top = "auto";
      s.classList.remove("is-dragged");
    }

    const sl = slot();
    if (sl) sl.style.minHeight = "";
    setChrome(true);
    if (!soft) persistUi();
  }

  /** Hide floating player; audio keeps going. One ♪ tab reopens stations + player. */
  function placePlayerMini() {
    const s = ensureShellOnBody();
    if (s) {
      s.hidden = true;
      s.classList.add("is-minimized", "is-popup");
      s.classList.remove("is-home");
    }
    playerMode = "mini";
    setChrome(false);
    updateLabels();
  }

  function setPlayerMode(next, { persist = true } = {}) {
    if (!playing && next !== "home") {
      placePlayerHome();
      if (persist) persistUi();
      return;
    }
    if (next === "home") placePlayerHome();
    else if (next === "mini") placePlayerMini();
    else placePlayerFloat();
    if (persist) persistUi();
  }

  function setDockOpen(open, { persist = true } = {}) {
    dockOpen = !!open;
    const d = dockRoot();
    const p = panel();
    const t = tab();
    const sc = scrim();

    // Classes on root + panel (belt-and-suspenders so open never fails)
    if (d) {
      d.classList.toggle("is-open", dockOpen);
      d.classList.toggle("is-dock", dockOpen);
      d.classList.toggle("is-tab", !dockOpen);
      d.classList.toggle("is-playing", playing);
    }
    if (p) {
      p.classList.toggle("is-open", dockOpen);
      p.hidden = false; // never use [hidden] — CSS visibility handles it
      p.setAttribute("aria-hidden", dockOpen ? "false" : "true");
    }
    if (t) {
      t.setAttribute("aria-expanded", dockOpen ? "true" : "false");
      t.classList.toggle("is-active-tab", dockOpen);
      // Don’t pin left via inline styles — CSS slides tab with the panel border
      t.style.pointerEvents = "auto";
      t.style.zIndex = "120";
    }
    if (sc) {
      const narrow = window.matchMedia("(max-width: 820px)").matches;
      sc.hidden = !(dockOpen && narrow);
      sc.setAttribute("aria-hidden", sc.hidden ? "true" : "false");
    }
    // Reposition player relative to dock
    if (playing) {
      if (playerMode === "home") placePlayerHome();
      else if (playerMode === "float") placePlayerFloat({ soft: true });
    }
    updateLabels();
    if (persist) persistUi();
  }

  function stopMusic() {
    playing = false;
    const f = frame();
    if (f) {
      try {
        f.src = "about:blank";
      } catch {
        f.removeAttribute("src");
      }
    }
    currentEmbed = "";
    const s = shell();
    if (s) s.hidden = true;
    const e = empty();
    if (e) {
      e.hidden = false;
      e.textContent = "Music stopped · pick a station";
    }
    setActiveButtons("");
    setPlayerMode("home", { persist: false });
    updateLabels();
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          id: currentId,
          embed: lastEmbed,
          label: currentLabel,
          stopped: true,
        })
      );
    } catch {
      /* ignore */
    }
    persistUi();
  }

  function play(id, embed, label, { forceReload = false } = {}) {
    if (!embed) return;
    ensureShellOnBody();
    ensureBarChrome();
    const f = frame();
    const s = shell();
    const e = empty();
    if (!f || !s) return;

    const src = withAutoplay(embed);

    if (currentEmbed === embed && playing && !forceReload) {
      setActiveButtons(id);
      s.hidden = false;
      if (e) e.hidden = true;
      setPlayerMode(playerMode === "mini" ? "mini" : playerMode === "float" ? "float" : "home");
      return;
    }

    currentEmbed = embed;
    lastEmbed = embed;
    currentId = id || "";
    currentLabel =
      label || (id === "lofi" ? "Lofi Beats" : id === "dgray" ? "D.Gray-Man" : "Playing…");
    f.src = src;
    playing = true;
    s.hidden = false;
    if (e) e.hidden = true;
    setActiveButtons(currentId);
    updateLabels();

    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          id: currentId,
          embed: currentEmbed,
          label: currentLabel,
          stopped: false,
        })
      );
    } catch {
      /* ignore */
    }

    if (playerMode === "mini") placePlayerMini();
    else if (playerMode === "float") placePlayerFloat();
    else placePlayerHome();
    persistUi();
  }

  function clamp(left, top, el) {
    const w = el?.offsetWidth || 320;
    const h = el?.offsetHeight || 200;
    const vw = window.innerWidth || 800;
    const vh = window.innerHeight || 600;
    // Allow free movement within the viewport (small margin)
    const margin = 4;
    return {
      left: Math.min(Math.max(margin, left), Math.max(margin, vw - w - margin)),
      top: Math.min(Math.max(margin, top), Math.max(margin, vh - h - margin)),
    };
  }

  function bindPlayerDrag() {
    const s = ensureShellOnBody();
    const bar = s?.querySelector(".music-player-bar");
    if (!s || !bar || bar.dataset.dragBound) return;
    bar.dataset.dragBound = "1";

    bar.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest("button, a, iframe")) return;
      if (playerMode === "mini" || !playing) return;
      e.preventDefault();
      const rect = s.getBoundingClientRect();
      // Lift from home into free float
      if (playerMode === "home") {
        floatPos = { left: rect.left, top: rect.top };
        placePlayerFloat({ soft: true });
      }
      drag = { ox: e.clientX - rect.left, oy: e.clientY - rect.top, id: e.pointerId };
      try {
        bar.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      s.classList.add("is-dragging");
    });

    bar.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const pos = clamp(e.clientX - drag.ox, e.clientY - drag.oy, s);
      floatPos = pos;
      s.style.left = `${pos.left}px`;
      s.style.top = `${pos.top}px`;
      s.style.right = "auto";
      s.style.bottom = "auto";
      s.classList.add("is-dragged");
      const near = pos.left < SNAP_LEFT && dockOpen;
      s.classList.toggle("is-snap-near", near);
    });

    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const near = floatPos && floatPos.left < SNAP_LEFT && dockOpen;
      drag = null;
      s.classList.remove("is-dragging", "is-snap-near");
      if (near) {
        floatPos = null;
        setPlayerMode("home");
      } else {
        setPlayerMode("float");
      }
    };
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);
  }

  function nudgeAutoplayOnGesture() {
    if (gestureHooked) return;
    gestureHooked = true;
    const once = () => {
      window.removeEventListener("pointerdown", once, true);
      window.removeEventListener("keydown", once, true);
      window.removeEventListener("touchstart", once, true);
      if (!playing || !currentEmbed) return;
      play(currentId || "nudge", currentEmbed, currentLabel, { forceReload: true });
    };
    window.addEventListener("pointerdown", once, { capture: true, passive: true });
    window.addEventListener("keydown", once, { capture: true });
    window.addEventListener("touchstart", once, { capture: true, passive: true });
  }

  function autoStart() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.stopped) {
          currentId = data.id || "";
          currentLabel = data.label || "Playing…";
          lastEmbed = data.embed || "";
          updateLabels();
          return;
        }
        if (data?.embed) {
          play(data.id || "restored", data.embed, data.label || "");
          nudgeAutoplayOnGesture();
          return;
        }
      }
    } catch {
      /* ignore */
    }
    const btn =
      $(`.bg-music-btn[data-playlist="${DEFAULT_ID}"]`) || $(".bg-music-btn[data-embed]");
    if (btn?.dataset?.embed) {
      play(
        btn.dataset.playlist,
        btn.dataset.embed,
        btn.querySelector("strong")?.textContent || btn.dataset.playlist
      );
    } else {
      play(DEFAULT_ID, DEFAULT_EMBED, "Lofi Beats");
    }
    nudgeAutoplayOnGesture();
  }

  function restoreUi() {
    try {
      const raw = localStorage.getItem(UI_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.float && Number.isFinite(data.float.left)) floatPos = data.float;
        if (data.playerMode === "float" || data.playerMode === "mini" || data.playerMode === "home") {
          playerMode = data.playerMode;
        }
        setDockOpen(!!data.dockOpen, { persist: false });
        return;
      }
    } catch {
      /* ignore */
    }
    // Default closed on all sizes so ♪ tab is always the clear entry
    setDockOpen(false, { persist: false });
  }

  function boot() {
    // Critical: shell on body BEFORE any iframe src
    ensureShellOnBody();
    ensureBarChrome();
    // Remove legacy second tab if present from older builds
    $("#music-mini-tab")?.remove();
    restoreUi();
    autoStart();
    if (playing) setPlayerMode(playerMode, { persist: false });
    bindPlayerDrag();

    // Capture-phase so nothing (floating shell, games) can swallow the tab click
    document.addEventListener(
      "click",
      (e) => {
        const t = e.target.closest?.("#music-dock-tab, .music-dock-tab");
        if (t) {
          e.preventDefault();
          e.stopPropagation();
          const opening = !dockOpen;
          setDockOpen(opening);
          if (opening && playing && playerMode === "mini") setPlayerMode("home");
          return;
        }
        if (e.target.closest?.("#music-dock-close")) {
          e.preventDefault();
          e.stopPropagation();
          setDockOpen(false);
          return;
        }
        if (e.target.closest?.("#music-dock-scrim")) {
          e.preventDefault();
          setDockOpen(false);
          return;
        }
        if (e.target.closest?.("#nav-music")) {
          e.preventDefault();
          e.stopPropagation();
          setDockOpen(!dockOpen);
          return;
        }
        if (e.target.closest?.("#music-player-min")) {
          e.preventDefault();
          e.stopPropagation();
          setPlayerMode("mini");
          return;
        }
        if (e.target.closest?.("#music-player-close")) {
          e.preventDefault();
          e.stopPropagation();
          stopMusic();
        }
      },
      true
    );

    $$(".bg-music-btn[data-embed]").forEach((btn) => {
      btn.addEventListener("click", () => {
        play(
          btn.dataset.playlist,
          btn.dataset.embed,
          btn.querySelector("strong")?.textContent || btn.dataset.playlist,
          { forceReload: true }
        );
        if (playerMode === "mini") setPlayerMode("float");
        else if (playerMode === "home") placePlayerHome();
      });
    });

    if (location.hash === "#bg-music") setDockOpen(true);
    window.addEventListener("hashchange", () => {
      if (location.hash === "#bg-music") setDockOpen(true);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dockOpen) setDockOpen(false);
    });
    window.addEventListener(
      "scroll",
      () => {
        if (playerMode === "home" && playing) placePlayerHome();
      },
      { passive: true }
    );
    window.addEventListener("resize", () => {
      if (playerMode === "home" && playing) placePlayerHome();
      else if (playerMode === "float" && floatPos) {
        const s = shell();
        floatPos = clamp(floatPos.left, floatPos.top, s);
        if (s) {
          s.style.left = `${floatPos.left}px`;
          s.style.top = `${floatPos.top}px`;
        }
      }
      setDockOpen(dockOpen, { persist: false });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
