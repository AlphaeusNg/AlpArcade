# AlpArcade continuous improvement log

Last updated: 2026-08-11 (Cycle 98 across the projects workspace; AlpArcade Cycle 57)

## Current state

- Branch: `main`; working tree was clean and aligned with `origin/main` at cycle start.
- Runtime: zero-build static GitHub Pages arcade with eight lazy-loaded game modules.
- Deployment version: `2026.08.11.1`.
- Local verification: dependency-free `npm test` plus syntax checks across all JavaScript and test modules.
- Automated verification: least-privilege GitHub Actions runs workflow policy, static structure, score persistence/import, achievement persistence/cloud merge, SGT daily scheduling, lazy script and cabinet-request lifecycles, shared audio/music hydration, achievement-toast, persistent error-log, and Pulse Grid suites on Node 24.

## Latest cycle: cancel stale lazy cabinet navigation

### Why this was selected

Returning to the lobby while a cabinet script was still loading did not cancel the pending continuation. When that fetch later resolved, the stale request could mount a hidden game and rewrite the URL. If the player started another cabinet first, a stale rejection could call the shared lobby cleanup and cancel the replacement request.

### Changes

- Added a small request-token lifecycle module for beginning, cancelling, validating, and finishing lazy cabinet opens.
- Invalidated an in-flight token immediately when returning to the lobby, before the fullscreen-history wait can yield.
- Guarded post-load mounting, synchronous mount completion, error handling, and final cleanup by request identity so stale work cannot affect a replacement.
- Added an 11-contract VM fixture covering concurrent opens, cancellation, unique replacements, stale cleanup, and the delayed-load race.
- Enforced the helper's script order and app integration in the static suite.
- Bumped the deployment version to `2026.08.11.1`.

### Verification and scores

- Test-first lifecycle fixture failed because no cancellation-aware cabinet session existed.
- `node tests/cabinet-session.test.mjs`: 11 navigation lifecycle and delayed-load contracts passed.
- `npm test`: workflow policy, all persistence/loader/music/navigation contracts, and all existing suites passed across 22 JavaScript modules.
- `find js tests ... | xargs -n1 node --check`: passed for every JavaScript and test module.
- Manifest, Firebase CLI, and Firestore index JSON parsing: passed.
- Retrying local HTTP preview smoke: served the cabinet lifecycle module and `2026.08.11.1` version successfully.
- `git diff --check`: passed.
- Correctness/reliability: 10/10 (stale lazy-load success and failure paths cannot mutate the active view).
- Verifiability: 9/10 (the lifecycle race is deterministic; a full browser cabinet flow remains uncovered).
- Maintainability: 9/10 (request identity is isolated behind four named lifecycle operations).
- Performance: 10/10 (constant-time numeric token checks; no new runtime dependency).
- Security/robustness: 9/10 (navigation state remains internally consistent under delayed or failed network loads).

### Lessons and process improvements

- A boolean prevents overlap but cannot distinguish a stale continuation from the request that replaced it; asynchronous UI work needs request identity.
- Cancellation must happen before the first `await` in teardown, or pending work can resume during cleanup.
- Stale error handlers are as dangerous as stale success handlers because shared cleanup can destroy newer state.
- A tiny dependency-free state machine gave deterministic race coverage without imposing a browser package and download on every CI run.

## Recent project evolution

- Cycle 57: made lazy cabinet navigation cancellation-safe with request-scoped lifecycle coverage.
- Cycle 56 (`87cce54`): normalized music/dock preferences and constrained restored iframe URLs to canonical stations.
- Cycle 55 (`ec3d46b`): normalized achievement maps and made every cloud merge change durable.
- Cycle 54 (`acfddff`): made failed/timed-out lazy cabinet loads retryable.
- Cycle 53 (`586bf73`): verified SGT scheduling/completion and recovered wrong-shape daily storage.
- Cycle 52 (`295ebf2`): hardened score persistence/import/cloud state with a direct VM fixture.
- Cycle 51 (`2a4ec86`): added least-privilege Node 24 CI with ten locally enforced workflow policies.

## Prioritized opportunities

| Priority | Opportunity | Category | Impact | Effort / risk | Evidence / dependency |
|---|---|---|---|---|---|
| 1 | Add lobby/game browser smoke coverage | Verification | High | Large / medium | VM/source tests do not execute a full cabinet open/play/back flow in a browser DOM |
| 2 | Add achievement save-failure observability | Reliability / UX | Low-medium | Small / low | Storage write exceptions remain intentionally silent, so a new badge can look durable when it is not |

## Next cycle

Local next: add a real browser lobby/open-cabinet/back smoke when the larger dependency and CI cost is justified. Workspace next: rotate to ChristoDay's current backlog after this focused AlpArcade cycle.
