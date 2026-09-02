import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function filesBelow(directory, extension) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory()
      ? filesBelow(relative, extension)
      : entry.name.endsWith(extension)
        ? [relative]
        : [];
  });
}

const htmlFiles = ["index.html", "404.html"];
const localRefs = [];
for (const file of htmlFiles) {
  const html = read(file);
  assert(!/<style\b/i.test(html), `${file} contains inline CSS`);
  localRefs.push(
    ...[...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((ref) => !/^(?:https?:|#|data:)/.test(ref))
  );
}

const app = read("js/app.js");
const indexHtml = read("index.html");
assert(
  indexHtml.indexOf('src="js/core/script-loader.js"') >= 0
    && indexHtml.indexOf('src="js/core/script-loader.js"') < indexHtml.indexOf('src="js/app.js"'),
  "the shared lazy script loader must initialize before app.js",
);
assert(
  indexHtml.indexOf('src="js/core/cabinet-session.js"') >= 0
    && indexHtml.indexOf('src="js/core/cabinet-session.js"') < indexHtml.indexOf('src="js/app.js"'),
  "the cabinet lifecycle helper must initialize before app.js",
);
assert(
  app.includes("window.ArcadeScriptLoader.create().load")
    && !app.includes("const scriptPromises ="),
  "app.js must use the tested retryable loader instead of an app-local promise cache",
);
assert(
  app.includes("cabinetSession.isCurrent(requestToken)")
    && app.includes("cabinetSession.cancel()")
    && !app.includes("let opening = false"),
  "app.js must cancel stale lazy cabinet requests by identity",
);
assert(
  app.includes("function cabinetLockChip")
    && app.includes("lockEl.textContent = cabinetLockChip(id)")
    && app.includes("unlockRequirement")
    && !app.includes("bestEl.textContent = req?.message"),
  "locked cabinets must show a compact Lv chip instead of replacing .cab-best",
);
assert(
  read("js/core/scores.js").includes("function xpToReachLevel")
    && read("js/features/achievements.js").includes("xpToReachLevel")
    && read("js/features/achievements.js").includes("XP to go")
    && read("css/lobby.css").includes("text-overflow: ellipsis"),
  "remaining XP uses the shared level curve on the lock chip and the chip stays contained",
);
assert(
  app.includes('id="btn-daily-play"')
    && app.includes('id="btn-daily-continue"')
    && app.includes("alparcade-last-cabinet-v1")
    && app.includes("persistLastCabinet")
    && app.includes("continueId && continueId !== replayId && continueId !== playGame")
    && /Continue \$\{escapeHtml\(continueLabel\)\}/.test(app),
  "daily card keeps Continue only when its cabinet differs from Play and Replay",
);
assert(
  app.includes("alparcade-last-run-v1")
    && app.includes("persistLastRun")
    && app.includes('id="daily-last-run"')
    && app.includes('id="btn-daily-share"')
    && app.includes('id="btn-daily-replay"')
    && /Replay \$\{escapeHtml\(replayLabel\)\}/.test(app)
    && app.includes("lastRunPlayUrl")
    && app.includes("#play/${id}"),
  "lobby must recap, share, and replay the last run via a cabinet deep-link",
);
const responsive = read("css/responsive.css");
const phoneBlock = responsive.slice(responsive.indexOf("@media (max-width: 720px)"));
assert(
  phoneBlock.includes("#daily-card .daily-actions")
    && phoneBlock.includes("#daily-card .daily-last-run")
    && phoneBlock.includes("#daily-card .daily-last-run-copy")
    && phoneBlock.includes("flex-wrap: nowrap")
    && phoneBlock.includes("text-overflow: ellipsis")
    && phoneBlock.includes("padding: 0.22rem 0.48rem"),
  "phone daily recap and actions stay one compact contained control row",
);
assert(
  app.includes("Mute game SFX (music is in the ♪ dock)")
    && indexHtml.includes('title="Mute game SFX (music is in the ♪ dock)"'),
  "mute tooltip must distinguish game SFX from the music dock",
);
assert(
  indexHtml.includes('id="nav-music"') && read("js/features/music.js").includes("#nav-music"),
  "header Music toggle must exist and open the left dock",
);
assert(
  app.includes("navigator.share") && app.includes("AbortError"),
  "last-run share uses the native share sheet when the browser offers it",
);
localRefs.push(...[...app.matchAll(/"(js\/games\/[^"]+\.js)"/g)].map((match) => match[1]));
for (const ref of new Set(localRefs)) {
  assert(fs.existsSync(path.join(root, ref)), `Missing local reference: ${ref}`);
}

for (const file of filesBelow("js", ".js")) {
  execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "pipe" });
}

for (const file of filesBelow("css", ".css")) {
  const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0;
  for (const character of css) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    assert(depth >= 0, `${file} has an unexpected closing brace`);
  }
  assert(depth === 0, `${file} has ${depth} unclosed blocks`);
}

assert(
  read("js/core/scores.js").includes("shooter: 500000")
    && read("js/core/scores.js").includes("breaker: 500000")
    && read("firebase/firestore.rules").includes("d.score <= 500000")
    && read("js/games/shooter.js").includes("function commitScore()")
    && read("js/games/snake.js").includes("function commitScore()")
    && read("js/games/tapper.js").includes("function commitScore()")
    && read("js/games/breaker.js").includes("function commitScore()")
    && read("js/games/memory.js").includes("abandoned: true"),
  "long Space Shooter runs stay under the fairness cap and every endless cabinet commits on leave",
);
assert(
  read("js/games/breaker.js").includes('id: "wide"')
    && read("js/games/breaker.js").includes("function splitBalls()")
    && read("js/games/breaker.js").includes('id: "extra"')
    && !read("js/games/breaker.js").includes('id: "slow"')
    && read("js/games/breaker.js").includes("const MAX_BALLS = 96")
    && read("js/games/breaker.js").includes("const START_ROWS = 14")
    && read("js/games/breaker.js").includes("function floodClear()")
    && read("css/games.css").includes(".br-powers")
    && read("css/games.css").includes(".br-power-chip"),
  "Circuit Breaker ships large banks and exponential split floods without slow-mo",
);
assert(fs.existsSync(path.join(root, "index.html")), "GitHub Pages index.html must remain at root");
assert(fs.existsSync(path.join(root, "404.html")), "GitHub Pages 404.html must remain at root");

console.log(
  `Static structure passed: ${htmlFiles.length} HTML entrypoints, ${filesBelow("css", ".css").length} CSS modules, ${filesBelow("js", ".js").length} JavaScript modules.`
);
