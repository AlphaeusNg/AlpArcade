/**
 * Privacy-limited client error reporting.
 * Sends Firebase Analytics `exception` events and queues reports while offline.
 */
(function (global) {
  "use strict";

  const QUEUE_KEY = "alparcade-error-reports-v1";
  const MAX_QUEUE = 10;
  const MAX_DESCRIPTION = 100;
  const sessionSignatures = new Set();
  let analytics = null;

  function firebaseOptions() {
    const c = global.ARCADE_FIREBASE_CONFIG || {};
    return {
      apiKey: c.apiKey,
      authDomain: c.authDomain,
      projectId: c.projectId,
      storageBucket: c.storageBucket,
      messagingSenderId: c.messagingSenderId,
      appId: c.appId,
      measurementId: c.measurementId,
    };
  }

  function cleanText(value, limit) {
    return String(value || "")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
      .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[api-key]")
      .replace(/https?:\/\/[^\s]+/gi, (url) => {
        try {
          const parsed = new URL(url);
          return parsed.origin + parsed.pathname;
        } catch {
          return "[url]";
        }
      })
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  }

  function loadQueue() {
    try {
      const saved = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
      return Array.isArray(saved) ? saved.slice(-MAX_QUEUE) : [];
    } catch {
      return [];
    }
  }

  function saveQueue(queue) {
    try {
      if (queue.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
      else localStorage.removeItem(QUEUE_KEY);
    } catch {
      // Reporting must never interrupt gameplay.
    }
  }

  function getAnalytics() {
    if (analytics) return analytics;
    const c = global.ARCADE_FIREBASE_CONFIG || {};
    if (
      typeof firebase === "undefined"
      || typeof firebase.analytics !== "function"
      || !c.enabled
      || !c.measurementId
    ) {
      return null;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(firebaseOptions());
      analytics = firebase.analytics();
      return analytics;
    } catch {
      return null;
    }
  }

  function send(report) {
    const client = getAnalytics();
    if (!client || !navigator.onLine) return false;
    try {
      client.logEvent("exception", {
        description: `[${report.source}] ${report.message}`.slice(0, MAX_DESCRIPTION),
        fatal: false,
        error_source: report.source,
        app_version: report.version,
        page_path: report.page,
      });
      return true;
    } catch {
      return false;
    }
  }

  function flush() {
    const queued = loadQueue();
    if (!queued.length) return 0;
    const remaining = [];
    let sent = 0;
    queued.forEach((report) => {
      if (send(report)) sent += 1;
      else remaining.push(report);
    });
    saveQueue(remaining);
    return sent;
  }

  function report(input = {}) {
    const message = cleanText(input.message || "Unknown error", 300);
    const source = cleanText(input.source || "app", 32) || "app";
    const version = cleanText(global.SITE_VERSION?.id || "unknown", 32);
    const page = cleanText(global.location?.pathname || "/", 100);
    const signature = `${source}:${message}`;

    if (sessionSignatures.has(signature)) {
      return { status: "duplicate" };
    }
    sessionSignatures.add(signature);

    const reportData = {
      message,
      source,
      version,
      page,
      clientAt: Date.now(),
    };
    if (send(reportData)) return { status: "sent" };

    const queued = loadQueue();
    queued.push(reportData);
    saveQueue(queued);
    return { status: "queued" };
  }

  global.addEventListener("online", flush);
  setTimeout(flush, 1500);

  global.ArcadeErrorReporter = {
    report,
    flush,
  };
})(window);
