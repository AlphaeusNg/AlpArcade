import { expect, test } from "@playwright/test";

test("explains visit-only favorites when storage is denied", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https:\/\//, route => route.fulfill({
    contentType: route.request().resourceType() === "stylesheet" ? "text/css" : "application/javascript",
    body: "",
  }));
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "alparcade-favorites-v1") throw new DOMException("Denied", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-fav="snake"]').click();
  await expect(page.locator("#cab-quick-status")).toBeVisible();
  await expect(page.locator("#cab-quick-status")).toContainText("stay for this visit");
  await page.locator('#cab-quick [data-launch="snake"]').click();
  await expect(page).toHaveURL(/#play\/snake$/);
  await expect(page.locator("#play-title")).toHaveText("Snake");
  expect(errors).toEqual([]);
});
