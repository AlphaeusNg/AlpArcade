# AlpArcade continuous improvement log

Last updated: 2026-08-09 (Cycle 54 across the projects workspace)

## Current state

- Branch: `main`; working tree was clean and aligned with `origin/main` at cycle start.
- Runtime: zero-build static GitHub Pages arcade with eight lazy-loaded game modules.
- Deployment version: `2026.08.09.4`.
- Local verification: dependency-free `npm test` plus syntax checks across all JavaScript and test modules.
- Automated verification: least-privilege GitHub Actions runs workflow policy, static structure, score persistence/import, SGT daily scheduling, lazy script loading, shared audio, achievement-toast, persistent error-log, and Pulse Grid suites on Node 24.

## Latest cycle: make lazy cabinet loading retryable

### Why this was selected

The app cached each lazy game/dependency script promise forever. One failed prefetch left both a rejected promise and failed script node, so later clicks immediately reused the failure and a cabinet could not recover without refreshing the entire page.

### Changes

- Extracted generic classic-script loading into `js/core/script-loader.js` with injected DOM/timers and a bounded 12-second default timeout.
- Preserved concurrent-request deduplication and loaded-script reuse while clearing rejected cache entries and removing failed/timed-out nodes.
- Routed both game dependencies and game modules through the shared loader; a failed hover prefetch now retries on the cabinet click.
- Added an 11-contract fake-DOM fixture for concurrency, loaded reuse, error messages, node cleanup, fresh retry, timeout reporting, and timeout cleanup.
- Added static wiring checks enforcing loader-before-app order and banning the old app-local promise cache.
- Documented the loader boundary and bumped the deployment version to `2026.08.09.4`.

### Verification and scores

- Test-first loader fixture: failed with `ENOENT` before `js/core/script-loader.js` existed.
- `node tests/script-loader.test.mjs`: all 11 concurrency/success/failure/retry/timeout contracts passed.
- `npm test`: workflow policy, state contracts, loader contracts, and all existing suites passed across 21 JavaScript modules.
- `find js tests ... | xargs -n1 node --check`: passed for every JavaScript and test module.
- `git diff --check`: passed.
- Correctness/reliability: 9/10 (transient game/dependency failures recover without a page refresh).
- Verifiability: 9/10 (the complete loader state machine runs deterministically against an injected fake DOM).
- Maintainability: 9/10 (one small core helper replaces an untestable cache embedded in the 1,700-line app).
- Performance: 9/10 (successful/concurrent loads remain cached and deduplicated; tests remain sub-second).
- Security/robustness: 9/10 (hung loads are bounded and failed nodes/cache entries are cleaned before retry).

### Lessons and process improvements

- A rejected promise is cached state too; retry requires deleting it and removing the failed DOM node as one transition.
- Prefetch failure recovery must be tested through the same cache later used by the click path, even when the prefetch listener itself is one-shot.
- Keep game selection/ordering in the app and extract only the generic script state machine; this preserved the lazy-load contract with a small diff.
- After four compounding AlpArcade cycles, rotate workspace attention instead of continuing in one subsystem; keep achievement hydration and browser smoke in the backlog.

## Recent project evolution

- Cycle 53 (`586bf73`): verified SGT scheduling/completion and recovered wrong-shape daily storage.
- Cycle 52 (`295ebf2`): hardened score persistence/import/cloud state with a direct VM fixture.
- Cycle 51 (`2a4ec86`): added least-privilege Node 24 CI with ten locally enforced workflow policies.

## Prioritized opportunities

| Priority | Opportunity | Category | Impact | Effort / risk | Evidence / dependency |
|---|---|---|---|---|---|
| 1 | Normalize achievement persistence maps | Reliability / robustness | Medium | Small / low | Achievement storage catches invalid JSON but accepts unknown/invalid unlocked and seen values |
| 2 | Add lobby/game browser smoke coverage | Verification | High | Large / medium | VM/source tests do not execute a full cabinet open/play/back flow in a browser DOM |
| 3 | Verify music preference/dock hydration | Reliability / verification | Medium | Small-medium / low | Music state has guarded parsing but no direct tests for wrong-shape values or autoplay recovery |

## Next cycle

Pause AlpArcade after four high-value reliability/verification cycles and rotate to another untouched workspace project. On return, normalize achievement maps before adding broader browser smoke infrastructure.
