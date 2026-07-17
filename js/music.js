/**
 * Spotify background music for AlpArcade.
 * - Starts inline in the Music section
 * - When that section (or lobby) leaves view → bottom-right popup (draggable, closable)
 * - Close returns the player to the Music box
 * - No separate Stop buttons — use embed controls
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
  let preferInline = false;
  let docked = false;
  let minimized = false;
  let drag = null;
  let popupPos = null;

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
  function closeBtn() {
    return $("#music-player-close");
  }
  function minBtn() {
    return $("#music-player-min");
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

  function ensurePopupHost() {
    let host = $("#music-popup-host");
    if (host) return host;
    host = document.createElement("div");
    host.id = "music-popup-host";
    host.className = "music-popup-host";
    document.body.appendChild(host);
    return host;
  }

  function clearPopupPos(s) {
    if (!s) return;
    s.style.left = "";
    s.style.top = "";
    s.style.right = "";
    s.style.bottom = "";
    s.classList.remove("is-dragged");
  }

  function applyPopupPos(s) {
    if (!s || !popupPos) return;
    s.style.left = `${popupPos.left}px`;
    s.style.top = `${popupPos.top}px`;
    s.style.right = "auto";
    s.style.bottom = "auto";
    s.classList.add("is-dragged");
  }

  function setChromeVisible(isFloating) {
    const c = closeBtn();
    const m = minBtn();
    if (c) c.hidden = !isFloating;
    if (m) m.hidden = !isFloating;
  }

  function ensureMiniTab() {
    let tab = miniTab();
    if (tab) return tab;
    tab = document.createElement("button");
    tab.type = "button";
    tab.id = "music-mini-tab";
    tab.className = "music-mini-tab";
    tab.hidden = true;
    tab.setAttribute("aria-label", "Expand music player");
    tab.innerHTML = `<span class="music-mini-tab-icon" aria-hidden="true">♪</span><span class="music-mini-tab-label mono" id="music-mini-tab-label">Music</span>`;
    document.body.appendChild(tab);
    tab.addEventListener("click", () => expandFromTab());
    return tab;
  }

  function updateMiniTabLabel() {
    const lab = $("#music-mini-tab-label");
    const title = $("#music-player-label")?.textContent || "Music";
    if (lab) lab.textContent = title.length > 18 ? title.slice(0, 16) + "…" : title;
  }

  function hideMiniTab() {
    const tab = miniTab();
    if (tab) tab.hidden = true;
  }

  function showMiniTab() {
    const tab = ensureMiniTab();
    updateMiniTabLabel();
    tab.hidden = false;
  }

  function mountInline() {
    const s = shell();
    const sl = slot();
    if (!s || !sl) return;
    minimized = false;
    hideMiniTab();
    if (s.parentElement !== sl) sl.appendChild(s);
    s.classList.remove("is-popup", "is-docked", "is-minimized");
    s.hidden = !playing;
    clearPopupPos(s);
    docked = false;
    setChromeVisible(false);
    sl.classList.remove("is-player-docked");
  }

  function mountPopup() {
    const s = shell();
    if (!s) return;
    const host = ensurePopupHost();
    if (s.parentElement !== host) host.appendChild(s);
    s.classList.add("is-popup", "is-docked");
    docked = true;
    setChromeVisible(true);
    slot()?.classList.add("is-player-docked");
    if (popupPos) applyPopupPos(s);
    else clearPopupPos(s);
    if (minimized) {
      s.classList.add("is-minimized");
      s.hidden = true;
      showMiniTab();
    } else {
      s.classList.remove("is-minimized");
      s.hidden = false;
      hideMiniTab();
    }
  }

  function minimizePopup() {
    if (!playing) return;
    if (!docked) {
      preferInline = false;
      minimized = false;
      mountPopup();
    }
    minimized = true;
    const s = shell();
    if (s) {
      s.hidden = true;
      s.classList.add("is-minimized");
    }
    showMiniTab();
  }

  function expandFromTab() {
    minimized = false;
    preferInline = false;
    hideMiniTab();
    const s = shell();
    if (s) {
      s.classList.remove("is-minimized");
      s.hidden = false;
    }
    if (!docked) mountPopup();
    else {
      setChromeVisible(true);
      if (popupPos) applyPopupPos(s);
    }
  }

  function slotVisible() {
    const sl = slot();
    if (!sl || sl.closest("[hidden]")) return false;
    const lobby = $("#lobby");
    if (lobby && lobby.hidden) return false;
    const rect = sl.getBoundingClientRect();
    const vh = window.innerHeight || 0;
    return rect.bottom > 64 && rect.top < vh - 48;
  }

  function updateDockState() {
    const s = shell();
    if (!s || !playing) return;

    const lobby = $("#lobby");
    const lobbyHidden = !!(lobby && lobby.hidden);
    const visible = !lobbyHidden && slotVisible();

    if (visible) {
      preferInline = false;
      if (docked || minimized) mountInline();
      return;
    }

    if (preferInline && !lobbyHidden) {
      if (docked || minimized) mountInline();
      return;
    }

    // In a game (lobby hidden) or scrolled past Music → popup (or mini tab)
    if (!docked) mountPopup();
    else if (minimized) {
      if (s) {
        s.hidden = true;
        s.classList.add("is-minimized");
      }
      showMiniTab();
    }
  }

  function closePopupToMusic() {
    // Return player to Music box without scrolling the page
    preferInline = true;
    popupPos = null;
    mountInline();
  }

  function bindDrag() {
    const s = shell();
    const bar = s?.querySelector(".music-player-bar");
    if (!s || !bar || bar.dataset.dragBound) return;
    bar.dataset.dragBound = "1";

    bar.addEventListener("pointerdown", (e) => {
      if (!docked || minimized) return;
      if (e.target.closest("button, a, iframe")) return;
      e.preventDefault();
      const rect = s.getBoundingClientRect();
      drag = {
        ox: e.clientX - rect.left,
        oy: e.clientY - rect.top,
        id: e.pointerId,
      };
      bar.setPointerCapture?.(e.pointerId);
      s.classList.add("is-dragging");
    });

    bar.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const w = s.offsetWidth;
      const h = s.offsetHeight;
      let left = e.clientX - drag.ox;
      let top = e.clientY - drag.oy;
      const maxL = Math.max(0, (window.innerWidth || 0) - w - 4);
      const maxT = Math.max(0, (window.innerHeight || 0) - h - 4);
      left = Math.min(maxL, Math.max(4, left));
      top = Math.min(maxT, Math.max(4, top));
      popupPos = { left, top };
      applyPopupPos(s);
    });

    const endDrag = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      drag = null;
      s.classList.remove("is-dragging");
    };
    bar.addEventListener("pointerup", endDrag);
    bar.addEventListener("pointercancel", endDrag);
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
      updateDockState();
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
    const sl = slot();
    if (sl) sl.hidden = false;
    setActiveButtons(currentId);

    const lab = $("#music-player-label");
    if (lab) {
      lab.textContent =
        label || (id === "lofi" ? "Lofi Beats" : id === "dgray" ? "D.Gray-Man" : "Playing…");
    }
    updateMiniTabLabel();

    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ id: currentId, embed: currentEmbed, label: lab?.textContent || "" })
      );
    } catch {
      /* ignore */
    }
    if (!docked && !minimized) mountInline();
    updateDockState();
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

  function ensureBarControls() {
    const bar = shell()?.querySelector(".music-player-bar");
    if (!bar) return;
    if (!minBtn()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "music-player-min";
      btn.className = "music-player-min";
      btn.title = "Minimize to tab";
      btn.setAttribute("aria-label", "Minimize music player to a tab");
      btn.hidden = true;
      btn.textContent = "–";
      bar.appendChild(btn);
    }
    if (!closeBtn()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "music-player-close";
      btn.className = "music-player-close";
      btn.title = "Return player to Music section";
      btn.setAttribute("aria-label", "Close popup and return to Music section");
      btn.hidden = true;
      btn.textContent = "×";
      bar.appendChild(btn);
    }
  }

  function boot() {
    ensureBarControls();
    mountInline();
    autoStart();

    $$(".bg-music-btn[data-embed]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const label = btn.querySelector("strong")?.textContent || btn.dataset.playlist;
        play(btn.dataset.playlist, btn.dataset.embed, label, { forceReload: true });
      });
    });
    closeBtn()?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePopupToMusic();
    });
    minBtn()?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      minimizePopup();
    });
    ensureMiniTab();
    bindDrag();
    window.addEventListener("scroll", updateDockState, { passive: true });
    window.addEventListener("resize", updateDockState);

    const lobby = $("#lobby");
    if (lobby && "MutationObserver" in window) {
      new MutationObserver(() => updateDockState()).observe(lobby, {
        attributes: true,
        attributeFilter: ["hidden"],
      });
    }
    if ("IntersectionObserver" in window && slot()) {
      new IntersectionObserver(() => updateDockState(), {
        root: null,
        threshold: [0, 0.05, 0.2, 0.5, 1],
        rootMargin: "-40px 0px -40px 0px",
      }).observe(slot());
    }
    updateDockState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
