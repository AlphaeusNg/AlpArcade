/** Retryable classic-script loading for lazy game modules and dependencies. */
(function (global) {
  "use strict";

  function create({
    documentRef = global.document,
    setTimeoutFn = global.setTimeout?.bind(global),
    clearTimeoutFn = global.clearTimeout?.bind(global),
  } = {}) {
    const promises = Object.create(null);

    function load(src, { timeoutMs = 12000 } = {}) {
      if (typeof src !== "string" || !src.trim()) {
        return Promise.reject(new TypeError("Script source is required"));
      }
      if (promises[src]) return promises[src];

      const existing = documentRef.querySelector(`script[data-arcade-src="${src}"]`);
      if (existing?.dataset.loaded === "1") {
        promises[src] = Promise.resolve();
        return promises[src];
      }

      const script = existing || documentRef.createElement("script");
      if (!existing) {
        script.src = src;
        script.async = true;
        script.dataset.arcadeSrc = src;
      }

      let timerId;
      const promise = new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeoutFn?.(timerId);
          script.removeEventListener("load", handleLoad);
          script.removeEventListener("error", handleError);
        };
        const fail = (error) => {
          cleanup();
          reject(error);
        };
        const handleLoad = () => {
          cleanup();
          script.dataset.loaded = "1";
          resolve();
        };
        const handleError = () => fail(new Error(`Failed to load ${src}`));

        script.addEventListener("load", handleLoad, { once: true });
        script.addEventListener("error", handleError, { once: true });
        timerId = setTimeoutFn?.(
          () => fail(new Error(`Timed out loading ${src} after ${timeoutMs} ms`)),
          timeoutMs,
        );
        if (!existing) documentRef.body.appendChild(script);
      });

      promises[src] = promise;
      promise.then(
        () => {},
        () => {
          if (promises[src] === promise) delete promises[src];
          if (script.dataset.loaded !== "1") script.remove();
        },
      );
      return promise;
    }

    return { load };
  }

  global.ArcadeScriptLoader = { create };
})(window);
