/**
 * Spotify background music for AlpArcade.
 * Auto-starts default/last station ASAP; floating mini-player bottom-right.
 * No separate Stop buttons — use the Spotify embed controls.
 */
(function () {
  "use strict";

  const KEY = "alparcade-bg-music";
  const DEFAULT_ID = "lofi";
  const DEFAULT_EMBED =
    "https://open.spotify.com/embed/playlist/0IcjCtBQgkV41B1jkMeAaw?utm_source=generator";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let currentEmbed = "";
  let currentId = "";
  let playing = false;
  let gestureHooked = false;

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

  function ensurePopupHost() {
    let host = $("#music-popup-host");
    if (host) return host;
    host = document.createElement("div");
    host.id = "music-popup-host";
    host.className = "music-popup-host";
    document.body.appendChild(host);
    return host;
  }

  function mountShellInPopup() {
    const s = shell();
    if (!s) return;
    const host = ensurePopupHost();
    if (s.parentElement !== host) host.appendChild(s);
    s.classList.add("is-popup", "is-docked");
  }

  function play(id, embed, label, { forceReload = false } = {}) {
    if (!embed) return;
    const f = frame();
    const s = shell();
    const e = empty();
    if (!f || !s) return;

    mountShellInPopup();
    const src = withAutoplay(embed);

    if (currentEmbed === embed && playing && !forceReload) {
      setActiveButtons(id);
      s.hidden = false;
      return;
    }

    currentEmbed = embed;
    currentId = id || "";
    f.removeAttribute("src");
    requestAnimationFrame(() => {
      f.src = src;
    });

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
  }

  function nudgeAutoplayOnGesture() {
    if (gestureHooked) return;
    gestureHooked = true;
    const once = () => {
      window.removeEventListener("pointerdown", once, true);
      window.removeEventListener("keydown", once, true);
      window.removeEventListener("touchstart", once, true);
      if (!playing || !currentEmbed) return;
      play(currentId || "nudge", currentEmbed, $("#music-player-label")?.textContent || "", {
        forceReload: true,
      });
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
      const label = btn.querySelector("strong")?.textContent || btn.dataset.playlist;
      play(btn.dataset.playlist, btn.dataset.embed, label);
    } else {
      play(DEFAULT_ID, DEFAULT_EMBED, "Lofi Beats");
    }
    nudgeAutoplayOnGesture();
  }

  function boot() {
    // Kick player immediately
    mountShellInPopup();
    autoStart();

    $$(".bg-music-btn[data-embed]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const label = btn.querySelector("strong")?.textContent || btn.dataset.playlist;
        play(btn.dataset.playlist, btn.dataset.embed, label, { forceReload: true });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
