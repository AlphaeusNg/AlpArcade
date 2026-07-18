/**
 * AlpArcade music — left ♪ tab opens/closes the station panel only.
 * Player shell stays in the dock slot (never free-floating / draggable).
 * Iframe stays mounted when the dock closes so audio never cuts.
 */
(function () {
  "use strict";

  const KEY = "alparcade-bg-music";
  const UI_KEY = "alparcade-music-ui-v5";
  const DEFAULT_ID = "lofi";
  const DEFAULT_EMBED =
    "https://open.spotify.com/embed/playlist/0IcjCtBQgkV41B1jkMeAaw?utm_source=generator";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let currentEmbed = "";
  let currentId = "";
  let currentLabel = "Playing…";
  let lastEmbed = "";
  let playing = false;
  let gestureHooked = false;
  let dockOpen = false;

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

  /** Keep shell inside the dock slot — never reparent to body. */
  function ensureShellInSlot() {
    const s = shell();
    const slot = $("#music-player-slot");
    if (!s || !slot) return s;
    if (s.parentElement !== slot) {
      slot.appendChild(s);
    }
    s.classList.add("music-player-shell", "is-docked");
    s.classList.remove("is-popup", "is-home", "is-minimized", "is-dragged", "is-dragging", "is-snap-near");
    // Clear any leftover float positioning from older builds
    s.style.position = "";
    s.style.left = "";
    s.style.top = "";
    s.style.right = "";
    s.style.bottom = "";
    s.style.width = "";
    s.style.maxWidth = "";
    s.style.transform = "";
    s.style.zIndex = "";
    return s;
  }

  function ensureStopButton() {
    const bar = shell()?.querySelector(".music-player-bar");
    if (!bar) return;
    // Strip drag / mini chrome from older builds
    $("#music-player-grip")?.remove();
    $("#music-player-min")?.remove();
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
    const closeB = $("#music-player-close");
    if (closeB) closeB.hidden = false;
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
        : playing
          ? `Open stations · ${currentLabel} (playing)`
          : "Open stations";
      t.classList.toggle("is-active-tab", dockOpen);
      t.classList.toggle("is-playing-tab", playing);
      t.classList.remove("is-player-mini");
      t.style.zIndex = "";
    }
    dockRoot()?.classList.toggle("is-playing", playing);
    $("#music-mini-tab")?.remove();
  }

  function persistUi() {
    try {
      localStorage.setItem(
        UI_KEY,
        JSON.stringify({
          dockOpen,
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

  function setDockOpen(open, { persist = true } = {}) {
    dockOpen = !!open;
    const d = dockRoot();
    const p = panel();
    const t = tab();
    const sc = scrim();

    if (d) {
      d.classList.toggle("is-open", dockOpen);
      d.classList.toggle("is-dock", dockOpen);
      d.classList.toggle("is-tab", !dockOpen);
      d.classList.toggle("is-playing", playing);
    }
    if (p) {
      p.classList.toggle("is-open", dockOpen);
      p.hidden = false;
      p.setAttribute("aria-hidden", dockOpen ? "false" : "true");
    }
    if (t) {
      t.setAttribute("aria-expanded", dockOpen ? "true" : "false");
      t.classList.toggle("is-active-tab", dockOpen);
      t.style.pointerEvents = "auto";
    }
    if (sc) {
      const narrow = window.matchMedia("(max-width: 820px)").matches;
      sc.hidden = !(dockOpen && narrow);
      sc.setAttribute("aria-hidden", sc.hidden ? "true" : "false");
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
    ensureShellInSlot();
    ensureStopButton();
    const f = frame();
    const s = shell();
    const e = empty();
    if (!f || !s) return;

    const src = withAutoplay(embed);

    if (currentEmbed === embed && playing && !forceReload) {
      setActiveButtons(id);
      s.hidden = false;
      if (e) e.hidden = true;
      updateLabels();
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
    persistUi();
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
        setDockOpen(!!data.dockOpen, { persist: false });
        return;
      }
      // Migrate: ignore float/mini state from v4
      localStorage.removeItem("alparcade-music-ui-v4");
    } catch {
      /* ignore */
    }
    setDockOpen(false, { persist: false });
  }

  function boot() {
    ensureShellInSlot();
    ensureStopButton();
    $("#music-mini-tab")?.remove();
    restoreUi();
    autoStart();

    document.addEventListener(
      "click",
      (e) => {
        const t = e.target.closest?.("#music-dock-tab, .music-dock-tab");
        if (t) {
          e.preventDefault();
          e.stopPropagation();
          setDockOpen(!dockOpen);
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
      });
    });

    if (location.hash === "#bg-music") setDockOpen(true);
    window.addEventListener("hashchange", () => {
      if (location.hash === "#bg-music") setDockOpen(true);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dockOpen) setDockOpen(false);
    });
    window.addEventListener("resize", () => {
      const sc = scrim();
      if (sc) {
        const narrow = window.matchMedia("(max-width: 820px)").matches;
        sc.hidden = !(dockOpen && narrow);
        sc.setAttribute("aria-hidden", sc.hidden ? "true" : "false");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
