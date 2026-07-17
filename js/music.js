/**
 * AlpArcade music — dock / float / tab.
 * - Side tab packs the player (music keeps playing)
 * - Drag panel out → free floating popup (stays where dropped)
 * - Drag near left edge → snaps back to left dock
 * - Minimize (–) → side tab
 * - Close (×) → stop audio and pack to tab
 * Iframe never reparented (audio continuity while playing).
 */
(function () {
  "use strict";

  const KEY = "alparcade-bg-music";
  const UI_KEY = "alparcade-music-ui-v2";
  const DEFAULT_ID = "lofi";
  const DEFAULT_EMBED =
    "https://open.spotify.com/embed/playlist/0IcjCtBQgkV41B1jkMeAaw?utm_source=generator";
  const SNAP_X = 72; // px from left → re-dock
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let currentEmbed = "";
  let currentId = "";
  let currentLabel = "Playing…";
  let playing = false;
  let gestureHooked = false;
  /** @type {'tab'|'dock'|'float'} */
  let mode = "tab";
  let floatPos = null; // { left, top }
  let drag = null;

  function dockEl() {
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

  function updateLabels() {
    const lab = $("#music-player-label");
    if (lab) lab.textContent = playing ? currentLabel : "Stopped";
    const tabText = $("#music-dock-tab-text");
    if (tabText) {
      if (!playing) {
        tabText.textContent = "Music";
      } else {
        const short =
          currentLabel.length > 14 ? currentLabel.slice(0, 12) + "…" : currentLabel || "Music";
        tabText.textContent = short;
      }
    }
    const t = tab();
    if (t) {
      const tip =
        mode === "tab"
          ? playing
            ? `Open music · ${currentLabel}`
            : "Open music"
          : mode === "float"
            ? "Dock music to the left"
            : "Minimize music to side tab";
      t.title = tip;
      t.setAttribute("aria-expanded", mode !== "tab" ? "true" : "false");
      t.setAttribute("aria-label", tip);
    }
    const d = dockEl();
    if (d) d.dataset.playing = playing ? "1" : "0";
  }

  function persistUi() {
    try {
      localStorage.setItem(
        UI_KEY,
        JSON.stringify({
          mode,
          float: floatPos,
          playing,
          id: currentId,
          embed: currentEmbed,
          label: currentLabel,
        })
      );
    } catch {
      /* ignore */
    }
  }

  function clearPanelInlinePos(p) {
    if (!p) return;
    p.style.left = "";
    p.style.top = "";
    p.style.right = "";
    p.style.bottom = "";
    p.style.width = "";
    p.style.maxHeight = "";
    p.style.transform = "";
  }

  /**
   * Apply visual mode: tab (packed), dock (left panel), float (free popup).
   */
  function setMode(next, { persist = true } = {}) {
    mode = next;
    const d = dockEl();
    const p = panel();
    const t = tab();
    const sc = scrim();
    if (!d || !p) return;

    d.classList.remove("is-tab", "is-dock", "is-float", "is-open", "is-dragging", "is-snap-near");
    d.classList.add(`is-${mode}`);
    if (mode === "dock" || mode === "float") d.classList.add("is-open");

    if (mode === "float" && floatPos) {
      p.style.left = `${floatPos.left}px`;
      p.style.top = `${floatPos.top}px`;
      p.style.right = "auto";
      p.style.bottom = "auto";
      p.style.transform = "none";
    } else {
      clearPanelInlinePos(p);
    }

    if (t) {
      t.hidden = false;
      // In float mode keep the side tab so user can re-dock with one tap
    }

    if (sc) {
      const narrow = window.matchMedia("(max-width: 820px)").matches;
      sc.hidden = !(mode === "dock" && narrow);
    }

    updateLabels();
    if (persist) persistUi();
  }

  function minimizeToTab() {
    setMode("tab");
  }

  function openDock() {
    setMode("dock");
  }

  function openFloat(pos) {
    if (pos) floatPos = pos;
    if (!floatPos) {
      const w = Math.min(352, (window.innerWidth || 400) - 24);
      floatPos = {
        left: Math.max(12, (window.innerWidth || 400) - w - 16),
        top: Math.max(64, (window.innerHeight || 600) - 420),
      };
    }
    setMode("float");
  }

  /** × — stop music and pack to tab */
  function closeAndStop() {
    stopMusic();
    setMode("tab");
  }

  function stopMusic() {
    playing = false;
    const f = frame();
    // Blank src stops Spotify/YouTube without destroying the element tree
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
      e.textContent = "Music stopped · pick a station to play";
    }
    setActiveButtons("");
    updateLabels();
    try {
      // Keep last station for resume, but mark stopped
      const raw = localStorage.getItem(KEY);
      const prev = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        KEY,
        JSON.stringify({
          ...prev,
          id: currentId || prev.id,
          embed: prev.embed || "",
          label: currentLabel || prev.label,
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

    const src = withAutoplay(embed);

    if (currentEmbed === embed && playing && !forceReload) {
      setActiveButtons(id);
      s.hidden = false;
      if (e) e.hidden = true;
      return;
    }

    currentEmbed = embed;
    currentId = id || "";
    currentLabel =
      label || (id === "lofi" ? "Lofi Beats" : id === "dgray" ? "D.Gray-Man" : "Playing…");
    if (forceReload || f.getAttribute("src") !== src) {
      f.src = src;
    }

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
    persistUi();
  }

  function clampFloat(left, top, el) {
    const w = el?.offsetWidth || 320;
    const h = el?.offsetHeight || 360;
    const maxL = Math.max(8, (window.innerWidth || 0) - w - 8);
    const maxT = Math.max(8, (window.innerHeight || 0) - Math.min(h, window.innerHeight * 0.9) - 8);
    return {
      left: Math.min(Math.max(8, left), maxL),
      top: Math.min(Math.max(8, top), maxT),
    };
  }

  function bindDrag() {
    const p = panel();
    const head = $("#music-dock-drag") || p?.querySelector(".music-dock-head");
    if (!p || !head || head.dataset.dragBound) return;
    head.dataset.dragBound = "1";

    head.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest("button, a, input, select, textarea, iframe")) return;
      e.preventDefault();
      const rect = p.getBoundingClientRect();
      // Lift docked panel into float immediately on drag
      if (mode === "dock" || mode === "tab") {
        floatPos = { left: rect.left, top: rect.top };
        setMode("float", { persist: false });
      }
      drag = {
        ox: e.clientX - rect.left,
        oy: e.clientY - rect.top,
        id: e.pointerId,
      };
      head.setPointerCapture?.(e.pointerId);
      dockEl()?.classList.add("is-dragging");
    });

    head.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      let left = e.clientX - drag.ox;
      let top = e.clientY - drag.oy;
      const pos = clampFloat(left, top, p);
      floatPos = pos;
      p.style.left = `${pos.left}px`;
      p.style.top = `${pos.top}px`;
      p.style.right = "auto";
      p.style.bottom = "auto";
      p.style.transform = "none";
      const near = pos.left < SNAP_X;
      dockEl()?.classList.toggle("is-snap-near", near);
    });

    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const near = floatPos && floatPos.left < SNAP_X;
      drag = null;
      dockEl()?.classList.remove("is-dragging", "is-snap-near");
      if (near) {
        floatPos = null;
        setMode("dock"); // pack to left dock
      } else {
        setMode("float"); // stay floating
      }
    };
    head.addEventListener("pointerup", end);
    head.addEventListener("pointercancel", end);
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
          // stash embed for resume without playing
          if (data.embed) {
            currentEmbed = ""; // require explicit play
            try {
              // keep embed in a side field via play only when user picks
              localStorage.setItem(
                KEY,
                JSON.stringify({ ...data, stopped: true, embed: data.embed })
              );
            } catch {
              /* ignore */
            }
          }
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
        if (data.float && typeof data.float.left === "number") floatPos = data.float;
        if (data.mode === "float" || data.mode === "dock" || data.mode === "tab") {
          setMode(data.mode, { persist: false });
          return;
        }
      }
    } catch {
      /* ignore */
    }
    // Default: side tab on phone, open dock on wide
    setMode(window.matchMedia("(min-width: 1100px)").matches ? "dock" : "tab", {
      persist: false,
    });
  }

  function boot() {
    restoreUi();
    autoStart();
    bindDrag();

    tab()?.addEventListener("click", (e) => {
      e.preventDefault();
      if (mode === "tab") openDock();
      else if (mode === "float") openDock(); // pack back
      else minimizeToTab();
    });

    $("#music-dock-min")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      minimizeToTab();
    });
    $("#music-dock-close")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAndStop();
    });
    scrim()?.addEventListener("click", () => minimizeToTab());

    $$(".bg-music-btn[data-embed]").forEach((btn) => {
      btn.addEventListener("click", () => {
        play(
          btn.dataset.playlist,
          btn.dataset.embed,
          btn.querySelector("strong")?.textContent || btn.dataset.playlist,
          { forceReload: true }
        );
        // Resume from stopped: if they pick a station while packed, open dock
        if (mode === "tab") openDock();
      });
    });

    $("#nav-music")?.addEventListener("click", (e) => {
      e.preventDefault();
      if (mode === "tab") openDock();
      else if (mode === "dock") minimizeToTab();
      else openDock();
    });

    if (location.hash === "#bg-music") openDock();
    window.addEventListener("hashchange", () => {
      if (location.hash === "#bg-music") openDock();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (mode === "dock" || mode === "float") minimizeToTab();
      }
    });

    window.addEventListener("resize", () => {
      if (mode === "float" && floatPos) {
        const p = panel();
        floatPos = clampFloat(floatPos.left, floatPos.top, p);
        if (p) {
          p.style.left = `${floatPos.left}px`;
          p.style.top = `${floatPos.top}px`;
        }
        persistUi();
      } else if (mode === "dock") {
        setMode("dock", { persist: false });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
