import { expect, test } from "@playwright/test";

test("Pulse Grid keeps running when the locked view starts below the top", async ({ page }) => {
  test.setTimeout(30_000);
  await page.addInitScript(() => {
    localStorage.setItem("alphaeus-arcade-v1", JSON.stringify({ xp: 10000 }));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#play/jubeat", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#jb-start")).toBeVisible();
  await page.locator("#jb-start").click();
  await expect(page.locator("#btn-fullscreen")).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 520));
  await page.locator("#btn-fullscreen").click();

  const locked = await page.evaluate(() => {
    const view = document.querySelector("#play-view").getBoundingClientRect();
    return {
      top: view.top,
      height: view.height,
      innerHeight: window.innerHeight,
      offset: getComputedStyle(document.body).getPropertyValue("--game-view-scroll-offset").trim(),
      fullscreen: document.querySelector("#play-view").classList.contains("is-app-fullscreen"),
    };
  });
  expect(locked.fullscreen).toBe(true);
  expect(locked.offset).toBe("0px");
  expect(Math.abs(locked.top)).toBeLessThan(2);
  expect(locked.height).toBeGreaterThan(locked.innerHeight * 0.9);

  await expect(page.locator("#jb-playfield")).toBeVisible();
  await expect(page.locator("#jb-pause")).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator("#jb-pause-overlay")).toBeHidden();

  const grid = await page.locator("#jb-grid").boundingBox();
  expect(grid).toBeTruthy();
  expect(grid.y).toBeGreaterThanOrEqual(0);
  expect(grid.y).toBeLessThan(locked.innerHeight * 0.8);

  const seek = await page.evaluate(() => {
    const audio = document.querySelector("#jb-audio");
    if (!audio || audio.paused || !Number.isFinite(audio.currentTime)) return { armed: false };
    const before = audio.currentTime;
    audio.currentTime = Math.max(0, before - 0.45);
    return { armed: true, before, after: audio.currentTime };
  });
  if (seek.armed) await page.waitForTimeout(300);
  await expect(page.locator("#jb-pause-overlay")).toBeHidden();
  await expect(page.locator("#jb-pause")).toBeEnabled();
});
