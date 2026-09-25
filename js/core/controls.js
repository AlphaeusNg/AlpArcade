/**
 * Per-cabinet controls for action games. Turn-based and single-pad cabinets
 * do not use this panel. A denied write keeps the visit's choices in memory.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "alparcade-controls-v1";
  const PLACES = ["left", "center", "right"];
  const RESERVED = new Set(["p", "escape", "tab", "enter", " "]);

  const GAMES = {
    snake: {
      actions: [
        { id: "up", label: "Up", keys: ["ArrowUp", "w"] },
        { id: "down", label: "Down", keys: ["ArrowDown", "s"] },
        { id: "left", label: "Left", keys: ["ArrowLeft", "a"] },
        { id: "right", label: "Right", keys: ["ArrowRight", "d"] },
      ],
      touch: { scale: 1, place: "center" },
    },
    shooter: {
      actions: [
        { id: "up", label: "Up", keys: ["ArrowUp", "w"] },
        { id: "down", label: "Down", keys: ["ArrowDown", "s"] },
        { id: "left", label: "Left", keys: ["ArrowLeft", "a"] },
        { id: "right", label: "Right", keys: ["ArrowRight", "d"] },
      ],
      touch: { scale: 1, place: "right" },
    },
    breaker: {
      actions: [
        { id: "left", label: "Left", keys: ["ArrowLeft", "a"] },
        { id: "right", label: "Right", keys: ["ArrowRight", "d"] },
      ],
      touch: { scale: 1, place: "center" },
    },
  };

  const SCALE_MIN = 0.75;
  const SCALE_MAX = 1.45;
  let session = null;
  let persistDenied = false;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaults() {
    return clone(GAMES);
  }

  function normalizeKey(key) {
    const text = String(key || "");
    if (!text || text.length > 24) return "";
    return text.length === 1 ? text.toLowerCase() : text;
  }

  function sameKey(a, b) {
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  function normalizeGame(id, raw) {
    const base = defaults()[id];
    if (!base) return null;
    const source = raw && typeof raw === "object" ? raw : {};
    const actions = base.actions.map((action) => {
      const found = Array.isArray(source.actions)
        ? source.actions.find((item) => item && item.id === action.id)
        : null;
      const keys = Array.isArray(found?.keys) ? found.keys.map(normalizeKey).filter(Boolean).slice(0, 2) : [];
      return { id: action.id, label: action.label, keys: keys.length ? keys : action.keys.slice() };
    });
    const scale = Number(source.touch?.scale);
    const place = PLACES.includes(source.touch?.place) ? source.touch.place : base.touch.place;
    return {
      actions,
      touch: {
        scale: Number.isFinite(scale) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale)) : base.touch.scale,
        place,
      },
    };
  }

  function normalize(raw) {
    const next = {};
    for (const id of Object.keys(GAMES)) next[id] = normalizeGame(id, raw?.[id]);
    return next;
  }

  function load() {
    if (session) return session;
    try {
      const raw = global.localStorage?.getItem(STORAGE_KEY);
      session = normalize(raw ? JSON.parse(raw) : null);
    } catch {
      session = defaults();
      persistDenied = true;
    }
    return session;
  }

  function save(state) {
    session = normalize(state);
    try {
      global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
      persistDenied = false;
    } catch {
      persistDenied = true;
    }
    return session;
  }

  function isActionGame(gameId) {
    return Object.prototype.hasOwnProperty.call(GAMES, gameId);
  }

  function game(gameId) {
    return load()[gameId] || null;
  }

  function keysFor(gameId, actionId) {
    const action = game(gameId)?.actions.find((item) => item.id === actionId);
    return action ? action.keys.slice() : [];
  }

  function matches(gameId, actionId, event) {
    const key = event?.key;
    if (!key) return false;
    return keysFor(gameId, actionId).some((binding) => sameKey(binding, key));
  }

  function labelFor(gameId, actionId) {
    return game(gameId)?.actions.find((item) => item.id === actionId)?.label || actionId;
  }

  function setBinding(gameId, actionId, key) {
    const binding = normalizeKey(key);
    if (!isActionGame(gameId) || !binding) return { ok: false, reason: "invalid" };
    if (RESERVED.has(binding.toLowerCase())) return { ok: false, reason: "reserved" };
    const state = load();
    const current = state[gameId];
    const target = current.actions.find((item) => item.id === actionId);
    if (!target) return { ok: false, reason: "invalid" };
    const conflict = current.actions.find(
      (item) => item.id !== actionId && item.keys.some((owned) => sameKey(owned, binding)),
    );
    if (conflict) return { ok: false, reason: "conflict", action: conflict.label };
    target.keys = [binding];
    save(state);
    return { ok: true, persistDenied };
  }

  function reset(gameId) {
    if (!isActionGame(gameId)) return null;
    const state = load();
    state[gameId] = defaults()[gameId];
    save(state);
    return game(gameId);
  }

  function setTouch(gameId, patch) {
    if (!isActionGame(gameId)) return null;
    const state = load();
    const touch = state[gameId].touch;
    if (patch && Object.prototype.hasOwnProperty.call(patch, "scale")) {
      const scale = Number(patch.scale);
      if (Number.isFinite(scale)) touch.scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
    }
    if (PLACES.includes(patch?.place)) touch.place = patch.place;
    save(state);
    return game(gameId).touch;
  }

  function touch(gameId) {
    return game(gameId)?.touch || null;
  }

  function applyTouch(el, gameId) {
    const pref = touch(gameId);
    if (!el || !pref) return null;
    el.dataset.place = pref.place;
    el.style?.setProperty?.("--touch-scale", String(pref.scale));
    return pref;
  }

  function mountPanel(container, gameId, life) {
    if (!container || !isActionGame(gameId)) return function noop() {};
    const listen = (target, type, fn, options) => {
      if (life?.listen) return life.listen(target, type, fn, options);
      target.addEventListener(type, fn, options);
      return function unlisten() {
        target.removeEventListener(type, fn, options);
      };
    };
    let capture = null;
    const root = global.document.createElement("div");
    root.className = "ctrl-prefs";
    root.innerHTML = `
      <button type="button" class="ctrl-prefs-toggle" aria-expanded="false">Controls</button>
      <div class="ctrl-prefs-panel" hidden>
        <p class="ctrl-prefs-note">Keys and touch pad for this cabinet.</p>
        <div class="ctrl-bind-list"></div>
        <div class="ctrl-touch"></div>
        <p class="ctrl-prefs-status" role="status"></p>
        <button type="button" class="btn ghost ctrl-prefs-reset">Reset</button>
      </div>
    `;
    container.appendChild(root);
    const toggle = root.querySelector(".ctrl-prefs-toggle");
    const panel = root.querySelector(".ctrl-prefs-panel");
    const list = root.querySelector(".ctrl-bind-list");
    const touchRow = root.querySelector(".ctrl-touch");
    const status = root.querySelector(".ctrl-prefs-status");
    const resetBtn = root.querySelector(".ctrl-prefs-reset");

    function setStatus(text) {
      status.textContent = text || "";
    }

    function paint() {
      const current = game(gameId);
      list.replaceChildren();
      current.actions.forEach((action) => {
        const row = global.document.createElement("div");
        row.className = "ctrl-bind";
        const name = global.document.createElement("span");
        name.textContent = action.label;
        const shown = global.document.createElement("kbd");
        shown.textContent = action.keys.join(" / ");
        const change = global.document.createElement("button");
        change.type = "button";
        change.textContent = capture === action.id ? "Press key" : "Change";
        change.addEventListener("click", () => {
          capture = action.id;
          setStatus(`Press a key for ${action.label}. Esc cancels.`);
          paint();
        });
        row.append(name, shown, change);
        list.appendChild(row);
      });
      touchRow.replaceChildren();
      const padLabel = global.document.createElement("span");
      padLabel.textContent = "Pad";
      touchRow.appendChild(padLabel);
      PLACES.forEach((place) => {
        const btn = global.document.createElement("button");
        btn.type = "button";
        btn.textContent = place[0].toUpperCase() + place.slice(1);
        btn.setAttribute("aria-pressed", current.touch.place === place ? "true" : "false");
        btn.addEventListener("click", () => {
          setTouch(gameId, { place });
          applyTouch(container.closest(".snake-wrap, .shooter-wrap, .breaker-wrap")?.querySelector(".touch-cluster") || container.parentElement?.querySelector(".touch-cluster"), gameId);
          setStatus("");
          paint();
        });
        touchRow.appendChild(btn);
      });
      const sizeLabel = global.document.createElement("label");
      sizeLabel.className = "ctrl-size";
      sizeLabel.textContent = "Size";
      const range = global.document.createElement("input");
      range.type = "range";
      range.min = String(Math.round(SCALE_MIN * 100));
      range.max = String(Math.round(SCALE_MAX * 100));
      range.value = String(Math.round(current.touch.scale * 100));
      range.setAttribute("aria-label", "Touch button size");
      range.addEventListener("input", () => {
        setTouch(gameId, { scale: Number(range.value) / 100 });
        applyTouch(container.closest(".snake-wrap, .shooter-wrap, .breaker-wrap")?.querySelector(".touch-cluster") || container.parentElement?.querySelector(".touch-cluster"), gameId);
      });
      sizeLabel.appendChild(range);
      touchRow.appendChild(sizeLabel);
    }

    function onKey(event) {
      if (!capture) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (event.key === "Escape") {
        capture = null;
        setStatus("Change cancelled.");
        paint();
        return;
      }
      const result = setBinding(gameId, capture, event.key);
      const label = labelFor(gameId, capture);
      capture = null;
      if (!result.ok && result.reason === "conflict") {
        setStatus(`${event.key} is already used by ${result.action}.`);
      } else if (!result.ok && result.reason === "reserved") {
        setStatus("That key is reserved for pause or browser controls.");
      } else if (!result.ok) {
        setStatus("That key cannot be used.");
      } else {
        setStatus(result.persistDenied ? `${label} saved for this visit.` : `${label} updated.`);
      }
      paint();
    }

    toggle.addEventListener("click", () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (!open) {
        capture = null;
        setStatus("");
      }
    });
    resetBtn.addEventListener("click", () => {
      capture = null;
      reset(gameId);
      applyTouch(container.closest(".snake-wrap, .shooter-wrap, .breaker-wrap")?.querySelector(".touch-cluster") || container.parentElement?.querySelector(".touch-cluster"), gameId);
      setStatus("Controls reset.");
      paint();
    });
    const releaseKey = listen(global, "keydown", onKey, true);
    paint();
    applyTouch(container.closest(".snake-wrap, .shooter-wrap, .breaker-wrap")?.querySelector(".touch-cluster") || container.parentElement?.querySelector(".touch-cluster"), gameId);
    return function destroyPanel() {
      capture = null;
      releaseKey();
    };
  }

  global.ArcadeControls = Object.freeze({
    STORAGE_KEY,
    isActionGame,
    keysFor,
    matches,
    setBinding,
    reset,
    setTouch,
    touch,
    applyTouch,
    mountPanel,
    snapshot() {
      return { prefs: clone(load()), persistDenied };
    },
  });
})(window);
