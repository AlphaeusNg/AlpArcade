import { expect, test } from "@playwright/test";

const runtimeErrors = new WeakMap();
const FREE_CABINET_IDS = ["snake", "tictactoe", "tapper", "breaker"];

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

test("locked cabinets keep identity and stay unplayable", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const cabinet = page.locator('[data-game="jubeat"]');
  await expect(cabinet).toBeVisible();
  await expect(cabinet).toHaveClass(/is-locked/);
  await expect(cabinet.locator(".cab-lock")).toHaveText(/Lv 15 · \d+ XP to go/);
  await expect(cabinet.locator(".cab-desc")).toContainText("Lv 15");
  await expect(cabinet.locator(".cab-best")).toHaveText("No runs yet");
  await expect(cabinet.locator(".cab-best")).not.toContainText("Reach Lv");
  await cabinet.click({ force: true });
  await expect(page.locator("#lobby")).toBeVisible();
  await expect(page.locator("#play-view")).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Reach Lv 15");
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
  await expect(page.locator("#site-version")).toContainText("2026.09.03.8");

  await page.locator('[data-game="breaker"]').click();
  await expect(page.locator("#br-canvas")).toBeVisible();
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
  await expect(page.locator("#global-hall-label")).toContainText(/top 3 per game/i);
  await expect(page.locator("#hof-sub")).toContainText(/top 3 per game/i);
  await expect(page.locator("#highscores-list")).toContainText("Snake");
  await expect(page.locator("#highscores-list")).toContainText("Target Tap");

  await page.locator('#lb-filters [data-lb-game="snake"]').click();
  await expect(page.locator("#lb-filters [data-lb-game='snake']")).toHaveClass(/is-active/);
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

  await page.locator('#lb-filters [data-lb-game="all"]').click();
  await expect(page.locator("#highscores-list")).toContainText("Target Tap");
  await expect(page.locator("#global-hall-label")).toContainText(/top 3 per game/i);
});
