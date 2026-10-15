/* Header overflow actions share the existing Help and Portfolio handlers. */
(function () {
  "use strict";
  const root = document.getElementById("more-menu");
  const button = document.getElementById("btn-more");
  const menu = document.getElementById("more-menu-list");
  if (!root || !button || !menu) return;
  const items = [...menu.querySelectorAll('[role="menuitem"]')];
  function close(restoreFocus = false) {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (restoreFocus) button.focus();
  }
  function open() {
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    items[0]?.focus();
  }
  button.addEventListener("click", () => menu.hidden ? open() : close());
  button.addEventListener("keydown", (event) => {
    if (!["Enter", " ", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    open();
  });
  menu.addEventListener("keydown", (event) => {
    const index = items.indexOf(document.activeElement);
    let next;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    items[next].focus();
  });
  // Close before actions run so Help can take focus in its modal.
  menu.addEventListener("click", (event) => {
    if (event.target.closest('[role="menuitem"]')) close(true);
  }, true);
  document.addEventListener("click", (event) => {
    if (!root.contains(event.target)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (menu.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") {
      // Return to the trigger before the native Tab moves to the next control.
      close(true);
    }
  });
})();
