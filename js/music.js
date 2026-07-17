/**
 * AlpArcade music — left-edge dock (open/close tab).
 * Single Spotify iframe stays mounted; closing the panel does not stop audio.
 */
(function () {
  "use strict";

  const KEY = "alparcade-bg-music";
  const DOCK_KEY = "alparcade-music-dock-open";
  const DEFAULT_ID = "lofi";
  const DEFAULT_EMBED =
    "https://open.spotify.com/embed/playlist/0IcjCtBQgkV41B1jkMeAaw?utm_source=generator";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let currentEmbed = "";
  let currentId = "";
  let currentLabel = "Playing…";
  let playing = false;
  let gestureHooked = false;
  let dockOpen = false;

  function dock() {
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
    if (lab) lab.textContent = currentLabel;
    const tabText = $("#music-dock-tab-text");
    if (tabText) {
      const short =
        currentLabel && currentLabel !== "Playing…"
          ? currentLabel.length > 14
            ? currentLabel.slice(0, 12) + "…"
            : currentLabel
          : "Music";
      tabText.textContent = short;
    }
    const t = tab();
    if (t) {
      t.title = dockOpen ? "Close music" : `Open music · ${currentLabel || "Music"}`;
      t.setAttribute(
        "aria-label",
        dockOpen ? "Close music panel" : `Open music panel · ${currentLabel || "Music"}`
      );
    }
  }

  function applyDock(open, { persist = true } = {}) {
    dockOpen = !!open;
    const d = dock();
    const t = tab();
    const sc = scrim();
    if (d) d.classList.toggle("is-open", dockOpen);
    if (t) t.setAttribute("aria-expanded", dockOpen ? "true" : "false");
    // Scrim only on narrow viewports (CSS also gates it); always toggle hidden for a11y
    if (sc) {
      const narrow = window.matchMedia("(max-width: 820px)").matches;
      sc.hidden = !(dockOpen && narrow);
    }
    updateLabels();
    if (persist) {
      try {
        localStorage.setItem(DOCK_KEY, dockOpen ? "1" : "0");
      } catch {
        /* ignore */
      }
    }
  }

  function toggleDock() {
    applyDock(!dockOpen);
  }

  function openDock() {
    applyDock(true);
  }

  function closeDock() {
    applyDock(false);
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
        JSON.stringify({ id: currentId, embed: currentEmbed, label: currentLabel })
      );
    } catch {
      /* ignore */
    }
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

  function restoreDockState() {
    let open = false;
    try {
      const v = localStorage.getItem(DOCK_KEY);
      if (v === "1") open = true;
      else if (v === "0") open = false;
      else open = window.matchMedia("(min-width: 1100px)").matches;
    } catch {
      open = false;
    }
    applyDock(open, { persist: false });
  }

  function boot() {
    restoreDockState();
    autoStart();

    tab()?.addEventListener("click", (e) => {
      e.preventDefault();
      toggleDock();
    });
    $("#music-dock-close")?.addEventListener("click", (e) => {
      e.preventDefault();
      closeDock();
    });
    scrim()?.addEventListener("click", () => closeDock());

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

    // Nav Music → open dock (toggle if already open)
    $("#nav-music")?.addEventListener("click", (e) => {
      e.preventDefault();
      toggleDock();
      if (dockOpen) panel()?.focus?.();
    });

    // Deep link #bg-music
    if (location.hash === "#bg-music") openDock();
    window.addEventListener("hashchange", () => {
      if (location.hash === "#bg-music") openDock();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dockOpen) {
        closeDock();
      }
    });

    window.addEventListener("resize", () => {
      // Keep scrim in sync with viewport
      applyDock(dockOpen, { persist: false });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
