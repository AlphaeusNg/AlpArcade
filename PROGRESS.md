# AlpArcade continuous improvement log

Last updated: 2026-08-11 (Cycle 108 across the projects workspace; AlpArcade Cycle 58)

## Current state

- Branch: `main`; working tree was clean and aligned with `origin/main` at cycle start.
- Runtime: zero-build static GitHub Pages arcade with eight lazy-loaded game modules.
- Deployment version: `2026.08.11.2`.
- Local verification: locked npm test dependencies, comprehensive `npm test`, a real Chromium cabinet smoke, and syntax checks across all JavaScript and test modules.
- Automated verification: least-privilege GitHub Actions runs workflow policy and all unit/contract suites on Node 24, then exercises the lobby, a lazy-loaded game, and return navigation in Chromium.

## Latest cycle: exercise the cabinet workflow in a real browser

### Why this was selected

The existing VM and source-contract suites verified individual modules well but never executed AlpArcade's integrated browser lifecycle. A broken selector, script order, DOM mutation, hash update, focus transition, or real page exception could therefore pass CI even when the central open/play/back journey failed.

### Changes

- Added an exact, lockfile-pinned Playwright test dependency and a single-worker Chromium configuration backed by a local Python server.
- Added a browser smoke that waits for application initialization, opens the lazy-loaded Tic-Tac-Toe cabinet, makes a move, observes the AI reply, and returns to the lobby.
- Verified cabinet visibility, title, URL hash, board state, mount cleanup, and restored keyboard focus; page exceptions and console errors fail the test.
- Stubbed all external HTTPS resources by request type so Firebase, Spotify, font, and donation availability cannot make CI flaky or leak test traffic.
- Added locked dependency caching/install, browser installation, and the smoke to CI after the faster unit gate; enforced that order with five new workflow policy contracts.
- Documented the local browser workflow, ignored generated Playwright output, and bumped the deployment version to `2026.08.11.2`.

### Verification and scores

- Test-first workflow policy failed on the missing deterministic dependency install before the CI workflow was changed.
- `npm test`: all suites passed across 22 JavaScript modules, including 15 CI policy assertions and all 11 cabinet lifecycle contracts.
- `npm run test:browser -- --repeat-each=3`: 3/3 integrated open/play/back journeys passed in 4.0 seconds with no page or console errors.
- `npm audit --audit-level=high`: zero vulnerabilities.
- Syntax, JSON parsing, and `git diff --check`: passed.
- Correctness/reliability: 9/10 (the primary game journey is now exercised against the real application DOM).
- Verifiability: 10/10 (CI spans fast contracts plus an offline deterministic browser workflow).
- Maintainability: 9/10 (one focused spec and a conventional pinned harness; commands are documented and policy-checked).
- Performance: 8/10 (no runtime cost, but Chromium setup adds CI time; unit failures still short-circuit first).
- Security/robustness: 10/10 (unexpected browser exceptions fail, while tests make no external requests).

### Lessons and process improvements

- Application readiness should be observed through rendered public state, not a fixed timeout; the version footer makes a stable initialization signal.
- Route interception by resource type keeps an integration test offline without producing invalid CSS or document responses that create false console failures.
- Repeating the browser journey three times was a cheap race check after introducing the harness; the normal CI smoke stays intentionally singular.
- Keeping unit tests before the browser download preserves fast feedback despite the added integration coverage.

## Recent project evolution

- Cycle 58: added locked, offline Chromium coverage for the real lobby/open/play/back workflow.
- Cycle 57 (`c161c14`): made lazy cabinet navigation cancellation-safe with request-scoped lifecycle coverage.
- Cycle 56 (`87cce54`): normalized music/dock preferences and constrained restored iframe URLs to canonical stations.
- Cycle 55 (`ec3d46b`): normalized achievement maps and made every cloud merge change durable.
- Cycle 54 (`acfddff`): made failed/timed-out lazy cabinet loads retryable.
- Cycle 53 (`586bf73`): verified SGT scheduling/completion and recovered wrong-shape daily storage.
- Cycle 52 (`295ebf2`): hardened score persistence/import/cloud state with a direct VM fixture.
- Cycle 51 (`2a4ec86`): added least-privilege Node 24 CI with ten locally enforced workflow policies.

## Prioritized opportunities

| Priority | Opportunity | Category | Impact | Effort / risk | Evidence / dependency |
|---|---|---|---|---|---|
| 1 | Add achievement save-failure observability | Reliability / UX | Low-medium | Small / low | Storage write exceptions remain intentionally silent, so a new badge can look durable when it is not |

## Next cycle

Local next: surface an actionable warning when achievement persistence fails instead of implying the unlock is durable. Workspace next: rotate to ChristoDay's current backlog after this focused AlpArcade cycle.
