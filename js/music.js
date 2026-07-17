/**
 * AlpArcade music — single Spotify iframe (never reparented, so audio never drops).
 * - Music section always shows a soundboard (live player when in view, or "now playing" mirror)
 * - Scroll away → bottom-right popup (drag · minimize tab · close without scrolling)
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
  let currentLabel = "Playing…";
  let playing = false;
  let gestureHooked = false;
  /** User hit × — stay anchored to Music until section is seen again */
  let preferHome = false;
  let mode = "home"; // home | popup | mini
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
  function mirror() {
    return $("#music-slot-mirror");
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

  /** Keep shell permanently under body host — moving iframe would stop Spotify */
  function ensureHost() {
    let host = $("#music-popup-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "music-popup-host";
      host.className = "music-popup-host";
      document.body.appendChild(host);
    }
    const s = shell();
    if (s && s.parentElement !== host) host.appendChild(s);
    return host;
  }

  function ensureMirror() {
    const sl = slot();
    if (!sl) return null;
    let m = mirror();
    if (!m) {
      m = document.createElement("button");
      m.type = "button";
      m.id = "music-slot-mirror";
      m.className = "music-slot-mirror";
      m.hidden = true;
      m.innerHTML = `<span class="music-slot-mirror-icon" aria-hidden="true">♪</span>
        <span class="music-slot-mirror-body">
          <strong class="music-slot-mirror-title">Now playing</strong>
          <small class="music-slot-mirror-sub mono" id="music-slot-mirror-sub">—</small>
        </span>
        <span class="music-slot-mirror-hint mono">floating</span>`;
      sl.appendChild(m);
      m.addEventListener("click", () => {
        // Bring popup back if mini; do not scroll the page
        if (mode === "mini") expandFromTab();
        else if (mode === "popup") {
          /* already floating */
        } else {
          preferHome = false;
          setMode("popup");
        }
      });
    }
    return m;
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
      btn.title = "Dock player back to Music section";
      btn.setAttribute("aria-label", "Close popup and dock to Music section");
      btn.hidden = true;
      btn.textContent = "×";
      bar.appendChild(btn);
    }
  }

  function setChromeVisible(show) {
    const c = closeBtn();
    const m = minBtn();
    if (c) c.hidden = !show;
    if (m) m.hidden = !show;
  }

  function updateLabels() {
    const lab = $("#music-player-label");
    if (lab) lab.textContent = currentLabel;
    const sub = $("#music-slot-mirror-sub");
    if (sub) sub.textContent = currentLabel;
    const tabLab = $("#music-mini-tab-label");
    if (tabLab) {
      tabLab.textContent =
        currentLabel.length > 18 ? currentLabel.slice(0, 16) + "…" : currentLabel;
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
    s.classList.remove("is-dragged");
  }

  function slotVisible() {
    const sl = slot();
    if (!sl || sl.closest("[hidden]")) return false;
    const lobby = $("#lobby");
    if (lobby && lobby.hidden) return false;
    const rect = sl.getBoundingClientRect();
    const vh = window.innerHeight || 0;
    return rect.bottom > 72 && rect.top < vh - 48 && rect.width > 0;
  }

  function placeHome() {
    const s = shell();
    const sl = slot();
    if (!s || !sl) return;
    ensureHost();
    const rect = sl.getBoundingClientRect();
    // If slot is on-screen, pin shell over it so it looks like the in-section player
    s.classList.remove("is-popup", "is-minimized");
    s.classList.add("is-home");
    s.hidden = !playing;
    setChromeVisible(false);
    clearShellPos(s);
    if (rect.width > 0) {
      s.style.position = "fixed";
      s.style.left = `${Math.max(0, rect.left)}px`;
      s.style.top = `${Math.max(0, rect.top)}px`;
      s.style.width = `${rect.width}px`;
      s.style.right = "auto";
      s.style.bottom = "auto";
      s.style.zIndex = "40";
    }
    // Reserve space in the section so layout doesn't jump
    const h = Math.max(s.offsetHeight || 180, 168);
    sl.style.minHeight = `${h}px`;
    const m = ensureMirror();
    if (m) m.hidden = true;
    const tab = miniTab();
    if (tab) tab.hidden = true;
    mode = "home";
  }

  function placePopup() {
    const s = shell();
    if (!s) return;
    ensureHost();
    s.classList.add("is-popup");
    s.classList.remove("is-home", "is-minimized");
    s.hidden = false;
    setChromeVisible(true);
    s.style.zIndex = "70";
    if (popupPos) {
      s.style.position = "fixed";
      s.style.left = `${popupPos.left}px`;
      s.style.top = `${popupPos.top}px`;
      s.style.right = "auto";
      s.style.bottom = "auto";
      s.style.width = `min(340px, calc(100vw - 1.5rem))`;
      s.classList.add("is-dragged");
    } else {
      clearShellPos(s);
      s.style.position = "fixed";
      s.style.right = "1rem";
      s.style.bottom = "1rem";
      s.style.left = "auto";
      s.style.top = "auto";
      s.style.width = "min(340px, calc(100vw - 1.5rem))";
    }
    // Soundboard remains in the Music section as a sync mirror
    const m = ensureMirror();
    if (m) {
      m.hidden = false;
      updateLabels();
    }
    const tab = miniTab();
    if (tab) tab.hidden = true;
    const sl = slot();
    if (sl) sl.style.minHeight = "";
    mode = "popup";
  }

  function placeMini() {
    const s = shell();
    if (s) {
      s.hidden = true;
      s.classList.add("is-minimized");
      s.classList.remove("is-home");
      s.classList.add("is-popup");
    }
    setChromeVisible(false);
    const tab = ensureMiniTab();
    tab.hidden = false;
    updateLabels();
    const m = ensureMirror();
    if (m) {
      m.hidden = false;
      updateLabels();
    }
    mode = "mini";
  }

  function setMode(next) {
    if (!playing && next !== "home") return;
    if (next === "home") placeHome();
    else if (next === "mini") placeMini();
    else placePopup();
  }

  function updateDockState() {
    if (!playing) return;
    const lobby = $("#lobby");
    const lobbyHidden = !!(lobby && lobby.hidden);
    const visible = !lobbyHidden && slotVisible();

    if (visible) {
      preferHome = false;
      if (mode !== "home") setMode("home");
      else placeHome(); // re-pin to slot while scrolling within view
      return;
    }

    // Off music section / in a game
    if (preferHome && !lobbyHidden) {
      // × was pressed: keep docked home (off-screen), no popup, no scroll
      if (mode !== "home") setMode("home");
      return;
    }

    if (mode === "mini") {
      placeMini();
      return;
    }
    if (mode !== "popup") setMode("popup");
    else placePopup();
  }

  function closeToHome() {
    preferHome = true;
    popupPos = null;
    setMode("home");
    // deliberately no scrollIntoView
  }

  function minimize() {
    if (!playing) return;
    preferHome = false;
    setMode("mini");
  }

  function expandFromTab() {
    preferHome = false;
    setMode("popup");
  }

  function bindDrag() {
    const s = shell();
    const bar = s?.querySelector(".music-player-bar");
    if (!s || !bar || bar.dataset.dragBound) return;
    bar.dataset.dragBound = "1";

    bar.addEventListener("pointerdown", (e) => {
      if (mode !== "popup") return;
      if (e.target.closest("button, a, iframe")) return;
      e.preventDefault();
      const rect = s.getBoundingClientRect();
      drag = { ox: e.clientX - rect.left, oy: e.clientY - rect.top, id: e.pointerId };
      bar.setPointerCapture?.(e.pointerId);
      s.classList.add("is-dragging");
    });
    bar.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const w = s.offsetWidth || 320;
      const h = s.offsetHeight || 200;
      let left = e.clientX - drag.ox;
      let top = e.clientY - drag.oy;
      left = Math.min(Math.max(4, left), Math.max(4, (window.innerWidth || 0) - w - 4));
      top = Math.min(Math.max(4, top), Math.max(4, (window.innerHeight || 0) - h - 4));
      popupPos = { left, top };
      s.style.left = `${left}px`;
      s.style.top = `${top}px`;
      s.style.right = "auto";
      s.style.bottom = "auto";
      s.classList.add("is-dragged");
    });
    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      drag = null;
      s.classList.remove("is-dragging");
    };
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);
  }

  function play(id, embed, label, { forceReload = false } = {}) {
    if (!embed) return;
    const f = frame();
    const s = shell();
    const e = empty();
    if (!f || !s) return;

    ensureHost();
    const src = withAutoplay(embed);

    if (currentEmbed === embed && playing && !forceReload) {
      setActiveButtons(id);
      s.hidden = false;
      updateDockState();
      return;
    }

    // Only change iframe src when station changes — never reparent
    currentEmbed = embed;
    currentId = id || "";
    currentLabel =
      label || (id === "lofi" ? "Lofi Beats" : id === "dgray" ? "D.Gray-Man" : "Playing…");
    if (forceReload || f.getAttribute("src") !== src) {
      // Avoid removeAttribute+blank which stops audio harder; set src when needed
      if (forceReload) {
        f.src = src;
      } else {
        f.src = src;
      }
    }

    playing = true;
    s.hidden = false;
    if (e) e.hidden = true;
    const sl = slot();
    if (sl) sl.hidden = false;
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

    // First show: prefer home (Music section)
    if (mode === "mini") placeMini();
    else if (mode === "popup" && !preferHome) placePopup();
    else placeHome();
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

  function boot() {
    ensureHost();
    ensureBarControls();
    ensureMirror();
    ensureMiniTab();
    autoStart();

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
    closeBtn()?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeToHome();
    });
    minBtn()?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      minimize();
    });
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
        threshold: [0, 0.05, 0.25, 0.5, 1],
        rootMargin: "-48px 0px -48px 0px",
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
