/**
 * Request-scoped lifecycle for lazy cabinet navigation.
 * A cancelled load may finish fetching, but it must never mount or clean up a
 * newer request after the player has returned to the lobby.
 *
 * createLifecycle() tracks timers, animation frames, input listeners, and
 * audio nodes for one mount. dispose() drops them so a later cabinet cannot
 * inherit background work.
 *
 * frameGap() / scoredTimeout() discard hidden-tab, lock, and long-suspension
 * gaps so a scored run cannot fast-forward or earn time it did not play.
 */
(function (global) {
  "use strict";

  const STALL_MS = 1500;
  const MAX_STEP_MS = 34;

  function create() {
    let nextToken = 0;
    let currentToken = 0;

    function begin() {
      if (currentToken) return null;
      currentToken = ++nextToken;
      return currentToken;
    }

    function isCurrent(token) {
      return !!token && token === currentToken;
    }

    function cancel() {
      currentToken = 0;
    }

    function finish(token) {
      if (!isCurrent(token)) return false;
      currentToken = 0;
      return true;
    }

    return Object.freeze({ begin, isCurrent, cancel, finish });
  }

  function createLifecycle() {
    const timeouts = new Set();
    const intervals = new Set();
    const frames = new Set();
    const listeners = [];
    const audios = new Set();
    let disposed = false;

    function setTimeout(fn, delay, ...args) {
      if (disposed || typeof global.setTimeout !== "function") return 0;
      let id = 0;
      id = global.setTimeout(() => {
        timeouts.delete(id);
        if (!disposed) fn(...args);
      }, delay);
      timeouts.add(id);
      return id;
    }

    function clearTimeout(id) {
      timeouts.delete(id);
      global.clearTimeout?.(id);
    }

    function setInterval(fn, delay, ...args) {
      if (disposed || typeof global.setInterval !== "function") return 0;
      const id = global.setInterval((...tickArgs) => {
        if (!disposed) fn(...tickArgs);
      }, delay, ...args);
      intervals.add(id);
      return id;
    }

    function clearInterval(id) {
      intervals.delete(id);
      global.clearInterval?.(id);
    }

    function requestAnimationFrame(fn) {
      if (disposed || typeof global.requestAnimationFrame !== "function") return 0;
      let id = 0;
      id = global.requestAnimationFrame((ts) => {
        frames.delete(id);
        if (!disposed) fn(ts);
      });
      frames.add(id);
      return id;
    }

    function cancelAnimationFrame(id) {
      frames.delete(id);
      global.cancelAnimationFrame?.(id);
    }

    function listen(target, type, fn, options) {
      if (disposed || !target || typeof target.addEventListener !== "function") return function noop() {};
      target.addEventListener(type, fn, options);
      const rec = { target, type, fn, options };
      listeners.push(rec);
      return function unlisten() {
        const index = listeners.indexOf(rec);
        if (index >= 0) listeners.splice(index, 1);
        target.removeEventListener(type, fn, options);
      };
    }

    function trackAudio(node) {
      if (node) audios.add(node);
      return node;
    }

    function stopAudio(node) {
      try {
        node.pause?.();
      } catch {
        /* Ignore a media element that is already detached. */
      }
      try {
        if (typeof node.close === "function" && node.state !== "closed") node.close();
      } catch {
        /* Ignore an audio context that the browser already closed. */
      }
    }

    function dispose() {
      if (disposed) return false;
      disposed = true;
      for (const id of timeouts) global.clearTimeout?.(id);
      for (const id of intervals) global.clearInterval?.(id);
      for (const id of frames) global.cancelAnimationFrame?.(id);
      timeouts.clear();
      intervals.clear();
      frames.clear();
      for (const rec of listeners.splice(0)) {
        rec.target.removeEventListener(rec.type, rec.fn, rec.options);
      }
      for (const node of audios) stopAudio(node);
      audios.clear();
      return true;
    }

    function snapshot() {
      return {
        disposed,
        timeouts: timeouts.size,
        intervals: intervals.size,
        frames: frames.size,
        listeners: listeners.length,
        audios: audios.size,
      };
    }

    return Object.freeze({
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      requestAnimationFrame,
      cancelAnimationFrame,
      listen,
      trackAudio,
      dispose,
      snapshot,
    });
  }

  /**
   * One animation step. A missing anchor starts the clock at zero step.
   * Negative gaps and gaps longer than stallMs are suspension, not play time.
   */
  function frameGap(now, last, stallMs = STALL_MS) {
    const current = Number(now);
    if (!Number.isFinite(current)) return { stepMs: 0, stalled: true, now: 0 };
    if (last == null || !Number.isFinite(Number(last))) {
      return { stepMs: 0, stalled: false, now: current };
    }
    const elapsed = current - Number(last);
    if (elapsed < 0 || elapsed > stallMs) return { stepMs: 0, stalled: true, now: current };
    return { stepMs: Math.min(MAX_STEP_MS, elapsed), stalled: false, now: current };
  }

  /**
   * pending: the window is still open and may score.
   * due: it ended on time and should resolve normally.
   * suspended: the callback is late because the tab, lock, or process slept.
   * Suspended windows must not award points.
   */
  function scoredTimeout(dueAt, now, stallMs = STALL_MS) {
    const due = Number(dueAt);
    const current = Number(now);
    if (!Number.isFinite(due) || !Number.isFinite(current) || current < due) return "pending";
    if (current - due > stallMs) return "suspended";
    return "due";
  }

  function bindSuspension(life, doc, onEvent) {
    if (!life || !doc || typeof onEvent !== "function" || typeof life.listen !== "function") {
      return function noop() {};
    }
    const unlisteners = [
      life.listen(doc, "visibilitychange", () => {
        onEvent(doc.hidden || doc.visibilityState === "hidden" ? "hidden" : "visible");
      }),
      life.listen(doc, "pagehide", () => onEvent("pagehide")),
      life.listen(doc, "freeze", () => onEvent("freeze")),
      life.listen(doc, "pageshow", () => onEvent("pageshow")),
      life.listen(doc, "resume", () => onEvent("resume")),
    ];
    return function unbind() {
      unlisteners.forEach((fn) => fn());
    };
  }

  global.ArcadeCabinetSession = Object.freeze({
    create,
    createLifecycle,
    frameGap,
    scoredTimeout,
    bindSuspension,
    STALL_MS,
    MAX_STEP_MS,
  });
})(window);
