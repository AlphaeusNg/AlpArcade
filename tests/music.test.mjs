import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "js/features/music.js"), "utf8");
const MUSIC_KEY = "alparcade-bg-music";
const UI_KEY = "alparcade-music-ui-v5";
const LOFI = "https://open.spotify.com/embed/playlist/0IcjCtBQgkV41B1jkMeAaw?utm_source=generator";
const DGRAY = "https://open.spotify.com/embed/playlist/3OXFbQpZflLoxvjQ5vGJrL?utm_source=generator";
let contracts = 0;

function check(condition, message) {
  assert.ok(condition, message);
  contracts += 1;
}

class FakeClassList {
  constructor(...names) {
    this.names = new Set(names);
  }
  add(...names) {
    names.forEach((name) => this.names.add(name));
  }
  remove(...names) {
    names.forEach((name) => this.names.delete(name));
  }
  toggle(name, force) {
    const active = force === undefined ? !this.names.has(name) : !!force;
    if (active) this.names.add(name);
    else this.names.delete(name);
    return active;
  }
  contains(name) {
    return this.names.has(name);
  }
}

class FakeElement {
  constructor(id = "", { classes = [], dataset = {}, text = "" } = {}) {
    this.id = id;
    this.dataset = { ...dataset };
    this.textContent = text;
    this.hidden = false;
    this.title = "";
    this.style = {};
    this.classList = new FakeClassList(...classes);
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.parentElement = null;
    this.removed = false;
    this.srcAssignments = 0;
    this._src = "";
  }
  get src() {
    return this._src;
  }
  set src(value) {
    this._src = String(value);
    this.srcAssignments += 1;
  }
  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
    }
    this.children.push(child);
    child.parentElement = this;
    return child;
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name) {
    if (name === "src") this._src = "";
    this.attributes.delete(name);
  }
  remove() {
    this.removed = true;
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((item) => item !== this);
      this.parentElement = null;
    }
  }
  querySelector(selector) {
    return flatten(this.children).find((element) => matches(element, selector)) || null;
  }
  querySelectorAll(selector) {
    return flatten(this.children).filter((element) => matches(element, selector));
  }
}

function flatten(elements) {
  return elements.flatMap((element) => [element, ...flatten(element.children)]);
}

function matches(element, selector) {
  if (selector.startsWith("#")) return element.id === selector.slice(1);
  if (selector === "strong") return element.tagName === "STRONG";
  if (selector === ".bg-music-btn") return element.classList.contains("bg-music-btn");
  if (selector === ".bg-music-btn[data-embed]") {
    return element.classList.contains("bg-music-btn") && !!element.dataset.embed;
  }
  const playlist = /^\.bg-music-btn\[data-playlist="([^"]+)"\]$/.exec(selector)?.[1];
  return !!playlist && element.classList.contains("bg-music-btn") && element.dataset.playlist === playlist;
}

function station(id, embed, label) {
  const button = new FakeElement("", {
    classes: ["bg-music-btn"],
    dataset: { playlist: id, embed },
  });
  const strong = new FakeElement("", { text: label });
  strong.tagName = "STRONG";
  button.appendChild(strong);
  return button;
}

function bootMusic({ preference, ui, throwStorage = false } = {}) {
  const stored = new Map();
  if (preference !== undefined) stored.set(MUSIC_KEY, preference);
  if (ui !== undefined) stored.set(UI_KEY, ui);

  const elements = {
    "bg-music": new FakeElement("bg-music", { classes: ["music-dock"] }),
    "music-dock-tab": new FakeElement("music-dock-tab", { classes: ["music-dock-tab"] }),
    "music-dock-tab-text": new FakeElement("music-dock-tab-text", { text: "Music" }),
    "music-dock-panel": new FakeElement("music-dock-panel", { classes: ["music-dock-panel"] }),
    "music-dock-scrim": new FakeElement("music-dock-scrim", { classes: ["music-dock-scrim"] }),
    "music-player-slot": new FakeElement("music-player-slot", { classes: ["music-player-slot"] }),
    "bg-music-empty": new FakeElement("bg-music-empty", { text: "Starting music…" }),
    "music-player-shell": new FakeElement("music-player-shell", {
      classes: ["music-player-shell", "is-docked"],
    }),
    "music-player-label": new FakeElement("music-player-label", { text: "Playing…" }),
    "bg-music-frame": new FakeElement("bg-music-frame"),
  };
  elements["music-dock-scrim"].hidden = true;
  elements["music-player-shell"].hidden = true;
  const bar = new FakeElement("", { classes: ["music-player-bar"] });
  bar.appendChild(elements["music-player-label"]);
  elements["music-player-shell"].appendChild(bar);
  elements["music-player-slot"].appendChild(elements["bg-music-empty"]);
  elements["music-player-slot"].appendChild(elements["music-player-shell"]);
  const buttons = [station("lofi", LOFI, "Lofi Beats"), station("dgray", DGRAY, "D.Gray-Man")];
  const all = [...Object.values(elements), ...buttons, ...flatten(buttons)];

  const documentListeners = new Map();
  const document = {
    readyState: "complete",
    querySelector: (selector) => all.find((element) => matches(element, selector)) || null,
    querySelectorAll: (selector) => all.filter((element) => matches(element, selector)),
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) || [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    },
  };
  const windowListeners = new Map();
  const window = {
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    removeEventListener(type, listener) {
      windowListeners.set(type, (windowListeners.get(type) || []).filter((item) => item !== listener));
    },
  };
  const location = { href: "https://example.test/AlpArcade/", hash: "#lobby" };
  const localStorage = {
    getItem(key) {
      if (throwStorage) throw new Error("storage blocked");
      return stored.get(key) ?? null;
    },
    setItem(key, value) {
      if (throwStorage) throw new Error("storage blocked");
      stored.set(key, String(value));
    },
    removeItem(key) {
      if (throwStorage) throw new Error("storage blocked");
      stored.delete(key);
    },
  };
  const context = { window, document, location, localStorage, URL };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "js/features/music.js" });

  return {
    music: window.ArcadeMusic,
    elements,
    buttons,
    stored,
    dispatchWindow(type, event = {}) {
      for (const listener of [...(windowListeners.get(type) || [])]) listener(event);
    },
  };
}

const fresh = bootMusic();
check(fresh.music.isPlaying(), "a fresh visit autoplays the default station");
check(fresh.elements["bg-music-frame"].src.includes("0IcjCtBQgkV41B1jkMeAaw"), "default iframe is Lofi Beats");
check(fresh.elements["bg-music-frame"].src.includes("autoplay=1"), "default iframe requests autoplay");
check(JSON.parse(fresh.stored.get(MUSIC_KEY)).id === "lofi", "default choice is persisted");

const restored = bootMusic({
  preference: JSON.stringify({ id: "dgray", embed: DGRAY, label: "D.Gray-Man", stopped: false }),
});
check(restored.music.isPlaying(), "a valid saved station resumes");
check(restored.elements["bg-music-frame"].src.includes("3OXFbQpZflLoxvjQ5vGJrL"), "saved station uses canonical embed");
check(restored.buttons[1].classList.contains("is-active"), "saved station button is active");

const stopped = bootMusic({
  preference: JSON.stringify({ id: "dgray", embed: DGRAY, label: "D.Gray-Man", stopped: true }),
});
check(stopped.music.isPlaying(), "a saved stop preference cannot suppress autoplay on a new visit");
check(stopped.elements["bg-music-frame"].src.includes("3OXFbQpZflLoxvjQ5vGJrL"), "a new visit resumes the saved station");
check(JSON.parse(stopped.stored.get(MUSIC_KEY)).stopped === false, "startup clears a saved stop preference");

const corrupt = bootMusic({ preference: "{bad-json" });
check(corrupt.music.isPlaying(), "corrupt preference storage falls back to default autoplay");
check(corrupt.elements["bg-music-frame"].src.includes("0IcjCtBQgkV41B1jkMeAaw"), "corrupt storage cannot change station");

const stringBoolean = bootMusic({
  preference: JSON.stringify({ id: "dgray", embed: DGRAY, label: "D.Gray-Man", stopped: "false" }),
});
check(stringBoolean.music.isPlaying(), "string false cannot masquerade as a stopped preference");

const foreign = bootMusic({
  preference: JSON.stringify({ id: "unknown", embed: "https://evil.example/embed", label: "Foreign", stopped: false }),
});
check(foreign.music.isPlaying(), "unknown stored stations recover to the default");
check(!foreign.elements["bg-music-frame"].src.includes("evil.example"), "storage cannot inject an unlisted iframe URL");
check(foreign.elements["bg-music-frame"].src.includes("0IcjCtBQgkV41B1jkMeAaw"), "foreign embeds fall back to Lofi Beats");

const hijackedKnownId = bootMusic({
  preference: JSON.stringify({ id: "dgray", embed: "https://evil.example/embed", label: "Foreign", stopped: false }),
});
check(!hijackedKnownId.elements["bg-music-frame"].src.includes("evil.example"), "a known ID cannot smuggle a foreign embed");
check(hijackedKnownId.elements["bg-music-frame"].src.includes("3OXFbQpZflLoxvjQ5vGJrL"), "known IDs resolve to canonical DOM stations");

const falseDock = bootMusic({ ui: JSON.stringify({ dockOpen: "false" }) });
check(!falseDock.elements["bg-music"].classList.contains("is-open"), "string false cannot open the dock");
check(falseDock.elements["music-dock-tab"].getAttribute("aria-expanded") === "false", "closed hydration updates ARIA");
check(
  JSON.parse(falseDock.stored.get(UI_KEY)).dockOpen === false,
  "wrong-shaped dock state is rewritten with a boolean closed value",
);
const openDock = bootMusic({ ui: JSON.stringify({ dockOpen: true }) });
check(openDock.elements["bg-music"].classList.contains("is-open"), "an exact true preference restores the open dock");
check(!openDock.elements["music-dock-scrim"].hidden, "restored open dock exposes its outside-click scrim");

const retry = bootMusic();
const firstAssignments = retry.elements["bg-music-frame"].srcAssignments;
retry.dispatchWindow("pointerdown");
check(retry.elements["bg-music-frame"].srcAssignments === firstAssignments + 1, "first gesture retries autoplay once");
retry.dispatchWindow("keydown");
check(retry.elements["bg-music-frame"].srcAssignments === firstAssignments + 1, "autoplay retry listeners remove themselves");

assert.doesNotThrow(() => bootMusic({ throwStorage: true }), "blocked storage must not prevent music startup");
contracts += 1;

console.log(`Music preference, dock hydration, and autoplay recovery passed (${contracts} contracts).`);
