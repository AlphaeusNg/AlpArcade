import { expect, test } from "@playwright/test";

const runtimeErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.route(/^https:\/\//, async (route) => {
    const resourceType = route.request().resourceType();
    const contentType = resourceType === "stylesheet"
      ? "text/css"
      : resourceType === "document"
        ? "text/html"
        : "application/javascript";
    await route.fulfill({ status: 200, contentType, body: "" });
  });
});

test.afterEach(async ({ page }) => {
  await page.waitForTimeout(100);
  expect(runtimeErrors.get(page), "unexpected browser runtime errors").toEqual([]);
});

test("opens, plays, and leaves a lazy-loaded cabinet", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#site-version")).toContainText("AlpArcade");

  const cabinet = page.locator('[data-game="tictactoe"]');
  await expect(cabinet).toBeVisible();
  await cabinet.click();

  await expect(page.locator("#lobby")).toBeHidden();
  await expect(page.locator("#play-view")).toBeVisible();
  await expect(page.locator("#play-title")).toHaveText("Tic-Tac-Toe");
  await expect(page).toHaveURL(/#play\/tictactoe$/);

  const cells = page.locator("#ttt-board .ttt-cell");
  await expect(cells).toHaveCount(9);
  await cells.first().click();
  await expect(cells.first()).toHaveText("X");
  await expect(page.locator("#ttt-board .ttt-cell.filled")).toHaveCount(2);
  await expect(page.locator("#ttt-status")).toHaveText("Your move");

  await page.locator("#btn-back").click();
  await expect(page.locator("#lobby")).toBeVisible();
  await expect(page.locator("#play-view")).toBeHidden();
  await expect(page.locator("#game-mount")).toBeEmpty();
  await expect(page).not.toHaveURL(/#play\//);
  await expect(cabinet).toBeFocused();
});
