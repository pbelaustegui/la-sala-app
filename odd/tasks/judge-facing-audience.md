# judge-facing-audience

## Objective
Let a judge say they stand facing the audience, so the scoreboard mirrors left/right to match what they see (audience left = judge right).

## Decisions (user-confirmed)
- A toggle on the judge's scoreboard, remembered on the device (not in the bout log, not synced).
- Visual only: domain sides, events, colours per fencer, spectator board stay unchanged. Only the on-screen order of the two fencers swaps (halves, cards sheet, priority picker, correction sheet columns).

## Tasks
- [x] A1 Device preference store + toggle in the judge scoreboard, mirrored ordering in all side pairs, tests first

## Route
Delegated direct: one writer (preparation reading across web components).

## Out of scope
Spectator board, server, per-bout setting.

## Evidence (A1)
- RED: new CorrectionSheet and ScoreboardScreen tests failed (6 failures) before the UI change; the preference-store tests were written alongside an already-created store, so no separate RED was observed for them.
- GREEN: `npx vitest run` in packages/web: 38 files, 383 tests passed; `npm run typecheck` clean; `npm run check`: 0 errors, 0 warnings.
- Design: `FacingAudiencePreference` (core/facing-audience.ts) over the `KeyValueStorage` port (localStorage adapter in the app, `MemoryStorage` in tests), exposed as `services.facing`; Scoreboard takes `facing`/`onfacing`; CardsSheet and CorrectionSheet take `mirrored`. Only the iteration order of sides changes.
- Commit: pending (not committed by the writer).
