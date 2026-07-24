import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const reporter = fs.readFileSync(path.join(root, "js/services/error-reporter.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/lobby.css"), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(
  html.includes('id="cloud-error-details"')
    && html.includes('id="btn-cloud-copy"')
    && html.includes('id="btn-cloud-error-toggle"')
    && html.includes('aria-expanded="true"'),
  "Cloud errors must expose copy and minimize controls"
);
assert(
  app.includes("function rememberCloudError")
    && app.includes('navigator.clipboard.writeText(cloudErrorLog.text)')
    && app.includes("cloudErrorLog.minimized = !cloudErrorLog.minimized")
    && !/cloudErrorLog[\s\S]{0,500}setTimeout/.test(app),
  "Error logs must remain until explicitly minimized and support clipboard copying"
);
assert(
  styles.includes(".cloud-error-details")
    && styles.includes("user-select: text")
    && styles.includes("white-space: pre-wrap"),
  "Error details must be visibly formatted and selectable"
);
assert(
  html.includes("firebase-analytics-compat.js")
    && html.includes("js/services/error-reporter.js")
    && reporter.includes('client.logEvent("exception"')
    && reporter.includes("sessionSignatures")
    && reporter.includes("saveQueue(queued)"),
  "Displayed errors must send deduplicated Analytics feedback or queue it offline"
);
assert(
  reporter.includes('replace(/\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b/gi, "[email]")')
    && !reporter.includes("displayName")
    && !reporter.includes("userId"),
  "Automatic reports must redact email and omit account identifiers"
);

const saved = new Map();
const events = [];
const sandboxWindow = {
  ARCADE_FIREBASE_CONFIG: {
    enabled: true,
    apiKey: "public",
    projectId: "arcade",
    appId: "app",
    measurementId: "G-TEST",
  },
  SITE_VERSION: { id: "test-version" },
  location: { pathname: "/AlpArcade/" },
  addEventListener() {},
};
const sandbox = {
  window: sandboxWindow,
  navigator: { onLine: true },
  localStorage: {
    getItem(key) {
      return saved.get(key) ?? null;
    },
    setItem(key, value) {
      saved.set(key, value);
    },
    removeItem(key) {
      saved.delete(key);
    },
  },
  firebase: {
    apps: [],
    initializeApp() {
      this.apps.push({});
    },
    analytics() {
      return {
        logEvent(name, params) {
          events.push({ name, params });
        },
      };
    },
  },
  URL,
  setTimeout() {},
};
vm.runInNewContext(reporter, sandbox);

const first = sandboxWindow.ArcadeErrorReporter.report({
  source: "cloud",
  message: "Failed for alpha@example.com using AIza123456789012345678901234",
});
const repeated = sandboxWindow.ArcadeErrorReporter.report({
  source: "cloud",
  message: "Failed for alpha@example.com using AIza123456789012345678901234",
});
assert(
  first.status === "sent"
    && repeated.status === "duplicate"
    && events.length === 1
    && events[0].name === "exception"
    && events[0].params.description.includes("[email]")
    && events[0].params.description.includes("[api-key]"),
  "Reporter must send one redacted exception per unique session error"
);

sandbox.navigator.onLine = false;
const offline = sandboxWindow.ArcadeErrorReporter.report({
  source: "firebase-sdk",
  message: "Network unavailable",
});
assert(
  offline.status === "queued"
    && JSON.parse(saved.get("alparcade-error-reports-v1")).length === 1,
  "Offline diagnostics must remain queued for a later connection"
);

console.log("Persistent, copyable error log and reporting passed.");
