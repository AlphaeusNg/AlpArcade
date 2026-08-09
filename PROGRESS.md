# AlpArcade continuous improvement log

Last updated: 2026-08-10 (Cycle 77 across the projects workspace; AlpArcade Cycle 55)

## Current state

- Branch: `main`; working tree was clean and aligned with `origin/main` at cycle start.
- Runtime: zero-build static GitHub Pages arcade with eight lazy-loaded game modules.
- Deployment version: `2026.08.10.1`.
- Local verification: dependency-free `npm test` plus syntax checks across all JavaScript and test modules.
- Automated verification: least-privilege GitHub Actions runs workflow policy, static structure, score persistence/import, achievement persistence/cloud merge, SGT daily scheduling, lazy script loading, shared audio, achievement-toast, persistent error-log, and Pulse Grid suites on Node 24.

## Latest cycle: normalize achievement persistence maps

### Why this was selected

Achievement hydration accepted any object-shaped `unlocked` and `seen` map. Unknown IDs, negative/null timestamps, arbitrary truthy seen values, and arrays could inflate totals or create false badges. Cloud merge also retained negative timestamps, and an earlier cloud timestamp was not saved unless the same merge added a new badge.

### Changes

- Added definition-aware normalizers for both local maps.
- Unlocks now keep only known IDs with positive finite timestamps; numeric legacy timestamps normalize to numbers.
- Seen state now keeps only known IDs explicitly marked `true`.
- Wrong-shaped roots/maps and corrupt JSON recover to empty state; the next achievement save persists the repaired maps.
- Cloud merge ignores unknown IDs, replaces invalid timestamps with a valid local timestamp, and saves any earlier-timestamp change—not only newly added IDs.
- Added a direct VM fixture with 20 local/cloud/reset/gate contracts and wired it into the canonical runner.
- Bumped the deployment version to `2026.08.10.1`.

### Verification and scores

- Test-first achievement fixture: the stored map retained the unknown ID, negative/null timestamps, and an unnormalized numeric timestamp.
- `node tests/achievements.test.mjs`: 20 persistence, repair, cloud-merge, reset, and cabinet-gate contracts passed.
- `npm test`: workflow policy, state contracts, loader contracts, and all existing suites passed across 21 JavaScript modules.
- `find js tests ... | xargs -n1 node --check`: passed for every JavaScript and test module.
- `git diff --check`: passed.
- Correctness/reliability: 9/10 (only catalogued, valid achievement state affects badges and counts).
- Verifiability: 9/10 (local corruption, cloud merges, repair saves, and level-gate safety execute in one deterministic fixture).
- Maintainability: 9/10 (known-ID and timestamp policy each have one named helper).
- Performance: 9/10 (linear normalization over 26 definitions is negligible; all tests remain sub-second).
- Security/robustness: 9/10 (untrusted local/cloud map keys and values cannot create arbitrary progress).

### Lessons and process improvements

- Successfully parsed JSON is still untrusted; “object” is not a sufficient map contract because arrays and arbitrary keys also qualify.
- Validate map keys against the product catalog and values against their actual semantics: timestamps for unlocks, exact booleans for seen flags.
- Track `changed` separately from `added`; synchronization can improve existing metadata without adding a new record.
- Exercise cloud-derived achievement state against the player-level cabinet gate so persistence hardening cannot reopen a progression bypass.

## Recent project evolution

- Cycle 55: normalized achievement maps and made every cloud merge change durable.
- Cycle 54 (`acfddff`): made failed/timed-out lazy cabinet loads retryable.
- Cycle 53 (`586bf73`): verified SGT scheduling/completion and recovered wrong-shape daily storage.
- Cycle 52 (`295ebf2`): hardened score persistence/import/cloud state with a direct VM fixture.
- Cycle 51 (`2a4ec86`): added least-privilege Node 24 CI with ten locally enforced workflow policies.

## Prioritized opportunities

| Priority | Opportunity | Category | Impact | Effort / risk | Evidence / dependency |
|---|---|---|---|---|---|
| 1 | Verify music preference/dock hydration | Reliability / verification | Medium | Small-medium / low | Music state has guarded parsing but no direct tests for wrong-shape values or autoplay recovery |
| 2 | Add lobby/game browser smoke coverage | Verification | High | Large / medium | VM/source tests do not execute a full cabinet open/play/back flow in a browser DOM |
| 3 | Add achievement save-failure observability | Reliability / UX | Low-medium | Small / low | Storage write exceptions remain intentionally silent, so a new badge can look durable when it is not |

## Next cycle

Local next: verify music preference and dock hydration against corrupt and wrong-shaped storage. Workspace next: rotate to the Seeking Biblical Truth cross-repository viewer-data sync boundary after this focused return cycle.
