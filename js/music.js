/**
 * Optional Spotify background playlists (Alphaeus favourites).
 */
(function () {
  "use strict";

  const KEY = "alparcade-bg-music";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function play(id, embed) {
    const frame = $("#bg-music-frame");
    const empty = $("#bg-music-empty");
    if (!frame || !embed) return;
    frame.src = embed;
    frame.hidden = false;
    if (empty) empty.hidden = true;
    $$(".bg-music-btn").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.playlist === id);
    });
    try {
      localStorage.setItem(KEY, JSON.stringify({ id, embed }));
    } catch {
      /* ignore */
    }
  }

  function stop() {
    const frame = $("#bg-music-frame");
    const empty = $("#bg-music-empty");
    if (frame) {
      frame.src = "";
      frame.hidden = true;
    }
    if (empty) empty.hidden = false;
    $$(".bg-music-btn").forEach((b) => b.classList.remove("is-active"));
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }

  function boot() {
    $$(".bg-music-btn[data-embed]").forEach((btn) => {
      btn.addEventListener("click", () => play(btn.dataset.playlist, btn.dataset.embed));
    });
    $("#bg-music-stop")?.addEventListener("click", stop);

    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data?.embed) play(data.id || "restored", data.embed);
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
