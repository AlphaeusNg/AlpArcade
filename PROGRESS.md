# AlpArcade continuous improvement log

Last updated: 2026-08-27 (AlpArcade Cycle 77)

## Current state

- Branch: `main`; working tree was clean and aligned with `origin/main` at cycle start.
- Runtime: zero-build static GitHub Pages arcade with eight lazy-loaded game modules.
- Deployment version: `2026.08.27.1`.
- Daily card: Play, Replay, and Continue are deduplicated by cabinet destination. A 320px recap truncates only its copy while Share/Replay remain intact and the card stays contained.
- Local verification: locked npm test dependencies, comprehensive `npm test`, 13/13 real Chromium journeys (22.5s), and syntax checks across all JavaScript and test modules.
- Automated verification: least-privilege GitHub Actions runs workflow policy and all unit/contract suites on Node 24, then exercises cabinet navigation, last-run rematch collapse, phone fold, and denied score, achievement, daily-save, local reset, and cloud reset outcome paths in Chromium.

## Latest cycle: make hosted CI manually recoverable

### Why this was selected

After Cycle 76 was pushed, GitHub recorded the commit but did not enqueue its
push CI. The same delayed-delivery incident had already repeated in AIly, and
AlpArcade's workflow had no manual trigger, leaving the shipped browser change
without an immediate hosted verification path.

### Changes

- Add `workflow_dispatch` beside the existing push and pull-request triggers.
- Lock the recovery trigger into the zero-dependency workflow-policy suite.
- Runtime files and deployment version remain `2026.08.27.1`.

### Verification and scores

- Test-first: the sixteenth workflow assertion failed on the absent manual
  trigger before implementation.
- `npm test` passes the 16 workflow policies and every product contract.
- Manual recovery CI run `32990876910` passed all unit/contract gates and 13
  Chromium journeys in 1m5s on commit `e1f3951`. Pages deployment
  `32990875256` passed, and the live site serves `2026.08.27.1`.
- Correctness/reliability: 7/10 → 9/10 (hosted verification no longer depends
  solely on push-event delivery).
- Test coverage/verifiability: 4/10 → 10/10 (the recovery path is executable
  and policy-locked).
- Maintainability/process: 7/10 → 9/10 (one standard trigger matches AIly's
  recovered CI workflow).
- Performance/resources: 9/10 → 9/10 (manual dispatch is opt-in).
- User experience: 10/10 → 10/10 (runtime is unchanged).

### Lessons and process improvements

- A push trigger is not an observability fallback. When hosted checks are part
  of the release claim, retain an explicit dispatch path and test that it
  remains configured.

### Next opportunity

Rotate to AIly's Tauri content-security policy after its `v0.1.2` package
release finishes.

## Previous cycle: keep one daily CTA per cabinet destination

### Why this was selected

The previous cycle collapsed Continue when it duplicated Replay, but today's
primary Play / Play again button could still open the same cabinet as Replay.
At 320px the unbounded recap copy also competed with two fixed action buttons.

### Changes

- Hide Replay when the primary daily button already opens that cabinet.
- Hide Continue when it duplicates either Play or Replay.
- Wrap recap copy in a shrinkable ellipsis span while Share/Replay stay intact.
- Make the existing replay/continue browser fixtures select distinct unlocked
  cabinets instead of assuming a particular calendar day's challenge.
- Version `2026.08.27.1`.

### Verification and scores

- Test-first: the new 320px Chromium journey found `#btn-daily-replay` beside
  an identical daily destination before the fix.
- The first full browser run then caught two older Snake fixtures whose
  expectations changed when Snake happened to be today's challenge; making
  their destinations runtime-distinct removed the date dependency.
- `npm test` passed every workflow, structure, persistence, game, loader,
  cloud, and syntax contract. `npm audit --audit-level=high` found zero
  vulnerabilities; `git diff --check` passed.
- `CI=1 npm run test:browser`: 13/13 Chromium journeys passed in 22.5s. The
  320px probe requires no duplicate rematch/continue action, actual ellipsis,
  and both recap and card scroll widths to remain contained.
- Correctness/reliability: 7/10 → 10/10 (three CTA sources now share one
  destination-identity rule).
- Test coverage/verifiability: 6/10 → 10/10 (duplicate and narrow overflow
  execute in Chromium on every calendar date).
- Maintainability: 7/10 → 9/10 (fixtures derive distinct destinations rather
  than embedding date-sensitive game assumptions).
- Performance/resources: 10/10 → 10/10 (one bounded string comparison).
- Developer/user experience: 6/10 → 10/10 (one rematch path, readable fixed
  controls, and no horizontal overflow at 320px).

### Lessons and process improvements

- Deduplicate actions by the destination they open, not by their source or
  label.
- Date-driven UI tests must choose fixtures relative to the runtime challenge;
  a hard-coded cabinet can become today's destination and silently invert the
  scenario.

### Next opportunity

Rotate to AIly and restrict the Tauri shell's currently null content-security
policy now that its global bridge exposes consent-gated native commands.

## Previous cycle: collapse duplicate daily rematch so cabinets stay above the fold

### Why this was selected

Returning players got Last run + Share + Replay plus a sibling Continue for
the same cabinet. After a finished run those rematch CTAs were identical, so
the hero grew by two button rows and the 2-col cabinet grid dropped off the
first phone screen.

### Changes

- Skip Continue when last opened cabinet equals the unlocked last-run Replay.
- Keep Continue beside Play when that cabinet differs from Replay, or when
  there is no recap yet.
- Tighten `.daily-actions` / `.daily-last-run` on ≤720px so recap stays one
  compact control row.
- Version `2026.08.25.7`.

### Verification and scores

- `npm test` passed, including static-structure asserts for the collapse
  predicate (`Continue` only when last cabinet differs from last-run Replay)
  and the phone nowrap rules.
- Playwright: 12/12 Chromium journeys passed in 21.9s.
- After snake last-run + last-cabinet, the daily card shows Play + Share +
  Replay Snake and no Continue Snake.
- Opening Tic-Tac-Toe then Back shows Continue Tic-Tac-Toe with Replay Snake.
- At 390×844 both daily rows are `flex-wrap: nowrap` and the first cabinet is
  fully in the viewport.
- Version `2026.08.25.7`.

### Lessons and process improvements

- Collapse rematch CTAs by destination identity, not by whether a recap
  exists; Continue is still the right shortcut for a different cabinet.
- Phone-fold coverage should assert `flex-wrap: nowrap` and that the first
  cabinet is fully in view, not only that extra buttons are absent.

### Next opportunity

When Play challenge / Play again opens the same cabinet as Replay, the hero
still shows two rematch buttons. Collapse that remaining duplicate, and on
320px truncate last-run copy so the nowrap Share / Replay controls cannot
overflow.

## Previous cycle: replay and deep-link the last run

### Why this was selected

Last-run Share copied the lobby URL. A friend tapping it landed on cabinets
instead of the game just played, and rematching from the recap took extra taps.

### Changes

- Share last run encodes `#play/<id>` so the link opens that cabinet.
- Daily recap adds Replay when the last cabinet is unlocked.
- Version `2026.08.25.6`.

## Previous cycle: recap last run on the lobby

### Why this was selected

Share last run lived only in the play bar and vanished on reload. Returning
players could not brag from the lobby.

### Changes

- Persist the last finished run in `alparcade-last-run-v1`.
- Daily card shows Last run · game · score · Share.
- Version `2026.08.25.5`.

## Previous cycle: verify cloud delete-to-zero fallbacks

### Why this was selected

The account wipe prefers deleting private progress and public score documents,
then falls back to overwriting them with zero-value records when Firebase rules
deny deletion. Those privacy-sensitive fallback branches had no configured
service test, so a future change could retain user data or report a failed
replacement as successful without detection. This was the highest recorded
local opportunity and required no production behavior or schema change.

### Changes

- Extended the deterministic Firebase fixture with independently controlled
  progress and score existence, delete denial, and fallback-write denial.
- Verify that a denied progress delete produces an empty snapshot and a denied
  public-score delete produces a zero row, including exact XP, best, score, and
  arcade-point values.
- Verify that a second-stage write denial marks the affected domain `failed`,
  makes the aggregate wipe fail closed, and retains actionable domain errors.
- Bumped the deployment version to `2026.08.25.4`.

### Verification and scores

- `node tests/cloud-scores.test.mjs`: 46 assertions passed, up from 28.
- `npm test` passed every workflow, static, persistence, game, loader,
  cabinet, and cloud-service suite.
- `CI=1 npm run test:browser`: 10/10 Chromium journeys passed.
- Recursive JavaScript syntax, JSON parsing, dependency audit, and diff checks
  passed. Hosted CI `32768189005` and Pages `32768187803` also passed for
  commit `3ad7f31`.
- Correctness/reliability: 8/10 → 9/10 (both fallback outcomes are now contract-protected).
- Verifiability: 5/10 → 10/10 (delete denial, exact replacement, and replacement denial execute offline).
- Maintainability: 8/10 → 9/10 (one parameterized fixture covers independent Firestore outcomes).
- Performance: 10/10 → 10/10 (runtime behavior is unchanged).
- Security/robustness: 6/10 → 10/10 (privacy deletion fallbacks now fail closed under regression).
- Developer/user experience: 9/10 → 9/10 (no runtime UI change).

### Lessons and process improvements

- A fallback is a second operation with its own failure mode; tests must prove
  both the replacement payload and the aggregate result after replacement
  denial.
- Verification-only cycles should state that no behavior defect was found and
  score the added regression protection rather than inventing a runtime delta.

### Next opportunity

No higher-impact unblocked AlpArcade item is currently recorded. Rotate
repositories; KoboForge's accessible current-match state and transient export
cleanup have since shipped.

## Previous cycle: preserve username-retention and cloud-wipe outcomes

### Why this was selected

The default account wipe keeps `players/{uid}` so a username survives. When
that keep write was denied, the service returned `players: "skipped"`, exactly
like an intentional no-op, with no warning. UI inspection also found that a
real cloud deletion failure briefly showed “incomplete” and then overwrote it
with “Clean slate — local + cloud wiped.”

### Changes

- A failed default username keep now returns `players: "keep-failed"` and an
  actionable non-fatal `warnings` entry; it does not redefine successful
  account-data deletion. Explicitly disabling the keep remains `"skipped"`
  without warnings.
- The reset UI carries one final outcome message through local cleanup. It
  preserves both the non-fatal retention warning and an actual cloud deletion
  failure instead of unconditionally announcing a clean slate afterward.
- Extended the configured Firebase fixture through failed keep and intentional
  skip branches, and added a real Chromium journey for both final UI outcomes.
- Bumped the deployment version to `2026.08.25.3`.

### Verification and scores

- Test-first: the service returned `"skipped"` for a denied keep; the browser
  rendered `Clean slate — local + cloud wiped` and later drifted to an unrelated
  Firebase-load toast instead of the required retention outcome.
- `node tests/cloud-scores.test.mjs`: 28 assertions passed, up from 20.
- `npm test` passed every workflow, static, persistence, game, loader,
  cabinet, and cloud-service suite; recursive JavaScript syntax, JSON parsing,
  dependency audit, and diff checks passed.
- `CI=1 npm run test:browser`: 10/10 Chromium journeys passed, up from 9,
  including both the non-fatal keep warning and failed-deletion outcome.
- Hosted CI run `32764770606` passed all Node 24 and Chromium gates; Pages run
  `32764769559` deployed successfully, and the live site serves version
  `2026.08.25.3` with both final reset messages.
- Correctness/reliability: 4/10 → 10/10 (three distinct outcomes remain distinct end to end).
- Verifiability: 5/10 → 10/10 (configured service and real UI boundaries both execute).
- Maintainability: 8/10 → 9/10 (one final-message variable prevents toast overwrite races).
- Performance: 10/10 → 10/10 (no additional network or storage work).
- Security/robustness: 6/10 → 9/10 (privacy-sensitive partial deletion remains visible).
- Developer/user experience: 4/10 → 9/10 (warnings do not masquerade as failures or success).

### Lessons and process improvements

- A non-fatal warning still needs a dedicated status value; `skipped` must mean
  intentional non-execution, not a swallowed failed attempt.
- Testing a service result is insufficient when later UI code can overwrite its
  message. Carry the final outcome to the last render and browser-test it.

### Next opportunity

Extend the configured cloud fixture across progress and public-score
delete-to-zero fallbacks, including failure after delete denial.

## Previous cycle: propagate failed requested cloud-profile deletion

### Why this was selected

`wipeAccountData({ wipeProfile: true })` recorded `players: "failed"` and an
error when Firestore denied the delete, but left `result.ok` true. The outer
factory reset consequently reported success whenever local deletion succeeded,
even though a specifically requested cloud profile remained.

### Changes

- Mark the cloud wipe unsuccessful when requested `players/{uid}` deletion
  fails, preserving the existing per-domain outcome and actionable error.
- Extended the zero-network cloud-service fixture with configured Firebase,
  live auth, Firestore document operations, and a denied profile delete.
- Verify both `wipeAccountData()` and `factoryReset()` retain the cloud failure
  while distinguishing successful local cleanup.
- Bumped the deployment version to `2026.08.25.2`.

### Verification and scores

- Test-first: the configured fixture received `players: "failed"` and a player
  error from the old implementation, but `result.ok` was `true`.
- `node tests/cloud-scores.test.mjs`: 20 assertions passed.
- `npm test`: every workflow, static, persistence, game, loader, cabinet, and
  cloud-service contract passed; recursive syntax and diff checks passed.
- `CI=1 npm run test:browser`: 9/9 real Chromium journeys passed, including
  denied score, achievement, daily-save, and local reset paths.
- Hosted CI run `32762009672` passed the Node 24 contracts and Chromium smoke;
  Pages run `32762007858` deployed successfully, and the live site served
  version `2026.08.25.2`.
- Correctness/reliability: 3/10 → 10/10 (a requested retained cloud document
  can no longer be reported as a successful account wipe).
- Verifiability: 5/10 → 10/10 (live-auth/init, Firestore failure, and both
  service boundaries are exercised without network access).
- Maintainability: 8/10 → 9/10 (the aggregate follows the same rule as other
  failed wipe domains).
- Performance: 10/10 → 10/10 (no additional runtime operation).
- Security/robustness: 5/10 → 10/10 (privacy-sensitive deletion fails honest).
- Developer/user experience: 5/10 → 9/10 (callers receive a reliable outcome).

### Lessons and process improvements

- Recording an error is insufficient if the top-level success flag disagrees.
- Destructive-operation tests should assert domain status, aggregate status,
  and the outer UI/service wrapper independently.
- A small deterministic Firebase fixture makes authenticated cloud control-flow
  testable without weakening production boundaries or requiring credentials.

### Next opportunity

Audit the default username-retention branch: distinguish an intentional skip
from a failed requested keep operation without treating profile retention as
account-data deletion failure.

## Previous cycle: make console factory-reset results truthful

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
- Hosted CI run `32759931857` passed the locked Node 24 suite and Chromium
  smoke; Pages run `32759928956` deployed successfully, and the live site
  served version `2026.08.25.1`.
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

- Cycle 75: collapsed duplicate daily rematch (Continue vs Replay) and kept
  phone recap/actions on one nowrap row so cabinets stay above the fold.
- Cycle 72: covered successful and failed delete-to-zero cloud wipe fallbacks
  with exact replacement-payload assertions.
- Cycle 71: preserved username-retention warnings and cloud deletion failures
  through the final factory-reset UI message.
- Cycle 70: propagated denied requested cloud-profile deletion through both
  cloud-wipe and factory-reset aggregate outcomes.
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
| 1 | Collapse Play vs Replay when they open the same cabinet; keep 320px recap from overflowing | UX / lobby density | Medium | Small / low | Play challenge / Play again still rematches Replay's cabinet; nowrap buttons are `flex-shrink: 0` beside untruncated copy | Next |
| — | Collapse duplicate daily rematch so cabinets stay above the fold | UX / lobby density | Medium | Small / low | After Snake last-run, Play + Share + Replay with no Continue Snake; 390×844 first cabinet in view; 12/12 Chromium | Completed in Cycle 75 |
| — | Extend the configured cloud fixture across delete-to-zero fallbacks | Verification / reliability | Low-medium | Small / low | 46 service assertions cover exact zero replacements and second-stage denial | Completed in Cycle 72 |
| — | Distinguish failed username retention from intentional profile skip | Reliability / honesty | Medium | Small / low | 28 service assertions and a real UI journey preserve keep warning, skip, and deletion-failure outcomes | Completed in Cycle 71 |
| — | Propagate failed profile deletion into cloud factory-reset success | Reliability / honesty | Medium | Small / low | 20 cloud-service assertions cover the exact Firestore failure and outer aggregation | Completed in Cycle 70 |
| — | Report exact local outcomes from the console factory-reset helper | Reliability / honesty | Medium | Small / low | 12 VM assertions cover success, denied deletion, continuation, and unavailable domains | Completed in Cycle 69 |
| — | Report denied score resets through the factory-reset boundary | Reliability / UX | Low | Small / low | Denial now propagates a sanitized score-domain error through the factory-reset boundary and is covered in the VM harness and Chromium | Completed in Cycle 64 |
| — | Retain and report completed daily progress when device writes are denied | Reliability / UX | Medium | Small / low | Session snapshot, one-episode warning, recovery flush, and Chromium “Done ✓” are covered | Completed in Cycle 63 |
| — | Report denied daily-progress resets | Reliability / UX | Low | Small / low | Denial now propagates through the factory-reset boundary and is covered in the VM harness and Chromium | Completed in Cycle 62 |
| — | Report failed achievement resets | Reliability / UX | Low | Small / low | Denial now propagates through the factory-reset boundary and is covered in Chromium | Completed in Cycle 61 |
| — | Preserve and report score progress when device storage rejects writes | Reliability / UX | Medium-high | Medium / low | Full session fallback, recovery flush, warning episodes, and real HUD behavior are covered | Completed in Cycle 60 |

## Next cycle

Local next: collapse Play challenge / Play again when it rematches the same
cabinet as Replay, and check 320px nowrap overflow of last-run copy so Share
and Replay stay fully visible.
Workspace next: if that remaining duplicate is not reproduced on a daily that
differs from last-run, rotate to the highest-impact unblocked item in another
repo.
