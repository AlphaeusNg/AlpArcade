# AlpArcade feature roadmap

Research date: 2026-10-14 (Asia/Singapore).

## Selected: find a cabinet by play style and controls

The lobby has eight cabinets, level locks, favorites and recent destinations. It has no way to narrow the catalog by name, style, current availability or existing key-remapping support. Players currently scan cards or enter a cabinet to discover its controls. This is repository evidence, not measured player research; improved discovery is a product hypothesis.

Build a folded **Find a game** panel immediately before the catalog. Combine a case-insensitive name search, Action/Puzzle/Timing style selector, **Remappable keys** checkbox and **Playable now** checkbox. Snake, Space Shooter and Circuit Breaker have remapping through `ArcadeControls`; the filter must derive that capability from the existing API. Game-style classifications describe their actual mechanics, not difficulty or accessibility guarantees.

Use labeled native controls, a polite result count, explicit empty guidance and **Clear filters**. Keep the panel closed initially to preserve phone density. Keep selections during cabinet/back navigation for this visit; start unfiltered on reload. Filtering hides each cabinet together with its favorite button, without changing favorites, scores, XP, daily actions, locks or game loading. Favorites/recent shortcuts remain separate from catalog filtering.

## Research and design evidence

- [Game Accessibility Guidelines: Basic](https://gameaccessibilityguidelines.com/basic/) recommends control remapping and exposing accessibility features within the game. Inference: exposing cabinets that already offer remapping helps players choose before entering. This does not establish demand or guarantee that a cabinet suits every player.
- [W3C WAI: Labeling controls](https://www.w3.org/WAI/tutorials/forms/labels/) supports visible, associated labels for search, selection and checkbox controls; labels improve identification and clickable area.
- [W3C WAI: Grouping controls](https://www.w3.org/WAI/tutorials/forms/grouping/) supports semantic grouping of related controls. Use a fieldset with a legend.
- [W3C WCAG: Status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) explains announcing result counts without moving focus. Use `role="status"` and keep filter focus in place.

Sources accessed 2026-10-14. No external service, framework or additional game bundle is needed.

## Acceptance

1. Default folded panel shows all eight cabinets; phone first cabinet remains above the fold.
2. Search, style, remapping and availability intersect; clear restores every cabinet.
3. Empty results explain recovery. Hidden cabinets and their favorite buttons are absent from Tab order.
4. Availability refreshes when XP unlocks cabinets or reset restores locks. Locked cabinets remain discoverable by default and cannot be launched through filtering.
5. Filtering does not fetch cabinet scripts. Playing a filtered result and returning preserves filters and returns focus to its cabinet.
6. Desktop and 320px keyboard/browser journeys pass alongside existing unit/static/browser gates.

## Next priorities

| Priority | Capability | Rationale / prerequisites |
|---|---|---|
| 1 | Cabinet control preview | Show each game's actual keyboard/touch actions before entry; audit all modules first and avoid unsupported accessibility claims. |
| 2 | Local run-history view | Turn existing score history into a usable list with date, game and score; establish retention and session-only storage behavior before shipping. |
| 3 | Untimed practice options | Useful for learning timing/action cabinets; define separate practice scoring so personal bests, daily targets and cloud rankings remain fair. |

Avoid adding online matchmaking until an explicit need and hosting/security design exist. This release adds discovery only.

## Implementation notes

The 320px journey exposed pre-existing horizontal overflow in the player profile grid. A single `minmax(0, 1fr)` column now lets its name form shrink to the available width. The document fits 320px with discovery both folded and expanded. This is a targeted sizing correction; the profile layout and actions stay the same.
