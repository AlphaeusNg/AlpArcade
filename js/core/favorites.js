/**
 * Favorite and recently played cabinets. Launching still goes through the
 * lobby route. A denied write keeps the lists for this visit only.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "alparcade-favorites-v1";
  const ALLOWED = ["tictactoe", "snake", "breaker", "tapper", "reaction", "shooter", "memory", "jubeat"];
  const RECENT_MAX = 4;
  let session = null;
  let persistDenied = false;

  function blank() {
    return { favorites: [], recent: [] };
  }

  function cleanList(list, max) {
    const next = [];
    if (!Array.isArray(list)) return next;
    for (const id of list) {
      const key = String(id || "");
      if (!ALLOWED.includes(key) || next.includes(key)) continue;
      next.push(key);
      if (max && next.length >= max) break;
    }
    return next;
  }

  function normalize(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
      favorites: cleanList(source.favorites),
      recent: cleanList(source.recent, RECENT_MAX),
    };
  }

  function load() {
    if (session) return session;
    try {
      const raw = global.localStorage?.getItem(STORAGE_KEY);
      session = normalize(raw ? JSON.parse(raw) : null);
    } catch {
      session = blank();
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

  function toggle(id) {
    const key = String(id || "");
    if (!ALLOWED.includes(key)) return false;
    const state = load();
    state.favorites = state.favorites.includes(key)
      ? state.favorites.filter((item) => item !== key)
      : state.favorites.concat(key);
    save(state);
    return state.favorites.includes(key);
  }

  function remember(id) {
    const key = String(id || "");
    if (!ALLOWED.includes(key)) return load().recent.slice();
    const state = load();
    state.recent = [key].concat(state.recent.filter((item) => item !== key)).slice(0, RECENT_MAX);
    save(state);
    return state.recent.slice();
  }

  function pins() {
    const state = load();
    return {
      favorites: state.favorites.slice(),
      recent: state.recent.filter((id) => !state.favorites.includes(id)),
      persistDenied,
    };
  }

  global.ArcadeFavorites = Object.freeze({
    STORAGE_KEY,
    ALLOWED,
    toggle,
    remember,
    pins,
    isFavorite(id) {
      return load().favorites.includes(id);
    },
  });
})(window);
