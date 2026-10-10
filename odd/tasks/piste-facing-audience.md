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
- [ ] A1 Server: piste flag (store + sqlite persistence + judge-authenticated endpoint + published to spectators)
- [ ] B1 Web: judge toggle writes the piste flag (offline-safe), judge board no longer mirrors, spectator views mirror from the piste flag, remove the device-only preference

## Route
Delegated direct: one writer (cross-package, needs mapping of the piste/stream path).

## Out of scope
Per-bout setting, mirroring the judge view.
