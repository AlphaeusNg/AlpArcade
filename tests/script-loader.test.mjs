import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "js/core/script-loader.js"), "utf8");

function createFakeDocument() {
  const scripts = [];
  const body = {
    appendChild(script) {
      script.isConnected = true;
      scripts.push(script);
      return script;
    },
  };
  return {
    scripts,
    body,
    createElement(tagName) {
      assert.equal(tagName, "script");
      const listeners = new Map();
      return {
        dataset: {},
        isConnected: false,
        addEventListener(type, listener) {
          listeners.set(type, listener);
        },
        removeEventListener(type, listener) {
          if (listeners.get(type) === listener) listeners.delete(type);
        },
        dispatch(type) {
          const propertyHandler = this[`on${type}`];
          if (propertyHandler) propertyHandler();
          listeners.get(type)?.();
        },
        remove() {
          this.isConnected = false;
        },
      };
    },
    querySelector(selector) {
      const src = /^script\[data-arcade-src="(.+)"\]$/.exec(selector)?.[1];
      return scripts.find((script) => script.isConnected && script.dataset.arcadeSrc === src) || null;
    },
  };
}

const documentRef = createFakeDocument();
let timeoutCallback;
const window = {};
const context = { window };
vm.createContext(context);
vm.runInContext(source, context);
const loader = window.ArcadeScriptLoader.create({
  documentRef,
  setTimeoutFn(callback) {
    timeoutCallback = callback;
    return 1;
  },
  clearTimeoutFn() {},
});

const first = loader.load("js/games/snake.js");
const duplicate = loader.load("js/games/snake.js");
assert.equal(first, duplicate, "concurrent requests should share one promise");
assert.equal(documentRef.scripts.length, 1, "concurrent requests should append one script");
documentRef.scripts[0].dispatch("load");
await first;
assert.equal(documentRef.scripts[0].dataset.loaded, "1");
assert.equal(await loader.load("js/games/snake.js"), undefined, "loaded scripts should resolve from cache");
assert.equal(documentRef.scripts.length, 1, "loaded reuse should not append another script");

const failed = loader.load("js/games/shooter.js");
const failedNode = documentRef.scripts.at(-1);
failedNode.dispatch("error");
await assert.rejects(failed, /Failed to load js\/games\/shooter\.js/);
assert.equal(failedNode.isConnected, false, "failed script nodes should be removed");

const retry = loader.load("js/games/shooter.js");
const retryNode = documentRef.scripts.at(-1);
assert.notEqual(retry, failed, "failure should clear the rejected promise before retry");
assert.notEqual(retryNode, failedNode, "retry should append a fresh script node");
retryNode.dispatch("load");
await retry;

const timedOut = loader.load("js/games/memory.js", { timeoutMs: 25 });
const timedOutNode = documentRef.scripts.at(-1);
timeoutCallback();
await assert.rejects(timedOut, /Timed out loading js\/games\/memory\.js after 25 ms/);
assert.equal(timedOutNode.isConnected, false, "timed-out nodes should be removed before retry");

console.log("Retryable lazy script loader passed (11 contracts).");
