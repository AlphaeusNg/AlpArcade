/**
 * Persistent Spotify background music.
 * Lives in a sticky dock outside #lobby so game navigation never unloads the player.
 * Only Stop or choosing a different station changes/stops playback.
 */
(function () {
  "use strict";

  const KEY = "alparcade-bg-music";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let currentEmbed = "";
  let currentId = "";
  let minimized = false;

  function dock() {
    return $("#music-dock");
  }

  function frame() {
    return $("#bg-music-frame");
  }

  function setActiveButtons(id) {
    $$(".bg-music-btn").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.playlist === id);
    });
  }

  function play(id, embed, label) {
    if (!embed) return;
    const f = frame();
    const d = dock();
    if (!f || !d) return;

    // Same station — do not reload iframe (would restart/stop music)
    if (currentEmbed === embed && f.src && !d.hidden) {
      setActiveButtons(id);
      d.classList.remove("is-minimized");
      minimized = false;
      return;
    }

    currentEmbed = embed;
    currentId = id || "";
    // Only assign src when it actually changes
    if (f.getAttribute("src") !== embed) {
      f.src = embed;
    }
    d.hidden = false;
    d.classList.remove("is-minimized");
    minimized = false;
    setActiveButtons(currentId);

    const lab = $("#music-dock-label");
    if (lab) {
      lab.textContent =
        label ||
        (id === "lofi" ? "Lofi Beats" : id === "dgray" ? "D.Gray-Man" : "Playing…");
    }

    try {
      localStorage.setItem(KEY, JSON.stringify({ id: currentId, embed: currentEmbed, label: lab?.textContent || "" }));
    } catch {
      /* ignore */
    }
  }

  function stop() {
    const f = frame();
    const d = dock();
    if (f) {
      f.removeAttribute("src");
      f.src = "about:blank";
    }
    if (d) {
      d.hidden = true;
      d.classList.remove("is-minimized");
    }
    currentEmbed = "";
    currentId = "";
    minimized = false;
    setActiveButtons("");
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }

  function toggleMinimize() {
    const d = dock();
    if (!d || d.hidden) return;
    minimized = !minimized;
    d.classList.toggle("is-minimized", minimized);
    const btn = $("#music-dock-minimize");
    if (btn) btn.textContent = minimized ? "▴" : "▾";
  }

  function boot() {
    $$(".bg-music-btn[data-embed]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const label = btn.querySelector("strong")?.textContent || btn.dataset.playlist;
        play(btn.dataset.playlist, btn.dataset.embed, label);
      });
    });
    $("#bg-music-stop")?.addEventListener("click", stop);
    $("#music-dock-stop")?.addEventListener("click", stop);
    $("#music-dock-minimize")?.addEventListener("click", toggleMinimize);

    // Never tear down player when lobby is hidden for a game
    // (dock is outside #lobby by design)

    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data?.embed) play(data.id || "restored", data.embed, data.label || "");
    } catch {
      /* ignore */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
