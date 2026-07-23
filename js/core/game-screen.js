/**
 * Shared cabinet viewport lock.
 * Keeps game geometry stable when mobile browser chrome or dynamic UI changes.
 */
(function (global) {
  "use strict";

  function lock(root) {
    const layout = root?.closest(".play-layout");
    if (!root || !layout) return () => {};

    let released = false;
    let frame = 0;
    const applyLock = () => {
      if (released || !root.isConnected || !layout.isConnected) return;
      const viewportHeight = Math.round(global.visualViewport?.height || global.innerHeight);
      const layoutTop = Math.max(0, layout.getBoundingClientRect().top);
      const availableHeight = Math.max(320, viewportHeight - layoutTop - 12);
      const gameHeight = Math.max(
        320,
        Math.min(Math.ceil(Math.max(root.getBoundingClientRect().height, root.scrollHeight)), availableHeight)
      );
      const layoutHeight = Math.max(
        gameHeight,
        Math.min(Math.ceil(Math.max(layout.getBoundingClientRect().height, layout.scrollHeight)), availableHeight)
      );

      root.style.setProperty("--cabinet-screen-height", `${gameHeight}px`);
      layout.style.setProperty("--cabinet-play-height", `${layoutHeight}px`);
      root.classList.add("is-screen-locked");
      layout.classList.add("is-screen-locked");
      root.dataset.screenLocked = "true";
    };

    frame = global.requestAnimationFrame(() => {
      frame = global.requestAnimationFrame(applyLock);
    });

    return () => {
      released = true;
      global.cancelAnimationFrame(frame);
      root.classList.remove("is-screen-locked");
      layout.classList.remove("is-screen-locked");
      root.style.removeProperty("--cabinet-screen-height");
      layout.style.removeProperty("--cabinet-play-height");
      delete root.dataset.screenLocked;
    };
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function isFullscreen(root) {
    const active = fullscreenElement();
    return root ? active === root : !!active;
  }

  function isFullscreenSupported(root) {
    return !!(root?.requestFullscreen || root?.webkitRequestFullscreen);
  }

  function enterFullscreen(root) {
    if (!root || isFullscreen(root)) return Promise.resolve();
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!request) return Promise.reject(new Error("Fullscreen is not supported"));
    try {
      const result = request.call(root, { navigationUI: "hide" });
      return result?.then ? result : Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function exitFullscreen(root) {
    if (!isFullscreen(root)) return Promise.resolve();
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!exit) return Promise.resolve();
    try {
      const result = exit.call(document);
      return result?.then ? result : Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function guardFullscreenGestures(root) {
    if (!root) return () => {};
    let multiTouch = false;
    const active = () => isFullscreen(root);
    const stopGesture = (event) => {
      if (active() && event.cancelable) event.preventDefault();
    };
    const onTouchStart = (event) => {
      if (!active()) return;
      multiTouch = event.touches.length > 1;
      if (multiTouch && event.cancelable) event.preventDefault();
    };
    const onTouchMove = (event) => {
      if (!active()) return;
      if (event.touches.length > 1) multiTouch = true;
      if (event.cancelable) event.preventDefault();
    };
    const onTouchEnd = (event) => {
      if (!active()) return;
      if (multiTouch && event.cancelable) event.preventDefault();
      if (!event.touches.length) multiTouch = false;
    };

    root.addEventListener("touchstart", onTouchStart, { passive: false, capture: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    root.addEventListener("touchend", onTouchEnd, { passive: false, capture: true });
    root.addEventListener("touchcancel", onTouchEnd, { passive: false, capture: true });
    root.addEventListener("gesturestart", stopGesture, { passive: false });
    root.addEventListener("gesturechange", stopGesture, { passive: false });
    root.addEventListener("gestureend", stopGesture, { passive: false });
    root.addEventListener("wheel", stopGesture, { passive: false });
    root.addEventListener("contextmenu", stopGesture);

    return () => {
      root.removeEventListener("touchstart", onTouchStart, { capture: true });
      root.removeEventListener("touchmove", onTouchMove, { capture: true });
      root.removeEventListener("touchend", onTouchEnd, { capture: true });
      root.removeEventListener("touchcancel", onTouchEnd, { capture: true });
      root.removeEventListener("gesturestart", stopGesture);
      root.removeEventListener("gesturechange", stopGesture);
      root.removeEventListener("gestureend", stopGesture);
      root.removeEventListener("wheel", stopGesture);
      root.removeEventListener("contextmenu", stopGesture);
    };
  }

  global.ArcadeGameScreen = Object.freeze({
    lock,
    isFullscreen,
    isFullscreenSupported,
    enterFullscreen,
    exitFullscreen,
    guardFullscreenGestures,
  });
})(window);
