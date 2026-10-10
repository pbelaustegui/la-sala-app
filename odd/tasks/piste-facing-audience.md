# piste-facing-audience

## Objective
"Estoy de cara al público" mirrors left/right on the SPECTATOR views of a piste instead of on the judge's own scoreboard.

## Problem
PR #53 stores the toggle on the judge's device and mirrors only the judge's screen. The spectator sees the bout on another device, so the flag must travel through the server.

## Decisions (user-confirmed)
- The setting belongs to the PISTE (the judge does not move), not to the bout: it persists across bouts until changed.
- It mirrors the spectator view; the judge's own scoreboard goes back to the unmirrored layout. The judge keeps the toggle on their scoreboard, but it now sets the piste flag.
- Visual only: domain sides, events and per-side colours are unchanged.

## Tasks
- [x] A1 Server: piste flag (store + sqlite persistence + judge-authenticated endpoint + published to spectators)
- [x] B1 Web: judge toggle writes the piste flag (offline-safe), judge board no longer mirrors, spectator views mirror from the piste flag, remove the device-only preference

## Route
Delegated direct: one writer (cross-package, needs mapping of the piste/stream path).

## Out of scope
Per-bout setting, mirroring the judge view.

## Evidence
- Server: RED = 23 failing tests (missing repository methods, route, snapshot field) before implementation; GREEN = `npx vitest run` 14 files / 197 tests, `npm run typecheck` clean.
- Web: RED = 12 failing tests (api-client, piste-view, piste-facing, ScoreboardScreen, SpectatorScreen); GREEN = `npx vitest run` 38 files / 397 tests, `npm run check` 0 errors.
- Domain untouched: `npx vitest run` 8 files / 142 tests.
- API: `PUT /pistes/:id/facing-audience` `{facing: boolean}` (judge PIN) answers the snapshot; `facingAudience` is now part of every snapshot, the board feed and the per-piste stream.
- Persistence: SQLite `pistes.facing_audience INTEGER NOT NULL DEFAULT 0`, added by `migrate()` to databases created before it (tested with a legacy file); reset by `replacePistes`.
- Offline decision: not queued. Optimistic toggle, locked while saving, reverted with a Spanish hint on failure (`PisteFacing`); initial value read from `GET /pistes/:id/state`, silently off if unreachable.
- Removed: device-only `FacingAudiencePreference` and its env wiring; `mirrored` props of CardsSheet/CorrectionSheet and the judge scoreboard mirroring.
- Not committed (per instructions). Changed lines exceed the ~400 heuristic (about 3 packages with tests); advisory only.

