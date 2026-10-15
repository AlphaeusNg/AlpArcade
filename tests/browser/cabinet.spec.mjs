import { expect, test } from "@playwright/test";

const runtimeErrors = new WeakMap();
const FREE_CABINET_IDS = ["snake", "tictactoe", "tapper", "breaker"];

async function openFold(page, id) {
  const details = page.locator(id);
  if (await details.evaluate((element) => element.open)) return;
  await page.locator(`${id} > summary`).click();
}

async function distinctFreeCabinets(page, excluded, count = 1) {
  return page.evaluate(
    ({ ids, excludedId, limit }) => ids
      .filter((id) => id !== excludedId)
      .slice(0, limit)
      .map((gameId) => ({
        gameId,
        label: window.ArcadeScores.GAMES[gameId].label,
      })),
    { ids: FREE_CABINET_IDS, excludedId: excluded, limit: count },
  );
}

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

test("initializes the lobby without waiting for Google Fonts", async ({ page }) => {
  let releaseFont;
  let sawFontRequest;
  const fontRequested = new Promise((resolve) => {
    sawFontRequest = resolve;
  });
  const fontReleased = new Promise((resolve) => {
    releaseFont = resolve;
  });
  await page.route("https://fonts.googleapis.com/**", async (route) => {
    sawFontRequest();
    await fontReleased;
    await route.fulfill({ status: 200, contentType: "text/css", body: "" });
  });

  const navigation = page.goto("/", { waitUntil: "domcontentloaded" });
  await fontRequested;
  try {
    await expect(page.locator("#daily-card .daily-badge")).toBeVisible();
  } finally {
    releaseFont();
  }
  await navigation;
  await expect(page.locator('link[href^="https://fonts.googleapis.com/"]')).toHaveAttribute("media", "all");
});

test("locked cabinets keep identity and stay unplayable", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const cabinet = page.locator('[data-game="jubeat"]');
  await expect(cabinet).toBeVisible();
  await expect(cabinet).toHaveClass(/is-locked/);
  await expect(cabinet.locator(".cab-lock")).toHaveText(/Lv 15 · \d+ XP to go/);
  const tooltip = cabinet.locator('[role="tooltip"]');
  await expect(tooltip).toBeHidden();
  for (const tip of await page.locator(".is-locked .cab-lock").all()) await expect(tip).toBeHidden();
  await expect(cabinet).toHaveAccessibleDescription(/XP to go/);
  await expect(cabinet).toHaveAttribute("aria-describedby", await tooltip.getAttribute("id"));
  await expect(cabinet).not.toHaveAttribute("title");
  await cabinet.hover();
  await expect(tooltip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();
  await page.keyboard.press("Tab");
  await cabinet.focus();
  await expect(tooltip).toBeVisible();
  await cabinet.blur();
  await expect(tooltip).toBeHidden();
  await expect(cabinet.locator(".cab-desc")).toContainText("Lv 15");
  await expect(cabinet.locator(".cab-best")).toHaveText("No runs yet");
  await expect(cabinet.locator(".cab-best")).not.toContainText("Reach Lv");
  await cabinet.click({ force: true });
  await expect(page.locator("#lobby")).toBeVisible();
  await expect(page.locator("#play-view")).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Reach Lv 15");
});

test("touch toggles locked requirements and preserves free cabinet navigation", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route(/^https:\/\//, route => route.fulfill({ status: 200, body: "" }));
  try {
    await page.goto("/");
    const card = page.locator('[data-game="shooter"]');
    const tip = card.locator('[role="tooltip"]');
    await expect(tip).toBeHidden();
    await expect(card.locator(".cab-desc")).toContainText("Lv 5");
    await expect(card).toHaveAccessibleDescription(/XP to go/);
    await card.tap({ force: true });
    await expect(tip).toBeVisible();
    await expect(page.locator(".lock-announcement")).toContainText("XP to go");
    await card.tap({ force: true });
    await expect(tip).toBeHidden();
    await card.tap({ force: true });
    await expect(tip).toBeVisible();
    await page.locator("#daily-card .eyebrow").tap();
    await expect(tip).toBeHidden();
    await page.locator('[data-game="tictactoe"]').tap();
    await expect(page.locator("#play-view")).toBeVisible();
    await page.goto("/#play/tictactoe");
    await expect(page.locator("#play-view")).toBeVisible();
    await page.goto("/#play/shooter");
    await expect(page.locator("#lobby")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("Help isolates the arcade, traps focus, and returns it to the launcher", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const launcher = page.locator("#btn-help");
  const modal = page.locator("#help-modal");
  const closeButton = modal.locator("[data-close-help]").last();
  await page.locator("#btn-more").click();
  await launcher.click();

  await expect(modal).toBeVisible();
  await expect(closeButton).toBeFocused();
  await expect(page.locator("main")).toHaveJSProperty("inert", true);
  await expect(page.locator(".topbar")).toHaveJSProperty("inert", true);

  await page.keyboard.press("Tab");
  await expect(closeButton).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(closeButton).toBeFocused();

  await closeButton.click();
  await expect(modal).toBeHidden();
  await expect(page.locator("#btn-more")).toBeFocused();
  await expect(page.locator("main")).toHaveJSProperty("inert", false);
  await expect(page.locator(".topbar")).toHaveJSProperty("inert", false);
});

test("cloud save keeps keyboard focus inside its shared dialog boundary", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.ArcadeScores.submitScore("snake", 4, { eaten: 4 });
  });

  await openFold(page, "#scores-tools");
  const launcher = page.locator("#btn-share-cloud");
  const modal = page.locator("#cloud-save-modal");
  const goButton = page.locator("#btn-cloud-save-go");
  const skipButton = page.locator("#btn-cloud-save-skip");
  await launcher.click();

  await expect(modal).toBeVisible();
  await expect(goButton).toBeFocused();
  await expect(page.locator("main")).toHaveJSProperty("inert", true);
  await page.keyboard.press("Shift+Tab");
  await expect(skipButton).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(goButton).toBeFocused();

  await skipButton.click();
  await expect(modal).toBeHidden();
  await expect(launcher).toBeFocused();
  await expect(page.locator("main")).toHaveJSProperty("inert", false);
});

test("Pulse Grid keeps separate Easy, Medium, and Hard highs for each song", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("alphaeus-arcade-v1", JSON.stringify({
      playerName: "Chart Player",
      xp: 10000,
      gamesPlayed: 3,
      highScores: {
        jubeat: {
          best: 765432,
          songs: {
            imsosohappy: { easy: 123456, medium: 456789, extreme: 765432 },
          },
        },
      },
      history: [],
      hallOfFame: [],
    }));
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const cabinet = page.locator('[data-game="jubeat"]');
  await expect(cabinet).not.toHaveClass(/is-locked/);
  await cabinet.click();

  const bests = page.locator("#jb-song-detail-bests");
  await expect(bests.locator('[data-best-difficulty="easy"]')).toContainText("123,456");
  await expect(bests.locator('[data-best-difficulty="medium"]')).toContainText("456,789");
  await expect(bests.locator('[data-best-difficulty="extreme"]')).toContainText("765,432");
  await expect(bests).toHaveAttribute("aria-label", /Easy, Medium, and Hard/);

  await page.locator('#jb-songs [data-s="1"]').click();
  await expect(bests.locator(".jb-song-best")).toHaveCount(3);
  await expect(bests).not.toContainText("123,456");
});

test("Pulse Grid pause traps Tab and restores visible focus on every exit", async ({ page }) => {
  test.setTimeout(45_000);
  await page.addInitScript(() => {
    localStorage.setItem("alphaeus-arcade-v1", JSON.stringify({ xp: 10000 }));
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-game="jubeat"]').click();
  await page.locator("#jb-start").click();
  const pause = page.locator("#jb-pause");
  const resume = page.locator("#jb-resume");
  const restart = page.locator("#jb-restart-song");
  const end = page.locator("#jb-exit-song");
  await expect(pause).toBeEnabled({ timeout: 15_000 });
  await pause.click();
  await expect(resume).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(end).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(resume).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(restart).toBeFocused();
  await resume.click();
  await expect(resume).toBeDisabled();
  await page.keyboard.press("Tab");
  await expect(restart).toBeFocused();
  await expect(page.locator("#jb-pause-overlay")).toBeHidden();
  await expect(pause).toBeFocused();
  await pause.click();
  await restart.click();
  await expect(page.locator("#jb-pause-overlay")).toBeHidden();
  await expect(page.locator("#jb-grid")).toBeFocused();
  await expect(pause).toBeEnabled({ timeout: 15_000 });
  await pause.click();
  await end.click();
  await expect(page.locator("#jb-results")).toBeVisible();
  await expect(page.locator("#jb-results")).toBeFocused();
});

test("lobby recaps and shares the last run after reload", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
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
  const dailyGame = await page.locator("#btn-daily-play").getAttribute("data-daily-game");
  const [replay] = await distinctFreeCabinets(page, dailyGame);
  await page.evaluate(({ gameId, label }) => {
    localStorage.setItem(
      "alparcade-last-run-v1",
      JSON.stringify({ gameId, score: 12, isHighScore: true, label }),
    );
    localStorage.setItem("alparcade-last-cabinet-v1", gameId);
  }, replay);
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.locator("#daily-last-run")).toContainText(replay.label);
  await expect(page.locator("#daily-last-run")).toContainText("best");
  await expect(page.locator("#btn-daily-play")).toBeVisible();
  await expect(page.locator("#btn-daily-share")).toBeVisible();
  await expect(page.locator("#btn-daily-replay")).toHaveText(`Replay ${replay.label}`);
  await expect(page.locator("#btn-daily-continue")).toHaveCount(0);
  await expect(page.locator("#daily-card")).not.toContainText(`Continue ${replay.label}`);
  await expect(page.locator(".daily-last-run")).toHaveCSS("flex-wrap", "nowrap");
  await expect(page.locator(".daily-actions")).toHaveCSS("flex-wrap", "nowrap");
  await expect(page.locator(".cabinet-grid [data-game]").first()).toBeInViewport({ ratio: 1 });
  await page.locator("#btn-daily-share").click();
  const copied = await page.evaluate(() => window.__copied.at(-1));
  expect(copied).toContain(replay.label);
  expect(copied).toContain("12");
  expect(copied).toContain(`#play/${replay.gameId}`);
  await page.locator("#btn-daily-replay").click();
  await expect(page.locator("#play-title")).toHaveText(replay.label);
  await expect(page).toHaveURL(new RegExp(`#play/${replay.gameId}$`));
});

test("daily play owns a duplicate rematch and the 320px recap stays contained", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const dailyGame = await page.locator("#btn-daily-play").getAttribute("data-daily-game");
  expect(dailyGame).toBeTruthy();

  await page.evaluate((gameId) => {
    ArcadeFavorites.toggle(gameId);
    localStorage.setItem(
      "alparcade-last-run-v1",
      JSON.stringify({
        gameId,
        score: 123456,
        isHighScore: true,
        label: "A deliberately long last-run cabinet label",
      }),
    );
    localStorage.setItem("alparcade-last-cabinet-v1", gameId);
  }, dailyGame);
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.locator(`#cab-quick [data-launch="${dailyGame}"]`)).toHaveCount(1);
  await expect(page.locator("#btn-daily-play")).toBeVisible();
  await expect(page.locator("#btn-daily-replay")).toHaveCount(0);
  await expect(page.locator("#btn-daily-continue")).toHaveCount(0);
  const copy = page.locator(".daily-last-run-copy");
  await expect(copy).toHaveCSS("text-overflow", "ellipsis");
  const sizing = await page.locator("#daily-card").evaluate((card) => {
    const line = card.querySelector(".daily-last-run");
    const recap = card.querySelector(".daily-last-run-copy");
    return {
      cardContained: card.scrollWidth <= card.clientWidth,
      lineContained: line.scrollWidth <= line.clientWidth,
      copyTruncated: recap.scrollWidth > recap.clientWidth,
    };
  });
  expect(sizing).toEqual({ cardContained: true, lineContained: true, copyTruncated: true });
});

test("continue last cabinet sits beside the daily play CTA", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#btn-daily-play")).toBeVisible();
  await expect(page.locator("#btn-daily-continue")).toHaveCount(0);
  const dailyGame = await page.locator("#btn-daily-play").getAttribute("data-daily-game");
  const [continueCabinet] = await distinctFreeCabinets(page, dailyGame);
  expect(continueCabinet).toBeTruthy();

  await page.locator(`[data-game="${continueCabinet.gameId}"]`).click();
  await expect(page.locator("#play-title")).toHaveText(continueCabinet.label);
  await page.locator("#btn-back").click();

  await expect(page.locator("#btn-daily-play")).toBeVisible();
  await expect(page.locator("#btn-daily-continue")).toHaveText(`Continue ${continueCabinet.label}`);
  await page.locator("#btn-daily-continue").click();
  await expect(page.locator("#play-title")).toHaveText(continueCabinet.label);
});

test("continue last cabinet stays when it is distinct from last-run replay", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const dailyGame = await page.locator("#btn-daily-play").getAttribute("data-daily-game");
  const choices = await distinctFreeCabinets(page, dailyGame, 2);
  const [replay, nextCabinet] = choices;
  expect(replay).toBeTruthy();
  expect(nextCabinet).toBeTruthy();
  await page.evaluate(({ gameId, label }) => {
    localStorage.setItem(
      "alparcade-last-run-v1",
      JSON.stringify({ gameId, score: 12, isHighScore: true, label }),
    );
    localStorage.setItem("alparcade-last-cabinet-v1", gameId);
  }, replay);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#btn-daily-replay")).toHaveText(`Replay ${replay.label}`);
  await expect(page.locator("#btn-daily-continue")).toHaveCount(0);

  await page.locator(`[data-game="${nextCabinet.gameId}"]`).click();
  await expect(page.locator("#play-title")).toHaveText(nextCabinet.label);
  await page.locator("#btn-back").click();

  await expect(page.locator("#btn-daily-play")).toBeVisible();
  await expect(page.locator("#btn-daily-replay")).toHaveText(`Replay ${replay.label}`);
  await expect(page.locator("#btn-daily-continue")).toHaveText(`Continue ${nextCabinet.label}`);
  await page.locator("#btn-daily-continue").click();
  await expect(page.locator("#play-title")).toHaveText(nextCabinet.label);
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

test("Tic-Tac-Toe difficulty chips announce a real note", async ({ page }) => {
  await page.goto("/#play/tictactoe", { waitUntil: "domcontentloaded" });

  const cells = page.locator("#ttt-board .ttt-cell");
  await expect(cells).toHaveCount(9);

  const diffs = page.locator("#ttt-diffs");
  const chips = diffs.locator(".diff-chip");
  await expect(chips).toHaveCount(3);
  await diffs.getByRole("button", { name: "Medium" }).click();
  await diffs.getByRole("button", { name: "Easy" }).click();

  const status = page.locator("#ttt-status");
  await expect(status).toHaveText("Random-ish — your move");
  await expect(status).not.toContainText("undefined");
  await expect(diffs.getByRole("button", { name: "Easy" })).toHaveAttribute("aria-pressed", "true");
  await expect(diffs.getByRole("button", { name: "Medium" })).toHaveAttribute("aria-pressed", "false");
  await expect(diffs.getByRole("button", { name: "Hard" })).toHaveAttribute("aria-pressed", "false");
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
  await openFold(page, "#scores-tools");
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
  await openFold(page, "#scores-tools");
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
  await openFold(page, "#scores-tools");
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

  await openFold(page, "#scores-tools");
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

test("playfield tap starts Circuit Breaker and Space Shooter without using Launch", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("alphaeus-arcade-v1", JSON.stringify({
      playerName: "Tap Starter",
      xp: 10000,
      gamesPlayed: 8,
      highScores: {},
      history: [],
      hallOfFame: [],
    }));
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const releaseVersion = await page.evaluate(() => window.SITE_VERSION.id);
  expect(releaseVersion).toMatch(/^\d{4}\.\d{2}\.\d{2}\.\d+$/);
  await expect(page.locator("#site-version")).toContainText(releaseVersion);

  await page.locator('[data-game="breaker"]').click();
  await expect(page.locator("#br-canvas")).toBeVisible();
  await expect(page.locator("#br-levels")).toBeVisible();
  await expect(page.locator('#br-levels [data-level="1"]')).toHaveClass(/active/);
  await expect(page.locator("#br-powers")).toContainText(/split|flood/i);
  await page.locator("#br-canvas").click({ position: { x: 120, y: 220 } });
  await expect(page.locator("#br-start")).toHaveText(/Running/);
  await expect(page.locator("#br-hint")).toContainText(/8×1|8x1|Level 1/i);

  await page.locator("#btn-back").click();
  await expect(page.locator("#lobby")).toBeVisible();

  const shooter = page.locator('[data-game="shooter"]');
  await expect(shooter).not.toHaveClass(/is-locked/);
  await shooter.click();
  await expect(page.locator("#sh-canvas")).toBeVisible();
  await page.locator("#sh-canvas").click({ position: { x: 120, y: 220 } });
  await expect(page.locator("#sh-hint")).toContainText(/Wave 1|WASD|powerups/i);
  await expect(page.locator("#sh-wave")).toHaveText("1");
});

test("endless cabinets pause and can save the current score before death", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("alphaeus-arcade-v1", JSON.stringify({
      playerName: "Pause Banker",
      xp: 10000,
      gamesPlayed: 8,
      highScores: {},
      history: [],
      hallOfFame: [],
    }));
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator('[data-game="breaker"]').click();
  await expect(page.locator("#br-canvas")).toBeVisible();
  await page.locator("#br-canvas").click({ position: { x: 120, y: 220 } });
  await expect(page.locator("#br-pause")).toBeVisible();
  await page.locator("#br-pause").click();
  await expect(page.locator("#br-pause-overlay")).toBeVisible();
  await expect(page.locator("#br-bank")).toHaveText(/Save score & end/i);
  await page.locator("#br-resume").click();
  await expect(page.locator("#br-pause-overlay")).toBeHidden();
  await expect(page.locator("#br-start")).toHaveText(/Running/);
  await page.locator("#br-pause").click();
  await page.locator("#br-bank").click();
  await expect(page.locator("#br-pause-overlay")).toBeHidden();
  await expect(page.locator("#br-start")).toBeEnabled();
  await expect(page.locator("#br-hint")).toContainText(/saved|ended|fried/i);

  await page.locator("#btn-back").click();
  await page.locator('[data-game="snake"]').click();
  await expect(page.locator("#snake-canvas")).toBeVisible();
  await page.locator("#snake-start").click();
  await expect(page.locator("#snake-pause")).toBeVisible();
  await page.locator("#snake-pause").click();
  await expect(page.locator("#snake-pause-overlay")).toBeVisible();
  await page.locator("#snake-bank").click();
  await expect(page.locator("#snake-pause-overlay")).toBeHidden();
  await expect(page.locator("#snake-hint")).toContainText(/saved/i);
});

test("snake paints a text pause cue when the page hides and freezes the score", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-game="snake"]').click();
  await expect(page.locator("#snake-canvas")).toBeVisible();
  await page.locator("#snake-start").click();
  await expect(page.locator("#snake-pause")).toBeVisible();

  const frozen = await page.evaluate(() => {
    const canvas = document.querySelector("#snake-canvas");
    const ctx = canvas.getContext("2d");
    const seen = [];
    const original = ctx.fillText.bind(ctx);
    ctx.fillText = (text, ...rest) => {
      seen.push(String(text));
      return original(text, ...rest);
    };
    document.dispatchEvent(new Event("pagehide"));
    return {
      seen,
      eaten: document.querySelector("#snake-score").textContent,
    };
  });

  expect(frozen.seen).toContain("Paused · return to resume");
  await expect(page.locator("#snake-hint")).toHaveText("Paused (tab hidden) · return to resume");
  await expect(page.locator("#snake-pause-overlay")).toBeHidden();
  await page.waitForTimeout(450);
  await expect(page.locator("#snake-score")).toHaveText(frozen.eaten);
});

test("shooter paints a text pause cue when the page hides and freezes the score", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("alphaeus-arcade-v1", JSON.stringify({
      playerName: "Hidden Pilot",
      xp: 10000,
      gamesPlayed: 8,
      highScores: {},
      history: [],
      hallOfFame: [],
    }));
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-game="shooter"]').click();
  await expect(page.locator("#sh-canvas")).toBeVisible();
  await page.locator("#sh-canvas").click({ position: { x: 210, y: 420 } });
  await expect(page.locator("#sh-pause")).toBeVisible();

  const frozen = await page.evaluate(() => {
    const canvas = document.querySelector("#sh-canvas");
    const ctx = canvas.getContext("2d");
    const seen = [];
    const original = ctx.fillText.bind(ctx);
    ctx.fillText = (text, ...rest) => {
      seen.push(String(text));
      return original(text, ...rest);
    };
    document.dispatchEvent(new Event("pagehide"));
    return {
      seen,
      score: document.querySelector("#sh-score").textContent,
    };
  });

  expect(frozen.seen).toContain("Paused · return to resume");
  await expect(page.locator("#sh-hint")).toHaveText("Paused (tab hidden) · return to resume");
  await expect(page.locator("#sh-pause-overlay")).toBeHidden();
  await page.waitForTimeout(450);
  await expect(page.locator("#sh-score")).toHaveText(frozen.score);
});

test("keeps Circuit Breaker's unchanged live power status stable between frames", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-game="breaker"]').click();
  await expect(page.locator("#br-canvas")).toBeVisible();

  await page.evaluate(() => {
    window.__breakerPowerMutations = 0;
    window.__breakerPowerObserver = new MutationObserver((records) => {
      window.__breakerPowerMutations += records.filter((record) => record.type === "childList").length;
    });
    window.__breakerPowerObserver.observe(document.querySelector("#br-powers"), {
      childList: true,
      subtree: true,
    });
  });

  await page.locator("#br-canvas").click({ position: { x: 210, y: 420 } });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    window.__breakerPowerMutations = 0;
  });
  await page.waitForTimeout(650);

  const mutations = await page.evaluate(() => window.__breakerPowerMutations);
  expect(mutations, "unchanged aria-live status must not be replaced every animation frame").toBeLessThanOrEqual(1);
});



test("keeps Space Shooter's unchanged live power status stable between frames", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("alphaeus-arcade-v1", JSON.stringify({
      playerName: "Power Strip",
      xp: 10000,
      gamesPlayed: 8,
      highScores: {},
      history: [],
      hallOfFame: [],
    }));
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-game="shooter"]').click();
  await expect(page.locator("#sh-canvas")).toBeVisible();

  await page.evaluate(() => {
    window.__shooterPowerMutations = 0;
    window.__shooterPowerObserver = new MutationObserver((records) => {
      window.__shooterPowerMutations += records.filter((record) => record.type === "childList").length;
    });
    window.__shooterPowerObserver.observe(document.querySelector("#sh-powers"), {
      childList: true,
      subtree: true,
    });
  });

  await page.locator("#sh-canvas").click({ position: { x: 210, y: 420 } });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    window.__shooterPowerMutations = 0;
  });
  await page.waitForTimeout(650);

  const mutations = await page.evaluate(() => window.__shooterPowerMutations);
  expect(mutations, "unchanged aria-live status must not be replaced every animation frame").toBeLessThanOrEqual(1);
});

test("keeps Target Tap's zero combo HUD stable across consecutive misses", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-game="tapper"]').click();
  await expect(page.locator("#tap-grid")).toBeVisible();
  await page.locator("#tap-start").click();
  await expect(page.locator("#tap-grid .tap-cell.is-on")).toHaveCount(1);

  await page.evaluate(() => {
    window.__tapComboMutations = 0;
    window.__tapComboObserver = new MutationObserver((records) => {
      window.__tapComboMutations += records.filter((record) =>
        record.type === "childList" || record.type === "characterData"
      ).length;
    });
    window.__tapComboObserver.observe(document.querySelector("#tap-combo"), {
      childList: true,
      characterData: true,
      subtree: true,
    });

    const wrongCell = [...document.querySelectorAll("#tap-grid .tap-cell")]
      .find((cell) => !cell.classList.contains("is-on"));
    wrongCell.click();
    wrongCell.click();
    wrongCell.click();
  });
  await page.waitForTimeout(25);

  const result = await page.evaluate(() => ({
    combo: document.querySelector("#tap-combo").textContent,
    mutations: window.__tapComboMutations,
  }));
  expect(result.combo).toBe("0");
  expect(result.mutations, "repeated zero-combo misses must not replace unchanged HUD text").toBe(0);
});

test("scoreboard category chips show top 3 per game and filter local runs", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("alphaeus-arcade-v1", JSON.stringify({
      playerName: "Alp",
      xp: 200,
      gamesPlayed: 4,
      highScores: {
        snake: { best: 75, eaten: 12, level: 3, eatenTotal: 18 },
        tapper: { best: 40, hits: 8 },
        tictactoe: { best: 2, wins: 2, losses: 0, draws: 0 },
      },
      history: [
        { game: "snake", score: 75, player: "Alp", at: 4, arcadePoints: 40, xp: 40, headline: 12, stats: { eaten: 12, level: 3 } },
        { game: "snake", score: 40, player: "Alp", at: 3, arcadePoints: 30, xp: 30, headline: 6, stats: { eaten: 6, level: 2 } },
        { game: "tapper", score: 40, player: "Alp", at: 2, arcadePoints: 25, xp: 25, headline: 8, stats: { hits: 8 } },
      ],
      hallOfFame: [
        { game: "snake", score: 75, player: "Alp", at: 4, arcadePoints: 40, headline: 12, stats: { eaten: 12 } },
        { game: "tapper", score: 40, player: "Alp", at: 2, arcadePoints: 25, headline: 8, stats: { hits: 8 } },
      ],
    }));
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openFold(page, "#scores-details");
  await expect(page.locator("#global-hall-label")).toContainText(/top 3 per game/i);
  await expect(page.locator("#hof-sub")).toContainText(/top 3 per game/i);
  await expect(page.locator("#highscores-list")).toContainText("Snake");
  await expect(page.locator("#highscores-list")).toContainText("Target Tap");

  const filters = page.getByRole("group", { name: "Leaderboard game filter" });
  const allGames = filters.getByRole("button", { name: "All games" });
  const snake = filters.getByRole("button", { name: "Snake" });
  await expect(allGames).toHaveAttribute("aria-pressed", "true");
  await expect(snake).toHaveAttribute("aria-pressed", "false");
  await snake.focus();
  await page.keyboard.press("Space");
  await expect(snake).toBeFocused();
  await expect(snake).toHaveClass(/is-active/);
  await expect(snake).toHaveAttribute("aria-pressed", "true");
  await expect(allGames).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#pb-sub")).toContainText("Snake");
  await expect(page.locator("#hof-sub")).toContainText("Snake");
  await expect(page.locator("#highscores-list .hs-game")).toHaveCount(1);
  await expect(page.locator("#highscores-list")).toContainText("Snake");
  await expect(page.locator("#highscores-list")).not.toContainText("Target Tap");
  await expect(page.locator("#hall-list")).toContainText("12 eaten");
  await expect(page.locator("#hall-list")).toContainText("6 eaten");
  await expect(page.locator("#hall-list")).not.toContainText("Target Tap");
  await expect(page.locator("#history-list")).toContainText("Snake");
  await expect(page.locator("#history-list")).not.toContainText("Target Tap");

  await allGames.focus();
  await page.keyboard.press("Enter");
  await expect(allGames).toBeFocused();
  await expect(allGames).toHaveAttribute("aria-pressed", "true");
  await expect(snake).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#highscores-list")).toContainText("Target Tap");
  await expect(page.locator("#global-hall-label")).toContainText(/top 3 per game/i);
});


test("device backup validates, confirms and restores favorites and controls", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#site-version")).not.toHaveText("—");
  const text = await page.evaluate(() => {
    ArcadeScores.setPlayerName("Portable Player");
    ArcadeFavorites.toggle("snake");
    ArcadeControls.setBinding("snake", "up", "i");
    const backup = JSON.stringify(ArcadeBackup.exportSnapshot());
    ArcadeFavorites.toggle("snake");
    ArcadeControls.reset("snake");
    return backup;
  });
  const field = page.locator("#device-backup-file");
  const file = { name: "device.json", mimeType: "application/json", buffer: Buffer.from(text) };
  const cancel = page.waitForEvent("dialog").then((dialog) => dialog.dismiss());
  await field.setInputFiles(file);
  await cancel;
  await expect(page.locator("#device-backup-status")).toHaveText("Restore cancelled. Nothing changed.");
  expect(await page.evaluate(() => ArcadeFavorites.isFavorite("snake"))).toBe(false);
  const accept = page.waitForEvent("dialog").then((dialog) => dialog.accept());
  await field.setInputFiles(file);
  await accept;
  await expect(page.locator("#device-backup-status")).toContainText("Restored scores");
  expect(await page.evaluate(() => ArcadeFavorites.isFavorite("snake"))).toBe(true);
  expect(await page.evaluate(() => ArcadeControls.keysFor("snake", "up"))).toEqual(["i"]);
  const before = await page.evaluate(() => ArcadeScores.exportCode());
  await field.setInputFiles({ ...file, buffer: Buffer.from('{"version":99}') });
  await expect(page.locator("#device-backup-status")).toContainText("Nothing changed");
  expect(await page.evaluate(() => ArcadeScores.exportCode())).toBe(before);
});

test('daily challenge refreshes across Singapore midnight without a reload', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-07T15:59:30Z') });
  await page.goto('/');
  await expect(page.locator('#daily-card .daily-badge')).toHaveText('2026-10-07');
  await page.clock.runFor(60001);
  await expect(page.locator('#daily-card .daily-badge')).toHaveText('2026-10-08');
  await expect(page.locator('#btn-daily-play')).toBeVisible();
});

test("latest selected device backup wins over an older delayed read", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#site-version")).not.toHaveText("—");
  const backup = await page.evaluate(() => {
    const snapshot = ArcadeBackup.exportSnapshot();
    const read = File.prototype.text;
    File.prototype.text = function () {
      if (this.name === "slow.json") return new Promise((resolve) => {
        window.finishSlowBackup = () => read.call(this).then(resolve);
      });
      return read.call(this);
    };
    return JSON.stringify(snapshot);
  });
  let confirmations = 0;
  page.on("dialog", async (dialog) => { confirmations += 1; await dialog.accept(); });
  const field = page.locator("#device-backup-file");
  await field.setInputFiles({ name: "slow.json", mimeType: "application/json", buffer: Buffer.from(backup) });
  await expect.poll(() => page.evaluate(() => typeof window.finishSlowBackup)).toBe("function");
  await field.setInputFiles({ name: "latest.json", mimeType: "application/json", buffer: Buffer.from(backup) });
  await expect(page.locator("#device-backup-status")).toContainText("Restored scores");
  await page.evaluate(() => window.finishSlowBackup());
  await page.waitForTimeout(100);
  expect(confirmations).toBe(1);
});


test("help shortcuts preserve composition and modified browser chords", async ({page}) => {
  await page.goto("/");
  await expect(page.locator("#daily-card .daily-badge")).toBeVisible();
  for (const extra of [{isComposing:true}, {ctrlKey:true}, {metaKey:true}, {altKey:true}]) {
    await page.evaluate(extra => document.body.dispatchEvent(new KeyboardEvent("keydown", {key:"?",bubbles:true,cancelable:true,...extra})), extra);
    await expect(page.locator("#help-modal")).toBeHidden();
  }
  await page.keyboard.press("?");
  await expect(page.locator("#help-modal")).toBeVisible();
  await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape",isComposing:true,bubbles:true,cancelable:true})));
  await expect(page.locator("#help-modal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#help-modal")).toBeHidden();
});


test("control key capture preserves composition and browser shortcut chords", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-game="snake"]').click();
  await page.locator(".ctrl-prefs-toggle").click();
  const up = page.locator(".ctrl-bind").first();
  await up.getByRole("button", { name: "Change", exact: true }).click();
  const original = await page.evaluate(() => ArcadeControls.keysFor("snake", "up"));
  for (const extra of [
    { isComposing: true }, { keyCode: 229 }, { ctrlKey: true },
    { metaKey: true }, { altKey: true }, { consumed: true },
  ]) {
    const outcome = await page.evaluate((extra) => {
      const event = new KeyboardEvent("keydown", { key: "i", bubbles: true, cancelable: true, ...extra });
      if (extra.consumed) event.preventDefault();
      window.dispatchEvent(event);
      return { prevented: event.defaultPrevented, keys: ArcadeControls.keysFor("snake", "up") };
    }, extra);
    expect(outcome.prevented).toBe(!!extra.consumed);
    expect(outcome.keys).toEqual(original);
    await expect(up.getByRole("button", { name: "Press key", exact: true })).toBeVisible();
  }
  await page.keyboard.press("i");
  await expect(up.locator("kbd")).toHaveText("i");
  await expect(page.locator(".ctrl-prefs-status")).toHaveText("Up updated.");
  await up.getByRole("button", { name: "Change", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".ctrl-prefs-status")).toHaveText("Change cancelled.");
  expect(await page.evaluate(() => ArcadeControls.keysFor("snake", "up"))).toEqual(["i"]);
});

const visibleCatalog = (page) => page.locator('.cabinet-grid .cabinet-slot:not([hidden]) .cabinet');

test("cabinet discovery intersects filters without loading or changing cabinets", async ({ page }) => {
  const bundles = [];
  page.on("request", (request) => {
    if (request.url().includes("/js/games/")) bundles.push(request.url());
  });
  await page.goto("/");
  await expect(visibleCatalog(page)).toHaveCount(8);
  await page.locator("#cab-discovery summary").click();
  await page.getByLabel("Style", { exact: true }).selectOption("timing");
  await expect(visibleCatalog(page)).toHaveCount(2);
  await expect(page.locator('[data-game="jubeat"]')).toHaveAttribute("aria-disabled", "true");
  await page.getByLabel("Playable now", { exact: true }).check();
  await expect(visibleCatalog(page)).toHaveCount(0);
  await expect(page.locator("#cab-filter-empty")).toBeVisible();
  await expect(page.locator("#cab-filter-status")).toHaveText("0 of 8 cabinets");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByLabel("Game name", { exact: true })).toBeFocused();
  await page.getByLabel("Remappable keys", { exact: true }).check();
  await expect(visibleCatalog(page)).toHaveCount(3);
  await page.getByLabel("Playable now", { exact: true }).check();
  await expect(visibleCatalog(page)).toHaveCount(2);
  await page.getByLabel("Game name", { exact: true }).fill("  SNAKE  ");
  await expect(visibleCatalog(page)).toHaveCount(1);
  expect(bundles).toEqual([]);
  await expect(page.getByRole("button", { name: "Favorite Space Shooter", exact: true })).toBeHidden();
  await page.locator('.cabinet-grid [data-game="snake"]').click();
  await expect(page.locator("#play-view")).toBeVisible();
  await page.locator("#btn-back").click();
  await expect(page.locator('.cabinet-grid [data-game="snake"]')).toBeFocused();
  await expect(visibleCatalog(page)).toHaveCount(1);
  await expect(page.locator("#cab-search")).toHaveValue("  SNAKE  ");
});

test("playable discovery updates immediately after imported XP and factory reset", async ({ page }) => {
  await page.goto("/");
  await page.locator("#cab-discovery summary").click();
  await page.getByLabel("Playable now", { exact: true }).check();
  await expect(visibleCatalog(page)).toHaveCount(4);
  const code = await page.evaluate(() => {
    const state = ArcadeScores.getState();
    const code = btoa(unescape(encodeURIComponent(JSON.stringify({ ...state, xp: 10000 }))));
    ArcadeFavorites.toggle("jubeat");
    return code;
  });
  const importDialog = page.waitForEvent("dialog").then((dialog) => dialog.accept(code));
  await openFold(page, "#scores-tools");
  await page.locator("#btn-import").click();
  await importDialog;
  await expect(visibleCatalog(page)).toHaveCount(8);
  await page.getByLabel("Style", { exact: true }).selectOption("puzzle");
  await expect(visibleCatalog(page)).toHaveCount(2);
  await expect(page.locator('#cab-quick-line [data-launch="jubeat"]')).toBeVisible();
  const resetDialog = page.waitForEvent("dialog").then((dialog) => dialog.accept());
  await page.locator("#btn-reset").click();
  await resetDialog;
  await expect(visibleCatalog(page)).toHaveCount(1);
  await expect(page.locator("#cab-filter-status")).toHaveText("1 of 8 cabinets");
  await expect(page.locator("#daily-card")).toBeVisible();
});

test("phone discovery stays compact, uses keyboard controls and works without storage", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () { throw new DOMException("storage denied", "QuotaExceededError"); };
  });
  await page.goto("/");
  await expect(page.locator("#cab-discovery")).not.toHaveAttribute("open", "");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const first = await page.locator('.cabinet-grid [data-game="tictactoe"]').boundingBox();
  expect(first.y + first.height).toBeLessThan(844);
  await page.locator("#cab-discovery summary").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Game name", { exact: true })).toBeFocused();
  await page.keyboard.type("memory");
  await expect(visibleCatalog(page)).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Style", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(visibleCatalog(page)).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  expect(await page.locator("#cab-discovery").evaluate((panel) =>
    [...panel.querySelectorAll("*")].every((el) => el.getBoundingClientRect().right <= 320),
  )).toBe(true);
});

test("Lobby declutter: secondary sections open within one click", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#lobby")).toBeVisible();

  const folds = [
    ["#lobby-about", "#fun-fact-card"],
    ["#achievements-details", "#achievements-list"],
    ["#scores-details", "#highscores-list"],
    ["#scores-tools", "#btn-export"],
  ];
  for (const [details, inner] of folds) {
    await expect(page.locator(details)).not.toHaveAttribute("open", "");
    await expect(page.locator(inner)).not.toBeVisible();
  }
  for (const [details, inner] of folds) {
    await page.locator(`${details} > summary`).click();
    await expect(page.locator(details)).toHaveAttribute("open", "");
    await expect(page.locator(inner)).toBeVisible();
  }

  await page.locator("#scores-details").evaluate((element) => {
    element.open = false;
  });
  await page.locator("#achievements-details").evaluate((element) => {
    element.open = false;
  });
  await page.locator('.top-nav a[href="#scores-panel"]').click();
  await expect(page.locator("#scores-details")).toHaveAttribute("open", "");
  await expect(page.locator("#highscores-list")).toBeVisible();
  await page.locator('.top-nav a[href="#achievements-panel"]').click();
  await expect(page.locator("#achievements-details")).toHaveAttribute("open", "");
  await expect(page.locator("#achievements-list")).toBeVisible();
});

test("secondary icons expose names and reveal tooltips on hover and keyboard focus", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openFold(page, "#scores-tools");
  const controls = page.locator(".icon-control[data-tip]");
  for (const control of await controls.all()) {
    await expect(control).toHaveAttribute("aria-label", /.+/);
    expect(await control.getAttribute("data-tip")).toBe(await control.getAttribute("aria-label"));
  }
  const tooltip = (control) => control.evaluate((el) => {
    const style = getComputedStyle(el, "::after");
    return { opacity: style.opacity, visibility: style.visibility, content: style.content };
  });
  for (const control of [page.getByRole("link", { name: "Scores", exact: true }), page.getByRole("button", { name: "Export", exact: true }), page.locator("#scores-tools > summary")]) {
    await control.hover();
    expect(await tooltip(control)).toMatchObject({ opacity: "1", visibility: "visible" });
    await page.mouse.move(0, 0);
    await page.keyboard.press("Tab");
    await control.focus();
    await expect(control).toBeFocused();
    expect(await control.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    expect(await tooltip(control)).toMatchObject({ opacity: "1", visibility: "visible" });
  }
  const summary = page.locator("#scores-tools > summary");
  await summary.press("Enter");
  await expect(summary).toHaveAttribute("aria-expanded", "false");
});

test("secondary tooltips stay within a narrow viewport when shown", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openFold(page, "#scores-tools");
  for (const selector of ["#btn-more", "#scores-tools > summary", "#btn-export", "#nav-music"]) {
    const control = page.locator(selector);
    await control.scrollIntoViewIfNeeded();
    await control.hover();
    expect(await control.evaluate((el) => getComputedStyle(el, "::after").display)).toBe("block");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.mouse.move(319, 0);
    await page.keyboard.press("Tab");
    await control.focus();
    expect(await control.evaluate((el) => getComputedStyle(el, "::after").visibility)).toBe("visible");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
});

test("touch secondary tooltips show after tap and long press without blocking toggles", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const summary = page.locator("#scores-tools > summary");
  await summary.tap();
  await expect(summary).toHaveAttribute("aria-expanded", "true");
  await expect(summary).toHaveClass(/is-tip-visible/);
  expect(await summary.evaluate((el) => getComputedStyle(el, "::after").opacity)).toBe("1");
  await expect(summary).not.toHaveClass(/is-tip-visible/, { timeout: 2500 });
  await summary.dispatchEvent("pointerdown", { pointerType: "touch" });
  await expect(summary).toHaveClass(/is-tip-visible/);
  await summary.dispatchEvent("pointercancel", { pointerType: "touch" });
  await expect(summary).not.toHaveClass(/is-tip-visible/, { timeout: 2500 });
  await expect(summary).toHaveAttribute("aria-expanded", "true");
  await context.close();
});

for (const width of [1366, 390]) {
  test(`icon groups share a row and fold panels open below at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    for (const control of await page.locator(".icon-control").all()) {
      await expect(control.locator("svg")).toHaveCount(1);
      expect(await control.evaluate((el) => [...el.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join("").trim())).toBe("");
    }
    const folds = ["#cab-discovery", "#lobby-about", "#achievements-details", "#scores-tools", "#scores-details"];
    const summaries = page.locator(folds.map((id) => `${id} > summary`).join(","));
    const row = await summaries.evaluateAll((elements) => elements.map((el) => el.offsetTop));
    expect(new Set(row).size).toBe(1);
    for (const id of folds) {
      await openFold(page, id);
      const panel = await page.locator(`${id} > .fold-panel`).boundingBox();
      const boxes = await summaries.evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().bottom));
      expect(panel.y).toBeGreaterThanOrEqual(Math.max(...boxes));
    }
    await openFold(page, ".device-backup");
    for (const selector of [".top-nav", ".fun-fact-actions", ".auth-row", ".score-tools", ".cloud-actions", ".name-row"]) {
      const groups = page.locator(selector);
      for (const group of await groups.all()) {
        const tops = await group.locator(":scope > .icon-control:visible").evaluateAll((elements) => elements.map((el) => el.offsetTop));
        expect(new Set(tops).size, selector).toBeLessThanOrEqual(1);
      }
    }
    await page.locator("#btn-mute").click();
    await expect(page.locator("#btn-mute svg")).toHaveCount(1);
    await expect(page.locator("#btn-mute")).toHaveAttribute("aria-label", "Unmute game SFX");
  });
}

for (const width of [1366, 390]) {
  test(`More menu and single-row essentials at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const button = page.locator("#btn-more");
    const menu = page.getByRole("menu", { name: "More options" });
    const help = page.getByRole("menuitem", { name: "Help", exact: true });
    const portfolio = page.getByRole("menuitem", { name: "Portfolio", exact: true });
    const tops = await page.locator('.top-nav > .icon-control, #btn-more').evaluateAll((els) => els.map((el) => el.offsetTop));
    expect(tops).toHaveLength(5);
    expect(new Set(tops).size).toBe(1);
    const visualTops = await page.locator('.top-nav > .icon-control, #btn-more').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(new Set(visualTops).size).toBe(1);
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(help).toBeFocused();
    await expect(portfolio).toBeVisible();
    await expect(portfolio).toHaveAttribute("data-portfolio", "");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();
    await button.click();
    await button.click();
    await expect(menu).toBeHidden();
    await button.press("ArrowDown");
    await expect(help).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(portfolio).toBeFocused();
    await page.keyboard.press("Home");
    await expect(help).toBeFocused();
    await page.keyboard.press("End");
    await expect(portfolio).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(help).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(menu).toBeHidden();
    await button.press("Space");
    await expect(help).toBeFocused();
    await page.locator(".brand").click();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await button.press("Enter");
    await help.click();
    await expect(page.locator("#help-modal")).toBeVisible();
    await expect(menu).toBeHidden();
  });
}
