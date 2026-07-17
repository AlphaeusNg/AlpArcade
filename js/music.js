/**
 * AlpArcade music
 * - Left ♪ tab opens/closes the station dock (picks only + home slot)
 * - Small player shell can float (drag), minimize to side tab, or dock home
 * - × on floating player stops music; – packs to side tab (keeps playing)
 * - Iframe never reparented
 */
(function () {
  "use strict";

  const KEY = "alparcade-bg-music";
  const UI_KEY = "alparcade-music-ui-v3";
  const DEFAULT_ID = "lofi";
  const DEFAULT_EMBED =
    "https://open.spotify.com/embed/playlist/0IcjCtBQgkV41B1jkMeAaw?utm_source=generator";
  const SNAP_LEFT = 80;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let currentEmbed = "";
  let currentId = "";
  let currentLabel = "Playing…";
  let lastEmbed = ""; // kept after stop for re-pick
  let playing = false;
  let gestureHooked = false;
  /** Dock panel open (station list) */
  let dockOpen = false;
  /** Player chrome: home | float | mini */
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
  function miniTab() {
    return $("#music-mini-tab");
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

  function ensureMiniTab() {
    let el = miniTab();
    if (el) return el;
    el = document.createElement("button");
    el.type = "button";
    el.id = "music-mini-tab";
    el.className = "music-mini-tab";
    el.hidden = true;
    el.innerHTML = `<span class="music-mini-tab-icon" aria-hidden="true">♪</span><span class="music-mini-tab-label mono" id="music-mini-tab-label">Music</span>`;
    document.body.appendChild(el);
    el.addEventListener("click", () => {
      setPlayerMode("float");
    });
    return el;
  }

  function ensureBarChrome() {
    const bar = shell()?.querySelector(".music-player-bar");
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
    const tabText = $("#music-dock-tab-text");
    if (tabText) {
      tabText.textContent = playing
        ? currentLabel.length > 14
          ? currentLabel.slice(0, 12) + "…"
          : currentLabel
        : "Music";
    }
    const miniLab = $("#music-mini-tab-label");
    if (miniLab) {
      miniLab.textContent = playing
        ? currentLabel.length > 16
          ? currentLabel.slice(0, 14) + "…"
          : currentLabel
        : "Music";
    }
    const t = tab();
    if (t) {
      t.setAttribute("aria-expanded", dockOpen ? "true" : "false");
      t.title = dockOpen ? "Close station list" : "Open stations";
    }
    dockRoot()?.classList.toggle("is-playing", playing);
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
    s.style.transform = "";
    s.classList.remove("is-dragged", "is-popup", "is-home", "is-minimized");
  }

  function placePlayerHome() {
    const s = shell();
    const sl = slot();
    if (!s || !sl) return;
    playerMode = "home";
    s.classList.remove("is-popup", "is-minimized", "is-dragged");
    s.classList.add("is-home");
    s.hidden = !playing;
    clearShellPos(s);
    const rect = sl.getBoundingClientRect();
    if (rect.width > 0 && playing) {
      s.style.position = "fixed";
      s.style.left = `${Math.max(0, rect.left)}px`;
      s.style.top = `${Math.max(0, rect.top)}px`;
      s.style.width = `${rect.width}px`;
      s.style.zIndex = "58";
    }
    sl.style.minHeight = playing ? `${Math.max(s.offsetHeight || 180, 168)}px` : "";
    const mt = miniTab();
    if (mt) mt.hidden = true;
    // chrome: min/close only useful when floating
    const minB = $("#music-player-min");
    const closeB = $("#music-player-close");
    if (minB) minB.hidden = true;
    if (closeB) closeB.hidden = true;
    const grip = $("#music-player-grip");
    if (grip) grip.hidden = true;
  }

  function placePlayerFloat() {
    const s = shell();
    if (!s || !playing) return;
    playerMode = "float";
    s.hidden = false;
    s.classList.add("is-popup");
    s.classList.remove("is-home", "is-minimized");
    s.style.position = "fixed";
    s.style.zIndex = "70";
    s.style.width = "min(340px, calc(100vw - 1.5rem))";
    if (floatPos) {
      s.style.left = `${floatPos.left}px`;
      s.style.top = `${floatPos.top}px`;
      s.style.right = "auto";
      s.style.bottom = "auto";
      s.classList.add("is-dragged");
    } else {
      s.style.right = "1rem";
      s.style.bottom = "1rem";
      s.style.left = "auto";
      s.style.top = "auto";
    }
    const sl = slot();
    if (sl) sl.style.minHeight = "";
    const mt = miniTab();
    if (mt) mt.hidden = true;
    const minB = $("#music-player-min");
    const closeB = $("#music-player-close");
    if (minB) minB.hidden = false;
    if (closeB) closeB.hidden = false;
    const grip = $("#music-player-grip");
    if (grip) grip.hidden = false;
  }

  function placePlayerMini() {
    const s = shell();
    if (s) {
      s.hidden = true;
      s.classList.add("is-minimized", "is-popup");
      s.classList.remove("is-home");
    }
    playerMode = "mini";
    const mt = ensureMiniTab();
    mt.hidden = false;
    updateLabels();
    const minB = $("#music-player-min");
    const closeB = $("#music-player-close");
    if (minB) minB.hidden = true;
    if (closeB) closeB.hidden = true;
  }

  function setPlayerMode(next, { persist = true } = {}) {
    if (!playing && next !== "home") {
      // not playing — only home makes sense
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
    const t = tab();
    const sc = scrim();
    if (d) {
      d.classList.toggle("is-open", dockOpen);
      d.classList.toggle("is-dock", dockOpen);
      d.classList.toggle("is-tab", !dockOpen);
    }
    if (t) t.setAttribute("aria-expanded", dockOpen ? "true" : "false");
    if (sc) {
      const narrow = window.matchMedia("(max-width: 820px)").matches;
      sc.hidden = !(dockOpen && narrow);
    }
    // Re-pin home player when dock opens/closes
    if (playerMode === "home" && playing) placePlayerHome();
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
    const mt = miniTab();
    if (mt) mt.hidden = true;
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
    const f = frame();
    const s = shell();
    const e = empty();
    if (!f || !s) return;

    ensureBarChrome();
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
    return {
      left: Math.min(Math.max(8, left), Math.max(8, (window.innerWidth || 0) - w - 8)),
      top: Math.min(Math.max(8, top), Math.max(8, (window.innerHeight || 0) - h - 8)),
    };
  }

  function bindPlayerDrag() {
    const s = shell();
    const bar = s?.querySelector(".music-player-bar");
    if (!s || !bar || bar.dataset.dragBound) return;
    bar.dataset.dragBound = "1";

    bar.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest("button, a, iframe")) return;
      // Only drag the small player when floating (or lift from home)
      if (playerMode === "mini") return;
      e.preventDefault();
      const rect = s.getBoundingClientRect();
      if (playerMode === "home") {
        floatPos = { left: rect.left, top: rect.top };
        placePlayerFloat();
      }
      drag = { ox: e.clientX - rect.left, oy: e.clientY - rect.top, id: e.pointerId };
      bar.setPointerCapture?.(e.pointerId);
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
      // Snap highlight if near left dock slot
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
        if (data.float) floatPos = data.float;
        if (data.playerMode === "float" || data.playerMode === "mini" || data.playerMode === "home") {
          playerMode = data.playerMode;
        }
        setDockOpen(!!data.dockOpen, { persist: false });
        return;
      }
    } catch {
      /* ignore */
    }
    setDockOpen(window.matchMedia("(min-width: 1100px)").matches, { persist: false });
  }

  function boot() {
    ensureBarChrome();
    ensureMiniTab();
    restoreUi();
    autoStart();
    // Apply player mode after play may have started
    if (playing) setPlayerMode(playerMode, { persist: false });
    bindPlayerDrag();

    tab()?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDockOpen(!dockOpen);
    });
    $("#music-dock-close")?.addEventListener("click", (e) => {
      e.preventDefault();
      setDockOpen(false);
    });
    $("#music-dock-min")?.addEventListener("click", (e) => {
      // Panel min = just close dock list; player keeps mode
      e.preventDefault();
      setDockOpen(false);
    });
    scrim()?.addEventListener("click", () => setDockOpen(false));

    $("#music-player-min")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setPlayerMode("mini");
    });
    $("#music-player-close")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      stopMusic();
    });

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

    $("#nav-music")?.addEventListener("click", (e) => {
      e.preventDefault();
      setDockOpen(!dockOpen);
    });

    if (location.hash === "#bg-music") setDockOpen(true);
    window.addEventListener("hashchange", () => {
      if (location.hash === "#bg-music") setDockOpen(true);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dockOpen) setDockOpen(false);
    });
    window.addEventListener("scroll", () => {
      if (playerMode === "home" && playing) placePlayerHome();
    }, { passive: true });
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
