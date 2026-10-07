/** Versioned device backup. Validate every component before writing any of them. */
(function (global) {
  "use strict";
  const FORMAT = "alparcade-device-backup";
  const VERSION = 1;
  const MAX_BYTES = 1024 * 1024;

  function exportSnapshot() {
    return { format: FORMAT, version: VERSION, createdAt: new Date().toISOString(),
      scoreCode: global.ArcadeScores.exportCode(),
      favorites: global.ArcadeFavorites.snapshot(), controls: global.ArcadeControls.snapshot().prefs };
  }

  function parseSnapshot(text) {
    if (typeof text !== "string" || text.length > MAX_BYTES) throw new Error("Backup is too large");
    const raw = JSON.parse(text);
    if (raw?.format !== FORMAT || raw.version !== VERSION || typeof raw.scoreCode !== "string") {
      throw new Error("Unsupported arcade backup");
    }
    return { scoreCode: raw.scoreCode, scores: global.ArcadeScores.parseCode(raw.scoreCode),
      favorites: global.ArcadeFavorites.parseSnapshot(raw.favorites),
      controls: global.ArcadeControls.parseSnapshot(raw.controls) };
  }

  function restore(text) {
    const parsed = parseSnapshot(text);
    global.ArcadeScores.importCode(parsed.scoreCode);
    const favorites = global.ArcadeFavorites.restore(parsed.favorites);
    const controls = global.ArcadeControls.restore(parsed.controls);
    return { persistDenied: global.ArcadeScores.persistenceStatus().persistDenied ||
      favorites.persistDenied || controls.persistDenied };
  }

  global.ArcadeBackup = Object.freeze({ MAX_BYTES, exportSnapshot, parseSnapshot, restore });
})(window);
