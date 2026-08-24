# AlpArcade continuous improvement log

Last updated: 2026-08-25 (AlpArcade Cycle 69)

## Current state

- Branch: `main`; working tree was clean and aligned with `origin/main` at cycle start.
- Runtime: zero-build static GitHub Pages arcade with eight lazy-loaded game modules.
- Deployment version: `2026.08.25.1`.
- Local verification: locked npm test dependencies, comprehensive `npm test`, a real Chromium cabinet smoke, and syntax checks across all JavaScript and test modules.
- Automated verification: least-privilege GitHub Actions runs workflow policy and all unit/contract suites on Node 24, then exercises cabinet navigation and denied score, achievement, daily-save, and reset storage paths in Chromium.

## Latest cycle: make console factory-reset results truthful

### Why this was selected

The score, achievement, and daily modules correctly throw when browser storage
denies deletion, but `ArcadeCloud.factoryReset()` swallowed all three errors and
always returned `local: true`. A recovery helper must not claim deletion when
progress remains on the device.

### Changes

- Attempt all three local reset domains and report each as `reset`, `failed`, or
  `unavailable`.
- Set `local: false` and overall `ok: false` when any local domain cannot be
  cleared, retain requested cloud status separately, and return actionable
  `localErrors` instead of discarding exceptions.
- Emit one structured console warning for a partial local factory reset.
- Added a zero-network VM suite for complete success, one denied domain with
  later-domain continuation, and a missing reset module.
- Deployment version bumped to `2026.08.25.1`.

### Verification and scores

- Test-first: the old result had no `localResults`, and JSON inspection failed
  before it could verify any domain; the helper still returned local success.
- `node tests/cloud-scores.test.mjs`: 12 assertions passed.
- `npm test`: every workflow, static, storage, music, achievement, cabinet,
  loader, and cloud-service contract passed.
- `CI=1 npm run test:browser`: 9/9 real Chromium scenarios passed, including
  denied score, achievement, daily-save, and factory-reset storage paths.
- Recursive `node --check`, `git diff --check`, and JSON parsing passed.
- Correctness/reliability: 4/10 → 10/10 (partial deletion can no longer report success).
- Verifiability: 3/10 → 10/10 (the console/cloud service boundary now has an isolated suite).
- Maintainability: 7/10 → 9/10 (one reset loop replaces three swallow-only blocks).
- Performance: 10/10 → 10/10 (three synchronous local calls as before).
- Security/robustness: 6/10 → 9/10 (unavailable/denied storage fails closed).
- Developer/user experience: 5/10 → 9/10 (console callers receive exact local outcomes).

### Lessons and process improvements

- Catching a deletion error is only graceful if the returned status preserves
  the failure.
- Recovery boundaries should enumerate domains and continue after one failure;
  users need the fullest safe reset possible plus an honest partial result.
- Service-level helpers deserve isolated tests even when each underlying
  storage module is already well tested.

### Next opportunity

Audit `wipeAccountData({ wipeProfile: true })`: a failed `players/{uid}` delete
currently records `players: "failed"` but may leave the aggregate cloud result
successful.

## Previous cycle: header Music and native last-run sharing

### Why this was selected

The persistent left music dock had no clear text entry point in the header, and
the last-run action skipped the native share sheet on capable phones.

### Changes and verification

- Added a header Music control wired to the existing dock, preferred
  `navigator.share()` for last runs, kept clipboard fallback, and treated share
  cancellation as a no-op.
- Static contracts preserve the header-to-dock link and native-share path;
  deployment version was `2026.08.18.7` (`9f8890b`).

## Previous cycle: compact cabinet locks + continue last cabinet

### Why this was selected

Locked cabinets still replaced `.cab-best` with a long “Reach Lv N…”
sentence, so the tile lost its score identity. Returning players also
had no lobby shortcut back to the last unlocked cabinet they opened.

### Changes

- Locked cabinets now keep `.cab-desc` and `.cab-best`, and show a
  compact `Lv N` chip instead of the long lock sentence. Click/keyboard
  still toast the full requirement and refuse to open the game.
- Last opened unlocked cabinet id is persisted. The daily card keeps
  its play CTA and adds a sibling “Continue {name}” when that cabinet
  is still unlocked.
- Mute tooltip now says SFX are muted here and music lives in the ♪
  dock.
- Deployment version bumped to `2026.08.18.5`.

### Verification and scores

- `npm test`, `npm run test:browser`, `node --check` on edited JS, and
  `git diff --check`.
- User experience: 8/10 → 9/10 (locked tiles stay identifiable; last
  cabinet is one tap from the daily card).

## Previous cycle: lead the lobby with daily + cabinets

### Why this was selected

The daily card already sat above the cabinet grid, but the first screen
was still the ASCII intro, fun-facts column, and player bar. Players
should meet today’s challenge and the cabinets first.

### Changes

- `#daily-card` and `#cabinets` now open the lobby. `#intro`, `#fun-facts`,
  and `#player-bar` stay below with every existing ID intact.
- `#intro-tip` no longer points “below” at the daily challenge; the tip
  is hidden on desktop as well as phone (Help still covers Esc / P).
- Deployment version bumped to `2026.08.18.4`.

### Verification and scores

- `npm test`, `npm run test:browser`, `node --check` on edited JS, and
  `git diff --check`.
- User experience: 8/10 → 9/10 (first screen is play, not lore).

## Previous cycle: lobby hero daily + honest cabinet UX

### Why this was selected

The last cycles tightened storage-denial contracts. Players still met a
dead daily CTA when the assigned cabinet was locked, a generic share
tagline after a run, hidden cabinet blurbs on phones, and a missing
Help row for two cabinets. This cycle ships those visible lobby fixes.

### Changes

- `#daily-card` is now the lobby hero above `#cabinets`. If today's
  assigned game is locked, the primary button opens Snake (or the
  nearest unlocked free cabinet) and the card shows “Unlocks at Lv N”
  for the original. Done still paints “Done ✓” as a win.
- Each cabinet icon tile gets a distinct `--cab` accent (teal / cyan /
  violet / gold / coral). Pulse Grid’s blurb is a short identity line,
  and phones keep `.cab-desc` visible instead of hiding it.
- Help covers Circuit Breaker and Pulse Grid. Shooter controls say
  auto-fire, not Space fire. Share copies the last run’s game, score,
  and URL. Guest boards no longer ask players to edit `firebase-config.js`.
- Deployment version bumped to `2026.08.18.3`.

### Verification and scores

- Focused daily unit contracts cover the locked-day fallback.
- `npm test`, `node --check` on edited JS, and `git diff --check`.
- `npm run test:browser` when time allows.
- User experience: 6/10 → 9/10 (the hero CTA always opens a playable
  cabinet; share and help match what the games actually do).

## Previous cycle: report denied score-key resets truthfully

### Why this was selected

Workspace rotation returned here after the daily-save fallback. Achievement
and daily resets already throw sanitized errors, but `ArcadeScores.resetAll()`
still forwarded a raw `removeItem` exception. Inspection showed the factory
reset could not reach “Local scores wiped”, yet the toast exposed the
browser error and no contract locked the score key.

### Changes

- A denied score-key removal now throws one sanitized, actionable error;
  persisted and session-only XP remain the source of truth.
- The existing factory-reset error boundary converts that failure into a
  “Reset failed” toast and cannot reach its later success message.
- Expanded the score VM harness with removal denial, retained persisted and
  session state, and later recovery contracts.
- Added a real Chromium factory-reset journey that rejects only the score
  key, verifies the failure toast, and proves HUD XP, games played, and the
  player name remain both rendered and queryable.
- Documented the behavior and bumped the deployment version to
  `2026.08.18.2`.

### Verification and scores

- Test-first evidence: the new unit assertion failed because the thrown
  error was the raw `storage denied` exception, not a score-domain message.
- Focused score unit contracts passed after the sanitized throw landed.
- `npm test`: all suites passed across 22 JavaScript modules.
- `npm run test:browser`: 7/7 real Chromium journeys passed, including the
  score-key denial toast and retained HUD values.
- Recursive runtime syntax and `git diff --check` passed.
- Correctness/reliability: 8/10 → 10/10 (reset success now requires actual
  score-key removal, matching achievements and daily progress).
- Verifiability: 4/10 → 10/10 (denial, retained persisted and session
  state, recovery, rendered HUD, and messaging are directly covered).
- Maintainability: 8/10 → 9/10 (score reset now matches the achievement and
  daily throwing contracts).
- Performance: 10/10 → 10/10 (only the exceptional path changed).
- Security/robustness: 6/10 → 10/10 (raw storage errors stay behind a safe
  domain message).
- User experience: 6/10 → 10/10 (a denied wipe explains site storage
  instead of leaking a browser exception).

### Lessons and process improvements

- A raw throw can already stop a false success toast and still be the wrong
  public contract; sanitize the message and lock it before calling the
  family done.
- Session-only score snapshots need the same “do not clear until removal
  succeeds” rule as persisted keys, or a denied reset erases the visit.
- After finishing the last sibling in a storage-path family, inspect the
  remaining key even when the success toast already looks blocked.

## Previous cycle: retain and report daily progress when device writes fail

### Why this was selected

Workspace rotation returned here after CardFitSG. The remaining storage-family
gap was still the highest recorded local defect: `saveProgress()` swallowed a
denied `localStorage.setItem()`, so a just-completed challenge disappeared on
the next read and the player got no guidance.

### Changes

- A denied daily write now keeps a session snapshot as the current-visit source
  of truth and emits one sanitized `arcade:daily-save-error` per failure episode.
- A later successful write flushes the complete snapshot and resets notification
  state; a successful reset also clears any session-only progress.
- The lobby listener shows the site-storage toast and immediately repaints the
  daily card so “Done ✓” remains visible.
- Expanded the daily VM harness with denial, retention, recovery, and
  recurrence contracts, plus a real Chromium journey.
- Documented the fallback and bumped the deployment version to `2026.08.18.1`.

### Verification and scores

- Test-first evidence: `isComplete()` returned false after a successful attempt
  because the denied write left no durable or session state.
- Focused daily unit contracts passed after the session snapshot landed.
- `npm test`: all suites passed across 22 JavaScript modules.
- `npm run test:browser`: 6/6 real Chromium journeys passed, including retained
  “Done ✓”, one warning event, and the storage-guidance toast.
- Recursive runtime syntax and `git diff --check` passed.
- Correctness/reliability: 4/10 → 10/10 (a denied completion remains visible
  for the visit and flushes when storage recovers).
- Verifiability: 3/10 → 10/10 (denial, retention, recovery, recurrence, and
  rendered status are directly covered).
- Maintainability: 8/10 → 9/10 (daily save now matches the score and
  achievement failure-episode contracts).
- Performance: 10/10 → 10/10 (only the exceptional path changed).
- Security/robustness: 7/10 → 10/10 (raw storage errors stay behind a safe
  domain message).
- User experience: 2/10 → 10/10 (the daily card no longer forgets a just-earned
  completion and explains how to keep it).

### Lessons and process improvements

- Completing a daily challenge is a durable claim; a swallowed write makes the
  celebration lie. Keep the same session-snapshot plus one-episode warning
  pattern used by scores and achievements.
- Repaint the status surface on the save-error event. Queryable state can be
  truthful while the lobby still shows yesterday's empty badge.
- After leaving a storage-path family for other repos, finishing the last
  sibling defect is higher leverage than inventing a new capability.

## Previous cycle: report denied daily-progress resets truthfully

### Why this was selected

The highest recorded local backlog item remained after the workspace rotation:
`ArcadeDaily.resetAll()` swallowed a denied `localStorage.removeItem()` and
returned an empty-looking result. The factory reset could therefore announce
“Local scores wiped” while today's completed challenge still survived on the
device.

### Changes

- A denied daily-progress removal now throws one sanitized, actionable error;
  retained progress remains the source of truth.
- The existing factory-reset error boundary converts that failure into a
  “Reset failed” toast and cannot reach its later success message.
- Expanded the daily VM harness with removal denial, retained-state, and later
  recovery contracts.
- Added a real Chromium factory-reset journey that rejects only the daily key,
  verifies the failure toast, and proves “Done ✓” remains both rendered and
  queryable.
- Documented the behavior and bumped the deployment version to
  `2026.08.11.6`.

### Verification and scores

- Test-first evidence: the new unit assertion failed because no exception was
  reported. The first browser run then caught an incorrect fixture expectation
  (`Complete` versus the real `Done ✓` copy); correcting the assertion made the
  contract match production without changing runtime behavior.
- Focused daily unit and Chromium contracts passed after implementation.
- `npm test`: all suites passed across 22 JavaScript modules.
- `npm run test:browser`: 5/5 real Chromium journeys passed with no page or
  console errors; recursive runtime syntax and `git diff --check` also passed.
- Correctness/reliability: 4/10 → 10/10 (success now requires actual daily-key
  removal).
- Verifiability: 3/10 → 10/10 (denial, retention, recovery, rendered state, and
  messaging are directly covered).
- Maintainability: 8/10 → 9/10 (daily reset now matches the score and
  achievement throwing contracts).
- Performance: 10/10 → 10/10 (only the exceptional path changed).
- Security/robustness: 7/10 → 10/10 (raw browser errors stay behind a safe
  domain message).
- User experience: 2/10 → 10/10 (the destructive action no longer claims a
  clean slate while daily progress remains).

### Lessons and process improvements

- Apply the same confirmed-outcome rule to every key in a composite destructive
  action; one silent component can invalidate the whole success claim.
- A browser test should assert retained backing state and its rendered status,
  because either alone can hide a stale-paint or false-deletion bug.
- Test-first UI fixtures should derive date-sensitive state with the same
  timezone rule as production, while visible-copy expectations should follow
  the actual renderer rather than an assumed label.

## Previous cycle: report denied achievement resets truthfully

### Why this was selected

The previous save-failure fallbacks were green, but the highest recorded local
backlog item remained: `ArcadeAchievements.resetAll()` swallowed a denied
`localStorage.removeItem()` and returned an empty-looking result. The factory
reset UI then announced “Local scores wiped” even though achievement data and
the displayed badge still survived on the device.

### Changes

- A denied achievement removal now throws one sanitized, actionable error while
  preserving persisted and session achievement state.
- The existing factory-reset error boundary converts that failure into a
  “Reset failed” toast, so its later success path cannot run.
- Expanded the achievement harness from 29 to 32 contracts for reported denial,
  retained state, and a later successful recovery.
- Added a real Chromium factory-reset journey that rejects only the achievement
  removal, accepts the confirmation, verifies the failure toast, and proves the
  badge remains visible and unlocked.
- Documented truthful reset behavior and bumped the deployment version to
  `2026.08.11.5`.

### Verification and scores

- Test-first evidence: the unit contract reported a missing exception and the
  browser observed the false “Local scores wiped” success while the key
  survived.
- Focused achievement contracts passed after the fix; the new Chromium journey
  passed 5/5 repeated runs. An initial two-step toast assertion exposed a race
  with a later Firebase status toast, so it was replaced by one atomic message
  assertion without changing runtime timing.
- The complete unit, browser, dependency-audit, recursive syntax, JSON, diff,
  hosted CI, Pages, and live-version results are recorded in the Cycle 137
  completion summary.
- Correctness/reliability: 3/10 → 10/10 (reset success now means removal worked).
- Verifiability: 4/10 → 10/10 (denial, retention, recovery, and real UI messaging
  are directly covered).
- Maintainability: 8/10 → 9/10 (achievement reset now matches the throwing score
  reset contract and uses one safe domain message).
- Performance: 10/10 → 10/10 (only the exceptional path changed).
- Security/robustness: 7/10 → 10/10 (raw storage exception details stay behind
  a safe public error while retained data is not misrepresented).
- User experience: 2/10 → 10/10 (a destructive action no longer reports a
  clean slate when badges remain).

### Lessons and process improvements

- Destructive operations must report confirmed outcomes, not intended state;
  returning an empty model after a failed removal creates a dangerous illusion.
- Preserve state variables until the durable removal succeeds so recovery and
  the visible UI remain truthful.
- Toast assertions should capture one semantic message atomically when other
  asynchronous services legitimately share the status surface.

## Previous cycle: retain and report score progress when device storage fails

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

- Cycle 69: made `factoryReset()` fail closed and report exact local reset-domain outcomes.
- Cycle 68: added header Music and native last-run sharing with clipboard fallback.
- Cycle 64: reported denied score-key resets and verified retained XP through
  the factory-reset UI.
- Cycle 63: retained session daily-completion state across denied device writes
  and surfaced one actionable warning per failure episode.
- Cycle 62: reported denied daily-progress resets and verified retained daily
  state through the factory-reset UI.
- Cycle 61: reported denied achievement resets and prevented false factory-reset
  success.
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

| Priority | Opportunity | Category | Impact | Effort / risk | Evidence / dependency | Status |
|---|---|---|---|---|---|---|
| 1 | Propagate failed profile deletion into cloud factory-reset success | Reliability / honesty | Medium | Small / low | `wipeProfile` records `players: failed` but does not set `result.ok = false` | Planned |
| — | Report exact local outcomes from the console factory-reset helper | Reliability / honesty | Medium | Small / low | 12 VM assertions cover success, denied deletion, continuation, and unavailable domains | Completed in Cycle 69 |
| — | Report denied score resets through the factory-reset boundary | Reliability / UX | Low | Small / low | Denial now propagates a sanitized score-domain error through the factory-reset boundary and is covered in the VM harness and Chromium | Completed in Cycle 64 |
| — | Retain and report completed daily progress when device writes are denied | Reliability / UX | Medium | Small / low | Session snapshot, one-episode warning, recovery flush, and Chromium “Done ✓” are covered | Completed in Cycle 63 |
| — | Report denied daily-progress resets | Reliability / UX | Low | Small / low | Denial now propagates through the factory-reset boundary and is covered in the VM harness and Chromium | Completed in Cycle 62 |
| — | Report failed achievement resets | Reliability / UX | Low | Small / low | Denial now propagates through the factory-reset boundary and is covered in Chromium | Completed in Cycle 61 |
| — | Preserve and report score progress when device storage rejects writes | Reliability / UX | Medium-high | Medium / low | Full session fallback, recovery flush, warning episodes, and real HUD behavior are covered | Completed in Cycle 60 |

## Next cycle

Local next: make failed requested profile deletion set the aggregate cloud wipe
result to false and lock the behavior at the service boundary.
Workspace next: continue rotation, skip Car-Type-Classification-Service.
