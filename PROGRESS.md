# AlpArcade continuous improvement log

Last updated: 2026-08-09 (Cycle 51 across the projects workspace)

## Current state

- Branch: `main`; working tree was clean and aligned with `origin/main` at cycle start.
- Runtime: zero-build static GitHub Pages arcade with eight lazy-loaded game modules.
- Deployment version: `2026.08.09.1`.
- Local verification: dependency-free `npm test` plus syntax checks across all JavaScript and test modules.
- Automated verification: least-privilege GitHub Actions runs workflow policy, static structure, shared audio, achievement-toast, persistent error-log, and Pulse Grid suites on Node 24.

## Latest cycle: protect the existing suite with hosted CI

### Why this was selected

AlpArcade already had five useful dependency-free suites covering 20 JavaScript modules and eight CSS modules, but no hosted workflow. Regressions could reach `main` without executing any of those checks, making CI the highest-compounding low-risk improvement before expanding test coverage.

### Changes

- Added a Node 24 GitHub Actions workflow for `main` pushes and pull requests.
- Restricted workflow permissions to read-only repository contents, bounded the job to ten minutes, and canceled stale same-branch runs.
- Used supported `actions/checkout@v7` and `actions/setup-node@v7` actions and ran the exact local `npm test` command.
- Added ten executable workflow-policy assertions and wired them into the default suite.
- Documented local/hosted coverage and bumped the deployment version to `2026.08.09.1`.

### Verification and scores

- Test-first workflow policy: failed with `ENOENT` before `.github/workflows/ci.yml` existed, then passed all ten assertions.
- `npm test`: workflow policy plus all five existing suites passed.
- `find js tests ... | xargs -n1 node --check`: passed for every JavaScript and test module.
- `git diff --check`: passed.
- Correctness/reliability: 8/10 (every existing regression check now gates hosted changes).
- Verifiability: 9/10 (local and hosted commands are identical and workflow policy is self-tested).
- Maintainability: 8/10 (automation is dependency-free, bounded, and concise).
- Performance: 9/10 (the complete suite finishes locally in under one second and needs no install step).
- Security/robustness: 9/10 (read-only token permissions and current action runtimes are enforced).

### Lessons and process improvements

- A fast dependency-free suite has unusually high CI leverage: hosted protection adds no package-install failure surface.
- Workflow policy belongs in the default suite so runtime/action/permission drift fails locally before a push.
- The next coverage expansion should target core score persistence/import behavior, which drives XP, unlocks, daily progress, and cloud sync but has no executable unit contract.

## Recent project evolution

- `3d7b2bb`: auto-hid the public header across viewports.
- `bdfe5ad`: repaired Pulse Grid playback/touch flow and expanded its tests.
- `4f81baf`: corrected Pulse Grid audio and pause flow.

## Prioritized opportunities

| Priority | Opportunity | Category | Impact | Effort / risk | Evidence / dependency |
|---|---|---|---|---|---|
| 1 | Execute score persistence, reward, ranking, and import contracts | Reliability / verification | High | Medium / low | `js/core/scores.js` drives all progression/cloud handoff but has no direct test suite |
| 2 | Test SGT daily challenge boundaries and completion persistence | Correctness / verification | Medium-high | Small-medium / low | `js/features/daily.js` depends on timezone/date/storage behavior and is source-inspected only |
| 3 | Exercise lazy game-load failures and retry behavior | Reliability / UX | Medium-high | Medium / low | Game modules load dynamically; failure handling is not covered by an integrated test |

## Next cycle

Build a dependency-free VM/localStorage fixture around `js/core/scores.js`. Verify reward bounds, higher/lower-is-better records, bounded history/hall data, Unicode export/import round trips, malformed-code rejection, and safe persisted-state hydration before changing behavior.
