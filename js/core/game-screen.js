/**
 * Shared cabinet viewport lock.
 * Keeps game geometry stable when mobile browser chrome or dynamic UI changes.
 */
(function (global) {
  "use strict";

  let activePlayView = null;
  let lockedScrollY = 0;

  function shouldUseDocumentScroll(root) {
    const playView = root?.closest?.("#play-view");
    return (
      !!global.matchMedia?.("(max-width: 720px), (pointer: coarse)")?.matches &&
      !isFullscreen(playView)
    );
  }

  function lock(root) {
    const layout = root?.closest(".play-layout");
    if (!root || !layout) return () => {};

    let released = false;
    let frame = 0;
    const applyLock = () => {
      if (released || !root.isConnected || !layout.isConnected) return;
      if (shouldUseDocumentScroll(root)) {
        root.classList.remove("is-screen-locked");
        layout.classList.remove("is-screen-locked");
        root.classList.add("is-document-flow");
        layout.classList.add("is-document-flow");
        root.style.removeProperty("--cabinet-screen-height");
        layout.style.removeProperty("--cabinet-play-height");
        root.dataset.screenFlow = "document";
        delete root.dataset.screenLocked;
        return;
      }
      root.classList.remove("is-document-flow");
      layout.classList.remove("is-document-flow");
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
      root.classList.remove("is-document-flow");
      layout.classList.remove("is-document-flow");
      root.style.removeProperty("--cabinet-screen-height");
      layout.style.removeProperty("--cabinet-play-height");
      delete root.dataset.screenLocked;
      delete root.dataset.screenFlow;
    };
  }

  function isFullscreen(root) {
    return root ? activePlayView === root : !!activePlayView;
  }

  function isFullscreenSupported(root) {
    return !!root;
  }

  function announceScreenChange() {
    document.dispatchEvent(new CustomEvent("arcadegamescreenchange", {
      detail: { active: !!activePlayView },
    }));
  }

  function enterFullscreen(root) {
    if (!root || isFullscreen(root)) return Promise.resolve();
    if (activePlayView) exitFullscreen(activePlayView);
    lockedScrollY = Math.max(0, global.scrollY || 0);
    activePlayView = root;
    document.documentElement.classList.add("is-game-view-locked");
    document.body.classList.add("is-game-view-locked");
    document.body.style.setProperty("--game-view-scroll-offset", `${-lockedScrollY}px`);
    announceScreenChange();
    return Promise.resolve();
  }

  function exitFullscreen(root) {
    if (!activePlayView || (root && activePlayView !== root)) return Promise.resolve();
    activePlayView = null;
    document.documentElement.classList.remove("is-game-view-locked");
    document.body.classList.remove("is-game-view-locked");
    document.body.style.removeProperty("--game-view-scroll-offset");
    global.scrollTo(0, lockedScrollY);
    announceScreenChange();
    return Promise.resolve();
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
    shouldUseDocumentScroll,
  });
})(window);
