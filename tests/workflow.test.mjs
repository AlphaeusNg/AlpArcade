import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const workflowPath = path.join(root, ".github/workflows/ci.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");

assert.match(workflow, /^name:\s*ci\s*$/m, "workflow should have a stable name");
assert.match(workflow, /push:\s*\n\s+branches:\s*\[main\]/, "CI should run on main pushes");
assert.match(workflow, /^\s{2}pull_request:\s*$/m, "CI should run on pull requests");
assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/, "CI should use read-only contents access");
assert.match(workflow, /concurrency:[\s\S]*cancel-in-progress:\s*true/, "stale runs should cancel");
assert.match(workflow, /timeout-minutes:\s*10/, "the test job should have a bounded timeout");
assert.match(workflow, /uses:\s*actions\/checkout@v7/, "CI should use the supported checkout action");
assert.match(workflow, /uses:\s*actions\/setup-node@v7/, "CI should use the supported Node action");
assert.match(workflow, /node-version:\s*24/, "CI should use the documented Node baseline");
assert.match(workflow, /run:\s*npm test\b/, "CI should run the complete local suite");

console.log("GitHub Actions workflow policy passed (10 assertions).");
