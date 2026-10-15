import { expect, test } from "@playwright/test";

const runtimeErrors = new WeakMap();
const games = {
  tictactoe: ".ttt-board", snake: "#snake-canvas", breaker: "#br-canvas",
  tapper: "#tap-grid", reaction: "#rx-pad", shooter: "#sh-canvas",
  memory: "#mem-grid", jubeat: "#jb-setup",
};
async function enlargeText(page) {
  await page.evaluate(() => {
    const nodes = [...document.querySelectorAll("body *")];
    nodes.forEach((el) => {
      if (el.dataset.sizingFont !== undefined) el.style.fontSize = el.dataset.sizingFont;
      else el.dataset.sizingFont = el.style.fontSize;
    });
    const sizes = nodes.map((el) => parseFloat(getComputedStyle(el).fontSize) * 2);
    nodes.forEach((el, i) => { el.style.fontSize = `${sizes[i]}px`; });
  });
}
async function fitsPage(page, width) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}
async function noOverlap(page, selector) {
  expect(await page.locator(selector).evaluateAll((nodes) => {
    const boxes = nodes.filter((el) => el.checkVisibility()).map((el) => el.getBoundingClientRect());
    return boxes.every((a, i) => boxes.slice(i + 1).every((b) =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1 ||
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 1));
  })).toBe(true);
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/^https:\/\//, (route) => route.fulfill({ status: 200, body: "" }));
  await page.addInitScript(() => localStorage.setItem("alphaeus-arcade-v1", JSON.stringify({ xp: 10000 })));
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});

for (const width of [320, 375, 768, 1280]) {
  for (const doubled of [false, true]) {
    test(`lobby and all cabinets fit ${width}px${doubled ? " with doubled text" : ""}`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.locator("#site-version")).toContainText("AlpArcade");
      if (doubled) await enlargeText(page);
      await fitsPage(page, width);
      await noOverlap(page, ".topbar > .brand, .topbar > .top-nav");
      await noOverlap(page, ".top-nav > *");
      expect(await page.locator(".cab-fav").evaluateAll((buttons) => buttons.every((button) => {
        const rect = button.getBoundingClientRect(); return rect.width >= 24 && rect.height >= 24;
      }))).toBe(true);
      for (const [id, ready] of Object.entries(games)) {
        await page.evaluate((id) => { location.hash = `play/${id}`; }, id);
        await expect(page.locator(ready)).toBeVisible();
        if (doubled) await enlargeText(page);
        await fitsPage(page, width);
        await noOverlap(page, ".play-bar > *");
        if (id === "snake") {
          const box = await page.locator("#snake-canvas").boundingBox();
          expect(Math.abs(box.width - box.height)).toBeLessThan(1);
        }
        if (id === "jubeat") {
          expect(await page.locator(".jb-marker-btn").evaluateAll((buttons) => buttons.every((button) =>
            button.scrollWidth <= button.clientWidth + 1))).toBe(true);
        }
        await page.locator("#btn-back").evaluate((el) => el.click());
      }
    });
  }
}

test("enlarged help scrolls to its close action and native import/reset stay browser-owned", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await enlargeText(page);
  await page.locator("#btn-more").click();
  await page.locator("#btn-help").evaluate((el) => el.click());
  const card = page.locator("#help-modal .cloud-modal-card");
  const box = await card.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(568);
  const close = page.getByRole("button", { name: "Got it", exact: true });
  await close.scrollIntoViewIfNeeded();
  await close.click();
  await expect(page.locator("#help-modal")).toBeHidden();
  const types = [];
  page.on("dialog", async (dialog) => { types.push(dialog.type()); await dialog.dismiss(); });
  await page.locator("#scores-tools > summary").click();
  await page.locator("#btn-import").click();
  await page.locator("#btn-reset").click();
  expect(types).toEqual(["prompt", "confirm"]);
});

test("phone touch-size choices and dock closure preserve layout and player", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/#play/snake");
  await expect(page.locator("#snake-canvas")).toBeVisible();
  await page.locator(".ctrl-prefs-toggle").click();
  for (const scale of [0.75, 1.45]) {
    await page.evaluate((scale) => {
      ArcadeControls.setTouch("snake", { scale, place: "right" });
      ArcadeControls.applyTouch(document.getElementById("snake-touch"), "snake");
    }, scale);
    await fitsPage(page, 320);
    const box = await page.locator("#snake-touch .dpad").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  await page.locator("#nav-music").click();
  const frame = page.locator("#bg-music-frame");
  const src = await frame.getAttribute("src");
  await frame.evaluate((el) => { el.dataset.sizingIdentity = "same-player"; });
  await page.locator("#music-dock-close").click();
  await expect(frame).toHaveAttribute("src", src);
  await expect(frame).toHaveAttribute("data-sizing-identity", "same-player");
  await fitsPage(page, 320);
});


test("enlarged phone pause dialogs keep every end-run action reachable", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 568 });
  const cases = [
    ["snake", "#snake-start", "#snake-pause", "#snake-pause-overlay", "#snake-bank"],
    ["shooter", "#sh-start", "#sh-pause", "#sh-pause-overlay", "#sh-bank"],
    ["breaker", "#br-start", "#br-pause", "#br-pause-overlay", "#br-bank"],
    ["tapper", "#tap-start", "#tap-pause", "#tap-pause-overlay", "#tap-bank"],
    ["memory", ".mem-card", "#mem-pause", "#mem-pause-overlay", "#mem-bank"],
    ["jubeat", "#jb-start", "#jb-pause", "#jb-pause-overlay", "#jb-exit-song"],
  ];
  for (const [id, start, pause, overlay, end] of cases) {
    await page.goto(`/#play/${id}`);
    await expect(page.locator(games[id])).toBeVisible();
    await page.locator(start).first().click();
    await expect(page.locator(pause)).toBeEnabled({ timeout: 15_000 });
    await page.locator(pause).click();
    await expect(page.locator(overlay)).toBeVisible();
    await enlargeText(page);
    await fitsPage(page, 320);
    await page.locator(end).scrollIntoViewIfNeeded();
    const box = await page.locator(end).boundingBox();
    const panel = await page.locator(overlay).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(panel.x);
    expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
    expect(box.y).toBeGreaterThanOrEqual(panel.y);
    expect(box.y + box.height).toBeLessThanOrEqual(panel.y + panel.height + 1);
    await page.locator(end).click();
    await expect(page.locator(overlay)).toBeHidden();
  }
});


test("enlarged chart editor keeps timeline labels and save actions readable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/#play/jubeat");
  await page.locator("#jb-custom-new").click();
  await page.locator("#jb-editor-manual").click();
  await enlargeText(page);
  await fitsPage(page, 320);
  expect(await page.locator(".jb-editor-timeline button").evaluateAll((buttons) => buttons.every((button) =>
    button.scrollWidth <= button.clientWidth + 1))).toBe(true);
  expect(await page.locator(".jb-editor-save-actions button").evaluateAll((buttons) => buttons.every((button) => {
    const rect = button.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth;
  }))).toBe(true);
  const lastStep = page.locator("#jb-editor-timeline button").last();
  const stepIndex = Number(await lastStep.getAttribute("data-editor-step"));
  await lastStep.scrollIntoViewIfNeeded();
  await lastStep.click();
  await expect(page.locator("#jb-editor-step-label")).toHaveText(`STEP ${stepIndex + 1} / 16`);
});

test("390px lobby keeps music clear of cabinets and separates the fold row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".cab-fav").first()).toBeVisible();
  const tab = page.locator("#music-dock-tab");
  for (const card of await page.locator(".cabinet").all()) {
    await card.scrollIntoViewIfNeeded();
    const music = await tab.boundingBox();
    const cabinet = await card.boundingBox();
    if (music) {
      expect(
        music.x + music.width <= cabinet.x || cabinet.x + cabinet.width <= music.x ||
        music.y + music.height <= cabinet.y || cabinet.y + cabinet.height <= music.y,
      ).toBe(true);
    }
  }
  await page.evaluate(() => scrollTo(0, 0));
  const row = await page.locator(".lobby-fold-row").boundingBox();
  const heading = await page.locator("#cabinets > h2").boundingBox();
  expect(heading.y - row.y - row.height).toBeGreaterThanOrEqual(16);
  await expect(page.locator("#nav-music")).toBeVisible();
  await page.locator("#nav-music").click();
  await expect(page.locator("#music-dock-panel")).toBeVisible();
  await page.locator("#music-dock-close").click();
  await expect(page.locator("#music-dock-panel")).toBeHidden();
});
