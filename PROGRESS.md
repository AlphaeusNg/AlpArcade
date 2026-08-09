# AlpArcade continuous improvement log

Last updated: 2026-08-10 (Cycle 85 across the projects workspace; AlpArcade Cycle 56)

## Current state

- Branch: `main`; working tree was clean and aligned with `origin/main` at cycle start.
- Runtime: zero-build static GitHub Pages arcade with eight lazy-loaded game modules.
- Deployment version: `2026.08.10.2`.
- Local verification: dependency-free `npm test` plus syntax checks across all JavaScript and test modules.
- Automated verification: least-privilege GitHub Actions runs workflow policy, static structure, score persistence/import, achievement persistence/cloud merge, SGT daily scheduling, lazy script loading, shared audio/music hydration, achievement-toast, persistent error-log, and Pulse Grid suites on Node 24.

## Latest cycle: normalize music preference and dock hydration

### Why this was selected

Music hydration trusted truthiness and raw fields from local storage. The string `"false"` suppressed autoplay as if it were a real stopped flag, `"false"` could reopen the dock, and an arbitrary persisted embed URL could become the Spotify iframe source. None of the music boot, stop, dock, or autoplay-retry paths executed in tests.

### Changes

- Added plain-record and exact-boolean validation for stored music and dock state.
- Resolved restored station IDs/embeds through canonical station buttons already shipped in the page; persisted data can no longer inject a foreign iframe URL.
- Canonicalized valid stopped state, repaired malformed dock state, and preserved safe default autoplay when preferences are corrupt or blocked.
- Consolidated preference writes so play, stop, and hydration share one boolean-safe serializer.
- Added a direct fake-DOM/VM fixture with 25 boot, restore, stop, corruption, canonical URL, dock ARIA/scrim, blocked-storage, and one-shot autoplay-retry contracts.
- Bumped the deployment version to `2026.08.10.2`.

### Verification and scores

- Test-first music fixture: hydration treated stored `"false"` as a stopped preference and failed the autoplay contract.
- `node tests/music.test.mjs`: 25 music preference, dock hydration, canonical URL, and autoplay recovery contracts passed.
- `npm test`: workflow policy, all persistence/loader/music contracts, and all existing suites passed across 21 JavaScript modules.
- `find js tests ... | xargs -n1 node --check`: passed for every JavaScript and test module.
- Manifest, Firebase CLI, and Firestore index JSON parsing: passed.
- Retrying local HTTP preview smoke: served the music dock entrypoint, hardened module, and `2026.08.10.2` version successfully.
- `git diff --check`: passed.
- Correctness/reliability: 9/10 (only exact preferences and canonical stations influence startup state).
- Verifiability: 10/10 (the real module boots through 25 deterministic DOM/storage/gesture contracts).
- Maintainability: 9/10 (station resolution and preference serialization each have one named path).
- Performance: 9/10 (two station buttons are scanned only during hydration; the complete suite remains sub-second).
- Security/robustness: 9/10 (local storage can no longer choose an unlisted iframe source).

### Lessons and process improvements

- Treat local storage as untrusted even when only the same origin can normally write it; extensions, old builds, manual edits, and past bugs can leave hostile shapes behind.
- Persist identifiers, but resolve executable/embed destinations through the current application catalog rather than replaying stored URLs.
- Truthiness is not a schema: UI and stop flags require exact booleans.
- Full-suite verification caught an over-specific test expectation: invalid dock state is removed, then immediately rewritten in normalized form by autoplay. Require the stronger repaired state, not the transient implementation step.
- Local preview probes should retry connection refusal while the server binds; the first no-retry attempt measured a startup race rather than the application.

## Recent project evolution

- Cycle 56: normalized music/dock preferences and constrained restored iframe URLs to canonical stations.
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
