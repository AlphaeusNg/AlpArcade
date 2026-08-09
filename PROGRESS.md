# AlpArcade continuous improvement log

Last updated: 2026-08-09 (Cycle 52 across the projects workspace)

## Current state

- Branch: `main`; working tree was clean and aligned with `origin/main` at cycle start.
- Runtime: zero-build static GitHub Pages arcade with eight lazy-loaded game modules.
- Deployment version: `2026.08.09.2`.
- Local verification: dependency-free `npm test` plus syntax checks across all JavaScript and test modules.
- Automated verification: least-privilege GitHub Actions runs workflow policy, static structure, score persistence/import, shared audio, achievement-toast, persistent error-log, and Pulse Grid suites on Node 24.

## Latest cycle: validate and harden core score state

### Why this was selected

The score system drives XP, cabinet unlocks, local records, history, export/import, and cloud reconciliation but had no direct executable contract. Characterization showed that negative runs earned XP and could become impossible reaction bests, while malformed nested history/hall or cloud values could discard or erase otherwise-valid local progression.

### Changes

- Added a dependency-free VM/localStorage score fixture with 39 assertion sites across defaults, reward bounds, higher/lower-is-better records, invalid runs, bounded history/hall ranking, Unicode codes, malformed imports, persisted hydration, and cloud merges.
- Rejected negative scores and non-positive reaction times before they can mutate XP, games played, history, or records; invalid results now consistently return zero arcade points.
- Normalized known high-score fields, numeric legacy values, history/hall entries, player names, timestamps, metadata, and reward fields on every load.
- Discarded malformed nested entries individually instead of letting one bad item reset an otherwise-valid state read.
- Validated non-finite/negative cloud bests and Tic-Tac-Toe totals before merging so hostile or corrupt remote values cannot erase local records.
- Documented score coverage and bumped the deployment version to `2026.08.09.2`.

### Verification and scores

- Test-first score fixture: negative reaction `-1` earned 100 XP before validation; a later malformed `meta: null` case reset the hydrated player to defaults before nested normalization.
- `node tests/scores.test.mjs`: all reward, persistence, ranking, import, hydration, and cloud-merge contracts passed after implementation.
- `npm test`: workflow policy, score contracts, and all existing suites passed.
- `find js tests ... | xargs -n1 node --check`: passed for every JavaScript and test module.
- `git diff --check`: passed.
- Correctness/reliability: 9/10 (invalid local/remote scores cannot mutate or wipe valid progression).
- Verifiability: 9/10 (the progression core now runs deterministically against isolated storage in local and hosted CI).
- Maintainability: 9/10 (shared normalization helpers replace scattered coercion rules at persistence boundaries).
- Performance: 9/10 (state remains bounded to 40 history and 15 hall entries; the complete suite remains sub-second locally).
- Security/robustness: 9/10 (only known games/fields with finite non-negative values survive untrusted import/storage/cloud boundaries).

### Lessons and process improvements

- Test the same state contract at all three trust boundaries: localStorage, user-supplied export codes, and cloud merge input.
- Validate before mutation. Normalizing only after saving allowed non-finite remote data to overwrite a valid best and then collapse to the default.
- Filter malformed collection entries individually; a broad load-level catch protects startup but can silently discard unrelated valid progress.
- Characterization tests exposed real failures before behavior changed, keeping the hardening targeted rather than speculative.

## Recent project evolution

- Cycle 51 (`2a4ec86`): added least-privilege Node 24 CI with ten locally enforced workflow policies.
- `3d7b2bb`: auto-hid the public header across viewports.
- `bdfe5ad`: repaired Pulse Grid playback/touch flow and expanded its tests.

## Prioritized opportunities

| Priority | Opportunity | Category | Impact | Effort / risk | Evidence / dependency |
|---|---|---|---|---|---|
| 1 | Test SGT daily challenge boundaries and completion persistence | Correctness / verification | Medium-high | Small-medium / low | `js/features/daily.js` depends on timezone/date/storage behavior and is source-inspected only |
| 2 | Exercise lazy game-load failures and retry behavior | Reliability / UX | Medium-high | Medium / low | Game modules load dynamically; failure handling is not covered by an integrated test |
| 3 | Normalize achievement persistence maps | Reliability / robustness | Medium | Small / low | Achievement storage catches invalid JSON but accepts unknown/invalid unlocked and seen values |

## Next cycle

Add a deterministic VM/localStorage fixture for `js/features/daily.js`. Verify the UTC-to-SGT date rollover, stable challenge selection/targets, higher- and lower-is-better completion, first-time idempotence, malformed storage recovery, achievement notification, and reset behavior.
