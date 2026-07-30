import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const stored = new Map();
const context = {
  window: {},
  localStorage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  },
};
vm.createContext(context);
const source = fs.readFileSync(path.join(root, "js/core/audio.js"), "utf8");
vm.runInContext(source, context);

if (!source.includes("if (unlocked) return !!ac();")) {
  throw new Error("Audio unlock must be idempotent so rapid game taps do not create silent oscillator nodes");
}

const seen = [];
const stop = context.window.ArcadeSFX.onMuteChange((muted) => seen.push(muted));
context.window.ArcadeSFX.setMuted(true);
context.window.ArcadeSFX.setMuted(true);
stop();
context.window.ArcadeSFX.setMuted(false);

if (JSON.stringify(seen) !== JSON.stringify([false, true])) {
  throw new Error(`Mute listeners should receive initial and changed state; received ${JSON.stringify(seen)}`);
}
if (stored.get("alphaeus-arcade-mute") !== "0") {
  throw new Error("Global mute state must remain persisted");
}

console.log("Shared audio mute subscription passed.");
