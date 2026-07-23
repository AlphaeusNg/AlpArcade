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

assert(fs.existsSync(path.join(root, "index.html")), "GitHub Pages index.html must remain at root");
assert(fs.existsSync(path.join(root, "404.html")), "GitHub Pages 404.html must remain at root");

console.log(
  `Static structure passed: ${htmlFiles.length} HTML entrypoints, ${filesBelow("css", ".css").length} CSS modules, ${filesBelow("js", ".js").length} JavaScript modules.`
);
