import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/features.css"), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(
  html.includes('id="achievement-toast"')
    && html.includes('id="achievement-toast-close"')
    && html.includes('aria-label="Dismiss achievement notification"'),
  "Achievement notice must be visible to assistive tech and directly dismissible"
);
assert(
  html.indexOf('id="achievement-toast"') > html.indexOf("</footer>")
    && html.includes('<div id="game-mount" class="game-mount glass"></div>')
    && !app.includes("gameMount.appendChild(achievementToast)"),
  "Achievement notice must live outside the gameplay mount"
);
assert(
  app.includes("const achievementToastQueue = []")
    && app.includes("function showAchievementToast")
    && app.includes("achievementToastTimer = setTimeout(dismissAchievementToast, 3000)")
    && app.includes('achievementToastClose?.addEventListener("click"'),
  "Achievement notices must queue, dismiss on demand, and auto-hide after three seconds"
);
const notifySource = app.match(
  /function notifyAchievements\(list\) \{([\s\S]*?)\n  \}\n\n  window\.addEventListener/
)?.[1] || "";
assert(
  notifySource.includes("showAchievementToast")
    && !notifySource.includes("showToast("),
  "Achievement unlocks must not reuse the gameplay-overlaying generic toast"
);
assert(
  app.includes("playTitleBlock.appendChild(achievementToast)")
    && app.includes('achievementToast.classList.add("in-play-bar")')
    && styles.includes(".achievement-toast.in-play-bar {")
    && /\.achievement-toast\.in-play-bar\s*\{[^}]*position:\s*static/s.test(styles),
  "In-game achievement notices must stay in play chrome rather than overlay gameplay"
);
assert(
  app.includes("function suspendAchievementToastForFullscreen")
    && app.includes("achievementToastQueue.unshift(activeAchievementToast)")
    && app.includes("drainAchievementToast();"),
  "Fullscreen unlock notices must wait until non-overlay play chrome returns"
);

console.log("Achievement toast placement and timing passed.");
