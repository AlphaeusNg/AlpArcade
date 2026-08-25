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

test("locked cabinets keep identity and stay unplayable", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const cabinet = page.locator('[data-game="jubeat"]');
  await expect(cabinet).toBeVisible();
  await expect(cabinet).toHaveClass(/is-locked/);
  await expect(cabinet.locator(".cab-lock")).toHaveText("Lv 15");
  await expect(cabinet.locator(".cab-desc")).toContainText("Lv 15");
  await expect(cabinet.locator(".cab-best")).toHaveText("No runs yet");
  await expect(cabinet.locator(".cab-best")).not.toContainText("Reach Lv");
  await cabinet.click({ force: true });
  await expect(page.locator("#lobby")).toBeVisible();
  await expect(page.locator("#play-view")).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Reach Lv 15");
});

test("lobby recaps and shares the last run after reload", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "alparcade-last-run-v1",
      JSON.stringify({ gameId: "snake", score: 12, isHighScore: true, label: "Snake" })
    );
    window.__copied = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__copied.push(text);
        },
      },
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#daily-last-run")).toContainText("Snake");
  await expect(page.locator("#daily-last-run")).toContainText("best");
  await page.locator("#btn-daily-share").click();
  const copied = await page.evaluate(() => window.__copied.at(-1));
  expect(copied).toContain("Snake");
  expect(copied).toContain("12");
});

test("continue last cabinet sits beside the daily play CTA", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#btn-daily-play")).toBeVisible();
  await expect(page.locator("#btn-daily-continue")).toHaveCount(0);

  await page.locator('[data-game="tictactoe"]').click();
  await expect(page.locator("#play-title")).toHaveText("Tic-Tac-Toe");
  await page.locator("#btn-back").click();

  await expect(page.locator("#btn-daily-play")).toBeVisible();
  await expect(page.locator("#btn-daily-continue")).toHaveText("Continue Tic-Tac-Toe");
  await page.locator("#btn-daily-continue").click();
  await expect(page.locator("#play-title")).toHaveText("Tic-Tac-Toe");
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

test("keeps achievement progress visible when device storage rejects it", async ({ page }) => {
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "alparcade-achievements-v1") {
        throw new DOMException("storage denied", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };
    window.__achievementSaveErrors = 0;
    window.addEventListener("arcade:achievement-save-error", () => {
      window.__achievementSaveErrors += 1;
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#site-version")).toContainText("AlpArcade");

  const result = await page.evaluate(() => {
    window.ArcadeAchievements.unlock("first-run");
    window.ArcadeAchievements.unlock("ttt-win");
    return {
      count: window.ArcadeAchievements.count().have,
      firstRun: window.ArcadeAchievements.isUnlocked("first-run"),
      saveErrors: window.__achievementSaveErrors,
    };
  });

  expect(result).toEqual({ count: 2, firstRun: true, saveErrors: 1 });
  await expect(page.locator("#toast")).toBeVisible();
  await expect(page.locator("#toast")).toContainText("enable site storage");
});

test("keeps score progress visible when device storage rejects it", async ({ page }) => {
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "alphaeus-arcade-v1") {
        throw new DOMException("storage denied", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };
    window.__scoreSaveErrors = 0;
    window.addEventListener("arcade:score-save-error", () => {
      window.__scoreSaveErrors += 1;
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#site-version")).toContainText("AlpArcade");

  const result = await page.evaluate(() => {
    window.ArcadeScores.submitScore("snake", 50);
    window.ArcadeScores.submitScore("snake", 75);
    document.querySelector("#name-input").value = "Session Player";
    document.querySelector("#name-form").dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true })
    );
    const state = window.ArcadeScores.getState();
    return {
      xp: state.xp,
      gamesPlayed: state.gamesPlayed,
      best: state.highScores.snake.best,
      history: state.history.length,
      saveErrors: window.__scoreSaveErrors,
    };
  });

  expect(result.gamesPlayed).toBe(2);
  expect(result.best).toBe(75);
  expect(result.history).toBe(2);
  expect(result.saveErrors).toBe(1);
  await expect(page.locator("#player-name-display")).toHaveText("Session Player");
  await expect(page.locator("#xp-display")).toHaveText(`${result.xp} XP`);
  await expect(page.locator("#games-played")).toHaveText("2");
  await expect(page.locator("#toast")).toBeVisible();
  await expect(page.locator("#toast")).toContainText("enable site storage");
});

test("keeps completed daily progress visible when device storage rejects it", async ({ page }) => {
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "alparcade-daily-v1") {
        throw new DOMException("storage denied", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };
    window.__dailySaveErrors = 0;
    window.addEventListener("arcade:daily-save-error", () => {
      window.__dailySaveErrors += 1;
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#site-version")).toContainText("AlpArcade");

  const result = await page.evaluate(() => {
    const challenge = window.ArcadeDaily.challengeFor();
    const score = challenge.game === "tictactoe" ? 1 : challenge.target;
    const meta = challenge.game === "tictactoe" ? { result: "win" } : {};
    window.ArcadeDaily.markAttempt(challenge.game, score, meta);
    window.ArcadeDaily.markAttempt(challenge.game, score, meta);
    return {
      complete: window.ArcadeDaily.isComplete(),
      durable: Boolean(window.localStorage.getItem("alparcade-daily-v1")),
      saveErrors: window.__dailySaveErrors,
    };
  });

  expect(result).toEqual({ complete: true, durable: false, saveErrors: 1 });
  await expect(page.locator("#daily-card .daily-badge")).toHaveText("Done ✓");
  await expect(page.locator("#toast")).toBeVisible();
  await expect(page.locator("#toast")).toContainText("enable site storage");
});

test("does not claim a factory reset succeeded when achievement removal is denied", async ({ page }) => {
  await page.addInitScript(() => {
    const key = "alparcade-achievements-v1";
    Storage.prototype.setItem.call(
      localStorage,
      key,
      JSON.stringify({ unlocked: { "first-run": 1000 }, seen: {} }),
    );
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function removeItem(storageKey) {
      if (storageKey === key) {
        throw new DOMException("storage denied", "SecurityError");
      }
      return originalRemoveItem.call(this, storageKey);
    };
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#achievements-count")).toContainText("1 /");
  await page.locator("#btn-reset").click();

  await expect(page.locator("#toast")).toContainText(
    /Reset failed: Achievement data couldn't be reset/i,
  );
  await expect(page.locator("#achievements-count")).toContainText("1 /");
  await expect.poll(() => page.evaluate(() => (
    window.ArcadeAchievements.isUnlocked("first-run")
  ))).toBe(true);
});

test("does not claim a factory reset succeeded when score removal is denied", async ({ page }) => {
  await page.addInitScript(() => {
    const key = "alphaeus-arcade-v1";
    Storage.prototype.setItem.call(
      localStorage,
      key,
      JSON.stringify({
        playerName: "Reset Player",
        xp: 42,
        gamesPlayed: 3,
        highScores: { snake: { best: 75 } },
      }),
    );
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function removeItem(storageKey) {
      if (storageKey === key) {
        throw new DOMException("storage denied", "SecurityError");
      }
      return originalRemoveItem.call(this, storageKey);
    };
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#player-name-display")).toHaveText("Reset Player");
  await expect(page.locator("#xp-display")).toHaveText("42 XP");
  await expect(page.locator("#games-played")).toHaveText("3");
  await page.locator("#btn-reset").click();

  await expect(page.locator("#toast")).toContainText(
    /Reset failed: Score data couldn't be reset/i,
  );
  await expect(page.locator("#player-name-display")).toHaveText("Reset Player");
  await expect(page.locator("#xp-display")).toHaveText("42 XP");
  await expect(page.locator("#games-played")).toHaveText("3");
  await expect.poll(() => page.evaluate(() => window.ArcadeScores.getState().xp)).toBe(42);
});

test("does not claim a factory reset succeeded when daily-progress removal is denied", async ({ page }) => {
  await page.addInitScript(() => {
    const key = "alparcade-daily-v1";
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Singapore",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    Storage.prototype.setItem.call(
      localStorage,
      key,
      JSON.stringify({ [day]: { done: true, score: 999999, at: Date.now() } }),
    );
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function removeItem(storageKey) {
      if (storageKey === key) {
        throw new DOMException("storage denied", "SecurityError");
      }
      return originalRemoveItem.call(this, storageKey);
    };
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#daily-card .daily-badge")).toHaveText("Done ✓");
  await page.locator("#btn-reset").click();

  await expect(page.locator("#toast")).toContainText(
    /Reset failed: Daily challenge progress couldn't be reset/i,
  );
  await expect(page.locator("#daily-card .daily-badge")).toHaveText("Done ✓");
  await expect.poll(() => page.evaluate(() => window.ArcadeDaily.isComplete())).toBe(true);
});

test("keeps cloud reset retention and deletion outcomes honest", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.__wipeResult = {
      ok: true,
      players: "keep-failed",
      errors: [],
      warnings: ["players: username retention failed"],
    };
    window.ArcadeCloud.getState = () => ({ signedIn: true, leaderboardGame: "all" });
    window.ArcadeCloud.wipeAccountData = async () => window.__wipeResult;
    window.ArcadeCloud.loadLeaderboard = async () => [];
  });

  await page.locator("#btn-reset").click();
  await expect(page.locator("#toast")).toContainText(
    "Data wiped; username retention could not be confirmed",
  );

  await page.evaluate(() => {
    window.__wipeResult = {
      ok: false,
      players: "kept",
      errors: ["scores: delete denied"],
      warnings: [],
    };
  });
  await page.locator("#btn-reset").click();
  await expect(page.locator("#toast")).toContainText("Cloud wipe incomplete: scores: delete denied");
  await expect(page.locator("#toast")).not.toContainText("Clean slate");
});
