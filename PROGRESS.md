# AlpArcade continuous improvement log

Last updated: 2026-08-11 (Cycle 128 across the projects workspace; AlpArcade Cycle 60)

## Current state

- Branch: `main`; working tree was clean and aligned with `origin/main` at cycle start.
- Runtime: zero-build static GitHub Pages arcade with eight lazy-loaded game modules.
- Deployment version: `2026.08.11.4`.
- Local verification: locked npm test dependencies, comprehensive `npm test`, a real Chromium cabinet smoke, and syntax checks across all JavaScript and test modules.
- Automated verification: least-privilege GitHub Actions runs workflow policy and all unit/contract suites on Node 24, then exercises cabinet navigation and denied achievement storage in Chromium.

## Latest cycle: retain and report score progress when device storage fails

### Why this was selected

`scores.js` caught write failures but retained no state. Every later
`getState()` reloaded the old device snapshot, so the next denied run forgot the
previous run and `refreshHud()` immediately repainted stale XP, bests, history,
and cabinet unlock progress. The achievement fallback supplied a proven,
bounded failure-episode pattern for the highest recorded backlog item.

### Changes

- Added one normalized in-memory score snapshot that becomes the current-visit
  source of truth after a denied write and covers XP, games played, bests,
  history, hall of fame, and player name.
- The next successful mutation flushes the complete session snapshot to device
  storage, clears it from memory, and resets notification state; reset also
  clears any session-only snapshot after device removal succeeds.
- Added one deduplicated console warning and `arcade:score-save-error` event per
  failure episode, with the app rendering actionable site-storage guidance.
- Expanded the score VM fixture with fourteen denied-write, cumulative-state,
  recovery-flush, and recurrence contracts.
- Added a real Chromium journey that rejects only score writes and verifies two
  retained runs, cumulative XP, best/history continuity, HUD/player rendering,
  one warning event, and the visible guidance toast.
- Documented the fallback and bumped the deployment version to
  `2026.08.11.4`.

### Verification and scores

- Test-first evidence: the VM and Chromium paths both reported zero retained
  games instead of two; the browser also lacked the score failure event/HUD
  continuity.
- Focused score and one-browser regressions passed after the normalized session
  snapshot and app listener were added.
- `npm test`: every suite passed across 22 JavaScript modules, including all new
  denied-storage score contracts and the existing 29 achievement contracts.
- `npm run test:browser -- --repeat-each=3`: 9/9 cabinet, achievement-denial,
  and score-denial journeys passed with no page or console errors.
- `npm audit --audit-level=high`: zero vulnerabilities; recursive syntax,
  tracked JSON parsing, and `git diff --check` passed.
- Correctness/reliability: 3/10 → 10/10 (each denied run now builds on the full
  current visit instead of stale device state).
- Verifiability: 5/10 → 10/10 (score state, warning episodes, recovery, and real
  HUD behavior are directly exercised).
- Maintainability: 7/10 → 9/10 (one normalizer now owns both persisted and
  session-state hydration).
- Performance: 9/10 → 9/10 (one bounded state snapshot exists only during a
  failure episode; normal successful storage uses no fallback memory).
- Security/robustness: 8/10 → 10/10 (storage denial remains non-fatal and no
  exception details reach the player).
- User experience: 4/10 → 10/10 (the HUD stays truthful and explains that
  progress needs site storage to survive the visit).

### Lessons and process improvements

- A fallback for cumulative data must preserve the entire normalized snapshot;
  independent deltas can lose ordering, capped history, or lower-is-better
  records during repeated failures.
- Browser coverage should verify both the backing state and the rendered HUD;
  either layer alone can hide a stale reload regression.
- The achievement failure-episode pattern generalized cleanly, but score state
  needed one shared normalizer because its schema is materially richer.

## Previous cycle: retain and report achievements when device storage fails

### Why this was selected

Achievement writes caught browser storage exceptions and discarded them silently. The unlock celebration still appeared, but every subsequent read lost the badge and the player received no indication that it was not durable. This was the highest recorded local reliability opportunity and required no API or storage-schema change.

### Changes

- Added an in-memory achievement fallback that merges with normalized device state, so denied writes preserve badge/count behavior for the current visit.
- A later successful write flushes all session-only unlocks and resets failure notification state; earliest valid unlock timestamps remain canonical.
- Added a deduplicated console warning and `arcade:achievement-save-error` event for each failure episode, with an app listener that gives the player an actionable site-storage message.
- Expanded the VM fixture from 20 to 29 contracts for denied writes, session visibility, deduplicated reporting, successful recovery, and recurrence after recovery.
- Added real Chromium coverage that rejects only achievement writes and verifies two retained unlocks, one warning event, and the rendered guidance toast.
- Documented the fallback and expanded browser scope, then bumped the deployment version to `2026.08.11.3`.

### Verification and scores

- Test-first runs failed on both disappearing session progress and the absent UI listener before implementation.
- `npm test`: all suites passed across 22 JavaScript modules, including 29 achievement persistence contracts.
- `npm run test:browser -- --repeat-each=3`: 6/6 cabinet and denied-storage journeys passed in 4.9 seconds with no page or console errors.
- `npm audit --audit-level=high`: zero vulnerabilities.
- Syntax, JSON parsing, and `git diff --check`: passed.
- Correctness/reliability: 9/10 (a storage denial no longer makes a just-earned badge disappear during the visit).
- Verifiability: 10/10 (failure, deduplication, recovery, recurrence, and rendered UI are directly exercised).
- Maintainability: 9/10 (the fallback remains encapsulated in the persistence module and uses one semantic event).
- Performance: 9/10 (only a small in-memory map exists during a write-failure episode; normal writes clear it).
- Security/robustness: 10/10 (no sensitive error detail reaches the UI and denied storage remains non-fatal).

### Lessons and process improvements

- A graceful catch is not sufficient when the surrounding UI still implies durability; failure handling must preserve truthful user-visible state.
- Modeling a failure episode, rather than every exception, prevents warning fatigue while allowing a post-recovery regression to become visible again.
- Selectively overriding one storage key in Chromium is a reusable way to verify browser-denial UX without breaking unrelated initialization preferences.
- Test-first assertions caught both halves of the defect independently: state continuity and delivery to the player.

## Recent project evolution

- Cycle 60: retained session score/XP state across denied device writes and
  surfaced one actionable warning per failure episode.
- Cycle 59: retained session achievement state across denied device writes and surfaced one actionable warning per failure episode.
- Cycle 58 (`5b7e721`): added locked, offline Chromium coverage for the real lobby/open/play/back workflow.
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
| 1 | Report failed achievement resets | Reliability / UX | Low | Small / low | `resetAll()` still catches removal denial silently, so a factory reset can appear to clear data that the browser retained |
| — | Preserve and report score progress when device storage rejects writes | Reliability / UX | Medium-high | Medium / low | Full session fallback, recovery flush, warning episodes, and real HUD behavior are covered | Completed in Cycle 60 |

## Next cycle

Local next: make achievement reset denial observable so factory reset cannot
claim success while retained device data remains. Workspace next: rotate to
ChristoDay's current backlog after this focused AlpArcade cycle.
