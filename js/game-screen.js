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

  global.ArcadeGameScreen = Object.freeze({ lock });
})(window);
