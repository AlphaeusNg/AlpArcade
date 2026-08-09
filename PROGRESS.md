# AlpArcade continuous improvement log

Last updated: 2026-08-09 (Cycle 53 across the projects workspace)

## Current state

- Branch: `main`; working tree was clean and aligned with `origin/main` at cycle start.
- Runtime: zero-build static GitHub Pages arcade with eight lazy-loaded game modules.
- Deployment version: `2026.08.09.3`.
- Local verification: dependency-free `npm test` plus syntax checks across all JavaScript and test modules.
- Automated verification: least-privilege GitHub Actions runs workflow policy, static structure, score persistence/import, SGT daily scheduling, shared audio, achievement-toast, persistent error-log, and Pulse Grid suites on Node 24.

## Latest cycle: verify SGT daily scheduling and persistence

### Why this was selected

Daily challenges depend on the Singapore calendar boundary, deterministic hashing, per-game target direction, local persistence, and one-time achievement notification but had no direct tests. Valid JSON with a primitive or array shape bypassed the parse catch: strings threw during completion, while array properties disappeared when saved so completion never persisted.

### Changes

- Added a dependency-free fake-clock VM/localStorage fixture with 27 assertion sites and a 64-day deterministic schedule sample.
- Verified the exact SGT rollover immediately before/at 16:00 UTC and the fixed UTC+8 fallback when timezone formatting is unavailable.
- Proved same-day challenge stability, positive targets, all-eight-cabinet reachability, and explicit Snake higher-is-better, Reaction lower-is-better, and Tic-Tac-Toe win conditions.
- Verified wrong-game/missed-target rejection, first-time versus repeated completion, one achievement notification, persisted completion, and reset behavior.
- Required loaded daily progress to be a non-array record, making valid primitive/array JSON recover like malformed input.
- Documented daily coverage and bumped the deployment version to `2026.08.09.3`.

### Verification and scores

- Test-first daily fixture: a primitive JSON value threw `Cannot create property '2026-08-09' on string 'wrong-shape'` before normalization.
- `node tests/daily.test.mjs`: SGT schedule, target, completion, malformed-storage, and fallback contracts passed.
- `npm test`: workflow policy, score/daily contracts, and all existing suites passed.
- `find js tests ... | xargs -n1 node --check`: passed for every JavaScript and test module.
- `git diff --check`: passed.
- Correctness/reliability: 9/10 (daily dates and all target semantics are deterministic and persisted across valid/malformed storage shapes).
- Verifiability: 9/10 (fake time makes the timezone boundary and completion lifecycle repeatable locally and in hosted CI).
- Maintainability: 9/10 (one small record guard closes both primitive and array failure modes without changing valid storage).
- Performance: 9/10 (the 64-day sample and complete suite remain sub-second locally).
- Security/robustness: 9/10 (untrusted storage shape is checked before property mutation).

### Lessons and process improvements

- JSON parse success does not imply schema success; primitives and arrays require the same fallback as malformed text before mutation.
- Fake-clock tests should cover both sides of the business timezone boundary and the fallback clock implementation.
- Sample enough seeded dates to prove every cabinet remains reachable, then test representative higher/lower/special completion rules explicitly.
- The next loader cycle should clear rejected game-script promises; current failures remain cached for the page lifetime, preventing recovery after a transient network error.

## Recent project evolution

- Cycle 52 (`295ebf2`): hardened score persistence/import/cloud state with a direct VM fixture.
- Cycle 51 (`2a4ec86`): added least-privilege Node 24 CI with ten locally enforced workflow policies.
- `3d7b2bb`: auto-hid the public header across viewports.

## Prioritized opportunities

| Priority | Opportunity | Category | Impact | Effort / risk | Evidence / dependency |
|---|---|---|---|---|---|
| 1 | Make lazy game-script failures retryable | Reliability / UX | High | Medium / low | `loadScript` caches rejected promises and leaves failed nodes, so one transient failure disables that cabinet until refresh |
| 2 | Normalize achievement persistence maps | Reliability / robustness | Medium | Small / low | Achievement storage catches invalid JSON but accepts unknown/invalid unlocked and seen values |
| 3 | Add lobby/game browser smoke coverage | Verification | High | Large / medium | VM/source tests do not execute a full cabinet open/play/back flow in a browser DOM |

## Next cycle

Extract the script loader behind an injected DOM helper and test concurrent deduplication, loaded-script reuse, error cleanup, and successful retry. Route lazy game dependencies and modules through it so a transient failure does not require a full page refresh.
