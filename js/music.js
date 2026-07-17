/**
 * Spotify background music.
 * Auto-starts a default (or last) playlist on page load.
 * Plays inline in the Music section; when that section scrolls out of view
 * (or lobby hides for a game), the same player docks to the bottom-left.
 * Iframe is never reloaded unless station changes or Stop.
 */
(function () {
  "use strict";

  const KEY = "alparcade-bg-music";
  const DEFAULT_ID = "lofi";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let currentEmbed = "";
  let currentId = "";
  let playing = false;
  let observer = null;

  function shell() {
    return $("#music-player-shell");
  }
  function slot() {
    return $("#music-player-slot");
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
      u.searchParams.set("autoplay", "1");
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

  function updateDockState() {
    const s = shell();
    const sl = slot();
    if (!s || !playing) return;

    // Dock when the slot is not visible in the viewport
    const rect = sl?.getBoundingClientRect();
    const slotVisible =
      sl &&
      !sl.closest("[hidden]") &&
      rect &&
      rect.bottom > 48 &&
      rect.top < (window.innerHeight || 0) - 48;

    // Also dock when lobby is hidden (in a game)
    const lobby = $("#lobby");
    const lobbyHidden = !!(lobby && lobby.hidden);

    const shouldDock = lobbyHidden || !slotVisible;
    s.classList.toggle("is-docked", shouldDock);
    sl?.classList.toggle("is-player-docked", shouldDock);

    const pin = $("#music-dock-pin");
    if (pin) pin.hidden = !shouldDock;
  }

  function play(id, embed, label) {
    if (!embed) return;
    const f = frame();
    const s = shell();
    const e = empty();
    if (!f || !s) return;

    const src = withAutoplay(embed);

    if (currentEmbed === embed && playing) {
      setActiveButtons(id);
      updateDockState();
      return;
    }

    currentEmbed = embed;
    currentId = id || "";
    if (f.getAttribute("src") !== src) {
      f.src = src;
    }
    playing = true;
    s.hidden = false;
    if (e) e.hidden = true;
    setActiveButtons(currentId);

    const lab = $("#music-player-label");
    if (lab) {
      lab.textContent =
        label || (id === "lofi" ? "Lofi Beats" : id === "dgray" ? "D.Gray-Man" : "Playing…");
    }

    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ id: currentId, embed: currentEmbed, label: lab?.textContent || "" })
      );
    } catch {
      /* ignore */
    }
    updateDockState();
  }

  function stop() {
    const f = frame();
    const s = shell();
    const e = empty();
    if (f) {
      f.removeAttribute("src");
      f.src = "about:blank";
    }
    if (s) {
      s.hidden = true;
      s.classList.remove("is-docked");
    }
    slot()?.classList.remove("is-player-docked");
    if (e) e.hidden = false;
    playing = false;
    currentEmbed = "";
    currentId = "";
    setActiveButtons("");
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }

  function watchVisibility() {
    const sl = slot();
    if (!sl || !("IntersectionObserver" in window)) {
      window.addEventListener("scroll", updateDockState, { passive: true });
      window.addEventListener("resize", updateDockState);
      return;
    }
    observer = new IntersectionObserver(
      () => updateDockState(),
      { root: null, threshold: [0, 0.01, 0.1, 0.5, 1], rootMargin: "-40px 0px -40px 0px" }
    );
    observer.observe(sl);
    window.addEventListener("scroll", updateDockState, { passive: true });
    window.addEventListener("resize", updateDockState);

    // Lobby show/hide when entering games
    const lobby = $("#lobby");
    if (lobby && "MutationObserver" in window) {
      new MutationObserver(() => updateDockState()).observe(lobby, {
        attributes: true,
        attributeFilter: ["hidden"],
      });
    }
  }

  function autoStart() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.embed) {
          play(data.id || "restored", data.embed, data.label || "");
          return;
        }
      }
    } catch {
      /* ignore */
    }

    const btn =
      $(`.bg-music-btn[data-playlist="${DEFAULT_ID}"]`) || $(".bg-music-btn[data-embed]");
    if (!btn) return;
    const label = btn.querySelector("strong")?.textContent || btn.dataset.playlist;
    play(btn.dataset.playlist, btn.dataset.embed, label);
  }

  function boot() {
    $$(".bg-music-btn[data-embed]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const label = btn.querySelector("strong")?.textContent || btn.dataset.playlist;
        play(btn.dataset.playlist, btn.dataset.embed, label);
      });
    });
    $("#bg-music-stop")?.addEventListener("click", stop);
    $("#music-player-stop")?.addEventListener("click", stop);

    watchVisibility();
    autoStart();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
