import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(root, "js/games/breaker.js"), "utf8");
const context = { window: {}, Math, Number };
vm.createContext(context);
vm.runInContext(source, context);
const { layoutDims } = context.window.GameBreaker;

function assertDims(level, cols, rows, message) {
  const d = layoutDims(level);
  assert.equal(d.cols, cols, `${message} (cols)`);
  assert.equal(d.rows, rows, `${message} (rows)`);
}

assertDims(1, 8, 1, "level 1 is a single row of 8 bricks");
assertDims(2, 12, 2, "level 2 grows 1.5× to 12×2");
assertDims(3, 18, 3, "level 3 grows 1.5× to 18×3");
assert.ok(layoutDims(6).cols > layoutDims(5).cols || layoutDims(6).rows > layoutDims(5).rows);
assert.ok(layoutDims(20).cols <= 72 && layoutDims(20).rows <= 32);
for (let level = 1; level <= 12; level += 1) {
  const d = layoutDims(level);
  assert.ok(d.bw > d.bh, `level ${level} bricks stay wider than they are tall (${d.bw}×${d.bh})`);
}

console.log("Circuit Breaker level layout passed.");
