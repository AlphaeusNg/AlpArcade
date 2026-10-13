/** Visit-only catalog discovery. Never changes cabinet locks or loads games. */
(function (global) {
  "use strict";
  const doc = global.document;
  const search = doc.getElementById("cab-search");
  const style = doc.getElementById("cab-style");
  const remappable = doc.getElementById("cab-remappable");
  const playable = doc.getElementById("cab-playable");
  const status = doc.getElementById("cab-filter-status");
  const summary = doc.getElementById("cab-discovery-summary");
  if (!search || !style || !remappable || !playable || !status || !summary) return;

  function refresh() {
    const cards = [...doc.querySelectorAll(".cabinet-grid .cabinet[data-game]")];
    const query = search.value.trim().toLowerCase();
    let count = 0;
    for (const card of cards) {
      const name = card.querySelector("strong")?.textContent.toLowerCase() || "";
      const matches = name.includes(query) &&
        (style.value === "all" || card.dataset.style === style.value) &&
        (!remappable.checked || global.ArcadeControls?.isActionGame(card.dataset.game)) &&
        (!playable.checked || card.getAttribute("aria-disabled") !== "true");
      // Favorite controls must disappear along with their cabinet.
      const slot = card.closest(".cabinet-slot") || card;
      slot.hidden = !matches;
      if (matches) count += 1;
    }
    const message = `${count} of ${cards.length} cabinets`;
    if (status.textContent !== message) status.textContent = message;
    const active = query || style.value !== "all" || remappable.checked || playable.checked;
    summary.textContent = active ? `Find a game · ${message}` : "Find a game";
    doc.getElementById("cab-filter-empty").hidden = count !== 0;
  }

  search.addEventListener("input", refresh);
  for (const control of [style, remappable, playable]) control.addEventListener("change", refresh);
  doc.getElementById("cab-filter-clear").addEventListener("click", () => {
    search.value = "";
    style.value = "all";
    remappable.checked = false;
    playable.checked = false;
    refresh();
    search.focus({ preventScroll: true });
  });
  global.ArcadeDiscovery = Object.freeze({ refresh });
})(window);
